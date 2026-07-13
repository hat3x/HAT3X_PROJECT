// ============================================================================
// Edge Function · tpv-obtener-reserva-cobro  (sub-7)
// ----------------------------------------------------------------------------
// Enlace BIDIRECCIONAL de lectura: dado un `reserva_id`, devuelve su estado de
// cobro derivado (`estado_cobro`) y el ticket vivo asociado (si lo hay), a
// partir de la vista `tpv_v_reservas_cobro`. Sólo lectura; RLS por salón.
// Útil para pintar en la agenda un chip "Cobrada / Pendiente / Sin ticket" y
// para abrir el ticket asociado desde la reserva.
//
// POST body → obtenerReservaCobroSchema. Respuesta 200 → ReservaCobro.
// ============================================================================

import { obtenerReservaCobroSchema } from '../../shared/schemas.ts';
import {
  exigirMetodo,
  json,
  parsearBody,
  preflight,
  respuestaError,
} from '../_shared/http.ts';
import { clienteUsuario, mapearErrorPg } from '../_shared/supabase.ts';
import { CODIGOS_RELACION_AUSENTE } from '../_shared/reserva.ts';
import { ErrorTpv } from '../../shared/errors.ts';
import type { ReservaCobro } from '../../shared/types.ts';

Deno.serve(async (req: Request): Promise<Response> => {
  const pre = preflight(req);
  if (pre) return pre;

  try {
    exigirMetodo(req, 'POST');
    const input = await parsearBody(req, obtenerReservaCobroSchema);
    const sb = clienteUsuario(req);

    const { data, error } = await sb
      .from('tpv_v_reservas_cobro')
      .select('*')
      .eq('reserva_id', input.reserva_id)
      .maybeSingle();

    if (error) {
      if (error.code && CODIGOS_RELACION_AUSENTE.has(error.code)) {
        throw new ErrorTpv(
          'INTEGRACION_RESERVAS',
          'La integración con reservas no está disponible (falta la vista tpv_v_reservas_cobro). Aplica la migración 20260713000005.',
        );
      }
      throw mapearErrorPg(error);
    }
    if (!data) throw new ErrorTpv('NO_ENCONTRADO', 'Reserva no encontrada');

    return json(data as ReservaCobro, 200);
  } catch (e) {
    return respuestaError(e);
  }
});
