import { describe, it, expect } from "vitest";
import {
  TEETH,
  PERMANENT_FDI_NUMBERS,
  TEMPORARY_FDI_NUMBERS,
  ALL_FDI_NUMBERS,
  getTooth,
  isValidFDI,
  getQuadrant,
  getDentitionType,
  getTeethInQuadrant,
  getPermanentTeeth,
  getTemporaryTeeth,
  getTeethByArch,
  getTeethByClass,
} from "@/lib/dental/tooth";

// ---------------------------------------------------------------------------
// FDI number lists
// ---------------------------------------------------------------------------

describe("FDI number lists", () => {
  it("PERMANENT_FDI_NUMBERS contains exactly 32 entries", () => {
    expect(PERMANENT_FDI_NUMBERS.length).toBe(32);
  });

  it("TEMPORARY_FDI_NUMBERS contains exactly 20 entries", () => {
    expect(TEMPORARY_FDI_NUMBERS.length).toBe(20);
  });

  it("ALL_FDI_NUMBERS contains exactly 52 entries", () => {
    expect(ALL_FDI_NUMBERS.length).toBe(52);
  });

  it("ALL_FDI_NUMBERS has no duplicates", () => {
    const unique = new Set(ALL_FDI_NUMBERS);
    expect(unique.size).toBe(ALL_FDI_NUMBERS.length);
  });

  it("permanent FDI numbers are all in quadrants 1–4 (tens digit 1–4)", () => {
    for (const fdi of PERMANENT_FDI_NUMBERS) {
      const q = Math.floor(fdi / 10);
      expect(q).toBeGreaterThanOrEqual(1);
      expect(q).toBeLessThanOrEqual(4);
    }
  });

  it("temporary FDI numbers are all in quadrants 5–8 (tens digit 5–8)", () => {
    for (const fdi of TEMPORARY_FDI_NUMBERS) {
      const q = Math.floor(fdi / 10);
      expect(q).toBeGreaterThanOrEqual(5);
      expect(q).toBeLessThanOrEqual(8);
    }
  });
});

// ---------------------------------------------------------------------------
// TEETH registry
// ---------------------------------------------------------------------------

describe("TEETH registry", () => {
  it("contains exactly 52 teeth", () => {
    expect(Object.keys(TEETH).length).toBe(52);
  });

  it("every FDI in ALL_FDI_NUMBERS has an entry", () => {
    for (const fdi of ALL_FDI_NUMBERS) {
      expect(TEETH[fdi]).toBeDefined();
    }
  });

  it("FDI 11 — permanent upper-right incisivo_central", () => {
    const tooth = TEETH[11]!;
    expect(tooth.fdi).toBe(11);
    expect(tooth.dentition).toBe("permanent");
    expect(tooth.quadrant).toBe(1);
    expect(tooth.arch).toBe("upper");
    expect(tooth.side).toBe("right");
    expect(tooth.position).toBe(1);
    expect(tooth.toothClass).toBe("incisivo_central");
    expect(tooth.label).toBe("Incisivo central superior derecho");
    expect(tooth.abbreviation).toBe("IC.S.D");
  });

  it("FDI 18 — permanent upper-right tercer_molar, position 8", () => {
    const tooth = TEETH[18]!;
    expect(tooth.fdi).toBe(18);
    expect(tooth.toothClass).toBe("tercer_molar");
    expect(tooth.position).toBe(8);
    expect(tooth.arch).toBe("upper");
    expect(tooth.side).toBe("right");
  });

  it("FDI 21 — permanent upper-left incisivo_central, abbreviation IC.S.I", () => {
    const tooth = TEETH[21]!;
    expect(tooth.arch).toBe("upper");
    expect(tooth.side).toBe("left");
    expect(tooth.dentition).toBe("permanent");
    expect(tooth.toothClass).toBe("incisivo_central");
    expect(tooth.abbreviation).toBe("IC.S.I");
  });

  it("FDI 31 — permanent lower-left incisivo_central, abbreviation IC.I.I", () => {
    const tooth = TEETH[31]!;
    expect(tooth.arch).toBe("lower");
    expect(tooth.side).toBe("left");
    expect(tooth.abbreviation).toBe("IC.I.I");
  });

  it("FDI 41 — permanent lower-right incisivo_central, abbreviation IC.I.D", () => {
    const tooth = TEETH[41]!;
    expect(tooth.arch).toBe("lower");
    expect(tooth.side).toBe("right");
    expect(tooth.abbreviation).toBe("IC.I.D");
  });

  it("FDI 48 — permanent lower-right tercer_molar, position 8", () => {
    const tooth = TEETH[48]!;
    expect(tooth.fdi).toBe(48);
    expect(tooth.toothClass).toBe("tercer_molar");
    expect(tooth.position).toBe(8);
  });

  it("FDI 51 — temporary upper-right incisivo_central, label includes 'temporal'", () => {
    const tooth = TEETH[51]!;
    expect(tooth.dentition).toBe("temporary");
    expect(tooth.quadrant).toBe(5);
    expect(tooth.arch).toBe("upper");
    expect(tooth.side).toBe("right");
    expect(tooth.toothClass).toBe("incisivo_central");
    expect(tooth.label).toContain("temporal");
  });

  it("FDI 55 — temporary upper-right segundo_molar (deciduous position 5)", () => {
    const tooth = TEETH[55]!;
    expect(tooth.toothClass).toBe("segundo_molar");
    expect(tooth.position).toBe(5);
    expect(tooth.dentition).toBe("temporary");
  });

  it("FDI 74 — temporary lower-left primer_molar (deciduous position 4)", () => {
    const tooth = TEETH[74]!;
    expect(tooth.toothClass).toBe("primer_molar");
    expect(tooth.position).toBe(4);
    expect(tooth.arch).toBe("lower");
    expect(tooth.side).toBe("left");
    expect(tooth.dentition).toBe("temporary");
  });

  it("FDI 85 — temporary lower-right segundo_molar", () => {
    const tooth = TEETH[85]!;
    expect(tooth.toothClass).toBe("segundo_molar");
    expect(tooth.arch).toBe("lower");
    expect(tooth.side).toBe("right");
    expect(tooth.dentition).toBe("temporary");
  });

  it("permanent teeth have no 'temporal' in label", () => {
    for (const fdi of PERMANENT_FDI_NUMBERS) {
      expect(TEETH[fdi]!.label).not.toContain("temporal");
    }
  });

  it("temporary teeth all have 'temporal' in label", () => {
    for (const fdi of TEMPORARY_FDI_NUMBERS) {
      expect(TEETH[fdi]!.label).toContain("temporal");
    }
  });

  it("every tooth is frozen (immutable)", () => {
    expect(Object.isFrozen(TEETH[11])).toBe(true);
    expect(Object.isFrozen(TEETH[51])).toBe(true);
  });

  it("each tooth's fdi matches its registry key", () => {
    for (const fdi of ALL_FDI_NUMBERS) {
      expect(TEETH[fdi]!.fdi).toBe(fdi);
    }
  });
});

// ---------------------------------------------------------------------------
// getTooth
// ---------------------------------------------------------------------------

describe("getTooth", () => {
  it("returns a Tooth for valid FDI number", () => {
    const tooth = getTooth(11);
    expect(tooth).toBeDefined();
    expect(tooth!.fdi).toBe(11);
  });

  it("returns undefined for invalid FDI number (e.g. 99)", () => {
    expect(getTooth(99)).toBeUndefined();
  });

  it("returns undefined for 0", () => {
    expect(getTooth(0)).toBeUndefined();
  });

  it("returns undefined for negative numbers", () => {
    expect(getTooth(-11)).toBeUndefined();
  });

  it("returns correct tooth for temporary FDI (e.g. 63 = canino, upper-left)", () => {
    const tooth = getTooth(63);
    expect(tooth).toBeDefined();
    expect(tooth!.dentition).toBe("temporary");
    expect(tooth!.toothClass).toBe("canino");
  });
});

// ---------------------------------------------------------------------------
// isValidFDI
// ---------------------------------------------------------------------------

describe("isValidFDI", () => {
  it("returns true for all permanent FDI numbers", () => {
    for (const fdi of PERMANENT_FDI_NUMBERS) {
      expect(isValidFDI(fdi)).toBe(true);
    }
  });

  it("returns true for all temporary FDI numbers", () => {
    for (const fdi of TEMPORARY_FDI_NUMBERS) {
      expect(isValidFDI(fdi)).toBe(true);
    }
  });

  it("returns false for gap permanent FDI (units digit 9 never exists)", () => {
    for (const q of [1, 2, 3, 4]) {
      expect(isValidFDI(q * 10 + 9)).toBe(false);
    }
  });

  it("returns false for temporary gap (position 6+ don't exist in deciduous)", () => {
    for (const q of [5, 6, 7, 8]) {
      expect(isValidFDI(q * 10 + 6)).toBe(false);
    }
  });

  it("returns false for 0 and negative numbers", () => {
    expect(isValidFDI(0)).toBe(false);
    expect(isValidFDI(-1)).toBe(false);
  });

  it("returns false for FDI 100 (out of range)", () => {
    expect(isValidFDI(100)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getQuadrant
// ---------------------------------------------------------------------------

describe("getQuadrant", () => {
  it("returns 1 for FDI 11", () => {
    expect(getQuadrant(11)).toBe(1);
  });

  it("returns 4 for FDI 48", () => {
    expect(getQuadrant(48)).toBe(4);
  });

  it("returns 5 for FDI 51", () => {
    expect(getQuadrant(51)).toBe(5);
  });

  it("returns 8 for FDI 85", () => {
    expect(getQuadrant(85)).toBe(8);
  });

  it("returns undefined for invalid FDI", () => {
    expect(getQuadrant(99)).toBeUndefined();
  });

  it("quadrant matches tens digit for all valid FDI", () => {
    for (const fdi of ALL_FDI_NUMBERS) {
      expect(getQuadrant(fdi)).toBe(Math.floor(fdi / 10));
    }
  });
});

// ---------------------------------------------------------------------------
// getDentitionType
// ---------------------------------------------------------------------------

describe("getDentitionType", () => {
  it("returns 'permanent' for quadrant 1–4 FDI numbers", () => {
    expect(getDentitionType(11)).toBe("permanent");
    expect(getDentitionType(28)).toBe("permanent");
    expect(getDentitionType(33)).toBe("permanent");
    expect(getDentitionType(46)).toBe("permanent");
  });

  it("returns 'temporary' for quadrant 5–8 FDI numbers", () => {
    expect(getDentitionType(51)).toBe("temporary");
    expect(getDentitionType(63)).toBe("temporary");
    expect(getDentitionType(74)).toBe("temporary");
    expect(getDentitionType(85)).toBe("temporary");
  });

  it("returns undefined for invalid FDI (e.g. 99)", () => {
    expect(getDentitionType(99)).toBeUndefined();
  });

  it("returns undefined for 0 and negative numbers", () => {
    expect(getDentitionType(0)).toBeUndefined();
    expect(getDentitionType(-11)).toBeUndefined();
  });

  it("is consistent with TEETH registry dentition field for all valid FDI", () => {
    for (const fdi of ALL_FDI_NUMBERS) {
      expect(getDentitionType(fdi)).toBe(TEETH[fdi]!.dentition);
    }
  });
});

// ---------------------------------------------------------------------------
// getTeethInQuadrant
// ---------------------------------------------------------------------------

describe("getTeethInQuadrant", () => {
  it("returns 8 teeth for permanent quadrant 1", () => {
    expect(getTeethInQuadrant(1).length).toBe(8);
  });

  it("returns 8 teeth for permanent quadrant 4", () => {
    expect(getTeethInQuadrant(4).length).toBe(8);
  });

  it("returns 5 teeth for temporary quadrant 5", () => {
    expect(getTeethInQuadrant(5).length).toBe(5);
  });

  it("returns 5 teeth for temporary quadrant 8", () => {
    expect(getTeethInQuadrant(8).length).toBe(5);
  });

  it("teeth are sorted ascending by position (1 → max)", () => {
    const q1 = getTeethInQuadrant(1);
    for (let i = 0; i < q1.length - 1; i++) {
      expect(q1[i]!.position).toBeLessThan(q1[i + 1]!.position);
    }
  });

  it("all teeth in Q1 belong to quadrant 1 and are permanent", () => {
    const q1 = getTeethInQuadrant(1);
    for (const t of q1) {
      expect(t.quadrant).toBe(1);
      expect(t.dentition).toBe("permanent");
    }
  });

  it("all teeth in Q7 belong to quadrant 7 and are temporary", () => {
    const q7 = getTeethInQuadrant(7);
    for (const t of q7) {
      expect(t.quadrant).toBe(7);
      expect(t.dentition).toBe("temporary");
    }
  });
});

// ---------------------------------------------------------------------------
// getPermanentTeeth
// ---------------------------------------------------------------------------

describe("getPermanentTeeth", () => {
  it("returns exactly 32 teeth", () => {
    expect(getPermanentTeeth().length).toBe(32);
  });

  it("all teeth have dentition 'permanent'", () => {
    for (const t of getPermanentTeeth()) {
      expect(t.dentition).toBe("permanent");
    }
  });

  it("covers all 4 permanent quadrants (1–4)", () => {
    const quadrants = new Set(getPermanentTeeth().map((t) => t.quadrant));
    expect(quadrants).toContain(1);
    expect(quadrants).toContain(2);
    expect(quadrants).toContain(3);
    expect(quadrants).toContain(4);
  });
});

// ---------------------------------------------------------------------------
// getTemporaryTeeth
// ---------------------------------------------------------------------------

describe("getTemporaryTeeth", () => {
  it("returns exactly 20 teeth", () => {
    expect(getTemporaryTeeth().length).toBe(20);
  });

  it("all teeth have dentition 'temporary'", () => {
    for (const t of getTemporaryTeeth()) {
      expect(t.dentition).toBe("temporary");
    }
  });

  it("covers all 4 temporary quadrants (5–8)", () => {
    const quadrants = new Set(getTemporaryTeeth().map((t) => t.quadrant));
    expect(quadrants).toContain(5);
    expect(quadrants).toContain(6);
    expect(quadrants).toContain(7);
    expect(quadrants).toContain(8);
  });
});

// ---------------------------------------------------------------------------
// getTeethByArch
// ---------------------------------------------------------------------------

describe("getTeethByArch", () => {
  it("'upper' without dentition filter returns 26 teeth (16 perm + 10 temp)", () => {
    expect(getTeethByArch("upper").length).toBe(26);
  });

  it("'lower' without dentition filter returns 26 teeth (16 perm + 10 temp)", () => {
    expect(getTeethByArch("lower").length).toBe(26);
  });

  it("'upper' + 'permanent' returns 16 teeth (Q1 + Q2)", () => {
    const teeth = getTeethByArch("upper", "permanent");
    expect(teeth.length).toBe(16);
    for (const t of teeth) {
      expect(t.arch).toBe("upper");
      expect(t.dentition).toBe("permanent");
    }
  });

  it("'lower' + 'permanent' returns 16 teeth (Q3 + Q4)", () => {
    const teeth = getTeethByArch("lower", "permanent");
    expect(teeth.length).toBe(16);
    for (const t of teeth) {
      expect(t.arch).toBe("lower");
      expect(t.dentition).toBe("permanent");
    }
  });

  it("'upper' + 'temporary' returns 10 teeth (Q5 + Q6)", () => {
    expect(getTeethByArch("upper", "temporary").length).toBe(10);
  });

  it("'lower' + 'temporary' returns 10 teeth (Q7 + Q8)", () => {
    expect(getTeethByArch("lower", "temporary").length).toBe(10);
  });

  it("no tooth FDI appears in both upper and lower result sets", () => {
    const upper = new Set(getTeethByArch("upper").map((t) => t.fdi));
    const lower = new Set(getTeethByArch("lower").map((t) => t.fdi));
    for (const fdi of upper) {
      expect(lower.has(fdi)).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// getTeethByClass
// ---------------------------------------------------------------------------

describe("getTeethByClass", () => {
  it("'incisivo_central' without filter returns 8 teeth (4 perm + 4 temp)", () => {
    expect(getTeethByClass("incisivo_central").length).toBe(8);
  });

  it("'canino' without filter returns 8 teeth (4 perm + 4 temp)", () => {
    expect(getTeethByClass("canino").length).toBe(8);
  });

  it("'primer_premolar' + 'permanent' returns 4 teeth", () => {
    const teeth = getTeethByClass("primer_premolar", "permanent");
    expect(teeth.length).toBe(4);
    for (const t of teeth) {
      expect(t.toothClass).toBe("primer_premolar");
      expect(t.dentition).toBe("permanent");
    }
  });

  it("'primer_premolar' + 'temporary' returns 0 (no premolars in deciduous set)", () => {
    expect(getTeethByClass("primer_premolar", "temporary").length).toBe(0);
  });

  it("'segundo_premolar' + 'temporary' returns 0 (no premolars in deciduous set)", () => {
    expect(getTeethByClass("segundo_premolar", "temporary").length).toBe(0);
  });

  it("'tercer_molar' + 'temporary' returns 0 (no wisdom teeth in baby set)", () => {
    expect(getTeethByClass("tercer_molar", "temporary").length).toBe(0);
  });

  it("'primer_molar' + 'temporary' returns 4 teeth (deciduous first molars)", () => {
    const teeth = getTeethByClass("primer_molar", "temporary");
    expect(teeth.length).toBe(4);
    for (const t of teeth) {
      expect(t.toothClass).toBe("primer_molar");
      expect(t.dentition).toBe("temporary");
    }
  });

  it("'segundo_molar' + 'temporary' returns 4 teeth (deciduous second molars)", () => {
    expect(getTeethByClass("segundo_molar", "temporary").length).toBe(4);
  });

  it("permanent canines are exactly FDI 13, 23, 33, 43", () => {
    const fdis = getTeethByClass("canino", "permanent")
      .map((t) => t.fdi)
      .sort((a, b) => a - b);
    expect(fdis).toEqual([13, 23, 33, 43]);
  });
});
