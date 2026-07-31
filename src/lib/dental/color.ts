/**
 * Dental charting color system.
 *
 * Maps tooth treatment states to CSS colors following Spanish dental
 * charting conventions:
 *   pendiente (pending)  → rojo   (red)
 *   hecho     (done)     → azul   (blue)
 *
 * Each state exposes hex values (for SVG rendering) and Tailwind classes
 * (for React element styling).
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Treatment/condition state of a tooth or tooth surface */
export type ToothState =
  | "sano"           // Healthy — no treatment needed
  | "pendiente"      // Pending treatment → RED
  | "hecho"          // Treated / completed → BLUE
  | "en_curso"       // In progress → AMBER
  | "ausente"        // Missing / extracted → GRAY
  | "corona"         // Crowned → GOLD
  | "implante";      // Implant → TEAL (matches odontología primary #0f766e)

/** Color tokens for a tooth state, covering SVG and Tailwind use-cases */
export interface ToothColor {
  /** Fill hex used for tooth surface SVG paths */
  readonly fill: string;
  /** Stroke/border hex used for SVG outlines and element borders */
  readonly stroke: string;
  /** CSS color for text rendered on top of the fill */
  readonly textHex: string;
  /** Tailwind background class */
  readonly tailwindBg: string;
  /** Tailwind text class */
  readonly tailwindText: string;
  /** Tailwind border class */
  readonly tailwindBorder: string;
  /** Spanish display label */
  readonly label: string;
}

// ---------------------------------------------------------------------------
// Color map
// ---------------------------------------------------------------------------

/**
 * Complete color configuration for every tooth state.
 *
 * Color scale reference:
 *   red-500    #ef4444  / red-700    #b91c1c   — pendiente
 *   blue-500   #3b82f6  / blue-700   #1d4ed8   — hecho
 *   amber-500  #f59e0b  / amber-700  #b45309   — en_curso
 *   gray-400   #9ca3af  / gray-600   #4b5563   — ausente
 *   amber-600  #d97706  / amber-800  #92400e   — corona
 *   teal-600   #0d9488  / teal-700   #0f766e   — implante
 */
export const TOOTH_COLORS: Readonly<Record<ToothState, ToothColor>> = {
  sano: {
    fill:          "#ffffff",
    stroke:        "#d1d5db",   // gray-300
    textHex:       "#374151",   // gray-700
    tailwindBg:    "bg-white",
    tailwindText:  "text-gray-700",
    tailwindBorder:"border-gray-300",
    label:         "Sano",
  },

  // Rojo — tratamiento pendiente
  pendiente: {
    fill:          "#ef4444",   // red-500
    stroke:        "#b91c1c",   // red-700
    textHex:       "#ffffff",
    tailwindBg:    "bg-red-500",
    tailwindText:  "text-white",
    tailwindBorder:"border-red-700",
    label:         "Pendiente de tratamiento",
  },

  // Azul — tratamiento realizado
  hecho: {
    fill:          "#3b82f6",   // blue-500
    stroke:        "#1d4ed8",   // blue-700
    textHex:       "#ffffff",
    tailwindBg:    "bg-blue-500",
    tailwindText:  "text-white",
    tailwindBorder:"border-blue-700",
    label:         "Tratado",
  },

  en_curso: {
    fill:          "#f59e0b",   // amber-500
    stroke:        "#b45309",   // amber-700
    textHex:       "#ffffff",
    tailwindBg:    "bg-amber-500",
    tailwindText:  "text-white",
    tailwindBorder:"border-amber-700",
    label:         "En tratamiento",
  },

  ausente: {
    fill:          "#9ca3af",   // gray-400
    stroke:        "#4b5563",   // gray-600
    textHex:       "#ffffff",
    tailwindBg:    "bg-gray-400",
    tailwindText:  "text-white",
    tailwindBorder:"border-gray-600",
    label:         "Ausente",
  },

  corona: {
    fill:          "#d97706",   // amber-600
    stroke:        "#92400e",   // amber-800
    textHex:       "#ffffff",
    tailwindBg:    "bg-amber-600",
    tailwindText:  "text-white",
    tailwindBorder:"border-amber-800",
    label:         "Corona",
  },

  implante: {
    fill:          "#0d9488",   // teal-600
    stroke:        "#0f766e",   // teal-700 — matches odontología sector primary
    textHex:       "#ffffff",
    tailwindBg:    "bg-teal-600",
    tailwindText:  "text-white",
    tailwindBorder:"border-teal-700",
    label:         "Implante",
  },
};

// ---------------------------------------------------------------------------
// Public utilities
// ---------------------------------------------------------------------------

/** Returns the complete color config for a tooth state. */
export function getToothColor(state: ToothState): ToothColor {
  return TOOTH_COLORS[state];
}

/** Returns the SVG fill hex for a tooth state. */
export function getToothFill(state: ToothState): string {
  return TOOTH_COLORS[state].fill;
}

/** Returns the SVG stroke hex for a tooth state. */
export function getToothStroke(state: ToothState): string {
  return TOOTH_COLORS[state].stroke;
}

/** Returns the Tailwind background class for a tooth state. */
export function getToothTailwindBg(state: ToothState): string {
  return TOOTH_COLORS[state].tailwindBg;
}

/**
 * Returns a CSS-in-JS style object for a tooth element.
 * Suitable for React `style` props on SVG or DOM elements.
 */
export function getToothCssStyle(state: ToothState): {
  backgroundColor: string;
  borderColor: string;
  color: string;
} {
  const c = TOOTH_COLORS[state];
  return {
    backgroundColor: c.fill,
    borderColor:     c.stroke,
    color:           c.textHex,
  };
}

/**
 * Returns SVG presentation attributes for a tooth surface path.
 * @example
 *   <path {...getToothSvgAttrs("pendiente")} d="..." />
 */
export function getToothSvgAttrs(state: ToothState): {
  fill: string;
  stroke: string;
  strokeWidth: number;
} {
  const c = TOOTH_COLORS[state];
  return {
    fill:        c.fill,
    stroke:      c.stroke,
    strokeWidth: 1.5,
  };
}

/**
 * All tooth states as label/value pairs, ready for `<select>` or radio inputs.
 */
export const TOOTH_STATE_OPTIONS: ReadonlyArray<{
  value: ToothState;
  label: string;
}> = (Object.keys(TOOTH_COLORS) as ToothState[]).map((state) => ({
  value: state,
  label: TOOTH_COLORS[state].label,
}));
