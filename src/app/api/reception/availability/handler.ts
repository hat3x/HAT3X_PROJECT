/**
 * Lógica del endpoint `GET /api/reception/availability`, en un módulo HERMANO del
 * `route.ts`. Vive fuera del Route Handler a propósito: un `route.ts` de Next App Router
 * SOLO puede exportar los métodos HTTP y la config de ruta (`dynamic`, …); cualquier otro
 * export de valor (como este handler, que se exporta para el test unitario) rompe la
 * validación de tipos de `next build`. Al aislarlo aquí, el `route.ts` queda como una
 * superficie mínima y válida, y esta lógica sigue siendo importable por los tests.
 */
import type { NextRequest, NextResponse } from "next/server";

import { availabilityQuerySchema } from "@/lib/booking/schema";
import { BookingError, getAvailabilityForSalon } from "@/lib/booking/server";
import type { AvailabilityResponse, PublicSlot } from "@/lib/booking/types";
import {
  ReceptionError,
  receptionFieldErrorsFromZod,
  receptionJson,
} from "@/lib/reception";

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
 * `withReceptionGuard` y dentro de {@link getAvailabilityForSalon}). Recibe ya
 * el `salonId` de fiar, así que su único cometido es: validar el query, delegar en
 * el motor acotando por ese salón, y traducir el resultado al contrato.
 *
 * Se EXPORTA (desde este módulo hermano, no desde el `route.ts`) para poder probarla en
 * unitario sin montar la BD ni la cadena de autenticación. Sigue el modelo del guard:
 * LANZA `ReceptionError` en el fallo (la envoltura lo traduce a la respuesta del
 * contrato) y DEVUELVE `NextResponse` en el éxito.
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
