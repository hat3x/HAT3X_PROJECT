// ============================================================================
// Edge Function · tpv-cerrar-caja
// ----------------------------------------------------------------------------
// Cierra una sesión de caja con arqueo. El cajero aporta el efectivo REAL
// contado; el servidor calcula el efectivo TEÓRICO de forma autoritativa (fondo
// + cobros en efectivo + movimientos) y el DESCUADRE = real − teórico. Ningún
// importe de arqueo llega manipulado desde el navegador. RLS por salón vía JWT.
//
// POST body → cerrarCajaSchema. Respuesta 200 → CajaCompleta (ya cerrada).
// ============================================================================

import { cerrarCajaSchema } from '../../shared/schemas.ts';
import { redondear2 } from '../../shared/money.ts';
import {
  exigirMetodo,
  json,
  parsearBody,
  preflight,
  respuestaError,
} from '../_shared/http.ts';
import { clienteUsuario, mapearErrorPg } from '../_shared/supabase.ts';
import {
  cargarCaja,
  cargarSesion,
  exigirSesionAbierta,
} from '../_shared/caja.ts';
import type { SesionCaja } from '../../shared/types.ts';

Deno.serve(async (req: Request): Promise<Response> => {
  const pre = preflight(req);
  if (pre) return pre;

  try {
    exigirMetodo(req, 'POST');
    const input = await parsearBody(req, cerrarCajaSchema);
    const sb = clienteUsuario(req);

    // 1. Cargar la sesión y exigir que siga abierta.
    const sesion = await cargarSesion(sb, input.sesion_caja_id);
    exigirSesionAbierta(sesion);

    // 2. Calcular el teórico AUTORITATIVO desde lo persistido (arqueo abierto).
    const cajaPrevia = await cargarCaja(sb, sesion);
    const efectivoTeorico = cajaPrevia.arqueo.efectivo_teorico;
    const efectivoReal = redondear2(input.efectivo_real);
    const descuadre = redondear2(efectivoReal - efectivoTeorico);

    // 3. Cerrar: fijar teórico, real, descuadre y sello de cierre.
    const notas = componerNotas(sesion.notas, input.notas_cierre ?? null);
    const { data, error } = await sb
      .from('tpv_sesiones_caja')
      .update({
        estado: 'cerrada',
        cerrada_at: new Date().toISOString(),
        saldo_final_teorico: efectivoTeorico,
        saldo_final_real: efectivoReal,
        descuadre,
        empleado_cierre_id: input.empleado_cierre_id ?? null,
        notas,
      })
      .eq('id', sesion.id)
      .eq('estado', 'abierta') // no re-cerrar si ya la cerró otro (idempotencia)
      .select('*')
      .single();

    if (error) throw mapearErrorPg(error);

    return json(await cargarCaja(sb, data as SesionCaja), 200);
  } catch (e) {
    return respuestaError(e);
  }
});

/** Añade una nota de cierre a las notas de apertura, sin perder ninguna. */
function componerNotas(previas: string | null, cierre: string | null): string | null {
  const partes = [previas?.trim(), cierre ? `Cierre: ${cierre.trim()}` : null].filter(
    Boolean,
  );
  return partes.length ? partes.join('\n') : null;
}
