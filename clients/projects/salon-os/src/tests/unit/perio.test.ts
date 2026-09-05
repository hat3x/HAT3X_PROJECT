import { describe, it, expect } from "vitest";
import {
  SITE_ORDER,
  SITE_LABELS,
  deriveCal,
  isValidPd,
  isValidMargin,
  isValidSite,
  computePerioRollups,
  perioStage,
  type PerioSiteMeasurement,
} from "@/lib/dental/perio";

// ---------------------------------------------------------------------------
// SITE_ORDER / SITE_LABELS
// ---------------------------------------------------------------------------

describe("SITE_ORDER", () => {
  it("is exactly [1,2,3,4,5,6]", () => {
    expect(SITE_ORDER).toEqual([1, 2, 3, 4, 5, 6]);
  });
});

describe("SITE_LABELS", () => {
  it("maps every site code to its BSP/AAP abbreviation", () => {
    expect(SITE_LABELS).toEqual({
      1: "MB",
      2: "B",
      3: "DB",
      4: "ML",
      5: "L",
      6: "DL",
    });
  });
});

// ---------------------------------------------------------------------------
// deriveCal
// ---------------------------------------------------------------------------

describe("deriveCal", () => {
  it("margen al nivel del CEJ (0): CAL = PD", () => {
    expect(deriveCal(5, 0)).toBe(5);
  });

  it("recesión (margen negativo): CAL = PD + |margen|", () => {
    expect(deriveCal(5, -2)).toBe(7);
  });

  it("hiperplasia (margen positivo): CAL = PD - margen", () => {
    expect(deriveCal(4, 2)).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Validadores
// ---------------------------------------------------------------------------

describe("isValidPd", () => {
  it("acepta el rango clínico 0-20", () => {
    expect(isValidPd(0)).toBe(true);
    expect(isValidPd(20)).toBe(true);
    expect(isValidPd(10)).toBe(true);
  });

  it("rechaza fuera de rango", () => {
    expect(isValidPd(-1)).toBe(false);
    expect(isValidPd(21)).toBe(false);
  });
});

describe("isValidMargin", () => {
  it("acepta el rango -15 a 15", () => {
    expect(isValidMargin(-15)).toBe(true);
    expect(isValidMargin(15)).toBe(true);
    expect(isValidMargin(0)).toBe(true);
  });

  it("rechaza fuera de rango", () => {
    expect(isValidMargin(-16)).toBe(false);
    expect(isValidMargin(16)).toBe(false);
  });
});

describe("isValidSite", () => {
  it("acepta 1-6", () => {
    for (let s = 1; s <= 6; s++) {
      expect(isValidSite(s)).toBe(true);
    }
  });

  it("rechaza fuera de rango", () => {
    expect(isValidSite(0)).toBe(false);
    expect(isValidSite(7)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// computePerioRollups
// ---------------------------------------------------------------------------

describe("computePerioRollups", () => {
  it("calcula bopPercent, worstPd y meanCal sobre un conjunto de sitios", () => {
    const sites: PerioSiteMeasurement[] = [
      { fdi_tooth: 11, site: 1, pd_mm: 3, gingival_margin_mm: 0, bop: true },
      { fdi_tooth: 11, site: 2, pd_mm: 5, gingival_margin_mm: -1, bop: false },
    ];

    const rollups = computePerioRollups(sites);

    expect(rollups.bopPercent).toBe(50);
    expect(rollups.worstPd).toBe(5);
    expect(rollups.meanCal).toBe(4.5);
  });

  it("devuelve ceros con una lista vacía (sin dividir por cero)", () => {
    const rollups = computePerioRollups([]);
    expect(rollups).toEqual({ bopPercent: 0, worstPd: 0, meanCal: 0 });
  });
});

// ---------------------------------------------------------------------------
// perioStage
// ---------------------------------------------------------------------------

describe("perioStage", () => {
  it("Estadio I: CAL máximo <= 2", () => {
    expect(perioStage(1)).toBe("I");
    expect(perioStage(2)).toBe("I");
    expect(perioStage(0)).toBe("I");
  });

  it("Estadio II: CAL máximo 3-4", () => {
    expect(perioStage(3)).toBe("II");
    expect(perioStage(4)).toBe("II");
  });

  it("Estadio III: CAL máximo >= 5 (IV requiere señales de complejidad fuera de v1)", () => {
    expect(perioStage(5)).toBe("III");
    expect(perioStage(6)).toBe("III");
    expect(perioStage(100)).toBe("III");
  });
});
