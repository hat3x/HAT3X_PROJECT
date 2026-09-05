import { describe, it, expect } from "vitest";
import { groupSitesByToothId, perioKeys } from "@/lib/queries/perio";
import type { PerioSite } from "@/types/database";

function site(overrides: Partial<PerioSite> & { tooth_id: string; site: number }): PerioSite {
  return {
    id: `site-${overrides.tooth_id}-${overrides.site}`,
    salon_id: "salon-1",
    pd_mm: 3,
    gingival_margin_mm: 0,
    cal_mm: 3,
    bop: false,
    suppuration: false,
    plaque: false,
    created_at: "2026-07-31T00:00:00.000Z",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// groupSitesByToothId — helper puro (array plano → Map)
// ---------------------------------------------------------------------------

describe("groupSitesByToothId", () => {
  it("agrupa un array plano de sitios por tooth_id", () => {
    const toothA1 = site({ tooth_id: "tooth-a", site: 1 });
    const toothA2 = site({ tooth_id: "tooth-a", site: 2 });
    const toothB1 = site({ tooth_id: "tooth-b", site: 1 });

    const grouped = groupSitesByToothId([toothA1, toothA2, toothB1]);

    expect(grouped.size).toBe(2);
    expect(grouped.get("tooth-a")).toEqual([toothA1, toothA2]);
    expect(grouped.get("tooth-b")).toEqual([toothB1]);
  });

  it("con array vacío devuelve un Map vacío", () => {
    expect(groupSitesByToothId([]).size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// perioKeys — factory de cache keys
// ---------------------------------------------------------------------------

describe("perioKeys", () => {
  it("genera keys jerárquicas y estables por salón/paciente/examen", () => {
    expect(perioKeys.all("salon-1")).toEqual(["perio", "salon-1"]);
    expect(perioKeys.exams("salon-1", "customer-1")).toEqual([
      "perio",
      "salon-1",
      "exams",
      "customer-1",
    ]);
    expect(perioKeys.exam("salon-1", "exam-1")).toEqual([
      "perio",
      "salon-1",
      "exam",
      "exam-1",
    ]);
  });
});
