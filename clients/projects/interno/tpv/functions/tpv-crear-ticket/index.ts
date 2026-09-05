// ============================================================================
// Edge Function · tpv-crear-ticket
// ----------------------------------------------------------------------------
// Crea una venta/ticket (cabecera 'abierta') opcionalmente con líneas iniciales.
// El correlativo `numero_ticket` lo asigna el trigger de BD por salón. Totales
// calculados en servidor. RLS por salón aplicada vía JWT del usuario.
//
// POST body → crearTicketSchema. Respuesta 201 → TicketCompleto.
// ============================================================================

import { crearTicketSchema } from '../../shared/schemas.ts';
import {
  exigirMetodo,
  json,
  parsearBody,
  preflight,
  respuestaError,
} from '../_shared/http.ts';
import { clienteUsuario, mapearErrorPg } from '../_shared/supabase.ts';
import { cargarTicket, cargarVenta, reemplazarLineas } from '../_shared/ticket.ts';

Deno.serve(async (req: Request): Promise<Response> => {
  const pre = preflight(req);
  if (pre) return pre;

  try {
    exigirMetodo(req, 'POST');
    const input = await parsearBody(req, crearTicketSchema);
    const sb = clienteUsuario(req);

    // 1. Crear la cabecera vacía. WITH CHECK de RLS rechaza salones ajenos.
    const { data: venta, error } = await sb
      .from('tpv_ventas')
      .insert({
        salon_id: input.salon_id,
        sesion_caja_id: input.sesion_caja_id ?? null,
        reserva_id: input.reserva_id ?? null,
        cliente_id: input.cliente_id ?? null,
        empleado_id: input.empleado_id ?? null,
        notas: input.notas ?? null,
      })
      .select('*')
      .single();
    if (error) throw mapearErrorPg(error);

    // 2. Si vienen líneas iniciales, insertarlas y recalcular la cabecera.
    if (input.lineas.length > 0) {
      const ticket = await reemplazarLineas(
        sb,
        await cargarVenta(sb, venta.id),
        input.lineas,
      );
      return json(ticket, 201);
    }

    return json(await cargarTicket(sb, venta.id), 201);
  } catch (e) {
    return respuestaError(e);
  }
});
