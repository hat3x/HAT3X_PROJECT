// ============================================================================
// Edge Function · tpv-actualizar-lineas
// ----------------------------------------------------------------------------
// Reemplaza el conjunto de líneas de un ticket 'abierto' (añadir, editar,
// eliminar y aplicar descuentos, de forma uniforme) y recalcula la cabecera
// (subtotal, descuento_total, impuestos_total, total) en el servidor.
//
// POST body → actualizarLineasSchema. Respuesta 200 → TicketCompleto.
// ============================================================================

import { actualizarLineasSchema } from '../../shared/schemas.ts';
import {
  exigirMetodo,
  json,
  parsearBody,
  preflight,
  respuestaError,
} from '../_shared/http.ts';
import { clienteUsuario } from '../_shared/supabase.ts';
import { cargarVenta, reemplazarLineas } from '../_shared/ticket.ts';

Deno.serve(async (req: Request): Promise<Response> => {
  const pre = preflight(req);
  if (pre) return pre;

  try {
    exigirMetodo(req, 'POST');
    const input = await parsearBody(req, actualizarLineasSchema);
    const sb = clienteUsuario(req);

    // Cargar la venta (RLS decide visibilidad) y exigir estado 'abierta'.
    const venta = await cargarVenta(sb, input.venta_id);
    const ticket = await reemplazarLineas(sb, venta, input.lineas);

    return json(ticket, 200);
  } catch (e) {
    return respuestaError(e);
  }
});
