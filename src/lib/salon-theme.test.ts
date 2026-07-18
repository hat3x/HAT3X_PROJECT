import { describe, it, expect } from 'vitest';
import {
  hexToHsl,
  contrastRatio,
  assessFillLegibility,
  resolveBrandTheme,
  WCAG_AA_TEXT,
  type Hsl,
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
});
