// ============================================================================
// Edge Function · tpv-obtener-factura
// ----------------------------------------------------------------------------
// Devuelve una factura ya emitida (por factura_id o por venta_id) para verla,
// reimprimirla o exportarla a PDF. Sólo lectura; RLS por salón vía JWT.
//
// POST body → obtenerFacturaSchema. Respuesta 200 → FacturaCompleta.
// ============================================================================

import { obtenerFacturaSchema } from '../../shared/schemas.ts';
import {
  exigirMetodo,
  json,
  parsearBody,
  preflight,
  respuestaError,
} from '../_shared/http.ts';
import { clienteUsuario } from '../_shared/supabase.ts';
import { cargarFactura } from '../_shared/factura.ts';

Deno.serve(async (req: Request): Promise<Response> => {
  const pre = preflight(req);
  if (pre) return pre;

  try {
    exigirMetodo(req, 'POST');
    const input = await parsearBody(req, obtenerFacturaSchema);
    const sb = clienteUsuario(req);

    return json(await cargarFactura(sb, input), 200);
  } catch (e) {
    return respuestaError(e);
  }
});
