import { describe, it, expect } from "vitest";
import {
  PLAN_ITEM_TRANSITIONS,
  PLAN_ITEM_STATE_LABELS,
  PLAN_STATUS_LABELS,
  canTransitionItem,
  computePlanTotals,
  formatCents,
  mapServiceToFindingType,
  type PlanTotalsLine,
} from "@/lib/dental/treatment";
import type { PlanItemState, TreatmentPlanStatus } from "@/types/database";

const ALL_ITEM_STATES: PlanItemState[] = [
  "propuesto",
  "aceptado",
  "en_curso",
  "realizado",
  "rechazado",
  "anulado",
];

// ---------------------------------------------------------------------------
// canTransitionItem / PLAN_ITEM_TRANSITIONS
// ---------------------------------------------------------------------------

describe("canTransitionItem", () => {
  it("propuesto → aceptado: true (transición directa válida)", () => {
    expect(canTransitionItem("propuesto", "aceptado")).toBe(true);
  });

  it("propuesto → realizado: false (no se puede saltar aceptado/en_curso)", () => {
    expect(canTransitionItem("propuesto", "realizado")).toBe(false);
  });

  it("realizado → cualquier estado: false (estado terminal)", () => {
    for (const to of ALL_ITEM_STATES) {
      expect(canTransitionItem("realizado", to)).toBe(false);
    }
  });

  it("rechazado y anulado también son terminales", () => {
    for (const to of ALL_ITEM_STATES) {
      expect(canTransitionItem("rechazado", to)).toBe(false);
      expect(canTransitionItem("anulado", to)).toBe(false);
    }
  });

  it("aceptado → en_curso: true; aceptado → propuesto: false (sin retroceso)", () => {
    expect(canTransitionItem("aceptado", "en_curso")).toBe(true);
    expect(canTransitionItem("aceptado", "propuesto")).toBe(false);
  });

  it("en_curso → realizado: true; en_curso → rechazado: false (solo aceptado/propuesto rechazan)", () => {
    expect(canTransitionItem("en_curso", "realizado")).toBe(true);
    expect(canTransitionItem("en_curso", "rechazado")).toBe(false);
  });
});

describe("PLAN_ITEM_TRANSITIONS", () => {
  it("define exactamente las transiciones del brief", () => {
    expect(PLAN_ITEM_TRANSITIONS).toEqual({
      propuesto: ["aceptado", "rechazado", "anulado"],
      aceptado: ["en_curso", "rechazado", "anulado"],
      en_curso: ["realizado", "anulado"],
      realizado: [],
      rechazado: [],
      anulado: [],
    });
  });
});

// ---------------------------------------------------------------------------
// computePlanTotals
// ---------------------------------------------------------------------------

describe("computePlanTotals", () => {
  it("calcula proposed/accepted/done/active sobre una mezcla de estados", () => {
    const items: PlanTotalsLine[] = [
      { state: "propuesto", line_total_cents: 1000 },
      { state: "aceptado", line_total_cents: 2000 },
      { state: "en_curso", line_total_cents: 3000 },
      { state: "realizado", line_total_cents: 4000 },
      { state: "rechazado", line_total_cents: 500 },
      { state: "anulado", line_total_cents: 700 },
    ];

    const totals = computePlanTotals(items);

    expect(totals).toEqual({
      proposedCents: 1000,
      acceptedCents: 2000 + 3000 + 4000,
      doneCents: 4000,
      activeCents: 1000 + 2000 + 3000 + 4000,
    });
  });

  it("con lista vacía devuelve todo a cero", () => {
    expect(computePlanTotals([])).toEqual({
      proposedCents: 0,
      acceptedCents: 0,
      doneCents: 0,
      activeCents: 0,
    });
  });

  it("rechazado/anulado no cuentan ni siquiera para activeCents", () => {
    const totals = computePlanTotals([
      { state: "rechazado", line_total_cents: 999 },
      { state: "anulado", line_total_cents: 999 },
    ]);
    expect(totals.activeCents).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Etiquetas de display
// ---------------------------------------------------------------------------

describe("PLAN_ITEM_STATE_LABELS", () => {
  it("tiene una etiqueta en español para cada estado de item", () => {
    for (const state of ALL_ITEM_STATES) {
      expect(typeof PLAN_ITEM_STATE_LABELS[state]).toBe("string");
      expect(PLAN_ITEM_STATE_LABELS[state].length).toBeGreaterThan(0);
    }
  });
});

describe("PLAN_STATUS_LABELS", () => {
  it("tiene una etiqueta en español para cada estado de plan", () => {
    const statuses: TreatmentPlanStatus[] = [
      "draft",
      "proposed",
      "accepted",
      "in_progress",
      "completed",
      "cancelled",
    ];
    for (const status of statuses) {
      expect(typeof PLAN_STATUS_LABELS[status]).toBe("string");
      expect(PLAN_STATUS_LABELS[status].length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// formatCents
// ---------------------------------------------------------------------------

describe("formatCents", () => {
  it("formatea céntimos a EUR con coma decimal (es-ES)", () => {
    // Intl.NumberFormat("es-ES", { style: "currency" }) separa el símbolo con
    // un espacio NBSP (U+00A0), no un espacio normal (U+0020).
    // Intl.NumberFormat("es-ES", { style: "currency" }) separa el importe del
    // simbolo con NBSP (U+00A0); normalizamos a espacio normal antes de comparar
    // para no depender del caracter exacto que use el motor JS del entorno.
    const formatted = formatCents(1250).replace(/ /g, " ");
    expect(formatted).toBe("12,50 €");
  });

  it("acepta una moneda distinta", () => {
    expect(formatCents(1000, "USD")).toContain("10,00");
  });
});

// ---------------------------------------------------------------------------
// mapServiceToFindingType
// ---------------------------------------------------------------------------

describe("mapServiceToFindingType", () => {
  it("sin servicio ⇒ 'nota'", () => {
    expect(mapServiceToFindingType(null)).toBe("nota");
    expect(mapServiceToFindingType(undefined)).toBe("nota");
  });

  it("nombre sugiere caries ⇒ 'caries'", () => {
    expect(mapServiceToFindingType({ name: "Obturación por Caries", category: null })).toBe(
      "caries",
    );
  });

  it("nombre sugiere endodoncia (con o sin tilde) ⇒ 'endodoncia'", () => {
    expect(mapServiceToFindingType({ name: "Endodoncia molar", category: null })).toBe(
      "endodoncia",
    );
    expect(mapServiceToFindingType({ name: "Tratamiento de conducto", category: null })).toBe(
      "endodoncia",
    );
  });

  it("categoría sugiere implante ⇒ 'implante'", () => {
    expect(mapServiceToFindingType({ name: "Procedimiento X", category: "Implantes" })).toBe(
      "implante",
    );
  });

  it("nombre sugiere corona ⇒ 'corona'; extracción ⇒ 'extraccion'", () => {
    expect(mapServiceToFindingType({ name: "Corona de porcelana", category: null })).toBe(
      "corona",
    );
    expect(mapServiceToFindingType({ name: "Extracción simple", category: null })).toBe(
      "extraccion",
    );
  });

  it("sin match conocido ⇒ 'nota'", () => {
    expect(mapServiceToFindingType({ name: "Limpieza dental", category: "Higiene" })).toBe(
      "nota",
    );
  });
});
