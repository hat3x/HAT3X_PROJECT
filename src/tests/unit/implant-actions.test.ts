/**
 * Acciones de trazabilidad de implantes (A3).
 *
 * Estos registros existen para una obligación legal —Reglamento (UE) 2017/745—
 * y para un momento concreto: el fabricante retira un lote y hay que decir a
 * quién se le puso. Lo que se prueba aquí son las puertas que impiden que ese
 * registro sea inservible.
 *
 * La regla que hereda todo el módulo dental: el sector NO lo comprueba la RLS,
 * que solo aísla por salón. Si la acción no lo comprueba, una peluquería podría
 * escribir en tablas clínicas.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { MemberRole } from "@/types/database";

const h = vi.hoisted(() => ({
  salon: null as unknown,
  membership: null as unknown,
  insertResult: { data: { id: "imp-1" }, error: null } as unknown,
  captured: null as unknown,
}));

vi.mock("@/lib/salon", () => ({
  getActiveSalon: async () => h.salon,
  getActiveMembership: async () => h.membership,
}));

vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

vi.mock("@/lib/supabase/server", () => {
  const chain = {
    insert: (rows: unknown) => {
      h.captured = rows;
      return chain;
    },
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    single: async () => h.insertResult,
    maybeSingle: async () => h.insertResult,
    then: (r: (v: unknown) => unknown) => r(h.insertResult),
  };
  return {
    createClient: () => ({
      from: () => chain,
      auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
    }),
  };
});

import { registerImplant } from "@/app/(dashboard)/expediente/implant-actions";

const SALON = { id: "s1", name: "Clínica", sector: "odontologia" };
const PACIENTE = "11111111-1111-1111-1111-111111111111";

function entrada(extra: Record<string, unknown> = {}) {
  return { customerId: PACIENTE, fdiCode: 46, ...extra };
}

beforeEach(() => {
  h.salon = SALON;
  h.membership = { salonId: "s1", role: "owner" as MemberRole };
  h.insertResult = { data: { id: "imp-1" }, error: null };
  h.captured = null;
});

describe("registerImplant", () => {
  it("registra el implante en una clínica dental", async () => {
    const r = await registerImplant(entrada({ lot: "LOT123", gtin: "07612345678904" }));

    expect(r.ok).toBe(true);
  });

  it("una peluquería no puede escribir en tablas clínicas", async () => {
    // La RLS aisla por salón, NO por sector: esta puerta es la única.
    h.salon = { ...SALON, sector: "peluqueria" };

    const r = await registerImplant(entrada());

    expect(r.ok).toBe(false);
    expect(h.captured).toBeNull();
  });

  it("sin salón activo no se escribe nada", async () => {
    h.salon = null;

    const r = await registerImplant(entrada());

    expect(r.ok).toBe(false);
    expect(h.captured).toBeNull();
  });

  it("un rol sin permiso de escritura no registra", async () => {
    h.membership = { salonId: "s1", role: "viewer" as MemberRole };

    const r = await registerImplant(entrada());

    expect(r.ok).toBe(false);
    expect(h.captured).toBeNull();
  });

  it("un diente imposible se rechaza antes de tocar la base", async () => {
    const r = await registerImplant(entrada({ fdiCode: 99 }));

    expect(r.ok).toBe(false);
    expect(h.captured).toBeNull();
  });

  it("guarda el salón en la fila: sin él la RLS no aísla nada", async () => {
    await registerImplant(entrada({ lot: "LOT123" }));

    expect(h.captured).toMatchObject({ salon_id: "s1", customer_id: PACIENTE, fdi_code: 46 });
  });

  it("un lote en blanco entra como nulo, no como cadena vacía", async () => {
    // Una cadena vacia ensuciaria el indice por lote, que es el de la consulta
    // que se hace el dia de una alerta sanitaria.
    await registerImplant(entrada({ lot: "  " }));

    expect((h.captured as Record<string, unknown>).lot).toBeNull();
  });

  it("si la base falla, lo dice en vez de fingir que se guardó", async () => {
    h.insertResult = { data: null, error: { message: "boom" } };

    const r = await registerImplant(entrada());

    expect(r.ok).toBe(false);
  });
});
