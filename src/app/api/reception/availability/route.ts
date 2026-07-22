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
 */
import type { NextRequest, NextResponse } from "next/server";

import { availabilityQuerySchema } from "@/lib/booking/schema";
import { BookingError, getAvailabilityForSalon } from "@/lib/booking/server";
import type { AvailabilityResponse, PublicSlot } from "@/lib/booking/types";
import {
  ReceptionError,
  receptionFieldErrorsFromZod,
  receptionJson,
  withReceptionGuard,
} from "@/lib/reception";

/** La disponibilidad se calcula por request (autenticada y viva): nunca cachear. */
export const dynamic = "force-dynamic";

/**
 * Traduce un {@link BookingError} del motor de reservas al contrato de RECEPCIÓN.
 * En el cálculo de disponibilidad el motor solo lanza dos familias:
 *
 *   · 404 — el servicio (o el salón) no resuelve a algo reservable en el salón de la
 *     clave. Para el recepcionista IA eso es «no hay huecos para lo que pides» ⇒
 *     `NO_AVAILABILITY` (409), cuyo copy ya invita a probar otra fecha, profesional o
 *     servicio. Se prefiere a un 404 a medida: usa un código del contrato y no
 *     filtra qué recursos existen en el salón.
 *   · cualquier otra (500) ⇒ `INTERNAL_ERROR` (500) conservando la causa para el log
 *     del servidor, JAMÁS para el cliente.
 */
function bookingErrorToReception(error: unknown): ReceptionError {
  if (error instanceof BookingError && error.status === 404) {
    return ReceptionError.noAvailability();
  }
  return ReceptionError.internal(error);
}

/**
 * Lógica del endpoint, AISLADA del guard y del cliente admin (que viven, resp., en
 * {@link withReceptionGuard} y dentro de {@link getAvailabilityForSalon}). Recibe ya
 * el `salonId` de fiar, así que su único cometido es: validar el query, delegar en
 * el motor acotando por ese salón, y traducir el resultado al contrato.
 *
 * Se EXPORTA para poder probarla en unitario sin montar la BD ni la cadena de
 * autenticación. Sigue el modelo del guard: LANZA `ReceptionError` en el fallo (la
 * envoltura lo traduce a la respuesta del contrato) y DEVUELVE `NextResponse` en el
 * éxito.
 */
export async function handleReceptionAvailability(
  request: NextRequest,
  salonId: string,
): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);

  const parsed = availabilityQuerySchema.safeParse({
    serviceId: searchParams.get("serviceId") ?? undefined,
    date: searchParams.get("date") ?? undefined,
    professionalId: searchParams.get("professionalId") ?? undefined,
  });

  if (!parsed.success) {
    throw ReceptionError.validation(receptionFieldErrorsFromZod(parsed.error.issues));
  }

  let slots: PublicSlot[];
  try {
    slots = await getAvailabilityForSalon(
      salonId,
      parsed.data.serviceId,
      parsed.data.date,
      parsed.data.professionalId,
    );
  } catch (error) {
    throw bookingErrorToReception(error);
  }

  const body: AvailabilityResponse = { slots };
  return receptionJson(body);
}

/**
 * Route Handler exportado: el guard común de recepción envuelve la lógica y le pasa
 * el `salonId` ya resuelto de la clave. Cualquier `ReceptionError` que lance
 * `handleReceptionAvailability` —o cualquier throw inesperado— lo traduce el guard
 * al cuerpo del contrato con su `status` y `Cache-Control: no-store`.
 */
export const GET = withReceptionGuard((request, { salonId }) =>
  handleReceptionAvailability(request, salonId),
);
