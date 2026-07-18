// Tema dinámico (white-label) de la app CLIENTE — HELPERS PUROS de color y contraste.
//
// Traduce los colores de marca del salón (`primary_color` / `secondary_color`, en hex
// `#rrggbb`) al lenguaje del sistema de diseño de esta app: los tokens de `index.css`
// son TRIPLETES HSL en formato shadcn (`H S% L%`, consumidos con `hsl(var(--token))`).
// Este módulo:
//
//   1. Convierte el hex de marca a HSL (`hexToHsl`).
//   2. Deriva el juego de tokens de acento —`--primary`, `--ring`, la familia `--gold`,
//      `--accent`, el gradiente y la sombra dorada— REPRODUCIENDO las relaciones ya
//      calibradas del tema dorado por defecto (cuando el primario es el oro base
//      `38 60% 50%`, los tokens salen EXACTAMENTE como el default: re-tinta, no reescribe).
//   3. Elige el color de TEXTO sobre el acento por CONTRASTE WCAG real (no por asumir
//      claro/oscuro): una marca clara pide texto oscuro; una oscura, texto claro.
//
// Es PURO: sin dependencias de React ni de Supabase, para poder probarlo en aislamiento
// (ver salon-theme.test.ts). La parte con efectos (aplicar las variables al DOM, titular
// la pestaña) vive en salon-context.tsx (<SalonProvider>). Si NO hay marca válida
// (branding nulo o color primario mal formado) ⇒ `null` ⇒ el proveedor no inyecta nada y
// el tema dorado por defecto de index.css manda: fallback limpio, sin pantallazos ni crash.

/**
 * Patrón hex `#rrggbb` (6 dígitos, con almohadilla, case-insensitive). MISMA regex que
 * el CHECK de `salon_branding.primary_color` en Salón OS: una sola convención de color.
 * Sin atajo de 3 dígitos ni alfa de 8.
 */
export const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

/** Umbral de contraste WCAG 2.1 nivel AA para TEXTO NORMAL (4.5:1). */
export const WCAG_AA_TEXT = 4.5;

/** Color en el espacio HSL con canales enteros (h 0–360, s/l 0–100). */
export interface Hsl {
  h: number;
  s: number;
  l: number;
}

/** Triplete HSL en formato shadcn: `H S% L%` (sin `hsl()`), listo para `hsl(var())`. */
export type HslTriple = string;

/** Conjunto de overrides (variable CSS → valor) que re-tinta el tema de la app. */
export type ThemeVars = Record<string, string>;

// ─────────────────────────────────────────────────────────────────────────────
// Conversión de color (puro)
// ─────────────────────────────────────────────────────────────────────────────

const clamp = (value: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, value));

/** Formatea un triplete a `H S% L%` con canales redondeados (formato shadcn). */
function triple(h: number, s: number, l: number): HslTriple {
  return `${Math.round(h)} ${Math.round(s)}% ${Math.round(l)}%`;
}

/** Serializa un {@link Hsl} como triplete shadcn (`H S% L%`). */
function tripleOf(hsl: Hsl): HslTriple {
  return triple(hsl.h, hsl.s, hsl.l);
}

/**
 * `#rrggbb` → HSL entero, o `null` si el hex no es válido ({@link HEX_COLOR_PATTERN}).
 * Algoritmo estándar sRGB→HSL; el matiz se normaliza a [0,360). Ej.: `#c8a97e` → un
 * dorado cálido. Devolver `null` (en vez de lanzar) permite un fallback limpio arriba.
 */
export function hexToHsl(hex: string): Hsl | null {
  const value = typeof hex === 'string' ? hex.trim() : '';
  if (!HEX_COLOR_PATTERN.test(value)) return null;

  const r = parseInt(value.slice(1, 3), 16) / 255;
  const g = parseInt(value.slice(3, 5), 16) / 255;
  const b = parseInt(value.slice(5, 7), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const l = (max + min) / 2;

  let h = 0;
  let s = 0;
  if (delta !== 0) {
    s = delta / (1 - Math.abs(2 * l - 1));
    if (max === r) h = ((g - b) / delta) % 6;
    else if (max === g) h = (b - r) / delta + 2;
    else h = (r - g) / delta + 4;
    h *= 60;
    if (h < 0) h += 360;
  }

  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
}

/** HSL (canales 0–360 / 0–100) → RGB normalizado [0,1] (auxiliar de la luminancia). */
function hslToRgb({ h, s, l }: Hsl): [number, number, number] {
  const sat = s / 100;
  const lig = l / 100;
  const c = (1 - Math.abs(2 * lig - 1)) * sat;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;
  if (hp < 1) [r, g] = [c, x];
  else if (hp < 2) [r, g] = [x, c];
  else if (hp < 3) [g, b] = [c, x];
  else if (hp < 4) [g, b] = [x, c];
  else if (hp < 5) [r, b] = [x, c];
  else [r, b] = [c, x];
  const m = lig - c / 2;
  return [r + m, g + m, b + m];
}

// ─────────────────────────────────────────────────────────────────────────────
// Contraste WCAG (accesibilidad del texto sobre el acento)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Luminancia relativa WCAG de un color HSL (0 = negro, 1 = blanco). Base para elegir un
 * texto que CONTRASTE de verdad con el color de marca en lugar de asumir claro u oscuro.
 */
function relativeLuminance(hsl: Hsl): number {
  const linear = (channel: number): number =>
    channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  const [r, g, b] = hslToRgb(hsl);
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/**
 * Razón de contraste WCAG 2.1 entre dos colores (fórmula 1.4.3): `(L1+0.05)/(L2+0.05)`
 * con L = luminancia relativa, siempre el más claro sobre el más oscuro. Devuelve un
 * número en `[1, 21]` (1 = idénticos, 21 = negro↔blanco). Es la MEDIDA REAL que decide
 * qué texto es legible sobre la marca, en vez de asumir blanco o mirar solo la luminancia.
 */
export function contrastRatio(a: Hsl, b: Hsl): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

/*
 * Candidatos de texto sobre la marca = ESPEJO de los tokens de esta app (tema oscuro):
 *   · claro  ≈ `--foreground` (`40 20% 90%`) — hueso cálido, ligeramente más brillante.
 *   · oscuro ≈ `--primary-foreground` / `--background` (`30 10% 6%`) — casi negro cálido.
 * Se guardan como {@link Hsl} —no como triplete— porque necesitamos su luminancia REAL
 * para medir contraste: no son blanco/negro puros, así que un corte por luminancia no
 * basta para garantizar AA.
 */
const LIGHT_TEXT: Hsl = { h: 40, s: 20, l: 92 };
const DARK_TEXT: Hsl = { h: 30, s: 10, l: 6 };

/** Veredicto de legibilidad de un color de marca usado como RELLENO (botón/acento). */
export interface ContrastAssessment {
  /** Mejor contraste WCAG alcanzable con el texto claro u oscuro del sistema (`[1, 21]`). */
  ratio: number;
  /** `true` si `ratio >= WCAG_AA_TEXT` (4.5:1): el color es legible con AA. */
  meetsAA: boolean;
  /** Qué texto gana el contraste: `"light"` (hueso) u `"dark"` (casi negro). */
  text: 'light' | 'dark';
}

/** Foreground elegido sobre un relleno: su HSL, el contraste real y si es claro/oscuro. */
interface Foreground extends ContrastAssessment {
  hsl: Hsl;
}

/**
 * Entre el texto claro y el oscuro del sistema, elige el que MÁS contraste da sobre
 * `color` (empate ⇒ claro). Así la app SIEMPRE pinta el texto más legible posible sobre
 * la marca —una elección de color nunca deja un botón con texto ilegible—, y `ratio`
 * deja saber además si ese máximo alcanza AA.
 */
function readableForeground(color: Hsl): Foreground {
  const lightRatio = contrastRatio(color, LIGHT_TEXT);
  const darkRatio = contrastRatio(color, DARK_TEXT);
  return lightRatio >= darkRatio
    ? { hsl: LIGHT_TEXT, ratio: lightRatio, meetsAA: lightRatio >= WCAG_AA_TEXT, text: 'light' }
    : { hsl: DARK_TEXT, ratio: darkRatio, meetsAA: darkRatio >= WCAG_AA_TEXT, text: 'dark' };
}

/**
 * Evalúa si un color de marca es legible al usarse como RELLENO (fondo de botones y
 * estados activos) con el mejor texto claro/oscuro del sistema. Devuelve `null` si el
 * hex no es válido (no hay nada que evaluar). La UI puede usar `meetsAA` para AVISAR sin
 * bloquear: aun por debajo del umbral, ya se pinta el texto de mayor contraste posible.
 */
export function assessFillLegibility(hex: string): ContrastAssessment | null {
  const color = hexToHsl(hex);
  if (color === null) return null;
  const { ratio, meetsAA, text } = readableForeground(color);
  return { ratio, meetsAA, text };
}

// ─────────────────────────────────────────────────────────────────────────────
// Derivación de tokens de marca (tema oscuro único de la app cliente)
// ─────────────────────────────────────────────────────────────────────────────

/** Colores de marca del salón (subconjunto estructural de `SalonBranding` de salon.ts). */
export interface BrandColors {
  /** Color principal `#rrggbb` (la RPC garantiza un valor por defecto). */
  primaryColor: string;
  /** Color de acento `#rrggbb`, o null si el salón no lo definió. */
  secondaryColor?: string | null;
}

/**
 * Traduce los colores de marca al juego de overrides que re-tinta el tema, o `null`
 * cuando NO hay que pintar nada (branding nulo, o color primario inválido ⇒ fallback
 * limpio al tema dorado por defecto de index.css). El PRIMARIO alimenta botones, anillo
 * de foco y toda la familia dorada (`text-gold`, `border-gold`, gradiente y sombra); el
 * ACENTO sutil (estado activo) toma el matiz del SECUNDARIO si es válido, o del primario
 * en su defecto — conservando la ESTRUCTURA del default (nunca un bloque saturado que
 * arruine la legibilidad). No reescribe la UI: solo re-tinta las variables existentes.
 *
 * Con el primario = oro base (`#cc9433` ≈ `38 60% 50%`), la salida coincide con los
 * valores ya escritos a mano en index.css (misma resta/suma de S y L), de modo que el
 * salón insignia se ve idéntico y cualquier otro salón hereda esas MISMAS relaciones.
 */
export function resolveBrandTheme(branding: BrandColors | null): ThemeVars | null {
  if (branding === null) return null;

  const primary = hexToHsl(branding.primaryColor);
  if (primary === null) return null;

  // Matiz del acento: secundario válido si lo hay; si no, el propio primario.
  const secondary = branding.secondaryColor ? hexToHsl(branding.secondaryColor) : null;
  const accentSource = secondary ?? primary;

  const primaryTriple = tripleOf(primary);
  const fg = readableForeground(primary);

  // Familia dorada: mismas relaciones que index.css sobre el oro base
  //   gold-light = S−5, L+15 ; gold-dark = S−10, L−15 ; gold-muted = S/2, L/2.
  const goldLight = triple(primary.h, clamp(primary.s - 5, 0, 100), clamp(primary.l + 15, 0, 92));
  const goldDark = triple(primary.h, clamp(primary.s - 10, 0, 100), clamp(primary.l - 15, 0, 100));
  const goldMuted = triple(primary.h, clamp(primary.s * 0.5, 0, 100), clamp(primary.l * 0.5, 0, 100));

  // Acento: paridad con el default `38 45% 40%` a partir del oro (S·0.75, L−10), tomando
  // el matiz del secundario cuando exista para diferenciar el estado activo.
  const accent = {
    h: accentSource.h,
    s: clamp(accentSource.s * 0.75, 25, 65),
    l: clamp(accentSource.l - 10, 25, 55),
  };
  const accentFg = readableForeground(accent);

  // Gradiente y sombra dorados: reconstruidos desde el primario para que los realces
  // (.gradient-gold / .shadow-gold, usados en botones y banners) sigan a la marca.
  const gradientTo = triple(clamp(primary.h + 4, 0, 360), primary.s, clamp(primary.l + 10, 0, 92));

  return {
    '--primary': primaryTriple,
    '--primary-foreground': tripleOf(fg.hsl),
    '--ring': primaryTriple,
    '--gold': primaryTriple,
    '--gold-light': goldLight,
    '--gold-dark': goldDark,
    '--gold-muted': goldMuted,
    '--accent': tripleOf(accent),
    '--accent-foreground': tripleOf(accentFg.hsl),
    '--gradient-gold': `linear-gradient(135deg, hsl(${primaryTriple}), hsl(${gradientTo}))`,
    '--shadow-gold': `0 4px 20px -4px hsl(${primaryTriple} / 0.25)`,
  };
}
