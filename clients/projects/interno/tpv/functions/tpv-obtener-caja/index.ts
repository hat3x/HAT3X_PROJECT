// ============================================================================
// Edge Function · tpv-obtener-caja
// ----------------------------------------------------------------------------
// Devuelve el agregado de caja: por id de sesión (para ver un cierre concreto o
// el turno en curso), o la sesión ABIERTA de un salón (para reanudar el turno al
// entrar en el TPV). Si se pide por salón y no hay caja abierta, responde el
// centinela { sesion: null } (200) en vez de un 404. RLS por salón vía JWT.
//
// POST body → obtenerCajaSchema. Respuesta 200 → CajaCompleta | { sesion: null }.
// ============================================================================

import { obtenerCajaSchema } from '../../shared/schemas.ts';
import {
  exigirMetodo,
  json,
  parsearBody,
  preflight,
  respuestaError,
} from '../_shared/http.ts';
import { clienteUsuario } from '../_shared/supabase.ts';
import { cargarCaja, cargarSesion, sesionAbiertaDeSalon } from '../_shared/caja.ts';

Deno.serve(async (req: Request): Promise<Response> => {
  const pre = preflight(req);
  if (pre) return pre;

  try {
    exigirMetodo(req, 'POST');
    const input = await parsearBody(req, obtenerCajaSchema);
    const sb = clienteUsuario(req);

    // Vía A: por id de sesión (abierta o cerrada).
    if (input.sesion_caja_id) {
      const sesion = await cargarSesion(sb, input.sesion_caja_id);
      return json(await cargarCaja(sb, sesion), 200);
    }

    // Vía B: la sesión abierta del salón (o centinela si no hay ninguna).
    const abierta = await sesionAbiertaDeSalon(sb, input.salon_id as string);
    if (!abierta) return json({ sesion: null }, 200);
    return json(await cargarCaja(sb, abierta), 200);
  } catch (e) {
    return respuestaError(e);
  }
});
