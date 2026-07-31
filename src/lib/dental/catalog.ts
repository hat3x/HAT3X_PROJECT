/**
 * Dental surface catalog.
 *
 * Defines which anatomical surfaces apply to each tooth class and arch.
 *
 * Anterior teeth (incisors + canines) have an incisal edge.
 * Posterior teeth (premolars + molars) have an occlusal surface.
 * The inner axial surface name changes by arch:
 *   upper → palatino  (facing palate)
 *   lower → lingual   (facing tongue)
 */

import type { Arch, ToothClass } from "./tooth";

// ---------------------------------------------------------------------------
// Surface types
// ---------------------------------------------------------------------------

/**
 * All possible dental surface identifiers.
 *
 * Proximal: mesial, distal
 * Axial:    vestibular, palatino, lingual
 * Occlusal: incisal (anterior), oclusal (posterior)
 */
export type Surface =
  | "mesial"       // Proximal — faces midline
  | "distal"       // Proximal — faces away from midline
  | "vestibular"   // Axial — faces lips/cheeks
  | "palatino"     // Axial — faces palate (upper teeth only)
  | "lingual"      // Axial — faces tongue (lower teeth only)
  | "incisal"      // Occlusal — cutting edge of anterior teeth
  | "oclusal";     // Occlusal — chewing surface of posterior teeth

export type SurfaceGroup = "anterior" | "posterior";

/** Grouping of surfaces by anatomical position */
export type SurfacePosition = "proximal" | "axial" | "occlusal";

export interface SurfaceDef {
  readonly id: Surface;
  /** Spanish display name */
  readonly label: string;
  /** Single-letter abbreviation used in charting notation */
  readonly abbreviation: string;
  /** Anatomical position group */
  readonly position: SurfacePosition;
}

// ---------------------------------------------------------------------------
// Surface definitions
// ---------------------------------------------------------------------------

export const SURFACE_DEFS: Readonly<Record<Surface, SurfaceDef>> = {
  mesial: {
    id:           "mesial",
    label:        "Mesial",
    abbreviation: "M",
    position:     "proximal",
  },
  distal: {
    id:           "distal",
    label:        "Distal",
    abbreviation: "D",
    position:     "proximal",
  },
  vestibular: {
    id:           "vestibular",
    label:        "Vestibular",
    abbreviation: "V",
    position:     "axial",
  },
  palatino: {
    id:           "palatino",
    label:        "Palatino",
    abbreviation: "P",
    position:     "axial",
  },
  lingual: {
    id:           "lingual",
    label:        "Lingual",
    abbreviation: "L",
    position:     "axial",
  },
  incisal: {
    id:           "incisal",
    label:        "Incisal",
    abbreviation: "I",
    position:     "occlusal",
  },
  oclusal: {
    id:           "oclusal",
    label:        "Oclusal",
    abbreviation: "O",
    position:     "occlusal",
  },
};

// ---------------------------------------------------------------------------
// Anterior tooth classes (have incisal edge, not occlusal)
// ---------------------------------------------------------------------------

const ANTERIOR_CLASSES = new Set<ToothClass>([
  "incisivo_central",
  "incisivo_lateral",
  "canino",
]);

// ---------------------------------------------------------------------------
// Public utilities
// ---------------------------------------------------------------------------

/**
 * Returns the anatomical group for a tooth class.
 * Anterior: incisors + canines.
 * Posterior: premolars + molars.
 */
export function getSurfaceGroup(toothClass: ToothClass): SurfaceGroup {
  return ANTERIOR_CLASSES.has(toothClass) ? "anterior" : "posterior";
}

/**
 * Returns the ordered list of surfaces applicable to a tooth, given its class
 * and arch.
 *
 * Surface order follows standard charting convention:
 *   mesial → distal → vestibular → palatino/lingual → incisal/oclusal
 *
 * @example
 *   getSurfaces("incisivo_central", "upper")
 *   // → ["mesial", "distal", "vestibular", "palatino", "incisal"]
 *
 *   getSurfaces("primer_molar", "lower")
 *   // → ["mesial", "distal", "vestibular", "lingual", "oclusal"]
 */
export function getSurfaces(toothClass: ToothClass, arch: Arch): readonly Surface[] {
  const innerSurface: Surface = arch === "upper" ? "palatino" : "lingual";
  const occlusionSurface: Surface = ANTERIOR_CLASSES.has(toothClass) ? "incisal" : "oclusal";

  return ["mesial", "distal", "vestibular", innerSurface, occlusionSurface] as const;
}

/**
 * Returns the `SurfaceDef` for a surface identifier.
 * Convenience over direct `SURFACE_DEFS[surface]` access.
 */
export function getSurfaceDef(surface: Surface): SurfaceDef {
  return SURFACE_DEFS[surface];
}

/**
 * Returns a list of `SurfaceDef` objects for a tooth, given its class and arch.
 * Equivalent to `getSurfaces(...)` but with full surface metadata.
 */
export function getSurfaceDefs(toothClass: ToothClass, arch: Arch): readonly SurfaceDef[] {
  return getSurfaces(toothClass, arch).map((s) => SURFACE_DEFS[s]);
}

// ---------------------------------------------------------------------------
// Static surface catalog — full matrix of all tooth classes × both arches
// ---------------------------------------------------------------------------

/**
 * Pre-computed surface lists for every tooth class and both arches.
 *
 * Useful for documentation, validation, and static analysis without
 * calling `getSurfaces()` at runtime.
 *
 * @example
 *   SURFACE_CATALOG.canino.lower
 *   // → ["mesial", "distal", "vestibular", "lingual", "incisal"]
 */
export const SURFACE_CATALOG: Readonly<
  Record<ToothClass, { readonly upper: readonly Surface[]; readonly lower: readonly Surface[] }>
> = {
  incisivo_central: {
    upper: getSurfaces("incisivo_central", "upper"),
    lower: getSurfaces("incisivo_central", "lower"),
  },
  incisivo_lateral: {
    upper: getSurfaces("incisivo_lateral", "upper"),
    lower: getSurfaces("incisivo_lateral", "lower"),
  },
  canino: {
    upper: getSurfaces("canino", "upper"),
    lower: getSurfaces("canino", "lower"),
  },
  primer_premolar: {
    upper: getSurfaces("primer_premolar", "upper"),
    lower: getSurfaces("primer_premolar", "lower"),
  },
  segundo_premolar: {
    upper: getSurfaces("segundo_premolar", "upper"),
    lower: getSurfaces("segundo_premolar", "lower"),
  },
  primer_molar: {
    upper: getSurfaces("primer_molar", "upper"),
    lower: getSurfaces("primer_molar", "lower"),
  },
  segundo_molar: {
    upper: getSurfaces("segundo_molar", "upper"),
    lower: getSurfaces("segundo_molar", "lower"),
  },
  tercer_molar: {
    upper: getSurfaces("tercer_molar", "upper"),
    lower: getSurfaces("tercer_molar", "lower"),
  },
};
