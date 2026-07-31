/**
 * FDI World Dental Federation (ISO 3950) numbering system.
 *
 * Permanent dentition:  11–18 · 21–28 · 31–38 · 41–48  (32 teeth)
 * Temporary dentition:  51–55 · 61–65 · 71–75 · 81–85  (20 teeth)
 *
 * Quadrant encoding:
 *   Tens digit = quadrant (1–4 permanent, 5–8 temporary)
 *   Units digit = position within quadrant (1 = closest to midline)
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DentitionType = "permanent" | "temporary";

/** Arch in the mouth */
export type Arch = "upper" | "lower";

/** Side relative to facial midline */
export type Side = "right" | "left";

/**
 * FDI quadrant number.
 * 1–4 → permanent dentition (1 = upper-right, clockwise)
 * 5–8 → temporary dentition (5 = upper-right, clockwise)
 */
export type QuadrantId = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

/** Tooth classification by morphology */
export type ToothClass =
  | "incisivo_central"
  | "incisivo_lateral"
  | "canino"
  | "primer_premolar"
  | "segundo_premolar"
  | "primer_molar"
  | "segundo_molar"
  | "tercer_molar";

export interface Tooth {
  /** FDI number (e.g. 11, 23, 46, 74) */
  readonly fdi: number;
  readonly dentition: DentitionType;
  readonly quadrant: QuadrantId;
  readonly arch: Arch;
  readonly side: Side;
  /** Position within quadrant, 1 = closest to midline */
  readonly position: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  readonly toothClass: ToothClass;
  /** Full Spanish label, e.g. "Incisivo central superior derecho" */
  readonly label: string;
  /** Short abbreviation for charting, e.g. "IC.S.D" */
  readonly abbreviation: string;
}

// ---------------------------------------------------------------------------
// Internal lookup tables (mapped types → no undefined on access)
// ---------------------------------------------------------------------------

const QUADRANT_INFO: Record<
  QuadrantId,
  { arch: Arch; side: Side; dentition: DentitionType }
> = {
  1: { arch: "upper", side: "right",  dentition: "permanent" },
  2: { arch: "upper", side: "left",   dentition: "permanent" },
  3: { arch: "lower", side: "left",   dentition: "permanent" },
  4: { arch: "lower", side: "right",  dentition: "permanent" },
  5: { arch: "upper", side: "right",  dentition: "temporary" },
  6: { arch: "upper", side: "left",   dentition: "temporary" },
  7: { arch: "lower", side: "left",   dentition: "temporary" },
  8: { arch: "lower", side: "right",  dentition: "temporary" },
};

const PERMANENT_CLASS: Record<1 | 2 | 3 | 4 | 5 | 6 | 7 | 8, ToothClass> = {
  1: "incisivo_central",
  2: "incisivo_lateral",
  3: "canino",
  4: "primer_premolar",
  5: "segundo_premolar",
  6: "primer_molar",
  7: "segundo_molar",
  8: "tercer_molar",
};

// Deciduous: no premolars; positions 4–5 are primary molars
const TEMPORARY_CLASS: Record<1 | 2 | 3 | 4 | 5, ToothClass> = {
  1: "incisivo_central",
  2: "incisivo_lateral",
  3: "canino",
  4: "primer_molar",
  5: "segundo_molar",
};

const CLASS_LABEL: Record<ToothClass, string> = {
  incisivo_central:  "Incisivo central",
  incisivo_lateral:  "Incisivo lateral",
  canino:            "Canino",
  primer_premolar:   "Primer premolar",
  segundo_premolar:  "Segundo premolar",
  primer_molar:      "Primer molar",
  segundo_molar:     "Segundo molar",
  tercer_molar:      "Tercer molar",
};

const CLASS_ABBR: Record<ToothClass, string> = {
  incisivo_central:  "IC",
  incisivo_lateral:  "IL",
  canino:            "C",
  primer_premolar:   "PP",
  segundo_premolar:  "SP",
  primer_molar:      "PM",
  segundo_molar:     "SM",
  tercer_molar:      "TM",
};

// ---------------------------------------------------------------------------
// Registry builder
// ---------------------------------------------------------------------------

function buildTooth(fdi: number): Tooth {
  const quadrant = Math.floor(fdi / 10) as QuadrantId;
  const position = (fdi % 10) as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  const { arch, side, dentition } = QUADRANT_INFO[quadrant];

  const toothClass: ToothClass =
    dentition === "permanent"
      ? PERMANENT_CLASS[position]
      : TEMPORARY_CLASS[position as 1 | 2 | 3 | 4 | 5];

  const archLabel = arch === "upper" ? "superior" : "inferior";
  const sideLabel = side === "right" ? "derecho" : "izquierdo";
  const temporalTag = dentition === "temporary" ? " temporal" : "";
  const label = `${CLASS_LABEL[toothClass]}${temporalTag} ${archLabel} ${sideLabel}`;

  const archAbbr = arch === "upper" ? "S" : "I";
  const sideAbbr = side === "right" ? "D" : "I";
  const abbreviation = `${CLASS_ABBR[toothClass]}.${archAbbr}.${sideAbbr}`;

  return Object.freeze({ fdi, dentition, quadrant, arch, side, position, toothClass, label, abbreviation });
}

// ---------------------------------------------------------------------------
// FDI number lists (standard charting order: upper-right → upper-left →
//   lower-left → lower-right, reading from midline outward per quadrant)
// ---------------------------------------------------------------------------

/** Permanent FDI numbers in standard visual charting order */
export const PERMANENT_FDI_NUMBERS = [
  18, 17, 16, 15, 14, 13, 12, 11,  // Q1 right → midline
  21, 22, 23, 24, 25, 26, 27, 28,  // Q2 midline → left
  31, 32, 33, 34, 35, 36, 37, 38,  // Q3 midline → left
  48, 47, 46, 45, 44, 43, 42, 41,  // Q4 right → midline
] as const;

/** Temporary FDI numbers in standard visual charting order */
export const TEMPORARY_FDI_NUMBERS = [
  55, 54, 53, 52, 51,  // Q5 right → midline
  61, 62, 63, 64, 65,  // Q6 midline → left
  71, 72, 73, 74, 75,  // Q7 midline → left
  85, 84, 83, 82, 81,  // Q8 right → midline
] as const;

/** All valid FDI numbers (52 total: 32 permanent + 20 temporary) */
export const ALL_FDI_NUMBERS = [
  ...PERMANENT_FDI_NUMBERS,
  ...TEMPORARY_FDI_NUMBERS,
] as const;

// ---------------------------------------------------------------------------
// Tooth registry — keyed by FDI number
// ---------------------------------------------------------------------------

/**
 * Complete registry of all 52 teeth (32 permanent + 20 temporary),
 * built at module load time from FDI number tables.
 *
 * Use `getTooth(fdi)` for safe single-tooth lookup.
 */
export const TEETH: Readonly<Record<number, Tooth>> = Object.fromEntries(
  ALL_FDI_NUMBERS.map((fdi) => [fdi, buildTooth(fdi)])
);

// ---------------------------------------------------------------------------
// Public utilities
// ---------------------------------------------------------------------------

/** Returns the tooth data for an FDI number, or `undefined` if not valid. */
export function getTooth(fdi: number): Tooth | undefined {
  return TEETH[fdi];
}

/** Returns `true` if `fdi` is a valid permanent or temporary FDI number. */
export function isValidFDI(fdi: number): boolean {
  return Object.prototype.hasOwnProperty.call(TEETH, fdi);
}

/**
 * Returns the quadrant for an FDI number, or `undefined` if invalid.
 * Quadrants 1–4 = permanent; 5–8 = temporary.
 */
export function getQuadrant(fdi: number): QuadrantId | undefined {
  if (!isValidFDI(fdi)) return undefined;
  return Math.floor(fdi / 10) as QuadrantId;
}

/**
 * Returns the dentition type for an FDI number without full registry lookup.
 * Faster than `getTooth(fdi)?.dentition` for bulk checks.
 */
export function getDentitionType(fdi: number): DentitionType | undefined {
  const q = Math.floor(fdi / 10);
  if (q >= 1 && q <= 4) return "permanent";
  if (q >= 5 && q <= 8) return "temporary";
  return undefined;
}

/** Returns all teeth belonging to a quadrant, sorted by position (1 → max). */
export function getTeethInQuadrant(quadrant: QuadrantId): Tooth[] {
  return ALL_FDI_NUMBERS
    .filter((fdi) => Math.floor(fdi / 10) === quadrant)
    .sort((a, b) => (a % 10) - (b % 10))
    .map((fdi) => TEETH[fdi] as Tooth);
}

/** Returns all 32 permanent teeth. */
export function getPermanentTeeth(): Tooth[] {
  return [...PERMANENT_FDI_NUMBERS].map((fdi) => TEETH[fdi] as Tooth);
}

/** Returns all 20 temporary (deciduous) teeth. */
export function getTemporaryTeeth(): Tooth[] {
  return [...TEMPORARY_FDI_NUMBERS].map((fdi) => TEETH[fdi] as Tooth);
}

/**
 * Returns teeth filtered by arch and, optionally, dentition type.
 * @example
 *   getTeethByArch("upper")              // all upper teeth (permanent + temporary)
 *   getTeethByArch("lower", "permanent") // lower permanent teeth only
 */
export function getTeethByArch(arch: Arch, dentition?: DentitionType): Tooth[] {
  return ALL_FDI_NUMBERS
    .map((fdi) => TEETH[fdi] as Tooth)
    .filter(
      (t) =>
        t.arch === arch &&
        (dentition === undefined || t.dentition === dentition)
    );
}

/**
 * Returns all teeth of a given morphological class.
 * @example
 *   getTeethByClass("canino")                    // all canines (permanent + temporary)
 *   getTeethByClass("primer_molar", "permanent") // 4 permanent first molars
 */
export function getTeethByClass(toothClass: ToothClass, dentition?: DentitionType): Tooth[] {
  return ALL_FDI_NUMBERS
    .map((fdi) => TEETH[fdi] as Tooth)
    .filter(
      (t) =>
        t.toothClass === toothClass &&
        (dentition === undefined || t.dentition === dentition)
    );
}
