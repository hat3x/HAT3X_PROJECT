/**
 * Endpoint `POST /api/reception/appointments` (`@/app/api/reception/appointments/route`).
 *
 * Prueba la LÓGICA del handler (`handleReceptionCreateAppointment`) de forma aislada: el
 * guard de authn/entitlement ya está cubierto por `reception-guard.test.ts`, y la
 * creación real de la cita (recomputo de disponibilidad + dedup por teléfono + INSERT)
 * por los `booking-*` de integración. Aquí se verifica lo PROPIO de este endpoint:
 *
 *   · REUTILIZA el motor: delega en `createBookingForSalon` (no reimplementa la reserva)
 *     y lo ACOTA por el `salonId` de la clave (nunca por un salón del cuerpo).
 *   · MAPEO de contrato: cuerpo de recepción (`snake_case`, `customer.full_name`) →
 *     forma del motor (`camelCase`, `customer.fullName`, `marketingConsent:false`).
 *   · CONTRATO de salida: éxito `201 { id, starts_at, ... }` snake_case, con `Location`
 *     y `Cache-Control: no-store`.
 *   · Traducción de errores del motor al contrato de recepción: `404 → NO_AVAILABILITY`,
 *     `409 → SLOT_TAKEN`, `400 → VALIDATION_ERROR`, resto `→ INTERNAL_ERROR` sin filtrar
 *     detalle interno.
 *
 * El motor se sustituye por un doble: se mockea SOLO `createBookingForSalon`, conservando
 * el resto del módulo —en especial `BookingError`, que el handler usa con `instanceof`
 * para traducir los códigos—.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

vi.mock("@/lib/booking/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/booking/server")>();
  return { ...actual, createBookingForSalon: vi.fn() };
});

import { handleReceptionCreateAppointment } from "@/app/api/reception/appointments/handler";
import { POST } from "@/app/api/reception/appointments/route";
import { BookingError, createBookingForSalon } from "@/lib/booking/server";
import type { BookingConfirmation } from "@/lib/booking/types";
import { ReceptionError } from "@/lib/reception/errors";

const createBooking = vi.mocked(createBookingForSalon);

// -----------------------------------------------------------------------------
// Fixtures
// -----------------------------------------------------------------------------

const SALON = "salon-de-la-clave";
const SERVICE = "11111111-1111-1111-1111-111111111111";
const PROFESSIONAL = "22222222-2222-2222-2222-222222222222";
const STARTS_AT = "2026-07-24T08:00:00.000Z";

const CONFIRMATION: BookingConfirmation = {
  appointmentId: "appt-abc-123",
  startsAt: STARTS_AT,
  endsAt: "2026-07-24T09:00:00.000Z",
  professionalName: "Ana",
  serviceName: "Corte",
  salonName: "Salón de la Clave",
};

/** Cuerpo válido del POST (contrato de recepción: customer en snake_case). */
function validBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    serviceId: SERVICE,
    professionalId: PROFESSIONAL,
    startsAt: STARTS_AT,
    customer: {
      full_name: "Cliente Prueba",
      phone: "+34612345678",
      email: "cliente@example.com",
    },
    ...overrides,
  };
}

/** Petición cuyo `json()` resuelve al cuerpo dado (lo único que lee el handler). */
function req(body: unknown): NextRequest {
  return { json: async () => body } as unknown as NextRequest;
}

/** Petición cuyo `json()` REVIENTA (cuerpo no es JSON válido). */
function reqBrokenJson(): NextRequest {
  return {
    json: async () => {
      throw new SyntaxError("Unexpected token in JSON");
    },
  } as unknown as NextRequest;
}

/** Captura el `ReceptionError` que lanza el handler (o `null` si no lanzó). */
async function catchReceptionError(
  promise: Promise<unknown>,
): Promise<ReceptionError | null> {
  try {
    await promise;
    return null;
  } catch (error) {
    if (error instanceof ReceptionError) return error;
    throw error;
  }
}

beforeEach(() => {
  createBooking.mockReset();
});

// -----------------------------------------------------------------------------
// Camino feliz — delega en el motor, mapea el contrato y devuelve 201
// -----------------------------------------------------------------------------

describe("handleReceptionCreateAppointment — éxito", () => {
  it("201 con la cita en snake_case, Location y no-store; mapea el cuerpo a la forma del motor", async () => {
    createBooking.mockResolvedValue(CONFIRMATION);

    const res = await handleReceptionCreateAppointment(req(validBody()), SALON);

    expect(res.status).toBe(201);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("location")).toBe(
      `/api/reception/appointments/${CONFIRMATION.appointmentId}`,
    );
    await expect(res.json()).resolves.toEqual({
      id: CONFIRMATION.appointmentId,
      starts_at: CONFIRMATION.startsAt,
      ends_at: CONFIRMATION.endsAt,
      service_name: CONFIRMATION.serviceName,
      professional_name: CONFIRMATION.professionalName,
      salon_name: CONFIRMATION.salonName,
    });

    // Reutiliza el motor UNA vez, ACOTADO por el salón de la clave, con el cuerpo MAPEADO
    // a la forma del motor (customer en camelCase; sin consentimiento de marketing).
    expect(createBooking).toHaveBeenCalledTimes(1);
    expect(createBooking).toHaveBeenCalledWith(SALON, {
      serviceId: SERVICE,
      professionalId: PROFESSIONAL,
      startsAt: STARTS_AT,
      customer: {
        fullName: "Cliente Prueba",
        email: "cliente@example.com",
        phone: "+34612345678",
        marketingConsent: false,
      },
    });
  });

  it("professionalId 'any' se pasa tal cual al motor (lo resuelve el servidor)", async () => {
    createBooking.mockResolvedValue(CONFIRMATION);

    await handleReceptionCreateAppointment(
      req(validBody({ professionalId: "any" })),
      SALON,
    );

    expect(createBooking).toHaveBeenCalledWith(
      SALON,
      expect.objectContaining({ professionalId: "any" }),
    );
  });

  it("email ausente → se mapea a undefined (el motor lo trata como sin email)", async () => {
    createBooking.mockResolvedValue(CONFIRMATION);

    await handleReceptionCreateAppointment(
      req(validBody({ customer: { full_name: "Sin Email", phone: "+34600000000" } })),
      SALON,
    );

    expect(createBooking).toHaveBeenCalledWith(
      SALON,
      expect.objectContaining({
        customer: {
          fullName: "Sin Email",
          email: undefined,
          phone: "+34600000000",
          marketingConsent: false,
        },
      }),
    );
  });
});

// -----------------------------------------------------------------------------
// Validación del cuerpo — 400 VALIDATION_ERROR, sin tocar el motor
// -----------------------------------------------------------------------------

describe("handleReceptionCreateAppointment — 400 VALIDATION_ERROR", () => {
  it("JSON roto → 400 con mensaje propio y sin llamar al motor", async () => {
    const error = await catchReceptionError(
      handleReceptionCreateAppointment(reqBrokenJson(), SALON),
    );

    expect(error).toMatchObject({ code: "VALIDATION_ERROR", status: 400 });
    expect(error?.message).toBe("Cuerpo JSON no válido.");
    expect(createBooking).not.toHaveBeenCalled();
  });

  it("serviceId ausente → 400 con detail del campo y sin llamar al motor", async () => {
    const body = validBody();
    delete body.serviceId;

    const error = await catchReceptionError(
      handleReceptionCreateAppointment(req(body), SALON),
    );

    expect(error).toMatchObject({ code: "VALIDATION_ERROR", status: 400 });
    expect(error?.details?.some((d) => d.field === "serviceId")).toBe(true);
    expect(createBooking).not.toHaveBeenCalled();
  });

  it("serviceId no-uuid → 400 y sin llamar al motor", async () => {
    const error = await catchReceptionError(
      handleReceptionCreateAppointment(req(validBody({ serviceId: "no-uuid" })), SALON),
    );

    expect(error).toMatchObject({ code: "VALIDATION_ERROR", status: 400 });
    expect(createBooking).not.toHaveBeenCalled();
  });

  it("startsAt no-ISO → 400 y sin llamar al motor", async () => {
    const error = await catchReceptionError(
      handleReceptionCreateAppointment(req(validBody({ startsAt: "mañana" })), SALON),
    );

    expect(error).toMatchObject({ code: "VALIDATION_ERROR", status: 400 });
    expect(createBooking).not.toHaveBeenCalled();
  });

  it("customer.full_name demasiado corto → 400 con detail del campo anidado", async () => {
    const error = await catchReceptionError(
      handleReceptionCreateAppointment(
        req(validBody({ customer: { full_name: "A", phone: "+34612345678" } })),
        SALON,
      ),
    );

    expect(error).toMatchObject({ code: "VALIDATION_ERROR", status: 400 });
    expect(error?.details?.some((d) => d.field === "customer.full_name")).toBe(true);
    expect(createBooking).not.toHaveBeenCalled();
  });

  it("clave ajena en el cuerpo (p. ej. salonId) → 400 por strict: no se acepta un salón del cuerpo", async () => {
    const error = await catchReceptionError(
      handleReceptionCreateAppointment(
        req(validBody({ salonId: "salon-de-otro" })),
        SALON,
      ),
    );

    expect(error).toMatchObject({ code: "VALIDATION_ERROR", status: 400 });
    expect(createBooking).not.toHaveBeenCalled();
  });
});

// -----------------------------------------------------------------------------
// Traducción de errores del motor al contrato de recepción
// -----------------------------------------------------------------------------

describe("handleReceptionCreateAppointment — traduce los errores del motor", () => {
  it("servicio inexistente/inactivo (BookingError 404) → 409 NO_AVAILABILITY", async () => {
    createBooking.mockRejectedValue(new BookingError(404, "Servicio no disponible."));

    const error = await catchReceptionError(
      handleReceptionCreateAppointment(req(validBody()), SALON),
    );

    expect(error).toMatchObject({ code: "NO_AVAILABILITY", status: 409 });
  });

  it("hueco ya no disponible / carrera anti-solape (BookingError 409) → 409 SLOT_TAKEN", async () => {
    createBooking.mockRejectedValue(
      new BookingError(409, "Ese horario acaba de ocuparse. Elige otro."),
    );

    const error = await catchReceptionError(
      handleReceptionCreateAppointment(req(validBody()), SALON),
    );

    expect(error).toMatchObject({ code: "SLOT_TAKEN", status: 409 });
  });

  it("teléfono sin número real (BookingError 400) → 400 VALIDATION_ERROR con detail en customer.phone", async () => {
    createBooking.mockRejectedValue(
      new BookingError(400, "El teléfono no es válido. Revísalo e inténtalo de nuevo."),
    );

    const error = await catchReceptionError(
      handleReceptionCreateAppointment(req(validBody()), SALON),
    );

    expect(error).toMatchObject({ code: "VALIDATION_ERROR", status: 400 });
    expect(error?.details?.some((d) => d.field === "customer.phone")).toBe(true);
  });

  it("fallo de escritura (BookingError 500) → 500 INTERNAL_ERROR, causa guardada y no filtrada", async () => {
    const cause = new BookingError(500, "No se pudo crear la reserva.");
    createBooking.mockRejectedValue(cause);

    const error = await catchReceptionError(
      handleReceptionCreateAppointment(req(validBody()), SALON),
    );

    expect(error).toMatchObject({ code: "INTERNAL_ERROR", status: 500 });
    expect(error?.cause).toBe(cause);
    expect(error?.message).not.toContain("crear la reserva");
  });

  it("un throw inesperado (no BookingError) → 500 INTERNAL_ERROR sin filtrar el detalle", async () => {
    const boom = new Error("postgres: relation appointments 42P01");
    createBooking.mockRejectedValue(boom);

    const error = await catchReceptionError(
      handleReceptionCreateAppointment(req(validBody()), SALON),
    );

    expect(error).toMatchObject({ code: "INTERNAL_ERROR", status: 500 });
    expect(error?.cause).toBe(boom);
    expect(error?.message).not.toContain("42P01");
  });
});

// -----------------------------------------------------------------------------
// Aislamiento multi-tenant — siempre el salón de la clave
// -----------------------------------------------------------------------------

describe("handleReceptionCreateAppointment — aislamiento por salón", () => {
  it("la creación se acota SIEMPRE por el salonId del guard (primer argumento del motor)", async () => {
    createBooking.mockResolvedValue(CONFIRMATION);

    await handleReceptionCreateAppointment(req(validBody()), SALON);

    expect(createBooking.mock.calls[0]?.[0]).toBe(SALON);
  });
});

// -----------------------------------------------------------------------------
// Cableado del Route Handler
// -----------------------------------------------------------------------------

describe("POST export", () => {
  it("está cableado como Route Handler (envuelto por el guard de recepción)", () => {
    expect(typeof POST).toBe("function");
  });
});
