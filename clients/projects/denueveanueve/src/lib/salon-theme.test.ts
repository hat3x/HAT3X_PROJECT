import { describe, it, expect } from 'vitest';
import {
  hexToHsl,
  contrastRatio,
  assessFillLegibility,
  resolveBrandTheme,
  WCAG_AA_TEXT,
  type Hsl,
  type BrandColors,
} from './salon-theme';

const BLACK: Hsl = { h: 0, s: 0, l: 0 };
const WHITE: Hsl = { h: 0, s: 0, l: 100 };

describe('hexToHsl', () => {
  it('converts pure primaries to HSL', () => {
    expect(hexToHsl('#ff0000')).toEqual({ h: 0, s: 100, l: 50 });
    expect(hexToHsl('#00ff00')).toEqual({ h: 120, s: 100, l: 50 });
    expect(hexToHsl('#0000ff')).toEqual({ h: 240, s: 100, l: 50 });
  });

  it('maps black and white to their achromatic endpoints', () => {
    expect(hexToHsl('#000000')).toEqual({ h: 0, s: 0, l: 0 });
    expect(hexToHsl('#ffffff')).toEqual({ h: 0, s: 0, l: 100 });
  });

  it('accepts uppercase hex and surrounding whitespace', () => {
    expect(hexToHsl('  #FFFFFF ')).toEqual({ h: 0, s: 0, l: 100 });
  });

  it('returns null for malformed hex (no #, 3-digit, alpha, non-hex)', () => {
    expect(hexToHsl('fff')).toBeNull();
    expect(hexToHsl('#fff')).toBeNull();
    expect(hexToHsl('#12345678')).toBeNull();
    expect(hexToHsl('#gggggg')).toBeNull();
    expect(hexToHsl('')).toBeNull();
  });
});

describe('contrastRatio (WCAG 2.1 §1.4.3)', () => {
  it('black vs white is the maximum 21:1', () => {
    expect(contrastRatio(BLACK, WHITE)).toBeCloseTo(21, 5);
  });

  it('is symmetric (lighter always over darker)', () => {
    expect(contrastRatio(WHITE, BLACK)).toBeCloseTo(contrastRatio(BLACK, WHITE), 10);
  });

  it('identical colors give 1:1', () => {
    expect(contrastRatio(WHITE, WHITE)).toBeCloseTo(1, 10);
  });
});

describe('WCAG_AA_TEXT', () => {
  it('is the AA normal-text threshold of 4.5:1', () => {
    expect(WCAG_AA_TEXT).toBe(4.5);
  });
});

describe('assessFillLegibility — picks the readable text over a fill color', () => {
  it('chooses DARK text on a bright yellow fill (and clears AA comfortably)', () => {
    const res = assessFillLegibility('#ffe000')!;
    expect(res.text).toBe('dark');
    expect(res.meetsAA).toBe(true);
    expect(res.ratio).toBeGreaterThan(WCAG_AA_TEXT);
  });

  it('chooses LIGHT text on a deep indigo fill (and clears AA comfortably)', () => {
    const res = assessFillLegibility('#2a1a5e')!;
    expect(res.text).toBe('light');
    expect(res.meetsAA).toBe(true);
    expect(res.ratio).toBeGreaterThan(WCAG_AA_TEXT);
  });

  it('keeps DARK text on the flagship gold (the current design choice)', () => {
    // #c8a97e is the warm gold used as the index.html theme-color; dark text wins.
    const res = assessFillLegibility('#c8a97e')!;
    expect(res.text).toBe('dark');
  });

  it('always exposes ratio and a consistent meetsAA flag (mid-tone, no throw)', () => {
    // A medium red near the AA boundary — the contract must hold on either side of it.
    const res = assessFillLegibility('#c0392b')!;
    expect(res.ratio).toBeGreaterThanOrEqual(1);
    expect(res.meetsAA).toBe(res.ratio >= WCAG_AA_TEXT);
  });

  it('returns null for an invalid hex (nothing to assess)', () => {
    expect(assessFillLegibility('nope')).toBeNull();
    expect(assessFillLegibility('#fff')).toBeNull();
  });
});

describe('resolveBrandTheme — brand colors → token overrides (or null fallback)', () => {
  it('returns null for null branding (→ default theme stays)', () => {
    expect(resolveBrandTheme(null)).toBeNull();
  });

  it('returns null for an invalid primary color (→ default theme stays)', () => {
    expect(resolveBrandTheme({ primaryColor: 'not-a-color', secondaryColor: null })).toBeNull();
  });

  it('reproduces the flagship gold tokens exactly for the base primary #cc9433', () => {
    const theme = resolveBrandTheme({ primaryColor: '#cc9433', secondaryColor: null })!;
    // #cc9433 → 38 60% 50%: the hand-written index.css values must round-trip.
    expect(theme['--primary']).toBe('38 60% 50%');
    expect(theme['--gold']).toBe('38 60% 50%');
    expect(theme['--ring']).toBe('38 60% 50%');
    expect(theme['--gold-light']).toBe('38 55% 65%');
    expect(theme['--gold-dark']).toBe('38 50% 35%');
    expect(theme['--gold-muted']).toBe('38 30% 25%');
    expect(theme['--accent']).toBe('38 45% 40%');
    // Dark text wins over the gold fill (matches the current design).
    expect(theme['--primary-foreground']).toBe('30 10% 6%');
  });

  it('emits a brand-derived gradient and shadow referencing the primary', () => {
    const theme = resolveBrandTheme({ primaryColor: '#cc9433', secondaryColor: null })!;
    expect(theme['--gradient-gold']).toContain('linear-gradient(135deg, hsl(38 60% 50%)');
    expect(theme['--shadow-gold']).toBe('0 4px 20px -4px hsl(38 60% 50% / 0.25)');
  });

  it('derives the accent hue from a valid secondary color when present', () => {
    const theme = resolveBrandTheme({ primaryColor: '#cc9433', secondaryColor: '#0000ff' })!;
    // Secondary #0000ff → hue 240; accent should adopt that hue, primary stays gold.
    expect(theme['--accent'].startsWith('240 ')).toBe(true);
    expect(theme['--primary']).toBe('38 60% 50%');
  });

  it('falls back to the primary hue for the accent when secondary is null', () => {
    const theme = resolveBrandTheme({ primaryColor: '#cc9433', secondaryColor: null })!;
    expect(theme['--accent'].startsWith('38 ')).toBe(true);
  });

  it('ignores an invalid secondary color and uses the primary hue for the accent', () => {
    const theme = resolveBrandTheme({ primaryColor: '#cc9433', secondaryColor: 'bad' })!;
    expect(theme['--accent'].startsWith('38 ')).toBe(true);
  });

  it('chooses a WCAG-readable foreground when the primary is dark (light text)', () => {
    const theme = resolveBrandTheme({ primaryColor: '#111827', secondaryColor: null })!;
    // Dark charcoal primary → the readable foreground must be the LIGHT text token.
    expect(theme['--primary-foreground']).toBe('40 20% 92%');
  });

  it('never throws on malformed branding (clean fallback, no crash)', () => {
    // "fallback sin branding (tema por defecto, no crashea)": ninguna entrada mal
    // formada puede tumbar la derivación del tema; a lo sumo devuelve null y manda
    // el tema dorado por defecto de index.css.
    const malformed: (BrandColors | null)[] = [
      null,
      { primaryColor: '', secondaryColor: null },
      { primaryColor: '#fff', secondaryColor: null }, // 3-digit shorthand: not valid here
      { primaryColor: '#zzzzzz', secondaryColor: null },
      { primaryColor: 'rgb(0,0,0)', secondaryColor: null },
      { primaryColor: '#cc9433', secondaryColor: 'nope' }, // invalid secondary is ignored
      { primaryColor: '#cc9433', secondaryColor: undefined },
    ];
    for (const input of malformed) {
      expect(() => resolveBrandTheme(input)).not.toThrow();
    }
    // Invalid primary ⇒ null ⇒ default theme stays untouched.
    expect(resolveBrandTheme({ primaryColor: '#zzzzzz', secondaryColor: null })).toBeNull();
    // Valid primary + invalid secondary ⇒ still re-tints (accent falls back to primary hue).
    expect(resolveBrandTheme({ primaryColor: '#cc9433', secondaryColor: 'nope' })).not.toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Contraste real del TEXTO sobre el color de marca (accesibilidad AA).
//
// El sistema elige el texto (claro/oscuro) por CONTRASTE WCAG real, no asumiendo
// claro u oscuro. Estas pruebas fijan el contrato sobre los VALORES que la app
// RINDE en las variables CSS —no solo sobre el helper— y sobre dos superficies:
//   · --primary / --primary-foreground → RELLENO de botones/CTA: DEBE cumplir AA.
//   · --accent  / --accent-foreground  → estado activo SUTIL (mid-tone): el texto
//     es SIEMPRE el más legible posible, aunque ese máximo pueda quedar algo por
//     debajo de AA en un acento deliberadamente apagado (se documenta abajo).
// ─────────────────────────────────────────────────────────────────────────────

// Los DOS únicos tokens de texto del sistema (espejo de --foreground / --background
// en index.css): resolveBrandTheme nunca pinta otro color de texto sobre la marca.
const SYSTEM_LIGHT_TEXT: Hsl = { h: 40, s: 20, l: 92 };
const SYSTEM_DARK_TEXT: Hsl = { h: 30, s: 10, l: 6 };

// "H S% L%" (shadcn) → Hsl, para medir el contraste real de un token con contrastRatio.
const parseTriple = (triple: string): Hsl => {
  const m = triple.match(/^(\d+)\s+(\d+)%\s+(\d+)%$/);
  if (!m) throw new Error(`token no es un triplete HSL válido: "${triple}"`);
  return { h: Number(m[1]), s: Number(m[2]), l: Number(m[3]) };
};

// Marcas representativas: oro insignia, azul marino oscuro, rojo puro y verde.
const BRAND_PRIMARIES = ['#cc9433', '#111827', '#ff0000', '#2ecc71'];

describe('assessFillLegibility — un color problemático SE DETECTA como no-AA', () => {
  it('flags a mid grey whose best possible text still fails AA (< 4.5:1)', () => {
    // #727272 cae en la banda de luminancia donde NI el texto claro NI el oscuro
    // alcanzan AA: el máximo contraste posible ≈ 4.03 < 4.5. La función lo detecta
    // en vez de fingir que es legible.
    const res = assessFillLegibility('#727272')!;
    expect(res.meetsAA).toBe(false);
    expect(res.ratio).toBeLessThan(WCAG_AA_TEXT);
    expect(res.ratio).toBeGreaterThan(1);
  });

  it('each representative brand is AA-legible and picks the higher-contrast text', () => {
    for (const hex of BRAND_PRIMARIES) {
      const res = assessFillLegibility(hex)!;
      expect(res.meetsAA).toBe(true);
      expect(res.ratio).toBeGreaterThanOrEqual(WCAG_AA_TEXT);
      // El lado elegido es de VERDAD el de más contraste (no una suposición).
      const color = hexToHsl(hex)!;
      const chosen = res.text === 'light' ? SYSTEM_LIGHT_TEXT : SYSTEM_DARK_TEXT;
      const other = res.text === 'light' ? SYSTEM_DARK_TEXT : SYSTEM_LIGHT_TEXT;
      expect(res.ratio).toBeCloseTo(contrastRatio(color, chosen), 6);
      expect(contrastRatio(color, chosen)).toBeGreaterThanOrEqual(contrastRatio(color, other));
    }
  });
});

describe('resolveBrandTheme — el texto RENDERIZADO es legible sobre su relleno', () => {
  it('--primary-foreground cumple AA sobre --primary para toda marca representativa', () => {
    for (const hex of BRAND_PRIMARIES) {
      const theme = resolveBrandTheme({ primaryColor: hex, secondaryColor: null })!;
      const ratio = contrastRatio(
        parseTriple(theme['--primary']),
        parseTriple(theme['--primary-foreground'])
      );
      expect(ratio).toBeGreaterThanOrEqual(WCAG_AA_TEXT);
    }
  });

  it('--accent-foreground es SIEMPRE el más legible de los dos textos del sistema', () => {
    for (const hex of BRAND_PRIMARIES) {
      const theme = resolveBrandTheme({ primaryColor: hex, secondaryColor: null })!;
      const accent = parseTriple(theme['--accent']);
      const chosen = parseTriple(theme['--accent-foreground']);
      // El foreground del acento es uno de los dos tokens del sistema...
      const isLight = chosen.l === SYSTEM_LIGHT_TEXT.l;
      const other = isLight ? SYSTEM_DARK_TEXT : SYSTEM_LIGHT_TEXT;
      // ...y es el que MÁS contrasta con el acento (elección por WCAG, no asumida).
      expect(contrastRatio(accent, chosen)).toBeGreaterThanOrEqual(contrastRatio(accent, other));
    }
  });

  it('the flagship CTA fill clears AA even where the muted accent tone sits just under it', () => {
    // El --accent es un mid-tone DELIBERADO para estados activos sutiles: su mejor
    // texto queda algo por debajo de AA (≈ 4.30), mientras que el RELLENO de CTA
    // (--primary, la superficie que realmente lleva texto) cumple holgado (≈ 7.13).
    // El texto del acento sigue siendo el más legible posible. Prueba de
    // CARACTERIZACIÓN: si se re-calibra el acento, esta cifra debe revisarse.
    const theme = resolveBrandTheme({ primaryColor: '#cc9433', secondaryColor: null })!;
    const accentRatio = contrastRatio(
      parseTriple(theme['--accent']),
      parseTriple(theme['--accent-foreground'])
    );
    const primaryRatio = contrastRatio(
      parseTriple(theme['--primary']),
      parseTriple(theme['--primary-foreground'])
    );
    expect(accentRatio).toBeCloseTo(4.3, 1);
    expect(primaryRatio).toBeGreaterThanOrEqual(WCAG_AA_TEXT);
  });
});
