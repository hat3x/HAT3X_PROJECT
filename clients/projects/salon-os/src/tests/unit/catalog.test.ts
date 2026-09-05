import { describe, it, expect } from "vitest";
import {
  SURFACE_DEFS,
  SURFACE_CATALOG,
  getSurfaceGroup,
  getSurfaces,
  getSurfaceDef,
  getSurfaceDefs,
} from "@/lib/dental/catalog";
import type { Surface, ToothClass } from "@/lib/dental/catalog";
import type { Arch } from "@/lib/dental/tooth";

const ALL_SURFACES: Surface[] = [
  "mesial",
  "distal",
  "vestibular",
  "palatino",
  "lingual",
  "incisal",
  "oclusal",
];

const ANTERIOR_CLASSES: ToothClass[] = [
  "incisivo_central",
  "incisivo_lateral",
  "canino",
];

const POSTERIOR_CLASSES: ToothClass[] = [
  "primer_premolar",
  "segundo_premolar",
  "primer_molar",
  "segundo_molar",
  "tercer_molar",
];

const ALL_TOOTH_CLASSES: ToothClass[] = [
  ...ANTERIOR_CLASSES,
  ...POSTERIOR_CLASSES,
];

// ---------------------------------------------------------------------------
// SURFACE_DEFS
// ---------------------------------------------------------------------------

describe("SURFACE_DEFS", () => {
  it("contains exactly 7 surface definitions", () => {
    expect(Object.keys(SURFACE_DEFS).length).toBe(7);
  });

  it("has an entry for every surface identifier", () => {
    for (const s of ALL_SURFACES) {
      expect(SURFACE_DEFS[s]).toBeDefined();
    }
  });

  it("each SurfaceDef has id, label, abbreviation, position fields", () => {
    for (const s of ALL_SURFACES) {
      const def = SURFACE_DEFS[s];
      expect(def.id).toBeTruthy();
      expect(def.label).toBeTruthy();
      expect(def.abbreviation).toBeTruthy();
      expect(def.position).toBeTruthy();
    }
  });

  it("each SurfaceDef id matches its registry key", () => {
    for (const s of ALL_SURFACES) {
      expect(SURFACE_DEFS[s].id).toBe(s);
    }
  });

  it("mesial — proximal, label Mesial, abbreviation M", () => {
    const def = SURFACE_DEFS.mesial;
    expect(def.position).toBe("proximal");
    expect(def.label).toBe("Mesial");
    expect(def.abbreviation).toBe("M");
  });

  it("distal — proximal, label Distal, abbreviation D", () => {
    const def = SURFACE_DEFS.distal;
    expect(def.position).toBe("proximal");
    expect(def.label).toBe("Distal");
    expect(def.abbreviation).toBe("D");
  });

  it("vestibular — axial, label Vestibular, abbreviation V", () => {
    const def = SURFACE_DEFS.vestibular;
    expect(def.position).toBe("axial");
    expect(def.label).toBe("Vestibular");
    expect(def.abbreviation).toBe("V");
  });

  it("palatino — axial, label Palatino, abbreviation P", () => {
    const def = SURFACE_DEFS.palatino;
    expect(def.position).toBe("axial");
    expect(def.label).toBe("Palatino");
    expect(def.abbreviation).toBe("P");
  });

  it("lingual — axial, label Lingual, abbreviation L", () => {
    const def = SURFACE_DEFS.lingual;
    expect(def.position).toBe("axial");
    expect(def.label).toBe("Lingual");
    expect(def.abbreviation).toBe("L");
  });

  it("incisal — occlusal, label Incisal, abbreviation I", () => {
    const def = SURFACE_DEFS.incisal;
    expect(def.position).toBe("occlusal");
    expect(def.label).toBe("Incisal");
    expect(def.abbreviation).toBe("I");
  });

  it("oclusal — occlusal, label Oclusal, abbreviation O", () => {
    const def = SURFACE_DEFS.oclusal;
    expect(def.position).toBe("occlusal");
    expect(def.label).toBe("Oclusal");
    expect(def.abbreviation).toBe("O");
  });

  it("abbreviations are single-letter strings", () => {
    for (const s of ALL_SURFACES) {
      expect(SURFACE_DEFS[s].abbreviation.length).toBe(1);
    }
  });

  it("position values are restricted to proximal, axial, or occlusal", () => {
    const valid = new Set(["proximal", "axial", "occlusal"]);
    for (const s of ALL_SURFACES) {
      expect(valid.has(SURFACE_DEFS[s].position)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// getSurfaceGroup
// ---------------------------------------------------------------------------

describe("getSurfaceGroup", () => {
  it("returns 'anterior' for incisivo_central", () => {
    expect(getSurfaceGroup("incisivo_central")).toBe("anterior");
  });

  it("returns 'anterior' for incisivo_lateral", () => {
    expect(getSurfaceGroup("incisivo_lateral")).toBe("anterior");
  });

  it("returns 'anterior' for canino", () => {
    expect(getSurfaceGroup("canino")).toBe("anterior");
  });

  it("returns 'posterior' for primer_premolar", () => {
    expect(getSurfaceGroup("primer_premolar")).toBe("posterior");
  });

  it("returns 'posterior' for segundo_premolar", () => {
    expect(getSurfaceGroup("segundo_premolar")).toBe("posterior");
  });

  it("returns 'posterior' for primer_molar", () => {
    expect(getSurfaceGroup("primer_molar")).toBe("posterior");
  });

  it("returns 'posterior' for segundo_molar", () => {
    expect(getSurfaceGroup("segundo_molar")).toBe("posterior");
  });

  it("returns 'posterior' for tercer_molar", () => {
    expect(getSurfaceGroup("tercer_molar")).toBe("posterior");
  });

  it("all anterior classes return 'anterior'", () => {
    for (const c of ANTERIOR_CLASSES) {
      expect(getSurfaceGroup(c)).toBe("anterior");
    }
  });

  it("all posterior classes return 'posterior'", () => {
    for (const c of POSTERIOR_CLASSES) {
      expect(getSurfaceGroup(c)).toBe("posterior");
    }
  });
});

// ---------------------------------------------------------------------------
// getSurfaces
// ---------------------------------------------------------------------------

describe("getSurfaces", () => {
  it("always returns exactly 5 surfaces for any class × arch combo", () => {
    for (const cls of ALL_TOOTH_CLASSES) {
      for (const arch of ["upper", "lower"] as Arch[]) {
        expect(getSurfaces(cls, arch).length).toBe(5);
      }
    }
  });

  it("always starts with mesial, distal, vestibular (first 3 are fixed)", () => {
    for (const cls of ALL_TOOTH_CLASSES) {
      for (const arch of ["upper", "lower"] as Arch[]) {
        const surfaces = getSurfaces(cls, arch);
        expect(surfaces[0]).toBe("mesial");
        expect(surfaces[1]).toBe("distal");
        expect(surfaces[2]).toBe("vestibular");
      }
    }
  });

  it("upper arch always uses 'palatino' as 4th surface", () => {
    for (const cls of ALL_TOOTH_CLASSES) {
      const surfaces = getSurfaces(cls, "upper");
      expect(surfaces[3]).toBe("palatino");
    }
  });

  it("lower arch always uses 'lingual' as 4th surface", () => {
    for (const cls of ALL_TOOTH_CLASSES) {
      const surfaces = getSurfaces(cls, "lower");
      expect(surfaces[3]).toBe("lingual");
    }
  });

  it("anterior classes always use 'incisal' as 5th surface", () => {
    for (const cls of ANTERIOR_CLASSES) {
      for (const arch of ["upper", "lower"] as Arch[]) {
        const surfaces = getSurfaces(cls, arch);
        expect(surfaces[4]).toBe("incisal");
      }
    }
  });

  it("posterior classes always use 'oclusal' as 5th surface", () => {
    for (const cls of POSTERIOR_CLASSES) {
      for (const arch of ["upper", "lower"] as Arch[]) {
        const surfaces = getSurfaces(cls, arch);
        expect(surfaces[4]).toBe("oclusal");
      }
    }
  });

  it("incisivo_central upper — exact surface list", () => {
    expect(getSurfaces("incisivo_central", "upper")).toEqual([
      "mesial",
      "distal",
      "vestibular",
      "palatino",
      "incisal",
    ]);
  });

  it("incisivo_central lower — exact surface list", () => {
    expect(getSurfaces("incisivo_central", "lower")).toEqual([
      "mesial",
      "distal",
      "vestibular",
      "lingual",
      "incisal",
    ]);
  });

  it("primer_molar upper — exact surface list", () => {
    expect(getSurfaces("primer_molar", "upper")).toEqual([
      "mesial",
      "distal",
      "vestibular",
      "palatino",
      "oclusal",
    ]);
  });

  it("primer_molar lower — exact surface list", () => {
    expect(getSurfaces("primer_molar", "lower")).toEqual([
      "mesial",
      "distal",
      "vestibular",
      "lingual",
      "oclusal",
    ]);
  });

  it("canino upper — contains incisal, not oclusal", () => {
    const surfaces = getSurfaces("canino", "upper");
    expect(surfaces).toContain("incisal");
    expect(surfaces).not.toContain("oclusal");
  });

  it("tercer_molar lower — contains oclusal, not incisal", () => {
    const surfaces = getSurfaces("tercer_molar", "lower");
    expect(surfaces).toContain("oclusal");
    expect(surfaces).not.toContain("incisal");
  });

  it("no surface list contains both 'palatino' and 'lingual'", () => {
    for (const cls of ALL_TOOTH_CLASSES) {
      for (const arch of ["upper", "lower"] as Arch[]) {
        const surfaces = getSurfaces(cls, arch);
        const hasBoth =
          surfaces.includes("palatino") && surfaces.includes("lingual");
        expect(hasBoth).toBe(false);
      }
    }
  });

  it("no surface list contains both 'incisal' and 'oclusal'", () => {
    for (const cls of ALL_TOOTH_CLASSES) {
      for (const arch of ["upper", "lower"] as Arch[]) {
        const surfaces = getSurfaces(cls, arch);
        const hasBoth =
          surfaces.includes("incisal") && surfaces.includes("oclusal");
        expect(hasBoth).toBe(false);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// getSurfaceDef
// ---------------------------------------------------------------------------

describe("getSurfaceDef", () => {
  it("returns the correct SurfaceDef for 'mesial'", () => {
    expect(getSurfaceDef("mesial")).toEqual(SURFACE_DEFS.mesial);
  });

  it("returns the correct SurfaceDef for 'palatino'", () => {
    const def = getSurfaceDef("palatino");
    expect(def.id).toBe("palatino");
    expect(def.position).toBe("axial");
  });

  it("returns the correct SurfaceDef for 'oclusal'", () => {
    const def = getSurfaceDef("oclusal");
    expect(def.abbreviation).toBe("O");
    expect(def.position).toBe("occlusal");
  });

  it("is consistent with SURFACE_DEFS for all surfaces", () => {
    for (const s of ALL_SURFACES) {
      expect(getSurfaceDef(s)).toEqual(SURFACE_DEFS[s]);
    }
  });
});

// ---------------------------------------------------------------------------
// getSurfaceDefs
// ---------------------------------------------------------------------------

describe("getSurfaceDefs", () => {
  it("returns exactly 5 SurfaceDef objects for every class × arch combo", () => {
    for (const cls of ALL_TOOTH_CLASSES) {
      for (const arch of ["upper", "lower"] as Arch[]) {
        expect(getSurfaceDefs(cls, arch).length).toBe(5);
      }
    }
  });

  it("incisivo_central upper — SurfaceDef ids match getSurfaces output", () => {
    const defs = getSurfaceDefs("incisivo_central", "upper");
    const expected = getSurfaces("incisivo_central", "upper");
    expect(defs.map((d) => d.id)).toEqual([...expected]);
  });

  it("primer_molar lower — SurfaceDef ids match getSurfaces output", () => {
    const defs = getSurfaceDefs("primer_molar", "lower");
    const expected = getSurfaces("primer_molar", "lower");
    expect(defs.map((d) => d.id)).toEqual([...expected]);
  });

  it("returns full SurfaceDef objects with all required fields", () => {
    const defs = getSurfaceDefs("canino", "upper");
    for (const def of defs) {
      expect(def.id).toBeTruthy();
      expect(def.label).toBeTruthy();
      expect(def.abbreviation).toBeTruthy();
      expect(def.position).toBeTruthy();
    }
  });

  it("each returned SurfaceDef equals the SURFACE_DEFS entry", () => {
    const defs = getSurfaceDefs("segundo_molar", "lower");
    for (const def of defs) {
      expect(def).toEqual(SURFACE_DEFS[def.id]);
    }
  });
});

// ---------------------------------------------------------------------------
// SURFACE_CATALOG
// ---------------------------------------------------------------------------

describe("SURFACE_CATALOG", () => {
  it("contains an entry for every tooth class (8 total)", () => {
    expect(Object.keys(SURFACE_CATALOG).length).toBe(8);
    for (const cls of ALL_TOOTH_CLASSES) {
      expect(SURFACE_CATALOG[cls]).toBeDefined();
    }
  });

  it("each entry has upper and lower arrays", () => {
    for (const cls of ALL_TOOTH_CLASSES) {
      expect(SURFACE_CATALOG[cls].upper).toBeDefined();
      expect(SURFACE_CATALOG[cls].lower).toBeDefined();
    }
  });

  it("SURFACE_CATALOG values match getSurfaces() for all class × arch combos", () => {
    for (const cls of ALL_TOOTH_CLASSES) {
      for (const arch of ["upper", "lower"] as Arch[]) {
        expect([...SURFACE_CATALOG[cls][arch]]).toEqual([
          ...getSurfaces(cls, arch),
        ]);
      }
    }
  });

  it("canino.upper — contains palatino and incisal, not lingual or oclusal", () => {
    const surfaces = SURFACE_CATALOG.canino.upper;
    expect(surfaces).toContain("palatino");
    expect(surfaces).toContain("incisal");
    expect(surfaces).not.toContain("lingual");
    expect(surfaces).not.toContain("oclusal");
  });

  it("canino.lower — contains lingual and incisal, not palatino or oclusal", () => {
    const surfaces = SURFACE_CATALOG.canino.lower;
    expect(surfaces).toContain("lingual");
    expect(surfaces).toContain("incisal");
    expect(surfaces).not.toContain("palatino");
    expect(surfaces).not.toContain("oclusal");
  });

  it("tercer_molar.upper — contains palatino and oclusal, not lingual or incisal", () => {
    const surfaces = SURFACE_CATALOG.tercer_molar.upper;
    expect(surfaces).toContain("palatino");
    expect(surfaces).toContain("oclusal");
    expect(surfaces).not.toContain("lingual");
    expect(surfaces).not.toContain("incisal");
  });

  it("tercer_molar.lower — contains lingual and oclusal, not palatino or incisal", () => {
    const surfaces = SURFACE_CATALOG.tercer_molar.lower;
    expect(surfaces).toContain("lingual");
    expect(surfaces).toContain("oclusal");
    expect(surfaces).not.toContain("palatino");
    expect(surfaces).not.toContain("incisal");
  });

  it("all catalog entries have exactly 5 surfaces per arch", () => {
    for (const cls of ALL_TOOTH_CLASSES) {
      expect(SURFACE_CATALOG[cls].upper.length).toBe(5);
      expect(SURFACE_CATALOG[cls].lower.length).toBe(5);
    }
  });
});
