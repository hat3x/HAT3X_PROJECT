/**
 * El gabinete como recurso, en el motor de disponibilidad (B2).
 *
 * Hasta ahora la clínica con un solo sillón se resolvía con
 * `settings.single_resource`, que bloquea el hueco para TODA la clínica. Sirve
 * con un gabinete y se rompe con dos: dos dentistas pueden trabajar a la vez,
 * pero no en el mismo sillón.
 *
 * El roadmap avisaba de que esto toca el motor que usa la recepcionista de voz,
 * así que lo que se prueba aquí es sobre todo lo que NO debe cambiar: una
 * clínica sin gabinetes configurados tiene que seguir viendo exactamente los
 * mismos huecos que antes. Estrenar una función no puede dejar a nadie sin
 * poder citar.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const holder: { admin: unknown } = { admin: null };

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => holder.admin,
}));

import { getAvailability } from "@/lib/booking/server";

const TZ = "Europe/Madrid";
const DATE = "2025-06-09"; // lunes
const SLUG = "clinica-test";
const SALON_ID = "salon-1";
const SERVICE_ID = "00000000-0000-0000-0000-0000000000aa";
const PRO_ID = "11111111-1111-1111-1111-1111111111bb";

/** 10:00 y 11:00 hora Madrid (UTC+2 en junio). */
const L_10 = "2025-06-09T08:00:00.000Z";
const L_11 = "2025-06-09T09:00:00.000Z";

interface Fixtures {
  [table: string]: unknown;
}

function makeAdminMock(fx: Fixtures) {
  function builder(table: string) {
    function currentData(): { data: unknown; error: unknown } {
      return { data: fx[table] ?? [], error: null };
    }
    function resolveSingle() {
      const { data, error } = currentData();
      return { data: Array.isArray(data) ? (data[0] ?? null) : data, error };
    }
    const b: Record<string, unknown> = {
      select: () => b,
      eq: () => b,
      neq: () => b,
      in: () => b,
      gte: () => b,
      lt: () => b,
      filter: () => b,
      order: () => b,
      limit: () => b,
      maybeSingle: () => Promise.resolve(resolveSingle()),
      single: () => Promise.resolve(resolveSingle()),
      then: (f: (v: { data: unknown; error: unknown }) => unknown) => f(currentData()),
    };
    return b;
  }
  return { from: (table: string) => builder(table) };
}

/** El profesional y la clínica abren de 10:00 a 14:00 el lunes. */
function fixtures(overrides: Fixtures = {}): Fixtures {
  return {
    salons: {
      id: SALON_ID,
      name: "Clínica de Pruebas",
      slug: SLUG,
      timezone: TZ,
      active: true,
      settings: { slot_interval_minutes: 60, min_lead_minutes: 0 },
    },
    services: {
      id: SERVICE_ID,
      name: "Revisión",
      application_min: 60,
      exposure_min: 0,
      post_exposure_min: 0,
      price_cents: 3000,
      currency: "EUR",
      active: true,
    },
    professional_services: [{ professional_id: PRO_ID, professionals: { active: true } }],
    professional_schedules: [{ weekday: 1, start_time: "10:00:00", end_time: "14:00:00" }],
    schedule_exceptions: null,
    appointment_blocks: [],
    salon_opening_hours: [{ weekday: 1, start_time: "10:00:00", end_time: "14:00:00" }],
    salon_opening_exceptions: [],
    operatory: [],
    // Citas del día CON gabinete, de cualquier profesional. No son los bloques
    // de fase: durante la espera el profesional queda libre, pero el sillón no
    // —el paciente sigue sentado—, así que el gabinete lo ocupa la cita entera.
    appointments: [],
    ...overrides,
  };
}

function ofrece(slots: { startsAt: string }[], iso: string): boolean {
  return slots.some((s) => s.startsAt === iso);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2025-06-09T00:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
  holder.admin = null;
});

describe("disponibilidad — gabinete como recurso", () => {
  it("sin gabinetes configurados ofrece los mismos huecos que siempre", async () => {
    // La red de seguridad de toda la fase: estrenar la funcion no puede dejar
    // a una clinica sin poder citar.
    holder.admin = makeAdminMock(fixtures());

    const slots = await getAvailability(SLUG, SERVICE_ID, DATE, undefined);

    expect(ofrece(slots, L_10)).toBe(true);
    expect(ofrece(slots, L_11)).toBe(true);
  });

  it("con dos gabinetes y uno ocupado, el hueco sigue disponible", async () => {
    holder.admin = makeAdminMock(
      fixtures({
        operatory: [{ id: "g1" }, { id: "g2" }],
        // Cita de OTRO profesional: no bloquea a este, solo ocupa un sillón.
        appointments: [{ operatory_id: "g1", starts_at: L_10, ends_at: L_11 }],
      }),
    );

    const slots = await getAvailability(SLUG, SERVICE_ID, DATE, undefined);

    expect(ofrece(slots, L_10)).toBe(true);
  });

  it("con un solo gabinete ocupado, ese hueco desaparece", async () => {
    holder.admin = makeAdminMock(
      fixtures({
        operatory: [{ id: "g1" }],
        // El unico sillon, ocupado por otro profesional: aunque este dentista
        // este libre, no hay donde sentar al paciente.
        appointments: [{ operatory_id: "g1", starts_at: L_10, ends_at: L_11 }],
      }),
    );

    const slots = await getAvailability(SLUG, SERVICE_ID, DATE, undefined);

    expect(ofrece(slots, L_10)).toBe(false);
    expect(ofrece(slots, L_11)).toBe(true);
  });

  it("una cita sin gabinete asignado no ocupa ninguno", async () => {
    // Hay 9.108 citas antiguas sin gabinete: contarlas como "ocupan todos"
    // vaciaria la agenda de golpe.
    holder.admin = makeAdminMock(
      fixtures({
        operatory: [{ id: "g1" }],
        appointments: [{ operatory_id: null, starts_at: L_10, ends_at: L_11 }],
      }),
    );

    const slots = await getAvailability(SLUG, SERVICE_ID, DATE, undefined);

    // Sin gabinete asignado no ocupa ninguno: el hueco sigue libre.
    expect(ofrece(slots, L_10)).toBe(true);
  });
});
