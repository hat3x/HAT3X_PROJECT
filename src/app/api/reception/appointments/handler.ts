/**
 * Lógica del endpoint `POST /api/reception/appointments`, en un módulo HERMANO del
 * `route.ts`. Vive fuera del Route Handler a propósito: un `route.ts` de Next App Router
 * SOLO puede exportar los métodos HTTP y la config de ruta (`dynamic`, …); cualquier otro
 * export de valor (como este handler, que se exporta para el test unitario) rompe la
 * validación de tipos de `next build`. Al aislarlo aquí, el `route.ts` queda como una
 * superficie mínima y válida, y esta lógica sigue siendo importable por los tests.
 */
import type { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import type { CreateBookingInput } from "@/lib/booking/schema";
import { BookingError, createBookingForSalon } from "@/lib/booking/server";
import type { BookingConfirmation } from "@/lib/booking/types";
import {
  ReceptionError,
  receptionCreated,
  receptionFieldErrorsFromZod,
} from "@/lib/reception";

/**
 * Cita creada tal como la ve el recepcionista IA. Se expone en `snake_case` y con la
 * clave `id` para hablar el MISMO vocabulario que `identify` (`upcoming[].id/starts_at/
 * service_name/professional_name`): así la integración opera de punta a punta —crear,
 * y luego mover/cancelar por `id`— sin traducir entre formas. Es un REFLEJO mapeado de
 * {@link BookingConfirmation} (la forma interna del motor, en `camelCase`).
 */
export interface ReceptionCreatedAppointment {
  /** Id de la cita creada (para las siguientes acciones del recepcionista). */
  id: string;
  /** Inicio en ISO-8601 UTC (`appointments.starts_at`). */
  starts_at: string;
  /** Fin en ISO-8601 UTC (aplicación + exposición + post-exposición). */
  ends_at: string;
  /** Nombre del servicio reservado. */
  service_name: string;
  /** Nombre del profesional asignado (el motor resuelve "any" a uno concreto). */
  professional_name: string;
  /** Nombre del salón (el de la clave). */
  salon_name: string;
}

/**
 * Datos de contacto del cliente EN RECEPCIÓN. `snake_case` y solo lo que el
 * recepcionista recoge por teléfono (`full_name`, `phone`, `email?`): sin `notes` ni
 * consentimiento de marketing (que la reserva pública sí ofrece). El teléfono es la
 * clave de identidad: se exige, pero su validación canónica (E.164) la hace el motor.
 */
const receptionCustomerSchema = z.object({
  full_name: z.string().trim().min(2, "Indica el nombre del cliente.").max(200),
  phone: z.string().trim().min(6, "Teléfono no válido.").max(30),
  // Opcional; se acepta "" (la integración puede mandar vacío) y el motor lo trata como
  // ausente al normalizar el email.
  email: z.string().trim().email("Email no válido.").max(255).optional().or(z.literal("")),
});

/**
 * Cuerpo del POST. Mismo contrato de agenda que la reserva pública en el top-level
 * (`serviceId`/`professionalId`/`startsAt` en `camelCase`), con el customer de
 * recepción anidado. `.strict()` en el top-level caza claves ajenas (typos) en el
 * cuerpo, igual que `createBookingSchema`.
 */
const createReceptionAppointmentSchema = z
  .object({
    serviceId: z.string().uuid(),
    // Profesional concreto o "any" (el motor asigna uno disponible en el servidor).
    professionalId: z.union([z.string().uuid(), z.literal("any")]),
    // Inicio del hueco elegido (instante UTC en ISO con offset).
    startsAt: z.string().datetime({ offset: true }),
    customer: receptionCustomerSchema,
  })
  .strict();

type CreateReceptionAppointmentInput = z.infer<typeof createReceptionAppointmentSchema>;

/**
 * MAPEA el cuerpo de recepción (`snake_case`, mínimo) a la forma del motor
 * (`CreateBookingInput`, `camelCase`). El recepcionista no recoge `notes` ni
 * consentimiento de marketing, así que se omite `notes` y se fija
 * `marketingConsent: false` (sin consentimiento: la opción neutra y respetuosa por
 * defecto). El resto pasa tal cual; el motor normaliza teléfono y email.
 */
function toBookingInput(input: CreateReceptionAppointmentInput): CreateBookingInput {
  return {
    serviceId: input.serviceId,
    professionalId: input.professionalId,
    startsAt: input.startsAt,
    customer: {
      fullName: input.customer.full_name,
      email: input.customer.email,
      phone: input.customer.phone,
      marketingConsent: false,
    },
  };
}

/** Aplana la {@link BookingConfirmation} del motor al contrato de salida de recepción. */
function toCreatedAppointment(
  confirmation: BookingConfirmation,
): ReceptionCreatedAppointment {
  return {
    id: confirmation.appointmentId,
    starts_at: confirmation.startsAt,
    ends_at: confirmation.endsAt,
    service_name: confirmation.serviceName,
    professional_name: confirmation.professionalName,
    salon_name: confirmation.salonName,
  };
}

/**
 * Traduce un {@link BookingError} del motor de reservas al contrato de RECEPCIÓN. El
 * motor solo lanza estas familias al crear una cita:
 *
 *   · 400 — el teléfono no tiene número real (no normaliza a E.164). Es un problema del
 *     DATO de entrada ⇒ `VALIDATION_ERROR` (400) con un `detail` en `customer.phone`
 *     (el copy del motor ya es apto para el usuario). Nota: el esquema exige `min(6)`,
 *     pero eso no garantiza que `normalizePhone` acepte el número, de ahí que este 400
 *     siga siendo alcanzable tras Zod.
 *   · 404 — el servicio no resuelve a algo reservable en el salón de la clave. Para el
 *     recepcionista eso es «no hay huecos para lo que pides» ⇒ `NO_AVAILABILITY` (409),
 *     cuyo copy invita a probar otra fecha/profesional/servicio (y no filtra qué
 *     recursos existen en el salón, a diferencia de un 404 a medida).
 *   · 409 — el hueco pedido ya no está: bien porque el recomputo de disponibilidad no lo
 *     incluye, bien porque el INSERT chocó con la exclusion constraint anti-solape
 *     (carrera). Ambos son «ese hueco acaba de ocuparse, elige otro» ⇒ `SLOT_TAKEN`.
 *   · cualquier otra (500) ⇒ `INTERNAL_ERROR` (500), conservando la causa para el log
 *     del servidor, JAMÁS para el cliente.
 */
function bookingErrorToReception(error: unknown): ReceptionError {
  if (error instanceof BookingError) {
    switch (error.status) {
      case 400:
        return ReceptionError.validation([
          { field: "customer.phone", message: error.message },
        ]);
      case 404:
        return ReceptionError.noAvailability();
      case 409:
        return ReceptionError.slotTaken();
      default:
        return ReceptionError.internal(error);
    }
  }
  return ReceptionError.internal(error);
}

/**
 * Lógica del endpoint, AISLADA del guard y del cliente admin (que viven, resp., en
 * `withReceptionGuard` y dentro de {@link createBookingForSalon}). Recibe ya el
 * `salonId` de fiar, así que su único cometido es: validar el cuerpo, mapearlo a la
 * forma del motor, delegar la creación acotando por ese salón, y traducir el resultado
 * (éxito o error) al contrato.
 *
 * Se EXPORTA (desde este módulo hermano, no desde el `route.ts`) para poder probarla en
 * unitario sin montar la BD ni la cadena de autenticación. Sigue el modelo de
 * `handleReceptionAvailability`: LANZA `ReceptionError` en el fallo (la envoltura del
 * guard lo traduce a la respuesta del contrato) y DEVUELVE `NextResponse` (201) en el
 * éxito.
 */
export async function handleReceptionCreateAppointment(
  request: NextRequest,
  salonId: string,
): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    // JSON roto: es un problema del cuerpo, no del servidor ⇒ 400 VALIDATION_ERROR.
    throw ReceptionError.validation(undefined, "Cuerpo JSON no válido.");
  }

  const parsed = createReceptionAppointmentSchema.safeParse(body);
  if (!parsed.success) {
    throw ReceptionError.validation(receptionFieldErrorsFromZod(parsed.error.issues));
  }

  let confirmation: BookingConfirmation;
  try {
    // salonId viene del guard (x-api-key): createBookingForSalon acota TODA la operación
    // por él. Reutiliza el motor de reservas (dedup por teléfono incluido).
    confirmation = await createBookingForSalon(salonId, toBookingInput(parsed.data));
  } catch (error) {
    throw bookingErrorToReception(error);
  }

  const created = toCreatedAppointment(confirmation);
  // 201 + Location al recurso de la cita (aunque su GET llegue en una sub-tarea futura):
  // es la cabecera correcta tras un POST que crea, y da a la integración el id operable.
  return receptionCreated(created, `/api/reception/appointments/${created.id}`);
}
