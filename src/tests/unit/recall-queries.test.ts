/**
 * Helpers PUROS de `lib/queries/recall.ts` (recall de revisión).
 *
 * Mismo enfoque que `treatment-queries.test.ts`: la lógica de agregación y
 * filtrado se extrae a funciones puras testeables sin mockear Supabase;
 * `fetchPatientsDueForRecall` (I/O real) es un wrapper fino sobre ellas.
 */
import { describe, it, expect } from "vitest";

import {
  computeCutoffIso,
  lastVisitPerCustomer,
  recallKeys,
  selectPatientsDueForRecall,
} from "@/lib/queries/recall";

// ---------------------------------------------------------------------------
// lastVisitPerCustomer
// ---------------------------------------------------------------------------

describe("lastVisitPerCustomer", () => {
  it("reduce varias citas del mismo cliente a la fecha MÁS RECIENTE", () => {
    const result = lastVisitPerCustomer([
      { customer_id: "c1", starts_at: "2026-01-01T10:00:00.000Z" },
      { customer_id: "c1", starts_at: "2026-06-15T10:00:00.000Z" },
      { customer_id: "c1", starts_at: "2026-03-01T10:00:00.000Z" },
    ]);

    expect(result.get("c1")).toBe("2026-06-15T10:00:00.000Z");
  });

  it("mantiene una entrada por cada cliente distinto", () => {
    const result = lastVisitPerCustomer([
      { customer_id: "c1", starts_at: "2026-01-01T10:00:00.000Z" },
      { customer_id: "c2", starts_at: "2026-02-01T10:00:00.000Z" },
    ]);

    expect(result.size).toBe(2);
    expect(result.get("c2")).toBe("2026-02-01T10:00:00.000Z");
  });

  it("array vacío ⇒ Map vacío", () => {
    expect(lastVisitPerCustomer([]).size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// computeCutoffIso
// ---------------------------------------------------------------------------

describe("computeCutoffIso", () => {
  it("resta N meses a la fecha de referencia", () => {
    const now = new Date("2026-08-01T12:00:00.000Z");

    expect(computeCutoffIso(6, now)).toBe("2026-02-01T12:00:00.000Z");
    expect(computeCutoffIso(12, now)).toBe("2025-08-01T12:00:00.000Z");
  });
});

// ---------------------------------------------------------------------------
// selectPatientsDueForRecall
// ---------------------------------------------------------------------------

describe("selectPatientsDueForRecall", () => {
  const CUTOFF = "2026-02-01T00:00:00.000Z";

  it("incluye clientes cuya última visita es ANTERIOR al corte", () => {
    const customers = [{ id: "c1", full_name: "Ana", phone: "+34600000001" }];
    const lastVisit = new Map([["c1", "2026-01-01T00:00:00.000Z"]]);

    const result = selectPatientsDueForRecall(customers, lastVisit, CUTOFF);

    expect(result).toEqual([
      { customerId: "c1", fullName: "Ana", phone: "+34600000001", lastVisitAt: "2026-01-01T00:00:00.000Z" },
    ]);
  });

  it("EXCLUYE clientes cuya última visita es POSTERIOR (o igual) al corte", () => {
    const customers = [
      { id: "c1", full_name: "Reciente", phone: "+34600000001" },
      { id: "c2", full_name: "Justo en el corte", phone: "+34600000002" },
    ];
    const lastVisit = new Map([
      ["c1", "2026-06-01T00:00:00.000Z"],
      ["c2", CUTOFF],
    ]);

    const result = selectPatientsDueForRecall(customers, lastVisit, CUTOFF);

    expect(result).toEqual([]);
  });

  it("incluye clientes SIN ninguna cita registrada (lastVisitAt: null)", () => {
    const customers = [{ id: "c1", full_name: "Nunca ha venido", phone: "+34600000001" }];
    const lastVisit = new Map<string, string>();

    const result = selectPatientsDueForRecall(customers, lastVisit, CUTOFF);

    expect(result).toEqual([
      { customerId: "c1", fullName: "Nunca ha venido", phone: "+34600000001", lastVisitAt: null },
    ]);
  });

  it("ordena por urgencia: sin visita primero, luego la visita MÁS ANTIGUA primero", () => {
    const customers = [
      { id: "c1", full_name: "Antigua", phone: "+34600000001" },
      { id: "c2", full_name: "Sin visita", phone: "+34600000002" },
      { id: "c3", full_name: "Muy antigua", phone: "+34600000003" },
    ];
    const lastVisit = new Map([
      ["c1", "2026-01-15T00:00:00.000Z"],
      ["c3", "2025-06-01T00:00:00.000Z"],
    ]);

    const result = selectPatientsDueForRecall(customers, lastVisit, CUTOFF);

    expect(result.map((p) => p.customerId)).toEqual(["c2", "c3", "c1"]);
  });

  it("con varios clientes sin ninguna visita, desempata por nombre", () => {
    const customers = [
      { id: "c1", full_name: "Zoe", phone: "+34600000001" },
      { id: "c2", full_name: "Ana", phone: "+34600000002" },
    ];
    const lastVisit = new Map<string, string>();

    const result = selectPatientsDueForRecall(customers, lastVisit, CUTOFF);

    expect(result.map((p) => p.fullName)).toEqual(["Ana", "Zoe"]);
  });
});

// ---------------------------------------------------------------------------
// recallKeys
// ---------------------------------------------------------------------------

describe("recallKeys", () => {
  it("genera keys jerárquicas y estables por salón/meses", () => {
    expect(recallKeys.all("salon-1")).toEqual(["recall", "salon-1"]);
    expect(recallKeys.due("salon-1", 6)).toEqual(["recall", "salon-1", "due", 6]);
  });
});
