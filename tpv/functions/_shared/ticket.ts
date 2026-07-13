// ============================================================================
// TPV · Lógica de dominio del agregado "ticket" (reutilizada por las funciones)
// ----------------------------------------------------------------------------
// Carga del ticket completo (cabecera + líneas + pagos + saldo) y reemplazo
// declarativo de líneas con recálculo autoritativo de la cabecera. El servidor
// SIEMPRE recalcula subtotal/impuestos/total desde las líneas persistidas.
// ============================================================================

import { calcularLinea, calcularSaldo, calcularTotales } from '../../shared/money.ts';
import { ErrorTpv } from '../../shared/errors.ts';
import type {
  LineaTicket,
  Pago,
  TicketCompleto,
  Venta,
} from '../../shared/types.ts';
import type { LineaInput } from '../../shared/schemas.ts';
import { mapearErrorPg, type SupabaseClient } from './supabase.ts';

/** Lanza si el ticket no está en estado 'abierta' (no se puede modificar/cobrar). */
export function exigirTicketAbierto(venta: Venta): void {
  if (venta.estado !== 'abierta') {
    throw new ErrorTpv(
      'TICKET_NO_ABIERTO',
      `El ticket #${venta.numero_ticket} está '${venta.estado}' y no admite cambios`,
    );
  }
}

/** Carga la cabecera del ticket (RLS decide visibilidad); 404 si no existe. */
export async function cargarVenta(
  sb: SupabaseClient,
  ventaId: string,
): Promise<Venta> {
  const { data, error } = await sb
    .from('tpv_ventas')
    .select('*')
    .eq('id', ventaId)
    .maybeSingle();
  if (error) throw mapearErrorPg(error);
  if (!data) throw new ErrorTpv('NO_ENCONTRADO', 'Ticket no encontrado');
  return data as Venta;
}

/** Carga el agregado completo: cabecera + líneas + pagos + saldo derivado. */
export async function cargarTicket(
  sb: SupabaseClient,
  ventaId: string,
): Promise<TicketCompleto> {
  const venta = await cargarVenta(sb, ventaId);

  const [lineasRes, pagosRes] = await Promise.all([
    sb
      .from('tpv_lineas_ticket')
      .select('*')
      .eq('venta_id', ventaId)
      .order('orden', { ascending: true })
      .order('created_at', { ascending: true }),
    sb
      .from('tpv_pagos')
      .select('*')
      .eq('venta_id', ventaId)
      .order('pagado_at', { ascending: true }),
  ]);

  if (lineasRes.error) throw mapearErrorPg(lineasRes.error);
  if (pagosRes.error) throw mapearErrorPg(pagosRes.error);

  const lineas = (lineasRes.data ?? []) as LineaTicket[];
  const pagos = (pagosRes.data ?? []) as Pago[];

  // Sólo los pagos 'completado' cuentan para el saldo cobrado.
  const saldo = calcularSaldo(
    venta.total,
    pagos.filter((p) => p.estado === 'completado'),
  );

  return { venta, lineas, pagos, saldo };
}

/**
 * Reemplaza TODAS las líneas del ticket por el conjunto recibido y recalcula la
 * cabecera de forma autoritativa. Devuelve el agregado completo actualizado.
 *
 * Nota de atomicidad: supabase-js no abre transacción multi-sentencia desde el
 * Edge. Para máxima seguridad transaccional puede envolverse en una RPC SQL;
 * aquí el orden (borrar → insertar → recalcular cabecera desde lo persistido)
 * deja siempre la cabecera coherente con las líneas realmente guardadas.
 */
export async function reemplazarLineas(
  sb: SupabaseClient,
  venta: Venta,
  lineasInput: LineaInput[],
): Promise<TicketCompleto> {
  exigirTicketAbierto(venta);

  // 1. Calcular cada línea UNA vez con el núcleo compartido (fuente de verdad).
  const calculadas = lineasInput.map(calcularLinea);
  const filas = lineasInput.map((linea, i) => {
    const c = calculadas[i];
    return {
      venta_id: venta.id,
      salon_id: venta.salon_id, // denormalizado → misma política RLS que la venta
      tipo: linea.tipo,
      referencia_id: linea.referencia_id ?? null,
      descripcion: linea.descripcion,
      cantidad: linea.cantidad,
      precio_unitario: linea.precio_unitario,
      descuento: c.descuento,
      tipo_impuesto: c.tipo_impuesto,
      importe_impuesto: c.importe_impuesto,
      total_linea: c.total_linea,
      orden: linea.orden ?? i,
    };
  });

  // 2. Borrar las líneas actuales del ticket.
  const del = await sb.from('tpv_lineas_ticket').delete().eq('venta_id', venta.id);
  if (del.error) throw mapearErrorPg(del.error);

  // 3. Insertar las nuevas líneas (si las hay).
  if (filas.length > 0) {
    const ins = await sb.from('tpv_lineas_ticket').insert(filas);
    if (ins.error) throw mapearErrorPg(ins.error);
  }

  // 4. Recalcular la cabecera desde las líneas calculadas y persistirla.
  const totales = calcularTotales(calculadas);
  const upd = await sb
    .from('tpv_ventas')
    .update({
      subtotal: totales.subtotal,
      descuento_total: totales.descuento_total,
      impuestos_total: totales.impuestos_total,
      total: totales.total,
    })
    .eq('id', venta.id)
    .select('id')
    .single();
  if (upd.error) throw mapearErrorPg(upd.error);

  return cargarTicket(sb, venta.id);
}
