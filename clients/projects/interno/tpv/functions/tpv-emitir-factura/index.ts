// ============================================================================
// Edge Function · tpv-emitir-factura
// ----------------------------------------------------------------------------
// Emite una factura a partir de un ticket. El servidor recalcula base/IVA/total
// desde las líneas persistidas, congela el snapshot fiscal (emisor + cliente +
// desglose + líneas) y la BD asigna el número correlativo por (salon, serie).
// La serie se toma de la config del salón salvo override en la petición.
//
// POST body → emitirFacturaSchema. Respuesta 201 → FacturaCompleta.
// ============================================================================

import { emitirFacturaSchema } from '../../shared/schemas.ts';
import {
  exigirMetodo,
  json,
  parsearBody,
  preflight,
  respuestaError,
} from '../_shared/http.ts';
import { clienteUsuario } from '../_shared/supabase.ts';
import { emitirFactura } from '../_shared/factura.ts';

Deno.serve(async (req: Request): Promise<Response> => {
  const pre = preflight(req);
  if (pre) return pre;

  try {
    exigirMetodo(req, 'POST');
    const input = await parsearBody(req, emitirFacturaSchema);
    const sb = clienteUsuario(req);

    return json(await emitirFactura(sb, input), 201);
  } catch (e) {
    return respuestaError(e);
  }
});
