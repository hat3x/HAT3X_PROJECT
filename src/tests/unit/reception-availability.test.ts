/**
 * Endpoint `GET /api/reception/availability` (`@/app/api/reception/availability/route`).
 *
 * Prueba la LÓGICA del handler (`handleReceptionAvailability`) de forma aislada: el
 * guard de authn/entitlement ya está cubierto por `reception-guard.test.ts`, y el
 * cálculo de huecos por `availability.test.ts`/`booking-phases.test.ts`. Aquí se
 * verifica lo PROPIO de este endpoint:
 *
 *   · REUTILIZA el motor: delega en `getAvailabilityForSalon` (no recalcula a mano) y
 *     lo ACOTA por el `salonId` de la clave (nunca por un salón del query).
 *   · CONTRATO de entrada: mismo query que la reserva pública (uuid/fecha/"any").
 *   · CONTRATO de salida: éxito `{ slots }` con `Cache-Control: no-store`; los
 *     errores hablan el contrato de recepción (VALIDATION_ERROR / NO_AVAILABILITY /
 *     INTERNAL_ERROR) sin filtrar detalle interno.
 *
 * El motor de reservas se sustituye por un doble: se mockea SOLO
 * `getAvailabilityForSalon`, conservando el resto del módulo —en especial
 * `BookingError`, que el handler usa con `instanceof` para traducir el 404 a 409—.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

vi.mock("@/lib/booking/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/booking/server")>();
  return { ...actual, getAvailabilityForSalon: vi.fn() };
});

import { handleReceptionAvailability } from "@/app/api/reception/availability/handler";
import { GET } from "@/app/api/reception/availability/route";
import { BookingError, getAvailabilityForSalon } from "@/lib/booking/server";
import { ReceptionError } from "@/lib/reception/errors";
import type { PublicSlot } from "@/lib/booking/types";

const getAvailability = vi.mocked(getAvailabilityForSalon);

// -----------------------------------------------------------------------------
// Fixtures
// -----------------------------------------------------------------------------

const SALON = "salon-de-la-clave";
const SERVICE = "11111111-1111-1111-1111-111111111111";
const PROFESSIONAL = "22222222-2222-2222-2222-222222222222";
const DATE = "2026-07-24";

const SLOT: PublicSlot = {
  startsAt: "2026-07-24T08:00:00.000Z",
  endsAt: "2026-07-24T09:00:00.000Z",
  professionalId: PROFESSIONAL,
};

/** Petición mínima: el handler solo lee `request.url` (query). */
function req(query: Record<string, string>): NextRequest {
  const qs = new URLSearchParams(query).toString();
  return {
    url: `https://api.test/api/reception/availability?${qs}`,
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
  getAvailability.mockReset();
});

// -----------------------------------------------------------------------------
// Camino feliz — delega en el motor, acotado por el salón de la clave
// -----------------------------------------------------------------------------

describe("handleReceptionAvailability — éxito", () => {
  it("200 { slots } no-store: delega en el motor con el salonId de la clave y el query parseado", async () => {
    getAvailability.mockResolvedValue([SLOT]);

    const res = await handleReceptionAvailability(
      req({ serviceId: SERVICE, date: DATE, professionalId: PROFESSIONAL }),
      SALON,
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    await expect(res.json()).resolves.toEqual({ slots: [SLOT] });

    // No recalcula a mano: reutiliza el motor UNA vez, ACOTADO por el salón de la clave.
    expect(getAvailability).toHaveBeenCalledTimes(1);
    expect(getAvailability).toHaveBeenCalledWith(SALON, SERVICE, DATE, PROFESSIONAL);
  });

  it("sin huecos → 200 con lista vacía (una consulta vacía NO es un error)", async () => {
    getAvailability.mockResolvedValue([]);

    const res = await handleReceptionAvailability(
      req({ serviceId: SERVICE, date: DATE }),
      SALON,
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ slots: [] });
  });

  it("professionalId 'any' → cualquiera (undefined al motor)", async () => {
    getAvailability.mockResolvedValue([]);

    await handleReceptionAvailability(
      req({ serviceId: SERVICE, date: DATE, professionalId: "any" }),
      SALON,
    );

    expect(getAvailability).toHaveBeenCalledWith(SALON, SERVICE, DATE, undefined);
  });

  it("professionalId ausente → cualquiera (undefined al motor)", async () => {
    getAvailability.mockResolvedValue([]);

    await handleReceptionAvailability(req({ serviceId: SERVICE, date: DATE }), SALON);

    expect(getAvailability).toHaveBeenCalledWith(SALON, SERVICE, DATE, undefined);
  });

  it("ignora cualquier salón que venga en el query: siempre acota por el de la clave", async () => {
    getAvailability.mockResolvedValue([]);

    await handleReceptionAvailability(
      req({
        serviceId: SERVICE,
        date: DATE,
        salonId: "salon-de-otro",
        salon_id: "salon-de-otro",
      }),
      SALON,
    );

    expect(getAvailability).toHaveBeenCalledWith(SALON, SERVICE, DATE, undefined);
  });
});

// -----------------------------------------------------------------------------
// Validación del query — 400 VALIDATION_ERROR, sin tocar el motor
// -----------------------------------------------------------------------------

describe("handleReceptionAvailability — 400 VALIDATION_ERROR", () => {
  it("serviceId no-uuid → 400 con details del campo y sin llamar al motor", async () => {
    const error = await catchReceptionError(
      handleReceptionAvailability(req({ serviceId: "no-uuid", date: DATE }), SALON),
    );

    expect(error).toMatchObject({ code: "VALIDATION_ERROR", status: 400 });
    expect(error?.details?.some((d) => d.field === "serviceId")).toBe(true);
    expect(getAvailability).not.toHaveBeenCalled();
  });

  it("date con formato ≠ YYYY-MM-DD → 400 y sin llamar al motor", async () => {
    const error = await catchReceptionError(
      handleReceptionAvailability(req({ serviceId: SERVICE, date: "24-07-2026" }), SALON),
    );

    expect(error).toMatchObject({ code: "VALIDATION_ERROR", status: 400 });
    expect(getAvailability).not.toHaveBeenCalled();
  });

  it("serviceId ausente → 400 y sin llamar al motor", async () => {
    const error = await catchReceptionError(
      handleReceptionAvailability(req({ date: DATE }), SALON),
    );

    expect(error).toMatchObject({ code: "VALIDATION_ERROR", status: 400 });
    expect(getAvailability).not.toHaveBeenCalled();
  });
});

// -----------------------------------------------------------------------------
// Traducción de errores del motor al contrato de recepción
// -----------------------------------------------------------------------------

describe("handleReceptionAvailability — traduce los errores del motor", () => {
  it("servicio inexistente/inactivo (BookingError 404) → 409 NO_AVAILABILITY", async () => {
    getAvailability.mockRejectedValue(new BookingError(404, "Servicio no disponible."));

    const error = await catchReceptionError(
      handleReceptionAvailability(req({ serviceId: SERVICE, date: DATE }), SALON),
    );

    expect(error).toMatchObject({ code: "NO_AVAILABILITY", status: 409 });
  });

  it("fallo de lectura (BookingError 500) → 500 INTERNAL_ERROR, causa guardada y no filtrada", async () => {
    const cause = new BookingError(500, "Error al cargar el servicio.");
    getAvailability.mockRejectedValue(cause);

    const error = await catchReceptionError(
      handleReceptionAvailability(req({ serviceId: SERVICE, date: DATE }), SALON),
    );

    expect(error).toMatchObject({ code: "INTERNAL_ERROR", status: 500 });
    // La causa se conserva para el log del servidor…
    expect(error?.cause).toBe(cause);
    // …y el mensaje del contrato es el genérico (no el interno del motor).
    expect(error?.message).not.toContain("cargar el servicio");
  });

  it("un throw inesperado (no BookingError) → 500 INTERNAL_ERROR sin filtrar el detalle", async () => {
    const boom = new Error("postgres: relation services 42P01");
    getAvailability.mockRejectedValue(boom);

    const error = await catchReceptionError(
      handleReceptionAvailability(req({ serviceId: SERVICE, date: DATE }), SALON),
    );

    expect(error).toMatchObject({ code: "INTERNAL_ERROR", status: 500 });
    expect(error?.cause).toBe(boom);
    expect(error?.message).not.toContain("42P01");
  });
});

// -----------------------------------------------------------------------------
// Cableado del Route Handler
// -----------------------------------------------------------------------------

describe("GET export", () => {
  it("está cableado como Route Handler (envuelto por el guard de recepción)", () => {
    expect(typeof GET).toBe("function");
  });
});
