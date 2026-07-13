// ============================================================================
// TPV · Lógica de dominio de facturación (servidor, reutilizada por funciones)
// ----------------------------------------------------------------------------
// Emitir una factura a partir de un ticket y cargar facturas ya emitidas. El
// servidor es autoritativo: recalcula base/IVA/total desde las líneas del ticket
// (nunca del cliente), congela el snapshot fiscal y delega la numeración
// correlativa por (salon, serie) al trigger de BD. La AUTORIZACIÓN la impone la
// RLS por salón (el cliente reenvía el JWT del usuario).
// ============================================================================

import { ErrorTpv } from '../../shared/errors.ts';
import {
  construirSnapshotFactura,
  montarFacturaCompleta,
} from '../../shared/factura.ts';
import type {
  ConfigFacturacion,
  Factura,
  FacturaCompleta,
} from '../../shared/types.ts';
import type {
  DatosFiscalesClienteInput,
  EmitirFacturaInput,
} from '../../shared/schemas.ts';
import { mapearErrorPg, type SupabaseClient } from './supabase.ts';
import { cargarTicket } from './ticket.ts';

/** Serie por defecto cuando el salón no tiene configuración de facturación. */
const SERIE_POR_DEFECTO = 'A';
const MONEDA_POR_DEFECTO = 'EUR';

/** Estados de ticket que NO admiten facturación. */
const ESTADOS_NO_FACTURABLES = new Set(['anulada', 'reembolsada']);

/** Carga la config de facturación del salón (o null si aún no está creada). */
export async function cargarConfigFacturacion(
  sb: SupabaseClient,
  salonId: string,
): Promise<ConfigFacturacion | null> {
  const { data, error } = await sb
    .from('tpv_config_facturacion')
    .select('*')
    .eq('salon_id', salonId)
    .maybeSingle();
  if (error) throw mapearErrorPg(error);
  return (data as ConfigFacturacion | null) ?? null;
}

/** Normaliza los datos fiscales del cliente recibidos a valores persistibles. */
function snapshotCliente(cliente?: DatosFiscalesClienteInput) {
  return {
    razon_social: cliente?.razon_social ?? null,
    nif: cliente?.nif ?? null,
    direccion_fiscal: cliente?.direccion_fiscal ?? null,
    cliente_email: cliente?.email ?? null,
  };
}

/**
 * Emite una factura a partir de un ticket:
 *   1. Carga el ticket (RLS) y valida que es facturable (con líneas, no anulado).
 *   2. Resuelve serie/emisor/moneda/pie desde la config del salón (con override
 *      de serie y de datos de cliente en la petición).
 *   3. Recalcula base/IVA/total y congela el snapshot (emisor, desglose, líneas).
 *   4. Inserta la factura; el número correlativo lo asigna el trigger de BD.
 *
 * Un ticket sólo puede facturarse una vez (UNIQUE venta_id) → TICKET_YA_FACTURADO.
 */
export async function emitirFactura(
  sb: SupabaseClient,
  input: EmitirFacturaInput,
): Promise<FacturaCompleta> {
  const ticket = await cargarTicket(sb, input.venta_id);

  if (ESTADOS_NO_FACTURABLES.has(ticket.venta.estado)) {
    throw new ErrorTpv(
      'TICKET_NO_FACTURABLE',
      `El ticket #${ticket.venta.numero_ticket} está '${ticket.venta.estado}' y no se puede facturar`,
    );
  }
  if (ticket.lineas.length === 0) {
    throw new ErrorTpv(
      'TICKET_NO_FACTURABLE',
      'No se puede facturar un ticket sin líneas',
    );
  }

  const config = await cargarConfigFacturacion(sb, ticket.venta.salon_id);

  const serie = input.serie ?? config?.serie_por_defecto ?? SERIE_POR_DEFECTO;
  const moneda = config?.moneda ?? MONEDA_POR_DEFECTO;

  // Recalcular importes y congelar líneas desde lo persistido (autoritativo).
  const { lineas_snapshot, resumen } = construirSnapshotFactura(ticket.lineas);

  const fila = {
    salon_id: ticket.venta.salon_id,
    venta_id: ticket.venta.id,
    cliente_id: ticket.venta.cliente_id,
    serie,
    estado: 'emitida' as const,
    ...snapshotCliente(input.cliente),
    emisor_razon_social: config?.emisor_razon_social ?? null,
    emisor_nif: config?.emisor_nif ?? null,
    emisor_direccion_fiscal: config?.emisor_direccion_fiscal ?? null,
    base_imponible: resumen.base_imponible,
    impuestos: resumen.impuestos,
    total: resumen.total,
    moneda,
    desglose_iva: resumen.desglose_iva,
    lineas_snapshot,
    pie_factura: config?.pie_factura ?? null,
  };

  const { data, error } = await sb
    .from('tpv_facturas')
    .insert(fila)
    .select('*')
    .single();

  if (error) {
    // UNIQUE(venta_id) → el ticket ya estaba facturado: mensaje específico.
    if (error.code === '23505') {
      throw new ErrorTpv(
        'TICKET_YA_FACTURADO',
        `El ticket #${ticket.venta.numero_ticket} ya tiene una factura emitida`,
      );
    }
    throw mapearErrorPg(error);
  }

  return montarFacturaCompleta(data as Factura);
}

/** Carga una factura ya emitida por su id o por el ticket del que procede. */
export async function cargarFactura(
  sb: SupabaseClient,
  ref: { factura_id?: string; venta_id?: string },
): Promise<FacturaCompleta> {
  let q = sb.from('tpv_facturas').select('*');
  q = ref.factura_id
    ? q.eq('id', ref.factura_id)
    : q.eq('venta_id', ref.venta_id as string);

  const { data, error } = await q.maybeSingle();
  if (error) throw mapearErrorPg(error);
  if (!data) throw new ErrorTpv('NO_ENCONTRADO', 'Factura no encontrada');

  return montarFacturaCompleta(data as Factura);
}
