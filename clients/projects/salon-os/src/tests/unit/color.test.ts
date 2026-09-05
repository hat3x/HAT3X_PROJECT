import { describe, it, expect } from "vitest";
import {
  TOOTH_COLORS,
  TOOTH_STATE_OPTIONS,
  getToothColor,
  getToothFill,
  getToothStroke,
  getToothTailwindBg,
  getToothCssStyle,
  getToothSvgAttrs,
} from "@/lib/dental/color";
import type { ToothState } from "@/lib/dental/color";

const ALL_STATES: ToothState[] = [
  "sano",
  "pendiente",
  "hecho",
  "en_curso",
  "ausente",
  "corona",
  "implante",
];

// ---------------------------------------------------------------------------
// TOOTH_COLORS registry
// ---------------------------------------------------------------------------

describe("TOOTH_COLORS registry", () => {
  it("contains exactly 7 states", () => {
    expect(Object.keys(TOOTH_COLORS).length).toBe(7);
  });

  it("has an entry for every expected state", () => {
    for (const state of ALL_STATES) {
      expect(TOOTH_COLORS[state]).toBeDefined();
    }
  });

  it("every entry has fill, stroke, textHex, tailwindBg, tailwindText, tailwindBorder, label", () => {
    for (const state of ALL_STATES) {
      const c = TOOTH_COLORS[state];
      expect(c.fill).toBeTruthy();
      expect(c.stroke).toBeTruthy();
      expect(c.textHex).toBeTruthy();
      expect(c.tailwindBg).toBeTruthy();
      expect(c.tailwindText).toBeTruthy();
      expect(c.tailwindBorder).toBeTruthy();
      expect(c.label).toBeTruthy();
    }
  });

  it("fill, stroke, textHex are valid hex color strings", () => {
    const hexPattern = /^#[0-9a-fA-F]{3,6}$/;
    for (const state of ALL_STATES) {
      expect(TOOTH_COLORS[state].fill).toMatch(hexPattern);
      expect(TOOTH_COLORS[state].stroke).toMatch(hexPattern);
      expect(TOOTH_COLORS[state].textHex).toMatch(hexPattern);
    }
  });

  it("sano fill is white (#ffffff)", () => {
    expect(TOOTH_COLORS.sano.fill).toBe("#ffffff");
  });

  it("pendiente fill is red-500 (#ef4444) — Spanish charting convention", () => {
    expect(TOOTH_COLORS.pendiente.fill).toBe("#ef4444");
    expect(TOOTH_COLORS.pendiente.stroke).toBe("#b91c1c");
  });

  it("hecho fill is blue-500 (#3b82f6) — Spanish charting convention", () => {
    expect(TOOTH_COLORS.hecho.fill).toBe("#3b82f6");
    expect(TOOTH_COLORS.hecho.stroke).toBe("#1d4ed8");
  });

  it("en_curso fill is amber-500 (#f59e0b)", () => {
    expect(TOOTH_COLORS.en_curso.fill).toBe("#f59e0b");
    expect(TOOTH_COLORS.en_curso.stroke).toBe("#b45309");
  });

  it("ausente fill is gray-400 (#9ca3af)", () => {
    expect(TOOTH_COLORS.ausente.fill).toBe("#9ca3af");
    expect(TOOTH_COLORS.ausente.stroke).toBe("#4b5563");
  });

  it("corona fill is amber-600 (#d97706)", () => {
    expect(TOOTH_COLORS.corona.fill).toBe("#d97706");
    expect(TOOTH_COLORS.corona.stroke).toBe("#92400e");
  });

  it("implante fill is teal-600 (#0d9488) — matches odontología sector primary", () => {
    expect(TOOTH_COLORS.implante.fill).toBe("#0d9488");
    expect(TOOTH_COLORS.implante.stroke).toBe("#0f766e");
  });

  it("tailwindBg classes start with 'bg-'", () => {
    for (const state of ALL_STATES) {
      expect(TOOTH_COLORS[state].tailwindBg).toMatch(/^bg-/);
    }
  });

  it("tailwindText classes start with 'text-'", () => {
    for (const state of ALL_STATES) {
      expect(TOOTH_COLORS[state].tailwindText).toMatch(/^text-/);
    }
  });

  it("tailwindBorder classes start with 'border-'", () => {
    for (const state of ALL_STATES) {
      expect(TOOTH_COLORS[state].tailwindBorder).toMatch(/^border-/);
    }
  });

  it("non-sano states use white (#ffffff) text for contrast on colored fills", () => {
    const coloredStates: ToothState[] = [
      "pendiente",
      "hecho",
      "en_curso",
      "ausente",
      "corona",
      "implante",
    ];
    for (const state of coloredStates) {
      expect(TOOTH_COLORS[state].textHex).toBe("#ffffff");
    }
  });
});

// ---------------------------------------------------------------------------
// getToothColor
// ---------------------------------------------------------------------------

describe("getToothColor", () => {
  it("returns the full ToothColor object for 'sano'", () => {
    const c = getToothColor("sano");
    expect(c).toEqual(TOOTH_COLORS.sano);
  });

  it("returns the full ToothColor object for 'pendiente'", () => {
    const c = getToothColor("pendiente");
    expect(c.fill).toBe("#ef4444");
    expect(c.label).toBe("Pendiente de tratamiento");
  });

  it("returns referentially stable values (same object as registry)", () => {
    expect(getToothColor("hecho")).toBe(TOOTH_COLORS.hecho);
  });

  it("returns correct object for all 7 states", () => {
    for (const state of ALL_STATES) {
      expect(getToothColor(state)).toEqual(TOOTH_COLORS[state]);
    }
  });
});

// ---------------------------------------------------------------------------
// getToothFill
// ---------------------------------------------------------------------------

describe("getToothFill", () => {
  it("returns '#ffffff' for 'sano'", () => {
    expect(getToothFill("sano")).toBe("#ffffff");
  });

  it("returns '#ef4444' for 'pendiente'", () => {
    expect(getToothFill("pendiente")).toBe("#ef4444");
  });

  it("returns '#3b82f6' for 'hecho'", () => {
    expect(getToothFill("hecho")).toBe("#3b82f6");
  });

  it("returns '#f59e0b' for 'en_curso'", () => {
    expect(getToothFill("en_curso")).toBe("#f59e0b");
  });

  it("returns '#9ca3af' for 'ausente'", () => {
    expect(getToothFill("ausente")).toBe("#9ca3af");
  });

  it("returns '#d97706' for 'corona'", () => {
    expect(getToothFill("corona")).toBe("#d97706");
  });

  it("returns '#0d9488' for 'implante'", () => {
    expect(getToothFill("implante")).toBe("#0d9488");
  });

  it("is consistent with TOOTH_COLORS for all states", () => {
    for (const state of ALL_STATES) {
      expect(getToothFill(state)).toBe(TOOTH_COLORS[state].fill);
    }
  });
});

// ---------------------------------------------------------------------------
// getToothStroke
// ---------------------------------------------------------------------------

describe("getToothStroke", () => {
  it("returns '#d1d5db' for 'sano' (gray-300 border)", () => {
    expect(getToothStroke("sano")).toBe("#d1d5db");
  });

  it("returns '#b91c1c' for 'pendiente' (red-700)", () => {
    expect(getToothStroke("pendiente")).toBe("#b91c1c");
  });

  it("is consistent with TOOTH_COLORS for all states", () => {
    for (const state of ALL_STATES) {
      expect(getToothStroke(state)).toBe(TOOTH_COLORS[state].stroke);
    }
  });
});

// ---------------------------------------------------------------------------
// getToothTailwindBg
// ---------------------------------------------------------------------------

describe("getToothTailwindBg", () => {
  it("returns 'bg-white' for 'sano'", () => {
    expect(getToothTailwindBg("sano")).toBe("bg-white");
  });

  it("returns 'bg-red-500' for 'pendiente'", () => {
    expect(getToothTailwindBg("pendiente")).toBe("bg-red-500");
  });

  it("returns 'bg-blue-500' for 'hecho'", () => {
    expect(getToothTailwindBg("hecho")).toBe("bg-blue-500");
  });

  it("returns 'bg-amber-500' for 'en_curso'", () => {
    expect(getToothTailwindBg("en_curso")).toBe("bg-amber-500");
  });

  it("returns 'bg-gray-400' for 'ausente'", () => {
    expect(getToothTailwindBg("ausente")).toBe("bg-gray-400");
  });

  it("returns 'bg-amber-600' for 'corona'", () => {
    expect(getToothTailwindBg("corona")).toBe("bg-amber-600");
  });

  it("returns 'bg-teal-600' for 'implante'", () => {
    expect(getToothTailwindBg("implante")).toBe("bg-teal-600");
  });

  it("is consistent with TOOTH_COLORS for all states", () => {
    for (const state of ALL_STATES) {
      expect(getToothTailwindBg(state)).toBe(TOOTH_COLORS[state].tailwindBg);
    }
  });
});

// ---------------------------------------------------------------------------
// getToothCssStyle
// ---------------------------------------------------------------------------

describe("getToothCssStyle", () => {
  it("returns an object with backgroundColor, borderColor, color keys", () => {
    const style = getToothCssStyle("sano");
    expect(style).toHaveProperty("backgroundColor");
    expect(style).toHaveProperty("borderColor");
    expect(style).toHaveProperty("color");
  });

  it("sano — backgroundColor is fill (#ffffff), borderColor is stroke (#d1d5db), color is gray text", () => {
    const style = getToothCssStyle("sano");
    expect(style.backgroundColor).toBe("#ffffff");
    expect(style.borderColor).toBe("#d1d5db");
    expect(style.color).toBe("#374151");
  });

  it("pendiente — backgroundColor is #ef4444, borderColor is #b91c1c, color is white", () => {
    const style = getToothCssStyle("pendiente");
    expect(style.backgroundColor).toBe("#ef4444");
    expect(style.borderColor).toBe("#b91c1c");
    expect(style.color).toBe("#ffffff");
  });

  it("maps fill→backgroundColor, stroke→borderColor, textHex→color for all states", () => {
    for (const state of ALL_STATES) {
      const c = TOOTH_COLORS[state];
      const style = getToothCssStyle(state);
      expect(style.backgroundColor).toBe(c.fill);
      expect(style.borderColor).toBe(c.stroke);
      expect(style.color).toBe(c.textHex);
    }
  });
});

// ---------------------------------------------------------------------------
// getToothSvgAttrs
// ---------------------------------------------------------------------------

describe("getToothSvgAttrs", () => {
  it("returns an object with fill, stroke, strokeWidth keys", () => {
    const attrs = getToothSvgAttrs("sano");
    expect(attrs).toHaveProperty("fill");
    expect(attrs).toHaveProperty("stroke");
    expect(attrs).toHaveProperty("strokeWidth");
  });

  it("strokeWidth is always 1.5 for all states", () => {
    for (const state of ALL_STATES) {
      expect(getToothSvgAttrs(state).strokeWidth).toBe(1.5);
    }
  });

  it("fill and stroke match the TOOTH_COLORS registry for all states", () => {
    for (const state of ALL_STATES) {
      const attrs = getToothSvgAttrs(state);
      expect(attrs.fill).toBe(TOOTH_COLORS[state].fill);
      expect(attrs.stroke).toBe(TOOTH_COLORS[state].stroke);
    }
  });

  it("pendiente attrs — fill red-500, stroke red-700, strokeWidth 1.5", () => {
    const attrs = getToothSvgAttrs("pendiente");
    expect(attrs.fill).toBe("#ef4444");
    expect(attrs.stroke).toBe("#b91c1c");
    expect(attrs.strokeWidth).toBe(1.5);
  });

  it("implante attrs — fill teal-600, stroke teal-700", () => {
    const attrs = getToothSvgAttrs("implante");
    expect(attrs.fill).toBe("#0d9488");
    expect(attrs.stroke).toBe("#0f766e");
  });
});

// ---------------------------------------------------------------------------
// TOOTH_STATE_OPTIONS
// ---------------------------------------------------------------------------

describe("TOOTH_STATE_OPTIONS", () => {
  it("has exactly 7 entries (one per state)", () => {
    expect(TOOTH_STATE_OPTIONS.length).toBe(7);
  });

  it("each option has value and label fields", () => {
    for (const opt of TOOTH_STATE_OPTIONS) {
      expect(opt).toHaveProperty("value");
      expect(opt).toHaveProperty("label");
    }
  });

  it("values cover all 7 ToothState variants", () => {
    const values = TOOTH_STATE_OPTIONS.map((o) => o.value);
    for (const state of ALL_STATES) {
      expect(values).toContain(state);
    }
  });

  it("labels are non-empty strings", () => {
    for (const opt of TOOTH_STATE_OPTIONS) {
      expect(typeof opt.label).toBe("string");
      expect(opt.label.length).toBeGreaterThan(0);
    }
  });

  it("label for each option matches the TOOTH_COLORS registry label", () => {
    for (const opt of TOOTH_STATE_OPTIONS) {
      expect(opt.label).toBe(TOOTH_COLORS[opt.value].label);
    }
  });
});
