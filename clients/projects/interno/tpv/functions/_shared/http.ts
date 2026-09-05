// ============================================================================
// TPV · Utilidades HTTP para las Edge Functions
// ----------------------------------------------------------------------------
// Respuestas JSON con CORS, gestión de preflight, parseo+validación del body
// con Zod y traducción uniforme de errores (ErrorTpv / ZodError) a respuesta.
// ============================================================================

import { z } from 'zod';
import { CORS } from './cors.ts';
import { ErrorTpv, esErrorTpv } from '../../shared/errors.ts';

/** Respuesta JSON con cabeceras CORS. */
export function json(
  data: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS, ...extraHeaders },
  });
}

/** Responde el preflight OPTIONS; devuelve null si no aplica. */
export function preflight(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }
  return null;
}

/** Exige un método concreto (por defecto POST) o lanza METODO_NO_PERMITIDO. */
export function exigirMetodo(req: Request, metodo = 'POST'): void {
  if (req.method !== metodo) {
    throw new ErrorTpv(
      'METODO_NO_PERMITIDO',
      `Método ${req.method} no permitido; usa ${metodo}`,
    );
  }
}

/**
 * Lee el body JSON y lo valida contra un esquema Zod. Lanza ErrorTpv
 * ('VALIDACION') con el detalle de campos si no cumple.
 */
export async function parsearBody<S extends z.ZodTypeAny>(
  req: Request,
  schema: S,
): Promise<z.infer<S>> {
  let bruto: unknown;
  try {
    bruto = await req.json();
  } catch {
    throw new ErrorTpv('VALIDACION', 'El cuerpo de la petición no es JSON válido');
  }

  const parsed = schema.safeParse(bruto);
  if (!parsed.success) {
    throw new ErrorTpv(
      'VALIDACION',
      'Datos de entrada no válidos',
      parsed.error.flatten(),
    );
  }
  return parsed.data;
}

/** Traduce cualquier excepción capturada a una respuesta JSON tipada. */
export function respuestaError(e: unknown): Response {
  if (esErrorTpv(e)) {
    return json(e.toJSON(), e.status);
  }
  console.error('[tpv] error no controlado:', e);
  const interno = new ErrorTpv('INTERNO', 'Error interno del servidor');
  return json(interno.toJSON(), interno.status);
}
