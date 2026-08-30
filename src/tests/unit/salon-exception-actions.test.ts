/**
 * Excepciones del horario de la CLÍNICA: abrir un turno suelto o cerrar un día.
 *
 * El caso que lo motiva: Nicolás pasa consulta un martes por la tarde, pero solo
 * ese martes. Antes solo se podía abrir metiéndolo en el horario SEMANAL, lo que
 * abriría la clínica todos los martes del año.
 *
 * Lo que se prueba aquí son las reglas que impiden guardar una excepción que no
 * significa nada — porque el motor tendría que adivinar qué quiso decir, y
 * adivinar sobre horarios acaba en citas a puerta cerrada.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { MemberRole } from "@/types/database";

const h = vi.hoisted(() => ({
  membership: null as unknown,
  result: { data: { id: "e1" }, error: null } as unknown,
  captured: null as unknown,
}));

vi.mock("@/lib/salon", () => ({
  getActiveMembership: async () => h.membership,
  getActiveSalonId: async () => (h.membership === null ? null : "s1"),
  canManageSettings: (role: MemberRole | null | undefined) =>
    role === "owner" || role === "manager",
}));

vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

vi.mock("@/lib/supabase/server", () => {
  const chain = {
    insert: (rows: unknown) => {
      h.captured = rows;
      return chain;
    },
    delete: () => chain,
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    single: async () => h.result,
    maybeSingle: async () => h.result,
    then: (r: (v: unknown) => unknown) => r(h.result),
  };
  return { createClient: () => ({ from: () => chain }) };
});

import { createSalonOpeningException } from "@/app/(dashboard)/ajustes/horarios/actions";

beforeEach(() => {
  h.membership = { salonId: "s1", role: "owner" as MemberRole };
  h.result = { data: { id: "e1" }, error: null };
  h.captured = null;
});

describe("createSalonOpeningException", () => {
  it("abre un turno extra un día concreto", async () => {
    const r = await createSalonOpeningException({
      exception_date: "2026-09-01",
      is_open: true,
      start_time: "17:00",
      end_time: "20:00",
      reason: "Consulta de tarde",
    });

    expect(r.ok).toBe(true);
    expect(h.captured).toMatchObject({
      salon_id: "s1",
      exception_date: "2026-09-01",
      is_open: true,
    });
  });

  it("cierra un día sin pedir horas", async () => {
    const r = await createSalonOpeningException({
      exception_date: "2026-12-25",
      is_open: false,
      start_time: null,
      end_time: null,
      reason: "Navidad",
    });

    expect(r.ok).toBe(true);
    expect((h.captured as Record<string, unknown>).start_time).toBeNull();
  });

  it("una apertura sin horas no se guarda", async () => {
    // "Abierto de null a null" no significa nada y el motor tendria que
    // adivinar. Adivinar sobre horarios acaba en citas a puerta cerrada.
    const r = await createSalonOpeningException({
      exception_date: "2026-09-01",
      is_open: true,
      start_time: null,
      end_time: null,
    });

    expect(r.ok).toBe(false);
    expect(h.captured).toBeNull();
  });

  it("rechaza un tramo que termina antes de empezar", async () => {
    const r = await createSalonOpeningException({
      exception_date: "2026-09-01",
      is_open: true,
      start_time: "20:00",
      end_time: "17:00",
    });

    expect(r.ok).toBe(false);
    expect(h.captured).toBeNull();
  });

  it("un cierre con horas tampoco se guarda", async () => {
    // Cerrado es cerrado: unas horas ahi solo confundirian a quien lo lea.
    const r = await createSalonOpeningException({
      exception_date: "2026-12-25",
      is_open: false,
      start_time: "10:00",
      end_time: "14:00",
    });

    expect(r.ok).toBe(false);
  });

  it("quien no gestiona el salón no puede abrir ni cerrar días", async () => {
    // Abrir un dia es una decision de negocio, no de quien pasa consulta.
    h.membership = { salonId: "s1", role: "staff" as MemberRole };

    const r = await createSalonOpeningException({
      exception_date: "2026-09-01",
      is_open: true,
      start_time: "17:00",
      end_time: "20:00",
    });

    expect(r.ok).toBe(false);
    expect(h.captured).toBeNull();
  });

  it("sin salón activo no se escribe nada", async () => {
    h.membership = null;

    const r = await createSalonOpeningException({
      exception_date: "2026-09-01",
      is_open: false,
      start_time: null,
      end_time: null,
    });

    expect(r.ok).toBe(false);
    expect(h.captured).toBeNull();
  });
});
