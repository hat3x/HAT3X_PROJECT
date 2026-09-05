/**
 * `POST /api/reception/identify` — el recepcionista IA reconoce a quien llama.
 *
 * Entrada `{ phone }` (en cualquier formato). Devuelve, para el salón de la `x-api-key`:
 *   · `{ found: false }` si el teléfono no casa con ninguna ficha;
 *   · `{ found: true, customer: { id, full_name }, upcoming: [...] }` con sus próximas citas; o
 *   · `{ found: true, ambiguous: true, candidates: [{ id, full_name }, …] }` cuando VARIAS
 *     fichas comparten ese teléfono — una familia con un solo móvil, que es lo normal en
 *     una clínica. Entonces NO viajan `customer` ni `upcoming`: dar por buena la primera
 *     ficha sería contarle a quien llama las citas de otra persona. Quien atiende pregunta
 *     por el nombre ("¿hablo con Ana o con Santiago?"), igual que una recepcionista.
 *
 * El GUARD común ({@link withReceptionGuard}) resuelve ANTES la `x-api-key → salón` (401 si
 * falla) y exige el add-on `ai_receptionist` (403 si no), de modo que aquí `salonId` es de
 * fiar y toda la lógica de dominio ({@link identifyCustomer}) se acota a él: NUNCA se
 * devuelven datos de otro salón. La validación del cuerpo va con Zod en el borde y los
 * errores salen con el contrato compartido (`VALIDATION_ERROR` 400, `INTERNAL_ERROR` 500…).
 *
 * `identify` es una ACCIÓN (no un CRUD sobre un recurso), de ahí el verbo en la ruta —el
 * mismo criterio que `/auth/login`—. Respuesta 200 con el payload directo y `no-store`.
 */
import { z } from "zod";

import {
  ReceptionError,
  receptionFieldErrorsFromZod,
  receptionJson,
  withReceptionGuard,
} from "@/lib/reception";
import { identifyCustomer } from "@/lib/reception/identify";

/** Respuesta autenticada y dependiente del salón: nunca se cachea. */
export const dynamic = "force-dynamic";

/**
 * Cuerpo de la petición: solo el teléfono. Se recorta y se exige no vacío; la
 * canonicalización a E.164 (y el "sin número real ⇒ found:false") la hace
 * {@link identifyCustomer} reutilizando `normalizePhone`, no este esquema.
 */
const identifySchema = z.object({
  phone: z.string().trim().min(1, "El teléfono es obligatorio."),
});

export const POST = withReceptionGuard(async (request, { salonId }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    // JSON roto: es un problema del cuerpo, no del servidor ⇒ 400 VALIDATION_ERROR.
    throw ReceptionError.validation(undefined, "Cuerpo JSON no válido.");
  }

  const parsed = identifySchema.safeParse(body);
  if (!parsed.success) {
    throw ReceptionError.validation(receptionFieldErrorsFromZod(parsed.error.issues));
  }

  // salonId viene del guard (x-api-key): identifyCustomer acota TODA lectura por él.
  const result = await identifyCustomer(salonId, parsed.data.phone);
  return receptionJson(result);
});
