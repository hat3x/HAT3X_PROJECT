/**
 * Consultas de trazabilidad de implantes (A3).
 *
 * Son dos preguntas, y la segunda es la que justifica toda la fase:
 *
 *   1. «¿Qué lleva puesto este paciente?» — la del día a día.
 *   2. «Han retirado el lote LOT123: ¿a quién se lo pusimos?» — la del día
 *      malo, cuando hay que llamar a gente.
 *
 * Lo que se fija aquí es el ORDEN y el AISLAMIENTO, que son lo que hace que la
 * respuesta sirva: una lista sin ordenar por fecha obliga a leerla entera, y
 * una consulta sin filtro de salón devolvería pacientes de otra clínica.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  rows: [] as unknown[],
  calls: [] as Array<{ table: string; filters: Array<[string, unknown]>; order: string[] }>,
}));

vi.mock("@/lib/supabase/server", () => {
  function builder(table: string) {
    const registro = { table, filters: [] as Array<[string, unknown]>, order: [] as string[] };
    h.calls.push(registro);
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: (col: string, val: unknown) => {
        registro.filters.push([col, val]);
        return chain;
      },
      order: (col: string) => {
        registro.order.push(col);
        return chain;
      },
      // El codigo tipa el resultado con `.returns<T>()`; sin el en el arnes, la
      // cadena se corta antes de resolverse.
      returns: () => chain,
      then: (r: (v: unknown) => unknown) => r({ data: h.rows, error: null }),
    };
    return chain;
  }
  return { createClient: () => ({ from: (t: string) => builder(t) }) };
});

import { fetchImplantsByCustomer, fetchImplantsByLot } from "@/lib/queries/implants";

const SALON = "s1";
const PACIENTE = "c1";

beforeEach(() => {
  h.rows = [];
  h.calls = [];
});

describe("fetchImplantsByCustomer", () => {
  it("filtra por salón Y por paciente", async () => {
    await fetchImplantsByCustomer(SALON, PACIENTE);

    const filtros = h.calls[0]?.filters ?? [];
    expect(filtros).toContainEqual(["salon_id", SALON]);
    expect(filtros).toContainEqual(["customer_id", PACIENTE]);
  });

  it("ordena por fecha de colocación, no por orden de inserción", async () => {
    await fetchImplantsByCustomer(SALON, PACIENTE);

    expect(h.calls[0]?.order).toContain("placed_at");
  });
});

describe("fetchImplantsByLot", () => {
  it("filtra por salón Y por lote", async () => {
    // Sin el filtro de salón, una alerta sanitaria devolveria pacientes de
    // otra clinica: el peor fallo posible en este modulo.
    await fetchImplantsByLot(SALON, "LOT123");

    const filtros = h.calls[0]?.filters ?? [];
    expect(filtros).toContainEqual(["salon_id", SALON]);
    expect(filtros).toContainEqual(["lot", "LOT123"]);
  });

  it("un lote vacío no consulta nada en vez de devolver todo", async () => {
    // Con cadena vacia, un `eq` mal puesto podria traer TODOS los implantes y
    // hacer creer que una alerta afecta a la clinica entera.
    const r = await fetchImplantsByLot(SALON, "   ");

    expect(r).toEqual([]);
    expect(h.calls).toHaveLength(0);
  });
});
