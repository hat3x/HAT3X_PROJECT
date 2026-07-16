/**
 * Traducción SANEADA de los fallos de la capa de fidelización a respuestas HTTP
 * para los Route Handlers `POST /api/loyalty/*`.
 *
 * Carpeta `_lib`: el prefijo `_` la marca como *private folder* de Next.js, así
 * que nunca se enruta como endpoint. Es un módulo compartido por los handlers.
 *
 * Garantía de no filtración (la razón de ser de este archivo):
 *   · NUNCA se devuelve al navegador la `LOYALTY_API_KEY`, la URL interna del
 *     upstream, su cuerpo de error crudo (`LoyaltyError.body`) ni el mensaje
 *     original del `LoyaltyError` (que menciona endpoints y estados internos).
 *   · Al cliente solo le llega un `status` HTTP y un mensaje genérico en español.
 *   · En servidor se registra lo MÍNIMO para diagnosticar (código + estado
 *     upstream), sin el `qr_token` (sensible, no debe acabar en logs) ni el
 *     cuerpo del upstream (podría reflejar el propio token del cliente).
 */
import { NextResponse } from "next/server";

import { isLoyaltyError, type LoyaltyErrorCode } from "@/lib/loyalty";

/** Estado HTTP + mensaje público (saneado) asociados a un código de error. */
interface HttpMapping {
  status: number;
  message: string;
}

/**
 * Código propio (excepto `disabled`, que es el kill-switch) → respuesta pública.
 *
 * Propagación controlada de los estados del upstream, tal como exige el contrato:
 *   · 401 `unauthorized` → 401  (el upstream rechazó NUESTRA credencial; es un
 *     problema de configuración del servidor, no de la sesión del usuario. Se
 *     propaga el código por contrato, con mensaje genérico y detalle en el log).
 *   · 403 `forbidden`    → 403  (la key no puede operar sobre esa sede)
 *   · 404 `not_found`    → 404  (QR/recurso inexistente)
 * El resto se colapsa en 4xx/5xx del gateway sin exponer nada del upstream.
 */
export const LOYALTY_ERROR_HTTP: Record<
  Exclude<LoyaltyErrorCode, "disabled">,
  HttpMapping
> = {
  config: {
    status: 503,
    message: "El servicio de fidelización no está disponible en este momento.",
  },
  invalid_request: {
    status: 400,
    message: "La solicitud de fidelización no es válida.",
  },
  unauthorized: {
    status: 401,
    message: "El servicio de fidelización rechazó la autenticación.",
  },
  forbidden: {
    status: 403,
    message: "Sin permiso para operar en fidelización en esta sede.",
  },
  not_found: {
    status: 404,
    message: "No se ha encontrado el QR de fidelización.",
  },
  timeout: {
    status: 504,
    message: "El servicio de fidelización tardó demasiado en responder.",
  },
  network: {
    status: 502,
    message: "No se pudo contactar con el servicio de fidelización.",
  },
  http: {
    status: 502,
    message: "El servicio de fidelización devolvió un error.",
  },
  invalid_response: {
    status: 502,
    message: "El servicio de fidelización devolvió una respuesta no válida.",
  },
};

/** Respuesta cuando el fallo no es un `LoyaltyError` conocido. */
const UNEXPECTED: HttpMapping = {
  status: 500,
  message: "Error inesperado en fidelización.",
};

/**
 * Convierte cualquier fallo en una `NextResponse` saneada.
 *
 * `disabled` se trata como el kill-switch de la integración: `503 { enabled:
 * false }`, el mismo contrato que devuelven los handlers cuando
 * `isLoyaltyEnabled()` es `false`.
 *
 * @param error    Fallo capturado (idealmente un `LoyaltyError`).
 * @param context  Etiqueta para el log de servidor (p. ej. `api/loyalty/lookup`).
 */
export function loyaltyErrorResponse(error: unknown, context: string): NextResponse {
  if (isLoyaltyError(error)) {
    if (error.code === "disabled") {
      return NextResponse.json({ enabled: false }, { status: 503 });
    }

    const mapping = LOYALTY_ERROR_HTTP[error.code];

    // Log mínimo y sin datos sensibles: solo código propio + estado upstream.
    // Nada de qr_token, cuerpo del upstream ni API key.
    console.error(`[${context}] loyalty error: ${error.code}`, {
      upstreamStatus: error.status,
    });

    return NextResponse.json({ error: mapping.message }, { status: mapping.status });
  }

  // Error desconocido: no se filtra su contenido; se registra íntegro en servidor.
  console.error(`[${context}] error inesperado`, error);
  return NextResponse.json({ error: UNEXPECTED.message }, { status: UNEXPECTED.status });
}
