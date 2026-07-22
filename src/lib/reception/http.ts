/**
 * Helpers de RESPUESTA JSON para los Route Handlers de `/api/reception`.
 *
 * Capa fina sobre `NextResponse` que aplica el contrato de `@/lib/reception/errors`
 * de forma UNIFORME: cada endpoint responde éxito y error EXACTAMENTE igual, sin
 * repetir el `NextResponse.json(..., { status })` a mano (donde es fácil que el
 * status o la forma diverjan).
 *
 * Es lo ÚNICO del módulo de recepción que importa `next/server`; toda la lógica de
 * códigos/mensajes vive en `./errors` (pura y testeable sin el runtime de Next).
 *
 * Uso típico en un Route Handler:
 * ```ts
 * export async function POST(request: NextRequest) {
 *   try {
 *     const data = await createReceptionBooking(await request.json());
 *     return receptionCreated(data);            // 201, no-store
 *   } catch (error) {
 *     return receptionErrorResponse(error);     // ReceptionError → contrato; resto → 500
 *   }
 * }
 * ```
 */
import { NextResponse } from "next/server";

import {
  isReceptionErrorCode,
  normalizeReceptionError,
  ReceptionError,
  toReceptionErrorBody,
  type ReceptionErrorBody,
  type ReceptionErrorCode,
  type ReceptionErrorOptions,
} from "@/lib/reception/errors";

/**
 * Las respuestas de recepción son autenticadas y dependen del salón/sesión: NUNCA
 * se cachean. Se fija en TODAS (éxito y error) para que ni un proxy ni el CDN
 * sirvan datos de otra sesión.
 */
const NO_STORE_HEADERS = { "Cache-Control": "no-store" } as const;

/** Fusiona `Cache-Control: no-store` con cabeceras extra opcionales del llamador. */
function withNoStore(headers?: HeadersInit): Headers {
  const merged = new Headers(headers);
  merged.set("Cache-Control", "no-store");
  return merged;
}

// -----------------------------------------------------------------------------
// Éxito
// -----------------------------------------------------------------------------

/** Opciones de las respuestas de éxito de recepción. */
export interface ReceptionJsonInit {
  /** Estado HTTP; por defecto 200. Usa 201 para creaciones. */
  status?: number;
  /** Cabeceras adicionales (se les añade siempre `Cache-Control: no-store`). */
  headers?: HeadersInit;
}

/**
 * Respuesta de ÉXITO uniforme: serializa `data` tal cual (payload directo, como el
 * resto de la app —p. ej. `/api/public/booking`—, sin envoltorio `{ data }`) y
 * fuerza `no-store`. `status` por defecto 200.
 */
export function receptionJson<T>(data: T, init: ReceptionJsonInit = {}): NextResponse {
  return NextResponse.json(data, {
    status: init.status ?? 200,
    headers: withNoStore(init.headers),
  });
}

/**
 * Azúcar para creaciones: `receptionJson(data, { status: 201 })`. Si se pasa
 * `location`, añade la cabecera `Location` (recomendada tras un POST que crea).
 */
export function receptionCreated<T>(data: T, location?: string): NextResponse {
  const headers: Record<string, string> = {};
  if (location !== undefined) headers.Location = location;
  return receptionJson(data, { status: 201, headers });
}

/** `204 No Content` uniforme (p. ej. tras cancelar una cita). Sin cuerpo. */
export function receptionNoContent(): NextResponse {
  return new NextResponse(null, { status: 204, headers: NO_STORE_HEADERS });
}

// -----------------------------------------------------------------------------
// Error
// -----------------------------------------------------------------------------

/**
 * Respuesta de ERROR uniforme. Dos formas (sobrecargas):
 *   · `receptionErrorResponse("SLOT_TAKEN", options?)` — un código ESTABLE (el tipo
 *     obliga a que sea uno del contrato: cazas los typos en compilación) + opciones
 *     para sobrescribir mensaje / adjuntar `details`.
 *   · `receptionErrorResponse(error)` — para el `catch`: un `ReceptionError` se usa
 *     tal cual; CUALQUIER otro valor (Error de Postgrest, string suelto…) se colapsa
 *     a `INTERNAL_ERROR` (500) sin filtrar el detalle interno.
 *
 * Siempre emite el cuerpo del contrato `{ error: { code, message, details? } }` con
 * el `status` del catálogo y `Cache-Control: no-store`. Es DEFENSIVA: nunca lanza,
 * ni siquiera si (desde JS sin tipos) llega un string que no es un código válido.
 */
export function receptionErrorResponse(
  code: ReceptionErrorCode,
  options?: ReceptionErrorOptions,
): NextResponse<ReceptionErrorBody>;
export function receptionErrorResponse(error: unknown): NextResponse<ReceptionErrorBody>;
export function receptionErrorResponse(
  input: unknown,
  options?: ReceptionErrorOptions,
): NextResponse<ReceptionErrorBody> {
  const error = isReceptionErrorCode(input)
    ? new ReceptionError(input, options)
    : normalizeReceptionError(input);

  return NextResponse.json(toReceptionErrorBody(error), {
    status: error.status,
    headers: NO_STORE_HEADERS,
  });
}
