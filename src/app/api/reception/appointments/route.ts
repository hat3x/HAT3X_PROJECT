/**
 * POST /api/reception/appointments
 *
 * Endpoint del RECEPCIONISTA IA (Retell + Twilio + n8n): CREA una cita en el salón de
 * la clave. Es la cara de recepción del MISMO motor que la reserva pública: delega en
 * {@link createBookingForSalon}, que reutiliza el núcleo `createBookingForSalonConfig`
 * (recalcula disponibilidad en el servidor, resuelve/crea la ficha por teléfono
 * normalizado y crea la cita `pending`), así que crea la cita EXACTAMENTE igual que la
 * reserva pública. NO reimplementa la reserva a mano.
 *
 *   · Authn + entitlement — {@link withReceptionGuard} resuelve `x-api-key → salón` y
 *     exige el add-on `ai_receptionist`. El `salonId` que llega es de fiar y ES LO QUE
 *     ACOTA la creación (aislamiento cross-tenant: nunca se acepta un salón del cuerpo,
 *     solo el de la clave).
 *   · Contrato de ENTRADA — `{ serviceId (uuid), professionalId (uuid | "any"),
 *     startsAt (ISO con offset), customer: { full_name, phone, email? } }`. El customer
 *     va en `snake_case` (como el contrato de `identify`, misma integración consumidora);
 *     se MAPEA a la forma del motor (`CreateBookingInput`, `camelCase`) en el borde.
 *   · IDENTIDAD por teléfono — el motor resuelve/crea la ficha por `phone_e164` (un
 *     cliente = una ficha, sub-1): reservar con un teléfono ya conocido REUTILIZA su
 *     ficha en vez de duplicarla.
 *   · Contrato de SALIDA — éxito `201 { id, starts_at, ends_at, service_name,
 *     professional_name, salon_name }` (snake_case, con `Location`); los fallos hablan
 *     el contrato de errores de recepción (`@/lib/reception`), en particular
 *     `NO_AVAILABILITY` / `SLOT_TAKEN` (409) para los conflictos de agenda.
 *
 * La LÓGICA vive en el módulo hermano `./handler` (`handleReceptionCreateAppointment`):
 * un `route.ts` de Next App Router solo puede exportar métodos HTTP y config de ruta, así
 * que el handler —que se exporta para el test unitario— se aísla fuera de este archivo.
 */
import { withReceptionGuard } from "@/lib/reception";

import { handleReceptionCreateAppointment } from "./handler";

/** La creación es autenticada y dependiente del salón: nunca cachear. */
export const dynamic = "force-dynamic";

/**
 * Route Handler exportado: el guard común de recepción envuelve la lógica y le pasa el
 * `salonId` ya resuelto de la clave. Cualquier `ReceptionError` que lance
 * `handleReceptionCreateAppointment` —o cualquier throw inesperado— lo traduce el guard
 * al cuerpo del contrato con su `status` y `Cache-Control: no-store`.
 */
export const POST = withReceptionGuard((request, { salonId }) =>
  handleReceptionCreateAppointment(request, salonId),
);
