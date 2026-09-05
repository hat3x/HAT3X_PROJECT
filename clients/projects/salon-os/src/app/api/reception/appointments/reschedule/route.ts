/**
 * `POST /api/reception/appointments/reschedule` — el recepcionista IA MUEVE la cita del
 * cliente que llama a otra hora (y, si quiere, otro profesional).
 *
 * Entrada `{ appointmentId, phone, newStartsAt, newProfessionalId? }`. Mueve esa cita del
 * salón de la `x-api-key` SOLO si pertenece al cliente identificado por ese teléfono, y
 * devuelve la cita ya reprogramada. Resultados posibles (contrato de recepción,
 * `@/lib/reception`):
 *   · 200 `{ id, starts_at, ends_at, service_name, professional_name, salon_name }`
 *   · 404 `APPOINTMENT_NOT_FOUND` — no hay cita con ese id en el salón.
 *   · 403 `NOT_YOUR_APPOINTMENT` — la cita no es del cliente de ese teléfono.
 *   · 409 `SLOT_TAKEN` — el nuevo hueco no está libre (recomputo o carrera anti-solape).
 *   · 409 `NO_AVAILABILITY` — el servicio de la cita ya no es reservable.
 *
 * El GUARD común ({@link withReceptionGuard}) resuelve ANTES la `x-api-key → salón`
 * (401 si falla) y exige el add-on `ai_receptionist` (403 si no), de modo que aquí
 * `salonId` es de fiar y toda la lógica de dominio ({@link rescheduleAppointment}) —el
 * control de pertenencia y el movimiento vía el motor— se acota a él: NUNCA se toca la
 * cita de otro salón. La validación del cuerpo va con Zod en el borde y los errores salen
 * con el contrato compartido (`VALIDATION_ERROR` 400, `INTERNAL_ERROR` 500…).
 *
 * `reschedule` es una ACCIÓN sobre la cita (no un CRUD REST sobre `/appointments/{id}`),
 * de ahí el verbo en la ruta —mismo criterio que `identify`/`cancel`—. Respuesta 200 con
 * la cita y `no-store`.
 */
import { z } from "zod";

import {
  ReceptionError,
  receptionFieldErrorsFromZod,
  receptionJson,
  withReceptionGuard,
} from "@/lib/reception";
import { rescheduleAppointment } from "@/lib/reception/reschedule";

/** Respuesta autenticada y dependiente del salón: nunca se cachea. */
export const dynamic = "force-dynamic";

/**
 * Cuerpo de la petición. `appointmentId` es la PK uuid de la cita; `newStartsAt` el nuevo
 * inicio (ISO con offset, igual que `createBooking`); `newProfessionalId` es OPCIONAL y de
 * tres estados a propósito (ausente = mantener el profesional actual; `"any"` = reasignar;
 * uuid = profesional concreto). El teléfono se recorta y se exige no vacío; su
 * canonicalización a E.164 (y el "sin número real ⇒ NOT_YOUR_APPOINTMENT") la hace
 * {@link rescheduleAppointment} reutilizando `normalizePhone`.
 *
 * `.strict()` caza claves ajenas (p. ej. `professionalId` en vez de `newProfessionalId`,
 * o un `salonId` inyectado en el cuerpo): mismo criterio que la creación —el salón NUNCA
 * se toma del cuerpo, solo de la clave—.
 */
const rescheduleSchema = z
  .object({
    appointmentId: z.string().uuid("El identificador de la cita no es válido."),
    phone: z.string().trim().min(1, "El teléfono es obligatorio."),
    newStartsAt: z.string().datetime({ offset: true }),
    // Profesional concreto o "any"; ausente = mantener el actual (lo resuelve el dominio).
    newProfessionalId: z.union([z.string().uuid(), z.literal("any")]).optional(),
  })
  .strict();

export const POST = withReceptionGuard(async (request, { salonId }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    // JSON roto: es un problema del cuerpo, no del servidor ⇒ 400 VALIDATION_ERROR.
    throw ReceptionError.validation(undefined, "Cuerpo JSON no válido.");
  }

  const parsed = rescheduleSchema.safeParse(body);
  if (!parsed.success) {
    throw ReceptionError.validation(receptionFieldErrorsFromZod(parsed.error.issues));
  }

  // salonId viene del guard (x-api-key): rescheduleAppointment acota la pertenencia y el
  // movimiento por él, y aplica el control 404/403 antes de mover. `newProfessionalId`
  // ausente se pasa tal cual (undefined): el dominio lo resuelve al profesional actual.
  const appointment = await rescheduleAppointment(
    salonId,
    parsed.data.appointmentId,
    parsed.data.phone,
    parsed.data.newStartsAt,
    parsed.data.newProfessionalId,
  );
  return receptionJson(appointment);
});
