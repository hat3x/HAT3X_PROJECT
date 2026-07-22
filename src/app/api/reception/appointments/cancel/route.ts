/**
 * `POST /api/reception/appointments/cancel` — el recepcionista IA anula la cita del
 * cliente que llama.
 *
 * Entrada `{ appointmentId, phone }`. Cancela esa cita del salón de la `x-api-key`
 * SOLO si pertenece al cliente identificado por ese teléfono, y devuelve la cita ya
 * cancelada. Resultados posibles (contrato de recepción, `@/lib/reception`):
 *   · 200 `{ id, status: "cancelled", starts_at, service_name, professional_name, cancelled_reason }`
 *   · 404 `APPOINTMENT_NOT_FOUND` — no hay cita con ese id en el salón.
 *   · 403 `NOT_YOUR_APPOINTMENT` — la cita no es del cliente de ese teléfono.
 *
 * El GUARD común ({@link withReceptionGuard}) resuelve ANTES la `x-api-key → salón`
 * (401 si falla) y exige el add-on `ai_receptionist` (403 si no), de modo que aquí
 * `salonId` es de fiar y toda la lógica de dominio ({@link cancelAppointment}) se acota
 * a él: NUNCA se toca la cita de otro salón. La validación del cuerpo va con Zod en el
 * borde y los errores salen con el contrato compartido (`VALIDATION_ERROR` 400,
 * `INTERNAL_ERROR` 500…).
 *
 * `cancel` es una ACCIÓN sobre la cita (no un CRUD REST sobre `/appointments/{id}`), de
 * ahí el verbo en la ruta —mismo criterio que `identify`—. Respuesta 200 con la cita y
 * `no-store`.
 */
import { z } from "zod";

import {
  ReceptionError,
  receptionFieldErrorsFromZod,
  receptionJson,
  withReceptionGuard,
} from "@/lib/reception";
import { cancelAppointment } from "@/lib/reception/cancel";

/** Respuesta autenticada y dependiente del salón: nunca se cachea. */
export const dynamic = "force-dynamic";

/**
 * Cuerpo de la petición. `appointmentId` es la PK uuid de la cita (mismo criterio de
 * validación que los ids del contrato de disponibilidad). El teléfono se recorta y se
 * exige no vacío; su canonicalización a E.164 (y el "sin número real ⇒
 * NOT_YOUR_APPOINTMENT") la hace {@link cancelAppointment} reutilizando `normalizePhone`.
 */
const cancelSchema = z.object({
  appointmentId: z.string().uuid("El identificador de la cita no es válido."),
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

  const parsed = cancelSchema.safeParse(body);
  if (!parsed.success) {
    throw ReceptionError.validation(receptionFieldErrorsFromZod(parsed.error.issues));
  }

  // salonId viene del guard (x-api-key): cancelAppointment acota TODA lectura/escritura
  // por él y aplica el control de pertenencia (404/403) antes de cancelar.
  const appointment = await cancelAppointment(
    salonId,
    parsed.data.appointmentId,
    parsed.data.phone,
  );
  return receptionJson(appointment);
});
