import { describe, it, expect } from "vitest";
import { groupItemsByPhase, treatmentKeys } from "@/lib/queries/treatment";
import type { PlanItem } from "@/types/database";

function item(overrides: Partial<PlanItem> & { id: string; phase_id: string | null }): PlanItem {
  return {
    salon_id: "salon-1",
    plan_id: "plan-1",
    position: 0,
    service_id: null,
    description: null,
    fdi_code: null,
    surfaces: [],
    quantity: 1,
    unit_price_cents: 0,
    discount_cents: 0,
    tax_rate: 0,
    line_total_cents: 0,
    state: "propuesto",
    scheduled_appointment_id: null,
    executed_at: null,
    executed_by: null,
    finding_id: null,
    pos_sale_id: null,
    created_at: "2026-08-01T00:00:00.000Z",
    updated_at: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// groupItemsByPhase — helper puro (array plano → Map)
// ---------------------------------------------------------------------------

describe("groupItemsByPhase", () => {
  it("agrupa un array plano de items por phase_id", () => {
    const phaseA1 = item({ id: "item-a1", phase_id: "phase-a" });
    const phaseA2 = item({ id: "item-a2", phase_id: "phase-a" });
    const phaseB1 = item({ id: "item-b1", phase_id: "phase-b" });

    const grouped = groupItemsByPhase([phaseA1, phaseA2, phaseB1]);

    expect(grouped.size).toBe(2);
    expect(grouped.get("phase-a")).toEqual([phaseA1, phaseA2]);
    expect(grouped.get("phase-b")).toEqual([phaseB1]);
  });

  it("agrupa los items sin fase bajo la clave null", () => {
    const withPhase = item({ id: "item-1", phase_id: "phase-a" });
    const withoutPhase1 = item({ id: "item-2", phase_id: null });
    const withoutPhase2 = item({ id: "item-3", phase_id: null });

    const grouped = groupItemsByPhase([withPhase, withoutPhase1, withoutPhase2]);

    expect(grouped.get(null)).toEqual([withoutPhase1, withoutPhase2]);
    expect(grouped.get("phase-a")).toEqual([withPhase]);
  });

  it("con array vacío devuelve un Map vacío", () => {
    expect(groupItemsByPhase([]).size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// treatmentKeys — factory de cache keys
// ---------------------------------------------------------------------------

describe("treatmentKeys", () => {
  it("genera keys jerárquicas y estables por salón/paciente/plan", () => {
    expect(treatmentKeys.all("salon-1")).toEqual(["treatment", "salon-1"]);
    expect(treatmentKeys.plans("salon-1", "customer-1")).toEqual([
      "treatment",
      "salon-1",
      "plans",
      "customer-1",
    ]);
    expect(treatmentKeys.plan("salon-1", "plan-1")).toEqual([
      "treatment",
      "salon-1",
      "plan",
      "plan-1",
    ]);
  });
});
