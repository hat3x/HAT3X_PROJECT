import { describe, it, expect } from "vitest";
import { foldFindingsAsOf } from "@/lib/dental/fold";
import type { OdontogramFinding } from "@/types/database";

/**
 * Fábrica mínima de OdontogramFinding para los tests: solo rellena los
 * campos que `foldFindingsAsOf` inspecciona (fdi_tooth, recorded_at,
 * tooth_state) más los obligatorios del tipo real de la tabla.
 */
function finding(
  overrides: Partial<OdontogramFinding> & {
    fdi_tooth: number;
    recorded_at: string;
    tooth_state: OdontogramFinding["tooth_state"];
  },
): OdontogramFinding {
  return {
    id: `finding-${overrides.fdi_tooth}-${overrides.recorded_at}`,
    clinical_record_id: "clinical-record-1",
    salon_id: "salon-1",
    surfaces: [],
    finding_type: "caries",
    notes: null,
    recorded_by: null,
    created_at: overrides.recorded_at,
    ...overrides,
  };
}

describe("foldFindingsAsOf", () => {
  it("con dos eventos del mismo diente, devuelve el estado vigente en la fecha dada", () => {
    const caries = finding({
      fdi_tooth: 11,
      recorded_at: "2026-01-10T00:00:00.000Z",
      tooth_state: "pendiente",
      finding_type: "caries",
    });
    const obturado = finding({
      fdi_tooth: 11,
      recorded_at: "2026-03-01T00:00:00.000Z",
      tooth_state: "hecho",
      finding_type: "obturacion",
    });

    const asOfFeb = foldFindingsAsOf([caries, obturado], "2026-02-01T00:00:00.000Z");
    expect(asOfFeb.get(11)?.finding_type).toBe("caries");

    const asOfApr = foldFindingsAsOf([caries, obturado], "2026-04-01T00:00:00.000Z");
    expect(asOfApr.get(11)?.finding_type).toBe("obturacion");
  });

  it("si el único evento del diente es posterior a la fecha, el diente no aparece", () => {
    const future = finding({
      fdi_tooth: 22,
      recorded_at: "2026-05-01T00:00:00.000Z",
      tooth_state: "pendiente",
    });

    const map = foldFindingsAsOf([future], "2026-01-01T00:00:00.000Z");
    expect(map.size).toBe(0);
  });

  it("con lista vacía devuelve un Map vacío", () => {
    expect(foldFindingsAsOf([], "2026-01-01T00:00:00.000Z").size).toBe(0);
  });
});
