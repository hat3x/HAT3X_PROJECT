/**
 * Tests de integración del HORARIO DE APERTURA de la clínica en el cálculo de
 * disponibilidad (`salon_opening_hours` ∩ `professional_schedules`).
 *
 * Contexto — Biodental, agosto de 2026: la recepcionista de voz dio citas un LUNES
 * POR LA TARDE cuando la clínica cierra a las 14:00. La causa fue que el horario de
 * clínica todavía no existía; al añadirlo, la intersección lo cerró. Pero quedaba una
 * vía por la que el fallo podía VOLVER sin que nadie se enterara: si la consulta de
 * `salon_opening_hours` fallaba, la capa de servidor lo trataba como "este salón no usa
 * horario de clínica" y seguía adelante SIN la intersección — es decir, FALLABA EN
 * ABIERTO y ofrecía huecos con la clínica cerrada.
 *
 * Estos tests fijan las tres situaciones y las mantienen separadas:
 *   1. Horario configurado          → la tarde del lunes NO se ofrece (intersección).
 *   2. La consulta del horario FALLA → error, NUNCA huecos fuera de horario (fail-closed).
 *   3. Salón SIN horario configurado → se ignora la intersección (retrocompatibilidad:
 *      los salones que no usan horario de clínica siguen con el del profesional).
 *
 * El caso 3 es la razón de que no baste con "si no hay filas, cerrado": hay que
 * distinguir «no hay horario» (0 filas) de «no he podido leer el horario» (error).
 *
 * Complementa a `src/tests/unit/availability.test.ts`, que prueba el motor puro
 * (`generateSlots`) cuando YA recibe el horario de clínica. Aquí se prueba la capa de
 * servidor, que es quien decide SI se lo pasa.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const holder = vi.hoisted(() => ({ admin: null as unknown }));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => holder.admin,
}));

import { getAvailability, BookingError } from "@/lib/booking/server";

const TZ = "Europe/Madrid";
const DATE = "2025-06-09"; // Lunes (weekday 1)
const SLUG = "clinica-test";
const SALON_ID = "salon-1";
const SERVICE_ID = "00000000-0000-0000-0000-0000000000aa";
const PRO_ID = "11111111-1111-1111-1111-1111111111bb";

// Instantes de referencia del lunes de prueba, en hora Madrid (UTC+2 en junio).
const MONDAY_11_00 = "2025-06-09T09:00:00.000Z"; // dentro del horario de clínica
const MONDAY_17_00 = "2025-06-09T15:00:00.000Z"; // clínica CERRADA, profesional libre

/**
 * Doble del query builder de Supabase. A diferencia del de `booking-phases`, este
 * permite inyectar un ERROR por tabla (`errors`), que es justo lo que hay que
 * simular: la consulta del horario de clínica falla mientras el resto va bien.
 */
interface Fixtures {
  salons?: unknown;
  services?: unknown;
  professional_services?: unknown[];
  professional_schedules?: unknown[];
  schedule_exceptions?: unknown;
  appointment_blocks?: unknown[];
  salon_opening_hours?: unknown[];
  /** Tablas cuya consulta debe devolver error en lugar de datos. */
  errors?: Record<string, { message: string }>;
}

function makeAdminMock(fx: Fixtures) {
  function builder(table: string) {
    function currentData(): { data: unknown; error: unknown } {
      const failure = fx.errors?.[table];
      if (failure) return { data: null, error: failure };
      return { data: (fx as Record<string, unknown>)[table] ?? [], error: null };
    }

    function resolveSingle() {
      const { data, error } = currentData();
      return { data: Array.isArray(data) ? (data[0] ?? null) : data, error };
    }

    const b = {
      select: () => b,
      eq: () => b,
      neq: () => b,
      filter: () => b,
      order: () => b,
      limit: () => b,
      maybeSingle: () => Promise.resolve(resolveSingle()),
      single: () => Promise.resolve(resolveSingle()),
      then: (onFulfilled: (v: { data: unknown; error: unknown }) => unknown) =>
        onFulfilled(currentData()),
    };
    return b;
  }

  return { from: (table: string) => builder(table) };
}

/**
 * Escenario base: el profesional trabaja el lunes de 09:00 a 20:00, pero la clínica
 * solo abre de 10:00 a 14:00. La tarde del lunes solo aparece si la intersección con
 * el horario de clínica NO se aplica.
 */
function baseFixtures(overrides: Partial<Fixtures> = {}): Fixtures {
  return {
    salons: {
      id: SALON_ID,
      name: "Clínica de Pruebas",
      slug: SLUG,
      timezone: TZ,
      active: true,
      settings: { slot_interval_minutes: 30, min_lead_minutes: 0 },
    },
    services: {
      id: SERVICE_ID,
      name: "Revisión",
      application_min: 30,
      exposure_min: 0,
      post_exposure_min: 0,
      price_cents: 3000,
      currency: "EUR",
      active: true,
    },
    professional_services: [
      { professional_id: PRO_ID, professionals: { active: true } },
    ],
    professional_schedules: [
      { weekday: 1, start_time: "09:00:00", end_time: "20:00:00" },
    ],
    schedule_exceptions: null,
    appointment_blocks: [],
    salon_opening_hours: [{ weekday: 1, start_time: "10:00:00", end_time: "14:00:00" }],
    ...overrides,
  };
}

function offersSlot(slots: { startsAt: string }[], startsAt: string): boolean {
  return slots.some((s) => s.startsAt === startsAt);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2025-06-09T00:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
  holder.admin = null;
});

describe("disponibilidad — horario de apertura de la clínica", () => {
  it("con horario configurado, no ofrece la tarde del lunes (clínica cerrada)", async () => {
    holder.admin = makeAdminMock(baseFixtures());

    const slots = await getAvailability(SLUG, SERVICE_ID, DATE, undefined);

    expect(offersSlot(slots, MONDAY_11_00)).toBe(true);
    expect(offersSlot(slots, MONDAY_17_00)).toBe(false);
  });

  it("si la consulta del horario de clínica FALLA, no ofrece huecos: falla en CERRADO", async () => {
    holder.admin = makeAdminMock(
      baseFixtures({
        errors: { salon_opening_hours: { message: "conexión perdida" } },
      }),
    );

    // Sin saber si la clínica está abierta, la única respuesta segura es el error:
    // seguir sin la intersección ofrecería la tarde del lunes con la clínica cerrada.
    await expect(
      getAvailability(SLUG, SERVICE_ID, DATE, undefined),
    ).rejects.toBeInstanceOf(BookingError);
  });

  it("un salón SIN horario de clínica sigue usando solo el del profesional", async () => {
    holder.admin = makeAdminMock(baseFixtures({ salon_opening_hours: [] }));

    const slots = await getAvailability(SLUG, SERVICE_ID, DATE, undefined);

    expect(offersSlot(slots, MONDAY_11_00)).toBe(true);
    expect(offersSlot(slots, MONDAY_17_00)).toBe(true);
  });
});
