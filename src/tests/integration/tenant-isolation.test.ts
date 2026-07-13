/**
 * Tests de integración del AISLAMIENTO MULTI-TENANT y del guardado de horarios.
 *
 * Ejercitan los Server Actions reales (`createProfessional`, `updateProfessional`
 * de personal y `saveWeeklySchedule` de horarios) sustituyendo Supabase por un
 * doble configurable por tabla. Se comprueba la lógica de confianza del
 * servidor:
 *
 *   1. Un profesional NO puede asignarse a una sede de otro salón
 *      (`assertLocationInSalon`) ni vincular servicios de otro salón
 *      (`assertServicesInSalon`).
 *   2. Los Server Actions revalidan el rol (owner/manager) aunque el layout ya
 *      lo bloquee: defensa en profundidad.
 *   3. El guardado del horario semanal exige que el profesional pertenezca al
 *      salón activo y respeta la regla de esquema `end_time > start_time`.
 *
 * `getActiveMembership`, `createClient` y `revalidatePath` se mockean; la lógica
 * de negocio real se ejecuta contra los fixtures en memoria (sin base de datos).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// ─────────────────────────────────────────────────────────────────────────────
// Contenedores mutables izados por encima de los imports para poder reconfigurar
// el doble de Supabase y la pertenencia activa en cada test.
// ─────────────────────────────────────────────────────────────────────────────
const holder = vi.hoisted(() => ({
  supabase: null as unknown,
  membership: null as unknown,
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => holder.supabase,
}));

vi.mock("@/lib/salon", () => ({
  getActiveMembership: () => Promise.resolve(holder.membership),
}));

import {
  createProfessional,
  updateProfessional,
} from "@/app/(dashboard)/ajustes/personal/actions";
import { saveWeeklySchedule } from "@/app/(dashboard)/ajustes/horarios/actions";
import type { ProfessionalInput } from "@/lib/validations/professional";
import type { WeeklyScheduleInput } from "@/lib/validations/schedule";

// ─────────────────────────────────────────────────────────────────────────────
// Constantes de escenario (UUIDs sintéticos, no datos reales).
// ─────────────────────────────────────────────────────────────────────────────
const SALON_ID = "salon-activo";
const LOCATION_ID = "22222222-2222-2222-2222-222222222222";
const SERVICE_ID = "33333333-3333-3333-3333-333333333333";
const PRO_ID = "11111111-1111-1111-1111-111111111111";

/** Pertenencia por defecto: propietario del salón activo. */
function ownerMembership() {
  return { salonId: SALON_ID, role: "owner" as const };
}

// ─────────────────────────────────────────────────────────────────────────────
// Doble configurable de Supabase.
//
// `tables` fija el resultado de las lecturas por tabla; `onWrite` fabrica el
// resultado de insert/update/delete. Cada `.from()` crea un builder propio con
// su estado de escritura, de modo que una misma tabla puede leerse y escribirse
// en el mismo flujo sin interferencias.
// ─────────────────────────────────────────────────────────────────────────────
interface TableResult {
  data?: unknown;
  error?: { message: string; code?: string } | null;
}

interface MockConfig {
  tables?: Record<string, TableResult>;
  onWrite?: (
    op: "insert" | "update" | "delete",
    table: string,
    payload: unknown,
  ) => TableResult;
}

function makeSupabaseMock(config: MockConfig) {
  function builder(table: string) {
    let pending: { op: "insert" | "update" | "delete"; payload: unknown } | null =
      null;

    function readResult(): { data: unknown; error: unknown } {
      const t = config.tables?.[table] ?? { data: [], error: null };
      return { data: t.data ?? [], error: t.error ?? null };
    }

    function resolveList(): { data: unknown; error: unknown } {
      if (pending) {
        const r = config.onWrite?.(pending.op, table, pending.payload) ?? {};
        return { data: r.data ?? null, error: r.error ?? null };
      }
      return readResult();
    }

    function resolveSingle(): { data: unknown; error: unknown } {
      const { data, error } = resolveList();
      return {
        data: Array.isArray(data) ? (data[0] ?? null) : data,
        error,
      };
    }

    const b = {
      select: () => b,
      eq: () => b,
      in: () => b,
      order: () => b,
      limit: () => b,
      insert: (payload: unknown) => {
        pending = { op: "insert", payload };
        return b;
      },
      update: (payload: unknown) => {
        pending = { op: "update", payload };
        return b;
      },
      delete: () => {
        pending = { op: "delete", payload: null };
        return b;
      },
      maybeSingle: () => Promise.resolve(resolveSingle()),
      single: () => Promise.resolve(resolveSingle()),
      then: (onFulfilled: (v: { data: unknown; error: unknown }) => unknown) =>
        onFulfilled(resolveList()),
    };
    return b;
  }

  return { from: (table: string) => builder(table) };
}

/** Entrada válida de profesional; cada test ajusta lo necesario. */
function professionalInput(
  overrides: Partial<ProfessionalInput> = {},
): ProfessionalInput {
  return {
    full_name: "Ana López",
    location_id: LOCATION_ID,
    color: "#6366f1",
    service_ids: [],
    active: true,
    ...overrides,
  };
}

beforeEach(() => {
  holder.membership = ownerMembership();
  holder.supabase = null;
});

// ─────────────────────────────────────────────────────────────────────────────
describe("aislamiento multi-tenant — sede de otro salón", () => {
  it("rechaza crear un profesional en una sede que no pertenece al salón", async () => {
    // La consulta de la sede no encuentra fila para (id, salon_id) → fuera del salón.
    holder.supabase = makeSupabaseMock({ tables: { locations: { data: null } } });

    const result = await createProfessional(professionalInput());

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("no pertenece a tu salón");
    }
  });

  it("rechaza actualizar un profesional hacia una sede de otro salón", async () => {
    holder.supabase = makeSupabaseMock({ tables: { locations: { data: null } } });

    const result = await updateProfessional(PRO_ID, professionalInput());

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("no pertenece a tu salón");
    }
  });

  it("crea el profesional cuando la sede sí pertenece al salón (control positivo)", async () => {
    holder.supabase = makeSupabaseMock({
      tables: { locations: { data: [{ id: LOCATION_ID }] } },
      onWrite: (op, table) =>
        op === "insert" && table === "professionals"
          ? { data: [{ id: PRO_ID, salon_id: SALON_ID, full_name: "Ana López" }] }
          : {},
    });

    const result = await createProfessional(professionalInput());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.id).toBe(PRO_ID);
    }
  });
});

describe("aislamiento multi-tenant — servicios de otro salón", () => {
  it("rechaza vincular un servicio que no pertenece al salón", async () => {
    // Sede válida, pero la consulta de servicios devuelve menos filas que ids
    // solicitados → algún servicio es de otro salón.
    holder.supabase = makeSupabaseMock({
      tables: {
        locations: { data: [{ id: LOCATION_ID }] },
        services: { data: [] },
      },
    });

    const result = await createProfessional(
      professionalInput({ service_ids: [SERVICE_ID] }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("no pertenece a tu salón");
    }
  });
});

describe("defensa en profundidad — rol y pertenencia en el Server Action", () => {
  it("rechaza a quien no tiene un salón asignado", async () => {
    holder.membership = null;
    holder.supabase = makeSupabaseMock({});

    const result = await createProfessional(professionalInput());

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("No tienes un salón asignado");
    }
  });

  it("rechaza al rol staff (sin permiso de gestión)", async () => {
    holder.membership = { salonId: SALON_ID, role: "staff" };
    holder.supabase = makeSupabaseMock({});

    const result = await createProfessional(professionalInput());

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("No tienes permiso");
    }
  });

  it("rechaza una entrada inválida antes de tocar la base de datos", async () => {
    holder.supabase = makeSupabaseMock({});

    // Color en formato incorrecto → falla el esquema, no llega a Supabase.
    const result = await createProfessional(
      professionalInput({ color: "rojo" }),
    );

    expect(result.ok).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
function weeklyInput(
  overrides: Partial<WeeklyScheduleInput> = {},
): WeeklyScheduleInput {
  return {
    professional_id: PRO_ID,
    slots: [{ weekday: 1, start_time: "09:00", end_time: "17:00" }],
    ...overrides,
  };
}

describe("guardado de horarios — pertenencia y end_time > start_time", () => {
  it("rechaza guardar el horario de un profesional de otro salón", async () => {
    // El profesional no aparece para (id, salon_id) → no es del salón activo.
    holder.supabase = makeSupabaseMock({
      tables: { professionals: { data: null } },
    });

    const result = await saveWeeklySchedule(weeklyInput());

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("no pertenece a tu salón");
    }
  });

  it("rechaza un tramo con end_time ≤ start_time (regla de esquema)", async () => {
    holder.supabase = makeSupabaseMock({
      tables: { professionals: { data: [{ id: PRO_ID }] } },
    });

    const result = await saveWeeklySchedule(
      weeklyInput({
        slots: [{ weekday: 1, start_time: "17:00", end_time: "09:00" }],
      }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("posterior");
    }
  });

  it("guarda el horario válido de un profesional del salón (control positivo)", async () => {
    holder.supabase = makeSupabaseMock({
      tables: {
        professionals: { data: [{ id: PRO_ID }] },
        professional_schedules: { data: [] },
      },
    });

    const result = await saveWeeklySchedule(weeklyInput());

    expect(result.ok).toBe(true);
  });
});
