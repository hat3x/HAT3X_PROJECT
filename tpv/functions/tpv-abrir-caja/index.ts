// ============================================================================
// Edge Function · tpv-abrir-caja
// ----------------------------------------------------------------------------
// Abre una sesión de caja con un fondo inicial. Como máximo puede haber UNA
// sesión abierta por salón (índice único parcial en BD); si ya hay una, se
// devuelve CAJA_YA_ABIERTA en vez de un conflicto genérico. RLS por salón vía
// el JWT del usuario.
//
// POST body → abrirCajaSchema. Respuesta 201 → CajaCompleta.
// ============================================================================

import { abrirCajaSchema } from '../../shared/schemas.ts';
import { ErrorTpv } from '../../shared/errors.ts';
import {
  exigirMetodo,
  json,
  parsearBody,
  preflight,
  respuestaError,
} from '../_shared/http.ts';
import { clienteUsuario, mapearErrorPg } from '../_shared/supabase.ts';
import { cargarCaja, sesionAbiertaDeSalon } from '../_shared/caja.ts';
import type { SesionCaja } from '../../shared/types.ts';

Deno.serve(async (req: Request): Promise<Response> => {
  const pre = preflight(req);
  if (pre) return pre;

  try {
    exigirMetodo(req, 'POST');
    const input = await parsearBody(req, abrirCajaSchema);
    const sb = clienteUsuario(req);

    // 1. Rechazo temprano si el salón ya tiene una caja abierta (mensaje claro).
    const yaAbierta = await sesionAbiertaDeSalon(sb, input.salon_id);
    if (yaAbierta) {
      throw new ErrorTpv(
        'CAJA_YA_ABIERTA',
        'Ya hay una sesión de caja abierta en este salón; ciérrala antes de abrir otra',
        { sesion_caja_id: yaAbierta.id },
      );
    }

    // 2. Insertar la sesión. El índice único parcial protege ante una carrera
    //    (dos aperturas simultáneas): el 23505 se traduce a CAJA_YA_ABIERTA.
    const { data, error } = await sb
      .from('tpv_sesiones_caja')
      .insert({
        salon_id: input.salon_id,
        empleado_apertura_id: input.empleado_apertura_id ?? null,
        saldo_inicial: input.saldo_inicial,
        notas: input.notas ?? null,
      })
      .select('*')
      .single();

    if (error) {
      if (error.code === '23505') {
        throw new ErrorTpv(
          'CAJA_YA_ABIERTA',
          'Ya hay una sesión de caja abierta en este salón',
        );
      }
      throw mapearErrorPg(error);
    }

    return json(await cargarCaja(sb, data as SesionCaja), 201);
  } catch (e) {
    return respuestaError(e);
  }
});
