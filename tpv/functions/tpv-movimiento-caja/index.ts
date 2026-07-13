// ============================================================================
// Edge Function · tpv-movimiento-caja
// ----------------------------------------------------------------------------
// Registra un movimiento manual de efectivo (entrada/salida) sobre una sesión
// de caja ABIERTA: aportación de fondo, retirada para gasto, pago en efectivo a
// proveedor, etc. El `salon_id` se toma de la sesión (no del cliente) para que
// no se pueda inyectar un movimiento en otro salón. RLS por salón vía JWT.
//
// POST body → movimientoCajaSchema. Respuesta 201 → CajaCompleta.
// ============================================================================

import { movimientoCajaSchema } from '../../shared/schemas.ts';
import {
  exigirMetodo,
  json,
  parsearBody,
  preflight,
  respuestaError,
} from '../_shared/http.ts';
import { clienteUsuario, mapearErrorPg } from '../_shared/supabase.ts';
import { cargarCaja, cargarSesion, exigirSesionAbierta } from '../_shared/caja.ts';

Deno.serve(async (req: Request): Promise<Response> => {
  const pre = preflight(req);
  if (pre) return pre;

  try {
    exigirMetodo(req, 'POST');
    const input = await parsearBody(req, movimientoCajaSchema);
    const sb = clienteUsuario(req);

    // 1. Cargar la sesión y exigir que esté abierta.
    const sesion = await cargarSesion(sb, input.sesion_caja_id);
    exigirSesionAbierta(sesion);

    // 2. Insertar el movimiento (salon_id denormalizado desde la sesión).
    const ins = await sb.from('tpv_movimientos_caja').insert({
      sesion_caja_id: sesion.id,
      salon_id: sesion.salon_id,
      empleado_id: input.empleado_id ?? null,
      tipo: input.tipo,
      importe: input.importe,
      motivo: input.motivo,
    });
    if (ins.error) throw mapearErrorPg(ins.error);

    return json(await cargarCaja(sb, sesion), 201);
  } catch (e) {
    return respuestaError(e);
  }
});
