// ============================================================================
// Edge Function · tpv-registrar-pago
// ----------------------------------------------------------------------------
// Registra uno o varios pagos sobre un ticket (efectivo, tarjeta o mixto),
// valida los métodos de pago del salón, controla sobrepago / pago insuficiente
// y marca la venta como 'pagada' cuando queda cubierta.
//
// Semántica de importes: positivo = cobro, negativo = devolución/cambio.
// Sólo los pagos 'completado' cuentan para el saldo.
//
// POST body → registrarPagoSchema. Respuesta 200 → TicketCompleto.
// ============================================================================

import { registrarPagoSchema } from '../../shared/schemas.ts';
import { redondear2, TOLERANCIA_EUR } from '../../shared/money.ts';
import { ErrorTpv } from '../../shared/errors.ts';
import {
  exigirMetodo,
  json,
  parsearBody,
  preflight,
  respuestaError,
} from '../_shared/http.ts';
import { clienteUsuario, mapearErrorPg } from '../_shared/supabase.ts';
import { cargarTicket, exigirTicketAbierto } from '../_shared/ticket.ts';

Deno.serve(async (req: Request): Promise<Response> => {
  const pre = preflight(req);
  if (pre) return pre;

  try {
    exigirMetodo(req, 'POST');
    const input = await parsearBody(req, registrarPagoSchema);
    const sb = clienteUsuario(req);

    // 1. Cargar el ticket y validar que admite cobro.
    const ticket = await cargarTicket(sb, input.venta_id);
    exigirTicketAbierto(ticket.venta);
    if (ticket.lineas.length === 0) {
      throw new ErrorTpv('SIN_LINEAS', 'No se puede cobrar un ticket sin líneas');
    }

    // 2. Validar que los métodos de pago existen, están activos y son del salón.
    const metodoIds = [...new Set(input.pagos.map((p) => p.metodo_pago_id))];
    const { data: metodos, error: metErr } = await sb
      .from('tpv_metodos_pago')
      .select('id, activo, salon_id')
      .in('id', metodoIds);
    if (metErr) throw mapearErrorPg(metErr);

    const validos = new Map((metodos ?? []).map((m) => [m.id, m]));
    for (const id of metodoIds) {
      const m = validos.get(id);
      if (!m || m.salon_id !== ticket.venta.salon_id || !m.activo) {
        throw new ErrorTpv(
          'METODO_PAGO_INVALIDO',
          'Método de pago inexistente, inactivo o de otro salón',
          { metodo_pago_id: id },
        );
      }
    }

    // 3. Calcular el saldo resultante ANTES de insertar (validación previa).
    const nuevosCompletados = redondear2(
      input.pagos
        .filter((p) => p.estado === 'completado')
        .reduce((acc, p) => acc + p.importe, 0),
    );
    const pagadoFinal = redondear2(ticket.saldo.pagado + nuevosCompletados);
    const pendienteFinal = redondear2(ticket.venta.total - pagadoFinal);

    if (pendienteFinal < -TOLERANCIA_EUR) {
      throw new ErrorTpv(
        'SOBREPAGO',
        `El cobro supera el total en ${redondear2(-pendienteFinal)} €. ` +
          'Incluye una línea de cambio (importe negativo) para el efectivo.',
        { total: ticket.venta.total, pagado_final: pagadoFinal },
      );
    }

    const cubierto = Math.abs(pendienteFinal) < TOLERANCIA_EUR;
    if (input.marcar_pagada && !input.permitir_parcial && !cubierto) {
      throw new ErrorTpv(
        'PAGO_INSUFICIENTE',
        `Faltan ${pendienteFinal} € para cubrir el total. ` +
          'Usa permitir_parcial=true para un cobro parcial.',
        { total: ticket.venta.total, pendiente: pendienteFinal },
      );
    }

    // 4. Insertar los pagos (salon_id denormalizado desde la venta).
    const filas = input.pagos.map((p) => ({
      venta_id: ticket.venta.id,
      salon_id: ticket.venta.salon_id,
      metodo_pago_id: p.metodo_pago_id,
      sesion_caja_id: input.sesion_caja_id ?? ticket.venta.sesion_caja_id ?? null,
      importe: p.importe,
      estado: p.estado,
      referencia_externa: p.referencia_externa ?? null,
    }));
    const ins = await sb.from('tpv_pagos').insert(filas);
    if (ins.error) throw mapearErrorPg(ins.error);

    // 5. Marcar la venta como pagada si queda cubierta y así se solicitó.
    if (cubierto && input.marcar_pagada) {
      const upd = await sb
        .from('tpv_ventas')
        .update({ estado: 'pagada' })
        .eq('id', ticket.venta.id)
        .select('id')
        .single();
      if (upd.error) throw mapearErrorPg(upd.error);
    }

    return json(await cargarTicket(sb, ticket.venta.id), 200);
  } catch (e) {
    return respuestaError(e);
  }
});
