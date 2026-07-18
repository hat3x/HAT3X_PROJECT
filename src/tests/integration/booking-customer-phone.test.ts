/**
 * Tests de integración de la IDENTIDAD POR TELÉFONO en la reserva pública.
 *
 * Ejercitan la resolución de ficha de cliente dentro de `createBooking`
 * (`@/lib/booking/server`): el teléfono es la CLAVE NATURAL, se canonicaliza a
 * E.164 con `normalizePhone` (espejo de `app.normalize_phone`) y se busca por
 * `phone_e164` SIEMPRE acotado por `salon_id`. Si la ficha existe se REUTILIZA
 * sin pisar `user_id` ni nombre; si no, se crea. Un teléfono sin número real
 * (no normaliza) se rechaza con un 400 claro, sin crear una ficha fantasma.
 *
 * Supabase se sustituye por un doble que devuelve fixtures por tabla y registra
 * los INSERT, de modo que la lógica de negocio real se ejecuta sin base de datos.
 *
 * Escenarios:
 *   1. Teléfono que NO normaliza (basura sin número) → BookingError 400 y NO se
 *      inserta ninguna ficha ni cita.
 *   2. Ficha EXISTENTE con el mismo teléfono canónico → se REUTILIZA (la cita
 *      apunta a su id) y NO se inserta un cliente nuevo (no se pisa user_id/nombre).
 *   3. Sin ficha previa → se CREA la ficha y la cita apunta a la nueva.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const holder = vi.hoisted(() => ({ admin: null as unknown }));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => holder.admin,
}));

import { createBooking, BookingError } from "@/lib/booking/server";
import type { CreateBookingInput } from "@/lib/booking/schema";

// ─────────────────────────────────────────────────────────────────────────────
// Constantes de escenario (lunes, servicio de 30 min de una fase, sin bloques).
// ─────────────────────────────────────────────────────────────────────────────
const TZ = "Europe/Madrid";
const DATE = "2025-06-09"; // Lunes (weekday 1) — referencia del escenario
const SLUG = "salon-test";
const SALON_ID = "salon-1";
const SERVICE_ID = "00000000-0000-0000-0000-0000000000aa";
const PRO_ID = "11111111-1111-1111-1111-1111111111bb";

// Hueco libre: 11:00 Madrid = 09:00 UTC (CEST, +2), dentro del horario 09:00–17:00.
const AT_FREE = "2025-06-09T09:00:00.000Z";

// ─────────────────────────────────────────────────────────────────────────────
// Doble de query builder de Supabase (mismo patrón que booking-phases.test.ts),
// con REGISTRO de los INSERT para poder distinguir "reutilizar" de "crear".
// El `eq` es laxo (no filtra por columna): cada tabla devuelve su fixture, que es
// justo lo que necesitamos para simular "existe / no existe" la ficha.
// ─────────────────────────────────────────────────────────────────────────────
interface Fixtures {
  salons?: unknown;
  services?: unknown;
  professional_services?: unknown[];
  professional_schedules?: unknown[];
  schedule_exceptions?: unknown;
  appointment_blocks?: unknown[];
  customers?: unknown;
  professionals?: unknown;
  onInsert?: (table: string, payload: Record<string, unknown>) => unknown;
}

function makeAdminMock(fx: Fixtures) {
  function builder(table: string) {
    let pendingInsert: Record<string, unknown> | null = null;

    function currentData(): { data: unknown; error: unknown } {
      if (pendingInsert) {
        return { data: fx.onInsert?.(table, pendingInsert) ?? null, error: null };
      }
      const raw = (fx as Record<string, unknown>)[table];
      return { data: raw ?? [], error: null };
    }

    function resolveSingle() {
      const { data, error } = currentData();
      return { data: Array.isArray(data) ? (data[0] ?? null) : data, error };
    }

    const b = {
      select: () => b,
      eq: () => b,
      filter: () => b,
      order: () => b,
      limit: () => b,
      insert: (payload: Record<string, unknown>) => {
        pendingInsert = payload;
        return b;
      },
      maybeSingle: () => Promise.resolve(resolveSingle()),
      single: () => Promise.resolve(resolveSingle()),
      then: (onFulfilled: (v: { data: unknown; error: unknown }) => unknown) =>
        onFulfilled(currentData()),
    };
    return b;
  }

  return { from: (table: string) => builder(table) };
}

/** Fixtures base + captura de INSERT. Devuelve el registro de inserciones. */
function setup(overrides: Partial<Fixtures> = {}): {
  inserts: { table: string; payload: Record<string, unknown> }[];
} {
  const inserts: { table: string; payload: Record<string, unknown> }[] = [];

  const fx: Fixtures = {
    salons: {
      id: SALON_ID,
      name: "Salón de Pruebas",
      slug: SLUG,
      timezone: TZ,
      active: true,
      settings: { slot_interval_minutes: 30, min_lead_minutes: 0 },
    },
    services: {
      id: SERVICE_ID,
      name: "Corte",
      application_min: 30,
      exposure_min: 0,
      post_exposure_min: 0,
      price_cents: 2000,
      currency: "EUR",
      active: true,
    },
    professional_services: [
      { professional_id: PRO_ID, professionals: { active: true } },
    ],
    professional_schedules: [
      { weekday: 1, start_time: "09:00:00", end_time: "17:00:00" },
    ],
    schedule_exceptions: null,
    appointment_blocks: [],
    customers: null, // por defecto: no existe → se crea
    professionals: { full_name: "Ana" },
    onInsert: (table, payload) => {
      inserts.push({ table, payload });
      if (table === "customers") return { id: "cust-nuevo" };
      if (table === "appointments") {
        return { id: "appt-1", starts_at: payload.starts_at, ends_at: payload.ends_at };
      }
      return null;
    },
    ...overrides,
  };

  holder.admin = makeAdminMock(fx);
  return { inserts };
}

/** Input de reserva con teléfono `phone` en el hueco libre. */
function bookingInput(phone: string): CreateBookingInput {
  return {
    serviceId: SERVICE_ID,
    professionalId: "any",
    startsAt: AT_FREE,
    customer: {
      fullName: "Cliente Prueba",
      email: "cliente@example.com",
      phone,
      marketingConsent: false,
    },
  };
}

/** customer_id con el que se insertó la cita (o undefined si no hubo insert de cita). */
function appointmentCustomerId(
  inserts: { table: string; payload: Record<string, unknown> }[],
): unknown {
  return inserts.find((i) => i.table === "appointments")?.payload.customer_id;
}

// Reloj fijo a medianoche del día de prueba: todos los huecos diurnos quedan en
// el futuro y no los descarta la antelación mínima.
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(`${DATE}T00:00:00.000Z`));
});

afterEach(() => {
  vi.useRealTimers();
  holder.admin = null;
});

describe("reserva pública — identidad por teléfono (integración)", () => {
  it("(1) rechaza con 400 un teléfono sin número real y no inserta nada", async () => {
    const { inserts } = setup();

    // '------' pasa el largo mínimo del schema pero no contiene un número real:
    // normalizePhone → null (no un '+34' fantasma).
    await expect(createBooking(SLUG, bookingInput("------"))).rejects.toMatchObject({
      status: 400,
    });
    await expect(createBooking(SLUG, bookingInput("------"))).rejects.toBeInstanceOf(
      BookingError,
    );

    // Ni ficha ni cita: la validación corta antes de escribir.
    expect(inserts.some((i) => i.table === "customers")).toBe(false);
    expect(inserts.some((i) => i.table === "appointments")).toBe(false);
  });

  it("(2) reutiliza la ficha existente con el mismo teléfono canónico, sin crear otra", async () => {
    // La ficha existe (misma persona por teléfono); trae user_id y nombre que NO
    // se deben pisar. El teléfono '612 34 56 78' y '+34612345678' son el mismo.
    const { inserts } = setup({
      customers: {
        id: "cust-existente",
        user_id: "user-9",
        full_name: "Nombre Previo",
      },
    });

    const confirmation = await createBooking(SLUG, bookingInput("612 34 56 78"));

    expect(confirmation.appointmentId).toBe("appt-1");
    // La cita apunta a la ficha existente…
    expect(appointmentCustomerId(inserts)).toBe("cust-existente");
    // …y NO se insertó un cliente nuevo (no se toca user_id ni nombre).
    expect(inserts.some((i) => i.table === "customers")).toBe(false);
  });

  it("(3) crea la ficha cuando el teléfono no existe todavía en el salón", async () => {
    const { inserts } = setup({ customers: null });

    const confirmation = await createBooking(SLUG, bookingInput("600123456"));

    expect(confirmation.appointmentId).toBe("appt-1");
    // Se insertó la ficha con el teléfono crudo (phone_e164 lo deriva la BD)…
    const customerInsert = inserts.find((i) => i.table === "customers");
    expect(customerInsert).toBeDefined();
    expect(customerInsert?.payload.salon_id).toBe(SALON_ID);
    expect(customerInsert?.payload.phone).toBe("600123456");
    // …y la cita apunta a la ficha recién creada.
    expect(appointmentCustomerId(inserts)).toBe("cust-nuevo");
  });
});
