/**
 * Endpoint `GET /api/public/booking/[slug]/availability`
 * (`@/app/api/public/booking/[slug]/availability/route`).
 *
 * Prueba lo PROPIO del Route Handler de forma aislada: el cálculo de huecos y la rejilla
 * ya están cubiertos por `availability.test.ts`, así que aquí se mockea el motor
 * (`getAvailability` / `getDayAvailability`) y se verifica el CONTRATO del endpoint:
 *
 *   · Vista por defecto (`view` ausente / `free`): `{ slots }` — el contrato intacto que
 *     consumen la app de cliente y el panel. professionalId "any"/vacío → undefined.
 *   · Vista de rejilla (`view=day`): `{ daySlots }` — la jornada completa de un profesional
 *     concreto; delega en `getDayAvailability`. Sus `available: true` son los libres
 *     (invariante sub-1): un consumidor los obtiene filtrando la rejilla.
 *   · Validación de entrada (400 `{ error }`) SIN tocar el motor: uuid/fecha inválidos,
 *     `view` desconocido y `view=day` sin profesional concreto (la rejilla es per-profesional).
 *   · Errores del motor (`BookingError`) → su `status` + `{ error }`; cualquier otro throw
 *     → 500 genérico que NO filtra el detalle interno.
 *
 * Se mockea SOLO el motor, conservando el resto del módulo —en especial `BookingError`, que
 * el route usa con `instanceof` para traducir el error a su status—.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

vi.mock("@/lib/booking/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/booking/server")>();
  return { ...actual, getAvailability: vi.fn(), getDayAvailability: vi.fn() };
});

import { GET } from "@/app/api/public/booking/[slug]/availability/route";
import {
  BookingError,
  getAvailability,
  getDayAvailability,
} from "@/lib/booking/server";
import type { PublicDaySlot, PublicSlot } from "@/lib/booking/types";

const freeMock = vi.mocked(getAvailability);
const dayMock = vi.mocked(getDayAvailability);

// -----------------------------------------------------------------------------
// Fixtures (valores sintéticos)
// -----------------------------------------------------------------------------

const SLUG = "salon-demo";
const SERVICE = "11111111-1111-1111-1111-111111111111";
const PROFESSIONAL = "22222222-2222-2222-2222-222222222222";
const DATE = "2026-07-24";

const SLOT: PublicSlot = {
  startsAt: "2026-07-24T08:00:00.000Z",
  endsAt: "2026-07-24T09:00:00.000Z",
  professionalId: PROFESSIONAL,
};

/** Rejilla con un libre y un ocupado; el libre coincide con {@link SLOT} (invariante sub-1). */
const DAY_SLOTS: PublicDaySlot[] = [
  { ...SLOT, available: true },
  {
    startsAt: "2026-07-24T09:00:00.000Z",
    endsAt: "2026-07-24T10:00:00.000Z",
    available: false,
    reason: "occupied",
    professionalId: PROFESSIONAL,
  },
];

/** Petición mínima: el route solo lee `request.url` (query). */
function req(query: Record<string, string>): NextRequest {
  const qs = new URLSearchParams(query).toString();
  return {
    url: `https://api.test/api/public/booking/${SLUG}/availability?${qs}`,
  } as unknown as NextRequest;
}

const ctx = { params: { slug: SLUG } };

beforeEach(() => {
  freeMock.mockReset();
  dayMock.mockReset();
});

// -----------------------------------------------------------------------------
// Vista por defecto — { slots } (contrato intacto)
// -----------------------------------------------------------------------------

describe("GET availability — vista por defecto { slots }", () => {
  it("200 { slots }: delega en getAvailability y NO toca la rejilla", async () => {
    freeMock.mockResolvedValue([SLOT]);

    const res = await GET(
      req({ serviceId: SERVICE, date: DATE, professionalId: PROFESSIONAL }),
      ctx,
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ slots: [SLOT] });
    expect(freeMock).toHaveBeenCalledTimes(1);
    expect(freeMock).toHaveBeenCalledWith(SLUG, SERVICE, DATE, PROFESSIONAL);
    expect(dayMock).not.toHaveBeenCalled();
  });

  it("professionalId 'any' → cualquiera (undefined al motor)", async () => {
    freeMock.mockResolvedValue([]);

    await GET(req({ serviceId: SERVICE, date: DATE, professionalId: "any" }), ctx);

    expect(freeMock).toHaveBeenCalledWith(SLUG, SERVICE, DATE, undefined);
  });

  it("professionalId ausente → cualquiera (undefined al motor)", async () => {
    freeMock.mockResolvedValue([]);

    await GET(req({ serviceId: SERVICE, date: DATE }), ctx);

    expect(freeMock).toHaveBeenCalledWith(SLUG, SERVICE, DATE, undefined);
  });

  it("view=free explícito → misma vista por defecto", async () => {
    freeMock.mockResolvedValue([SLOT]);

    const res = await GET(
      req({ serviceId: SERVICE, date: DATE, professionalId: PROFESSIONAL, view: "free" }),
      ctx,
    );

    await expect(res.json()).resolves.toEqual({ slots: [SLOT] });
    expect(dayMock).not.toHaveBeenCalled();
  });

  it("sin huecos → 200 con lista vacía", async () => {
    freeMock.mockResolvedValue([]);

    const res = await GET(req({ serviceId: SERVICE, date: DATE }), ctx);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ slots: [] });
  });
});

// -----------------------------------------------------------------------------
// Vista de rejilla — view=day { daySlots }
// -----------------------------------------------------------------------------

describe("GET availability — vista de rejilla view=day { daySlots }", () => {
  it("200 { daySlots }: delega en getDayAvailability con el profesional concreto", async () => {
    dayMock.mockResolvedValue(DAY_SLOTS);

    const res = await GET(
      req({ serviceId: SERVICE, date: DATE, professionalId: PROFESSIONAL, view: "day" }),
      ctx,
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ daySlots: DAY_SLOTS });
    expect(dayMock).toHaveBeenCalledTimes(1);
    expect(dayMock).toHaveBeenCalledWith(SLUG, SERVICE, DATE, PROFESSIONAL);
    expect(freeMock).not.toHaveBeenCalled();
  });

  it("los libres se obtienen filtrando la rejilla por available (invariante sub-1)", async () => {
    dayMock.mockResolvedValue(DAY_SLOTS);

    const res = await GET(
      req({ serviceId: SERVICE, date: DATE, professionalId: PROFESSIONAL, view: "day" }),
      ctx,
    );

    const body = (await res.json()) as { daySlots: PublicDaySlot[] };
    const free = body.daySlots.filter((s) => s.available);
    expect(free).toEqual([{ ...SLOT, available: true }]);
  });
});

// -----------------------------------------------------------------------------
// Validación del query — 400 { error }, sin tocar el motor
// -----------------------------------------------------------------------------

describe("GET availability — 400 { error } sin tocar el motor", () => {
  it("serviceId no-uuid → 400", async () => {
    const res = await GET(req({ serviceId: "no-uuid", date: DATE }), ctx);

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toHaveProperty("error");
    expect(freeMock).not.toHaveBeenCalled();
    expect(dayMock).not.toHaveBeenCalled();
  });

  it("date con formato ≠ YYYY-MM-DD → 400", async () => {
    const res = await GET(req({ serviceId: SERVICE, date: "24-07-2026" }), ctx);

    expect(res.status).toBe(400);
    expect(freeMock).not.toHaveBeenCalled();
  });

  it("view desconocido → 400", async () => {
    const res = await GET(
      req({ serviceId: SERVICE, date: DATE, professionalId: PROFESSIONAL, view: "grid" }),
      ctx,
    );

    expect(res.status).toBe(400);
    expect(freeMock).not.toHaveBeenCalled();
    expect(dayMock).not.toHaveBeenCalled();
  });

  it("view=day con professionalId 'any' → 400 (la rejilla es per-profesional)", async () => {
    const res = await GET(
      req({ serviceId: SERVICE, date: DATE, professionalId: "any", view: "day" }),
      ctx,
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toHaveProperty("error");
    expect(dayMock).not.toHaveBeenCalled();
  });

  it("view=day sin professionalId → 400", async () => {
    const res = await GET(req({ serviceId: SERVICE, date: DATE, view: "day" }), ctx);

    expect(res.status).toBe(400);
    expect(dayMock).not.toHaveBeenCalled();
  });
});

// -----------------------------------------------------------------------------
// Traducción de errores del motor
// -----------------------------------------------------------------------------

describe("GET availability — errores del motor", () => {
  it("BookingError (vista de libres) → su status + { error }", async () => {
    freeMock.mockRejectedValue(new BookingError(404, "Salón no encontrado."));

    const res = await GET(req({ serviceId: SERVICE, date: DATE }), ctx);

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: "Salón no encontrado." });
  });

  it("BookingError (vista de rejilla) → su status + { error }", async () => {
    dayMock.mockRejectedValue(new BookingError(404, "Servicio no disponible."));

    const res = await GET(
      req({ serviceId: SERVICE, date: DATE, professionalId: PROFESSIONAL, view: "day" }),
      ctx,
    );

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: "Servicio no disponible." });
  });

  it("throw inesperado → 500 genérico sin filtrar el detalle interno", async () => {
    freeMock.mockRejectedValue(new Error("postgres: 42P01 relation salons"));

    const res = await GET(req({ serviceId: SERVICE, date: DATE }), ctx);

    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string };
    expect(body.error).not.toContain("42P01");
  });
});
