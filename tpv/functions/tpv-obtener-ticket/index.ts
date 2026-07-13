// ============================================================================
// Edge Function · tpv-obtener-ticket
// ----------------------------------------------------------------------------
// Devuelve el agregado completo de un ticket: cabecera + líneas + pagos +
// saldo (total / pagado / pendiente). Sólo lectura; RLS por salón vía JWT.
//
// POST body → obtenerTicketSchema. Respuesta 200 → TicketCompleto.
// (POST y no GET para llevar el venta_id en el cuerpo con validación Zod y
//  mantener la firma homogénea con el resto de funciones de cobro.)
// ============================================================================

import { obtenerTicketSchema } from '../../shared/schemas.ts';
import {
  exigirMetodo,
  json,
  parsearBody,
  preflight,
  respuestaError,
} from '../_shared/http.ts';
import { clienteUsuario } from '../_shared/supabase.ts';
import { cargarTicket } from '../_shared/ticket.ts';

Deno.serve(async (req: Request): Promise<Response> => {
  const pre = preflight(req);
  if (pre) return pre;

  try {
    exigirMetodo(req, 'POST');
    const input = await parsearBody(req, obtenerTicketSchema);
    const sb = clienteUsuario(req);

    return json(await cargarTicket(sb, input.venta_id), 200);
  } catch (e) {
    return respuestaError(e);
  }
});
