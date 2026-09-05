import { describe, it, expect } from 'vitest';
import { deriveSalonTheme, readableForeground } from './theme';
import { DEFAULT_PRIMARY_COLOR } from './salon';

// Verificación WCAG AA REAL del tema derivado. `theme.test.ts` comprueba que
// `readableForeground` ELIGE negro/blanco; aquí vamos un paso más allá y comprobamos que
// el par (color, texto) que la app pinta CUMPLE de verdad el ratio de contraste WCAG. El
// ratio se computa de forma INDEPENDIENTE aquí (sin reutilizar el código de producción)
// para que el test sea un juez externo, no un espejo de la implementación.
//
// ALCANCE (importante): el puente de tema garantiza AA para TEXTO NORMAL (≥ 4.5:1) sobre
// la PALETA DE MARCA que la app realmente pinta (default navy + dorado de denueveanueve y
// tonos de marca plausibles). NO lo garantiza para cualquier hex arbitrario: como el texto
// es 10%/98% (no negro/blanco puros) y el umbral de cruce es 0.179, un color cromático de
// luminancia media muy saturado (rojo/azul/verde puros) puede quedar por debajo de 4.5:1.
// Ese límite se DOCUMENTA abajo con un test de caracterización, no se oculta.

// Umbrales WCAG 2.1.
const AA_NORMAL = 4.5; // texto normal
const AA_LARGE = 3.0; // texto grande / componentes de UI

// ── Ground truth WCAG (independiente de theme.ts) ────────────────────────────────

/** Parsea el triplet Tailwind "H S% L%" a números. */
function parseHslTriplet(triplet: string): { h: number; s: number; l: number } {
  const [h, s, l] = triplet.replace(/%/g, '').trim().split(/\s+/).map(Number);
  return { h, s, l };
}

/** HSL (h 0–360, s/l 0–100) → RGB 0–255. */
function hslToRgb({ h, s, l }: { h: number; s: number; l: number }): {
  r: number;
  g: number;
  b: number;
} {
  const S = s / 100;
  const L = l / 100;
  const c = (1 - Math.abs(2 * L - 1)) * S;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r1 = 0;
  let g1 = 0;
  let b1 = 0;
  if (hp < 1) [r1, g1, b1] = [c, x, 0];
  else if (hp < 2) [r1, g1, b1] = [x, c, 0];
  else if (hp < 3) [r1, g1, b1] = [0, c, x];
  else if (hp < 4) [r1, g1, b1] = [0, x, c];
  else if (hp < 5) [r1, g1, b1] = [x, 0, c];
  else [r1, g1, b1] = [c, 0, x];
  const m = L - c / 2;
  return {
    r: Math.round((r1 + m) * 255),
    g: Math.round((g1 + m) * 255),
    b: Math.round((b1 + m) * 255),
  };
}

/** Luminancia relativa WCAG de un RGB. */
function relativeLuminance({ r, g, b }: { r: number; g: number; b: number }): number {
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** Ratio de contraste WCAG entre dos RGB (siempre ≥ 1). */
function contrastRatio(
  a: { r: number; g: number; b: number },
  b: { r: number; g: number; b: number },
): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Contraste entre dos tripletes HSL "H S% L%". */
function tripletContrast(bgTriplet: string, fgTriplet: string): number {
  return contrastRatio(hslToRgb(parseHslTriplet(bgTriplet)), hslToRgb(parseHslTriplet(fgTriplet)));
}

// Los dos colores de foreground que puede devolver readableForeground.
const DARK_TEXT = '0 0% 10%';
const LIGHT_TEXT = '0 0% 98%';

// Paleta de marca que la app REALMENTE pinta: el default del salón, el dorado real de
// denueveanueve y tonos de marca plausibles. Todos cumplen AA en primary y accent.
const BRAND_PALETTE = [
  DEFAULT_PRIMARY_COLOR, // #111827 navy (default de salon_branding.primary_color)
  '#c8a24b', // dorado denueveanueve
  '#7c3aed', // violeta
  '#facc15', // amarillo de marca
  '#2d2d2d', // gris muy oscuro
  '#4a4a4a', // gris oscuro
];

describe('WCAG AA — la paleta de marca cumple el ratio en primary y accent', () => {
  it.each(BRAND_PALETTE)('%s: texto sobre primary y sobre accent cumple AA (≥ 4.5:1)', (hex) => {
    const theme = deriveSalonTheme(hex);
    expect(theme).not.toBeNull();

    // Texto sobre el color principal cumple AA.
    expect(
      tripletContrast(theme!['--primary'], theme!['--primary-foreground']),
    ).toBeGreaterThanOrEqual(AA_NORMAL);

    // Y —requisito explícito de la tarea— el texto sobre el ACENTO también cumple AA.
    expect(
      tripletContrast(theme!['--accent'], theme!['--accent-foreground']),
    ).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it('el color por defecto del salón (#111827) produce un tema accesible', () => {
    expect(DEFAULT_PRIMARY_COLOR).toBe('#111827');
    const theme = deriveSalonTheme(DEFAULT_PRIMARY_COLOR)!;
    // Navy muy oscuro → texto claro, contraste holgado.
    expect(theme['--accent-foreground']).toBe(LIGHT_TEXT);
    expect(tripletContrast(theme['--accent'], theme['--accent-foreground'])).toBeGreaterThan(
      AA_LARGE,
    );
  });

  it('el dorado real de denueveanueve (#c8a24b) es holgadamente accesible', () => {
    const theme = deriveSalonTheme('#c8a24b')!;
    // Dorado claro ⇒ texto oscuro; debe superar con margen el umbral de UI (3:1).
    expect(theme['--accent-foreground']).toBe(DARK_TEXT);
    expect(tripletContrast(theme['--accent'], theme['--accent-foreground'])).toBeGreaterThan(
      AA_LARGE,
    );
  });
});

describe('detección del color de texto problemático (se elige el accesible, no el que falla)', () => {
  it('acento CLARO (dorado): el texto blanco fallaría AA y por eso se descarta', () => {
    const theme = deriveSalonTheme('#c8a24b')!;
    const accent = theme['--accent'];

    // La opción DESCARTADA (blanco sobre dorado) es la problemática: NO llega a AA.
    expect(tripletContrast(accent, LIGHT_TEXT)).toBeLessThan(AA_NORMAL);
    // La opción ELEGIDA (texto oscuro) sí cumple AA → el problema se detectó y evitó.
    expect(theme['--accent-foreground']).toBe(DARK_TEXT);
    expect(tripletContrast(accent, theme['--accent-foreground'])).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it('acento OSCURO (navy default): el texto oscuro fallaría AA y por eso se descarta', () => {
    const theme = deriveSalonTheme(DEFAULT_PRIMARY_COLOR)!;
    const accent = theme['--accent'];

    // La opción DESCARTADA (texto oscuro sobre navy) es la problemática: NO llega a AA.
    expect(tripletContrast(accent, DARK_TEXT)).toBeLessThan(AA_NORMAL);
    // La opción ELEGIDA (texto claro) sí cumple AA.
    expect(theme['--accent-foreground']).toBe(LIGHT_TEXT);
    expect(tripletContrast(accent, theme['--accent-foreground'])).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it('color inválido/ausente se detecta → null (se conserva el tema por defecto, sin crash)', () => {
    // Entrada "problemática" en el otro sentido: un hex que no se puede interpretar. El
    // puente lo detecta y devuelve null, de modo que el llamador mantiene el tema por
    // defecto de index.css en lugar de pintar variables corruptas o lanzar.
    expect(deriveSalonTheme('')).toBeNull();
    expect(deriveSalonTheme('   ')).toBeNull();
    expect(deriveSalonTheme('rojo')).toBeNull();
    expect(deriveSalonTheme('#12')).toBeNull();
  });
});

describe('readableForeground elige el foreground de mayor contraste', () => {
  it.each(BRAND_PALETTE)('%s: el texto elegido contrasta ≥ que la alternativa', (hex) => {
    const theme = deriveSalonTheme(hex)!;
    const chosen = theme['--primary-foreground'];
    const other = chosen === DARK_TEXT ? LIGHT_TEXT : DARK_TEXT;
    expect(tripletContrast(theme['--primary'], chosen)).toBeGreaterThanOrEqual(
      tripletContrast(theme['--primary'], other),
    );
  });

  it('el foreground del tema coincide con readableForeground sobre el RGB de marca', () => {
    // El foreground que expone el tema debe ser el que decide readableForeground sobre el
    // RGB del color de marca (no una constante suelta).
    const gold = { r: 200, g: 162, b: 75 }; // #c8a24b
    expect(readableForeground(gold)).toBe(deriveSalonTheme('#c8a24b')!['--primary-foreground']);
  });
});

describe('límite conocido: colores cromáticos de luminancia media NO están garantizados a AA', () => {
  it('rojo puro (#ff0000) queda por debajo de AA normal — documenta el límite del puente 10%/98%', () => {
    // #ff0000 NO es un color de la paleta de marca. Se DOCUMENTA (no se oculta) que
    // readableForeground, al usar texto 10%/98% con umbral de cruce 0.179, no garantiza
    // 4.5:1 para cualquier hex saturado de luminancia media. Si el puente se mejora a AA
    // universal, ACTUALIZAR este test (pasará a ≥ 4.5). El contraste sigue siendo alto (~4.35),
    // por encima del umbral de texto grande/UI (3:1), así que no es inaccesible, solo < AA normal.
    const theme = deriveSalonTheme('#ff0000')!;
    const primaryContrast = tripletContrast(theme['--primary'], theme['--primary-foreground']);
    expect(primaryContrast).toBeLessThan(AA_NORMAL);
    expect(primaryContrast).toBeGreaterThan(AA_LARGE);
  });
});
