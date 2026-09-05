// ============================================================================
// TPV · Lógica de integración con la agenda/reservas (sub-7)
// ----------------------------------------------------------------------------
// Puente entre una reserva de la agenda y el agregado "ticket". Lee la reserva
// SIEMPRE a través de la vista `tpv_v_reserva_precarga` (que encapsula el
// esquema de la agenda y aplica la RLS del usuario), nunca de `reservas`
// directamente. El enlace hacia atrás (reserva → ticket vivo) se resuelve sobre
// `tpv_ventas`. No escribe nada en `reservas`: el flujo de agenda queda intacto.
// ============================================================================

import { ErrorTpv } from '../../shared/errors.ts';
import type { LineaInput } from '../../shared/schemas.ts';
import type { ReservaPrecarga, Venta } from '../../shared/types.ts';
import { mapearErrorPg, type SupabaseClient } from './supabase.ts';

/**
 * Estados de reserva considerados "completados" y por tanto cobrables. Ajusta
 * este conjunto al vocabulario de estados de tu agenda (ver también la vista
 * `tpv_v_reserva_precarga`). Se compara en minúsculas.
 */
export const ESTADOS_RESERVA_COMPLETADA: ReadonlySet<string> = new Set([
  'completada',
  'completado',
  'realizada',
  'realizado',
  'atendida',
  'atendido',
  'finalizada',
  'finalizado',
]);

/** Códigos PostgREST/PG que indican que la vista de integración no existe. */
export const CODIGOS_RELACION_AUSENTE: ReadonlySet<string> = new Set([
  '42P01',
  'PGRST205',
  'PGRST202',
]);

/**
 * Carga la precarga de una reserva (servicio + cliente) desde la vista. Lanza:
 *  · INTEGRACION_RESERVAS si la vista no existe (migración 0005 no aplicada o
 *    agenda sin `reservas`).
 *  · NO_ENCONTRADO si la reserva no existe o es invisible por RLS.
 */
export async function cargarPrecargaReserva(
  sb: SupabaseClient,
  reservaId: string,
): Promise<ReservaPrecarga> {
  const { data, error } = await sb
    .from('tpv_v_reserva_precarga')
    .select('*')
    .eq('reserva_id', reservaId)
    .maybeSingle();

  if (error) {
    if (error.code && CODIGOS_RELACION_AUSENTE.has(error.code)) {
      throw new ErrorTpv(
        'INTEGRACION_RESERVAS',
        'La integración con reservas no está disponible (falta la vista tpv_v_reserva_precarga). Aplica la migración 20260713000005.',
      );
    }
    throw mapearErrorPg(error);
  }
  if (!data) throw new ErrorTpv('NO_ENCONTRADO', 'Reserva no encontrada');
  return data as ReservaPrecarga;
}

/** Exige que la reserva esté en un estado cobrable; si no, RESERVA_NO_COMPLETADA. */
export function exigirReservaCompletada(precarga: ReservaPrecarga): void {
  const estado = (precarga.reserva_estado ?? '').trim().toLowerCase();
  if (!ESTADOS_RESERVA_COMPLETADA.has(estado)) {
    throw new ErrorTpv(
      'RESERVA_NO_COMPLETADA',
      `La reserva está '${precarga.reserva_estado}' y aún no se puede cobrar`,
    );
  }
}

/**
 * Devuelve el ticket "vivo" (no anulado) asociado a la reserva, o null. Es la
 * base de la idempotencia: no se abre un segundo ticket si ya hay uno.
 */
export async function ticketVivoDeReserva(
  sb: SupabaseClient,
  reservaId: string,
): Promise<Venta | null> {
  const { data, error } = await sb
    .from('tpv_ventas')
    .select('*')
    .eq('reserva_id', reservaId)
    .neq('estado', 'anulada')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw mapearErrorPg(error);
  return (data as Venta) ?? null;
}

/** Construye la línea de ticket (servicio) a partir de la precarga de reserva. */
export function lineaDesdePrecarga(precarga: ReservaPrecarga): LineaInput {
  return {
    tipo: 'servicio',
    referencia_id: precarga.servicio_id ?? null,
    descripcion: precarga.servicio_nombre,
    cantidad: 1,
    precio_unitario: precarga.precio,
    descuento: 0,
    tipo_impuesto: precarga.tipo_impuesto,
    orden: 0,
  };
}
