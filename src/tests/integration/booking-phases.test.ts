/**
 * Tests de integración del modelo de FASES en la reserva pública.
 *
 * A diferencia de los unitarios de `availability.ts` (que prueban el motor puro
 * `generateSlots`), aquí ejercitamos la capa de servidor completa
 * (`getAvailability` y `createBooking` de `@/lib/booking/server`): lectura del
 * salón, columnas de fase del servicio, consulta de `appointment_blocks` con su
 * literal `tstzrange`, cálculo de la ventana de bloqueo vs. duración total y, en
 * `createBooking`, el recálculo de disponibilidad que decide aceptar o rechazar.
 *
 * Supabase se sustituye por un doble que devuelve fixtures por tabla, de modo
 * que la lógica de negocio real se ejecuta sin base de datos.
 *
 * Escenarios (una cita EXISTENTE del mismo profesional, servicio nuevo de 30 min):
 *   1. Reservar en el tramo de EXPOSICIÓN de la otra cita  → ACEPTADO.
 *   2. Reservar en el tramo de APLICACIÓN de la otra cita  → RECHAZADO.
 *   3. Reservar en el tramo de POST-EXPOSICIÓN de la otra cita → RECHAZADO.
 *   4. Servicio existente sin exposición (exposure_min = 0) → bloqueo contiguo,
 *      idéntico al modelo anterior (sin hueco reservable en medio).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// ─────────────────────────────────────────────────────────────────────────────
// Doble de Supabase admin. `vi.hoisted` crea un contenedor mutable accesible
// desde la factory de `vi.mock` (que se iza por encima de los imports).
// ─────────────────────────────────────────────────────────────────────────────
const holder = vi.hoisted(() => ({ admin: null as unknown }));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => holder.admin,
}));

import { getAvailability, createBooking, BookingError } from "@/lib/booking/server";
import type { CreateBookingInput } from "@/lib/booking/schema";

// ─────────────────────────────────────────────────────────────────────────────
// Constantes de escenario
// ─────────────────────────────────────────────────────────────────────────────
const TZ = "Europe/Madrid";
const DATE = "2025-06-09"; // Lunes (weekday 1)
const SLUG = "salon-test";
const SALON_ID = "salon-1";
const SERVICE_ID = "00000000-0000-0000-0000-0000000000aa";
const PRO_ID = "11111111-1111-1111-1111-1111111111bb";

// La cita EXISTENTE (3 fases) empieza a las 10:00 Madrid = 08:00 UTC:
//   · aplicación:     10:00–10:30 Madrid = 08:00–08:30 UTC   → bloque
//   · exposición:     10:30–11:30 Madrid = 08:30–09:30 UTC   → LIBRE (no bloquea)
//   · post-exposición 11:30–11:45 Madrid = 09:30–09:45 UTC   → bloque
const BLOCK_APPLICATION = '["2025-06-09 08:00:00+00","2025-06-09 08:30:00+00")';
const BLOCK_POST_EXPOSURE = '["2025-06-09 09:30:00+00","2025-06-09 09:45:00+00")';

// Instantes de la NUEVA reserva (servicio de 30 min, una sola fase).
const AT_EXPOSURE = "2025-06-09T08:30:00.000Z"; // 10:30 Madrid → hueco de exposición ajena
const AT_APPLICATION = "2025-06-09T08:00:00.000Z"; // 10:00 Madrid → aplicación ajena
const AT_POST_EXPOSURE = "2025-06-09T09:30:00.000Z"; // 11:30 Madrid → post-exposición ajena
const AT_FREE_ADJACENT = "2025-06-09T09:00:00.000Z"; // 11:00 Madrid → libre en todos los casos

// ─────────────────────────────────────────────────────────────────────────────
// Doble de query builder de Supabase.
//
// Reproduce solo lo que usa `server.ts`: encadenado fluido
// (`select`/`eq`/`filter`/`order`/`limit`), terminadores `maybeSingle`/`single`
// y `await` directo (el builder es "thenable"). Para inserts guarda el payload y
// delega en `onInsert` para fabricar la fila devuelta.
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
      // Thenable: permite `await admin.from(t).select(...).eq(...)` (consultas de lista).
      then: (onFulfilled: (v: { data: unknown; error: unknown }) => unknown) =>
        onFulfilled(currentData()),
    };
    return b;
  }

  return { from: (table: string) => builder(table) };
}

// Fixtures base compartidas por todos los escenarios. El servicio NUEVO es de una
// sola fase (aplicación 30 / exposición 0 / post 0): ventana de bloqueo = total = 30 min.
function baseFixtures(overrides: Partial<Fixtures> = {}): Fixtures {
  return {
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
    customers: null, // no encontrado → se crea
    professionals: { full_name: "Ana" },
    onInsert: (table, payload) => {
      if (table === "customers") return { id: "cust-1" };
      if (table === "appointments") {
        return { id: "appt-1", starts_at: payload.starts_at, ends_at: payload.ends_at };
      }
      return null;
    },
    ...overrides,
  };
}

function block(range: string, phase: "application" | "post_exposure") {
  return { occupied_range: range, phase };
}

function bookingInput(startsAt: string): CreateBookingInput {
  return {
    serviceId: SERVICE_ID,
    professionalId: "any",
    startsAt,
    customer: {
      fullName: "Cliente Prueba",
      email: "cliente@example.com",
      phone: "600123456",
      marketingConsent: false,
    },
  };
}

/** ¿Ofrece la disponibilidad un hueco que empiece exactamente en `startsAt`? */
function offersSlot(slots: { startsAt: string }[], startsAt: string): boolean {
  return slots.some((s) => s.startsAt === startsAt);
}

// ─────────────────────────────────────────────────────────────────────────────
// Reloj fijo: `generateSlots` usa `new Date()` por defecto en la capa de
// servidor. Lo fijamos a medianoche del día de prueba para que todos los huecos
// diurnos queden en el futuro y no los descarte la antelación mínima.
// ─────────────────────────────────────────────────────────────────────────────
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2025-06-09T00:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
  holder.admin = null;
});

describe("reserva pública — solapamiento por fases (integración)", () => {
  describe("cita existente CON exposición (hueco reservable en medio)", () => {
    // Bloques físicos de la otra cita: aplicación + post-exposición. La
    // exposición no aparece → el profesional está libre en ese tramo.
    const withExposure = () =>
      baseFixtures({
        appointment_blocks: [
          block(BLOCK_APPLICATION, "application"),
          block(BLOCK_POST_EXPOSURE, "post_exposure"),
        ],
      });

    it("(1) acepta reservar durante el tramo de EXPOSICIÓN de otra cita", async () => {
      holder.admin = makeAdminMock(withExposure());

      // La disponibilidad ofrece el hueco de las 10:30 Madrid (exposición ajena).
      const slots = await getAvailability(SLUG, SERVICE_ID, DATE, undefined);
      expect(offersSlot(slots, AT_EXPOSURE)).toBe(true);

      // Y la reserva se confirma.
      const confirmation = await createBooking(SLUG, bookingInput(AT_EXPOSURE));
      expect(confirmation.appointmentId).toBe("appt-1");
      expect(confirmation.startsAt).toBe(AT_EXPOSURE);
      // ends_at = inicio + total (30 min, servicio de una fase).
      expect(confirmation.endsAt).toBe("2025-06-09T09:00:00.000Z");
      expect(confirmation.professionalName).toBe("Ana");
    });

    it("(2) rechaza reservar durante el tramo de APLICACIÓN de otra cita", async () => {
      holder.admin = makeAdminMock(withExposure());

      const slots = await getAvailability(SLUG, SERVICE_ID, DATE, undefined);
      expect(offersSlot(slots, AT_APPLICATION)).toBe(false);

      await expect(createBooking(SLUG, bookingInput(AT_APPLICATION))).rejects.toMatchObject({
        status: 409,
      });
      await expect(createBooking(SLUG, bookingInput(AT_APPLICATION))).rejects.toBeInstanceOf(
        BookingError,
      );
    });

    it("(3) rechaza reservar durante el tramo de POST-EXPOSICIÓN de otra cita", async () => {
      holder.admin = makeAdminMock(withExposure());

      const slots = await getAvailability(SLUG, SERVICE_ID, DATE, undefined);
      expect(offersSlot(slots, AT_POST_EXPOSURE)).toBe(false);

      await expect(createBooking(SLUG, bookingInput(AT_POST_EXPOSURE))).rejects.toMatchObject({
        status: 409,
      });
    });

    it("mantiene libres los instantes no ocupados (control positivo)", async () => {
      holder.admin = makeAdminMock(withExposure());
      const slots = await getAvailability(SLUG, SERVICE_ID, DATE, undefined);
      // 11:00 Madrid está fuera de todos los bloques → disponible.
      expect(offersSlot(slots, AT_FREE_ADJACENT)).toBe(true);
    });
  });

  describe("(4) cita existente SIN exposición (exposure_min = 0)", () => {
    // Con exposición 0 los bloques de aplicación y post-exposición son contiguos
    // y cubren toda la duración, igual que el modelo anterior de rango único:
    //   · aplicación:      10:00–10:30 Madrid = 08:00–08:30 UTC
    //   · post-exposición: 10:30–11:00 Madrid = 08:30–09:00 UTC (contiguo)
    const noExposure = () =>
      baseFixtures({
        appointment_blocks: [
          block('["2025-06-09 08:00:00+00","2025-06-09 08:30:00+00")', "application"),
          block('["2025-06-09 08:30:00+00","2025-06-09 09:00:00+00")', "post_exposure"),
        ],
      });

    it("no deja hueco reservable en medio: el bloqueo es contiguo (como el modelo anterior)", async () => {
      holder.admin = makeAdminMock(noExposure());

      const slots = await getAvailability(SLUG, SERVICE_ID, DATE, undefined);

      // Ni el inicio (aplicación) ni el punto que sería "exposición" quedan libres:
      // con exposure_min = 0 no hay tramo de exposición que reservar.
      expect(offersSlot(slots, AT_APPLICATION)).toBe(false); // 10:00 Madrid
      expect(offersSlot(slots, AT_EXPOSURE)).toBe(false); // 10:30 Madrid (cubierto por post)

      // El primer hueco realmente libre es el adyacente al bloque: 11:00 Madrid.
      expect(offersSlot(slots, AT_FREE_ADJACENT)).toBe(true);
    });

    it("rechaza reservar dentro del rango contiguo ocupado", async () => {
      holder.admin = makeAdminMock(noExposure());

      // El instante que en el modelo de fases sería un hueco de exposición aquí
      // está ocupado por la post-exposición → la reserva se rechaza.
      await expect(createBooking(SLUG, bookingInput(AT_EXPOSURE))).rejects.toMatchObject({
        status: 409,
      });
    });

    it("acepta reservar justo después del rango contiguo (borde adyacente)", async () => {
      holder.admin = makeAdminMock(noExposure());

      const confirmation = await createBooking(SLUG, bookingInput(AT_FREE_ADJACENT));
      expect(confirmation.appointmentId).toBe("appt-1");
      expect(confirmation.startsAt).toBe(AT_FREE_ADJACENT);
    });
  });
});
