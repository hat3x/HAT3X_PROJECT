/**
 * GET /api/reception/availability?serviceId=&date=&professionalId=
 *
 * Endpoint del RECEPCIONISTA IA (Retell + Twilio + n8n): consulta los huecos
 * reservables de un salón. Es la cara de recepción del MISMO motor que la reserva
 * pública: delega en {@link getAvailabilityForSalon}, que reutiliza `generateSlots`
 * (modelo de 3 fases), así que devuelve LOS MISMOS huecos. NO recalcula nada a mano.
 *
 *   · Authn + entitlement — {@link withReceptionGuard} resuelve `x-api-key → salón`
 *     y exige el add-on `ai_receptionist`. El `salonId` que llega es de fiar y ES
 *     LO QUE ACOTA la consulta (aislamiento cross-tenant: nunca se acepta un salón
 *     del query, solo el de la clave).
 *   · Contrato de entrada — mismo query que la reserva pública
 *     (`availabilityQuerySchema`): `serviceId` (uuid), `date` (YYYY-MM-DD),
 *     `professionalId` (uuid | "any" | vacío = cualquiera). Una sola fuente de verdad.
 *   · Contrato de salida — éxito `{ slots }` (idéntico a `/api/public/.../availability`);
 *     los fallos hablan el contrato de errores de recepción (`@/lib/reception`).
 *
 * La LÓGICA vive en el módulo hermano `./handler` (`handleReceptionAvailability`): un
 * `route.ts` de Next App Router solo puede exportar métodos HTTP y config de ruta, así
 * que el handler —que se exporta para el test unitario— se aísla fuera de este archivo.
 */
import { withReceptionGuard } from "@/lib/reception";

import { handleReceptionAvailability } from "./handler";

/** La disponibilidad se calcula por request (autenticada y viva): nunca cachear. */
export const dynamic = "force-dynamic";

/**
 * Route Handler exportado: el guard común de recepción envuelve la lógica y le pasa
 * el `salonId` ya resuelto de la clave. Cualquier `ReceptionError` que lance
 * `handleReceptionAvailability` —o cualquier throw inesperado— lo traduce el guard
 * al cuerpo del contrato con su `status` y `Cache-Control: no-store`.
 */
export const GET = withReceptionGuard((request, { salonId }) =>
  handleReceptionAvailability(request, salonId),
);
