// ============================================================================
// Edge Function · tpv-crear-ticket-desde-reserva  (sub-7)
// ----------------------------------------------------------------------------
// Convierte una reserva COMPLETADA en un ticket TPV precargado con el servicio
// y el cliente de la reserva, listo para cobrar. No modifica la reserva ni la
// agenda: sólo crea la venta (con `reserva_id`) y su línea de servicio.
//
// Idempotente: si la reserva ya tiene un ticket vivo (no anulado), se devuelve
// ESE mismo ticket (200, ya_existia=true) en vez de abrir uno nuevo. El índice
// único parcial de BD garantiza la invariante incluso ante llamadas paralelas.
//
// POST body → crearTicketDesdeReservaSchema. Respuesta → TicketDesdeReserva
// (201 si se creó, 200 si ya existía).
// ============================================================================

import { crearTicketDesdeReservaSchema } from '../../shared/schemas.ts';
import {
  exigirMetodo,
  json,
  parsearBody,
  preflight,
  respuestaError,
} from '../_shared/http.ts';
import { clienteUsuario, mapearErrorPg } from '../_shared/supabase.ts';
import { ErrorTpv } from '../../shared/errors.ts';
import { cargarTicket, cargarVenta, reemplazarLineas } from '../_shared/ticket.ts';
import {
  cargarPrecargaReserva,
  exigirReservaCompletada,
  lineaDesdePrecarga,
  ticketVivoDeReserva,
} from '../_shared/reserva.ts';
import type { TicketCompleto } from '../../shared/types.ts';

Deno.serve(async (req: Request): Promise<Response> => {
  const pre = preflight(req);
  if (pre) return pre;

  try {
    exigirMetodo(req, 'POST');
    const input = await parsearBody(req, crearTicketDesdeReservaSchema);
    const sb = clienteUsuario(req);

    // 1. Leer la reserva (vista con RLS) y validar que es cobrable.
    const precarga = await cargarPrecargaReserva(sb, input.reserva_id);
    exigirReservaCompletada(precarga);

    // 2. Idempotencia: si ya hay un ticket vivo para la reserva, devolverlo.
    const existente = await ticketVivoDeReserva(sb, input.reserva_id);
    if (existente) {
      const ticket = await cargarTicket(sb, existente.id);
      return json({ ticket, ya_existia: true }, 200);
    }

    // 3. Crear la cabecera enlazada a la reserva (cliente/empleado heredados).
    const { data: venta, error } = await sb
      .from('tpv_ventas')
      .insert({
        salon_id: precarga.salon_id,
        reserva_id: precarga.reserva_id,
        cliente_id: precarga.cliente_id ?? null,
        empleado_id: input.empleado_id ?? precarga.empleado_id ?? null,
        sesion_caja_id: input.sesion_caja_id ?? null,
        notas: input.notas ?? null,
      })
      .select('*')
      .single();

    if (error) {
      // 23505 = otro proceso creó el ticket a la vez (índice único parcial):
      // resolver la carrera devolviendo el ticket ya existente.
      if (error.code === '23505') {
        const ganador = await ticketVivoDeReserva(sb, input.reserva_id);
        if (ganador) {
          const ticket = await cargarTicket(sb, ganador.id);
          return json({ ticket, ya_existia: true }, 200);
        }
      }
      throw mapearErrorPg(error);
    }
    if (!venta) {
      throw new ErrorTpv('INTERNO', 'No se obtuvo la venta tras crearla');
    }

    // 4. Precargar la línea del servicio y recalcular la cabecera.
    const ticket: TicketCompleto = await reemplazarLineas(
      sb,
      await cargarVenta(sb, venta.id),
      [lineaDesdePrecarga(precarga)],
    );

    return json({ ticket, ya_existia: false }, 201);
  } catch (e) {
    return respuestaError(e);
  }
});
