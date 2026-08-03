/**
 * Marca (white-label) — TEMATIZADO DINÁMICO del panel (sub-3 + sub-5). HELPERS PUROS.
 *
 * Traduce la fila `salon_branding` (colores en hex `#rrggbb`) al lenguaje del sistema
 * de diseño: los tokens de `globals.css` son TRIPLETES HSL en formato shadcn
 * (`H S% L%`, consumidos con `hsl(var(--token))`). Este módulo:
 *
 *   1. Convierte el hex de la marca a HSL (`hexToHsl`).
 *   2. Deriva los tokens de acento —`--primary`, `--ring`, `--info`, `--accent`…—
 *      para tema claro Y oscuro, EMULANDO las relaciones ya calibradas del default
 *      violeta (el foreground se elige por CONTRASTE WCAG; el primario se aclara en
 *      oscuro igual que hace la paleta base 262 83% 58% → 262 84% 68%).
 *   3. Emite un `<style>` con reglas ACOTADAS a la región del panel
 *      (`[data-salon-brand]`), de modo que la marca NO toca `:root` global: las
 *      páginas sin salón (login) conservan intacto el tema premium por defecto.
 *
 * Rebrand Kairos — SIN fallback por sector: cuando el tenant no tiene `salon_branding`,
 * NO se re-tiñe nada; el panel hereda el default de marca de `globals.css` (primary =
 * tinta, acento = latón `--brand`). `resolveSectorFallbackTheme` devuelve siempre `null`.
 *
 * SIN dependencias de red ni de React: funciones puras testeables (mismo espíritu que
 * `@/lib/salon-branding/branding`). La capa de servidor decide CUÁNDO pintar; aquí solo
 * se decide CÓMO. Si no hay marca válida ⇒ `null` ⇒ el layout no inyecta nada y el
 * tema por defecto de Kairos (tinta + latón) manda: [[salon-branding-server]].
 */
import type { SalonSector } from "@/types/database";

import { HEX_COLOR_PATTERN, type SalonBranding } from "./branding";

/**
 * Atributo que marca la REGIÓN tematizable (el wrapper del layout del panel). Las
 * variables CSS se declaran SOBRE ese elemento y HEREDAN a todo el subárbol (nav,
 * botones, anillos de foco…). Fuente única compartida por el CSS y por el layout.
 */
export const BRAND_SCOPE_ATTR = "data-salon-brand";

/** Triplete HSL en formato shadcn: `H S% L%` (sin `hsl()`), listo para `hsl(var())`. */
export type HslTriple = string;

/** Color en el espacio HSL con canales enteros (h 0–360, s/l 0–100). */
export interface Hsl {
  h: number;
  s: number;
  l: number;
}

/** Conjunto de tokens (variable CSS → triplete) para un modo de tema. */
export type ThemeVars = Record<string, HslTriple>;

/** Overrides de marca para tema claro y oscuro. */
export interface BrandTheme {
  light: ThemeVars;
  dark: ThemeVars;
}

// ─────────────────────────────────────────────────────────────────────────────
// Conversión de color (puro)
// ─────────────────────────────────────────────────────────────────────────────

const clamp = (value: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, value));

/** Formatea un triplete a `H S% L%` con canales redondeados (formato shadcn). */
function triple(h: number, s: number, l: number): HslTriple {
  return `${Math.round(h)} ${Math.round(s)}% ${Math.round(l)}%`;
}

/**
 * `#rrggbb` → HSL entero, o `null` si el hex no es válido (misma regex que el CHECK de
 * la BD, {@link HEX_COLOR_PATTERN}). Algoritmo estándar sRGB→HSL; el matiz se normaliza
 * a [0,360). Ej.: `#7c3aed` → `{ h: 262, s: 83, l: 58 }` (el violeta del default).
 */
export function hexToHsl(hex: string): Hsl | null {
  const value = typeof hex === "string" ? hex.trim() : "";
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

/**
 * HSL → `#rrggbb`. Convierte el foreground elegido (un {@link Hsl} del sistema) al hex
 * que la VISTA PREVIA del formulario pinta con estilos inline —donde no hay variables
 * CSS del panel—, para que el texto de la maqueta coincida EXACTAMENTE con la decisión
 * de contraste real del panel (una sola fuente de verdad para el color de texto legible).
 */
export function hslToHex(hsl: Hsl): string {
  const toByte = (channel: number): string =>
    clamp(Math.round(channel * 255), 0, 255)
      .toString(16)
      .padStart(2, "0");
  const [r, g, b] = hslToRgb(hsl);
  return `#${toByte(r)}${toByte(g)}${toByte(b)}`;
}

/**
 * Luminancia relativa WCAG de un color HSL (0 = negro, 1 = blanco). Se usa para elegir
 * un texto (foreground) que CONTRASTE de verdad con el color de marca, en lugar de
 * asumir blanco: una marca amarilla necesita texto oscuro; una añil, texto claro.
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

/**
 * Umbral de contraste WCAG 2.1 nivel AA para TEXTO NORMAL (4.5:1). Es la vara con la que
 * se decide si el color de marca, usado como relleno de botones/encabezados, es legible;
 * por debajo de él la UI de marca avisa (sin bloquear el guardado).
 */
export const WCAG_AA_TEXT = 4.5;

// ─────────────────────────────────────────────────────────────────────────────
// Derivación de tokens
// ─────────────────────────────────────────────────────────────────────────────

/*
 * Foregrounds candidatos = los MISMOS tokens que ya usa la paleta base en cada modo
 * (espejo de `--primary-foreground` / `--foreground` de globals.css), para que el texto
 * sobre la marca se sienta parte del sistema y no un parche. Se guardan como {@link Hsl}
 * —no como triplete— porque necesitamos su luminancia REAL para medir el contraste: no
 * son blanco/negro puros (`40 40% 99%` es hueso; `30 10% 15%` es casi negro cálido), así
 * que el punto de corte por luminancia no basta para garantizar AA.
 */
const LIGHT_TEXT_ON_LIGHT: Hsl = { h: 40, s: 40, l: 99 }; // claro sobre marca (tema claro)
const DARK_TEXT_ON_LIGHT: Hsl = { h: 30, s: 10, l: 15 }; // oscuro sobre marca (tema claro)
const LIGHT_TEXT_ON_DARK: Hsl = { h: 40, s: 22, l: 96 }; // claro sobre marca (tema oscuro)
const DARK_TEXT_ON_DARK: Hsl = { h: 30, s: 12, l: 10 }; // oscuro sobre marca (tema oscuro)

/** Foreground elegido sobre un relleno: color, su contraste real y si es texto claro/oscuro. */
interface Foreground {
  hsl: Hsl;
  ratio: number;
  text: "light" | "dark";
}

/** Entre el texto claro y el oscuro, devuelve el que MÁS contraste da sobre `bg` (empate ⇒ claro). */
function bestForeground(bg: Hsl, light: Hsl, dark: Hsl): Foreground {
  const lightRatio = contrastRatio(bg, light);
  const darkRatio = contrastRatio(bg, dark);
  return lightRatio >= darkRatio
    ? { hsl: light, ratio: lightRatio, text: "light" }
    : { hsl: dark, ratio: darkRatio, text: "dark" };
}

/**
 * Elige el foreground legible sobre `color` en el modo dado MAXIMIZANDO el contraste WCAG
 * (no por un umbral de luminancia aproximado): así el panel SIEMPRE pinta el texto más
 * legible posible sobre la marca —una elección de color nunca puede dejar un botón con
 * texto ilegible—, y `ratio` deja además saber si ese máximo alcanza AA.
 */
function readableForeground(color: Hsl, mode: "light" | "dark"): Foreground {
  return mode === "light"
    ? bestForeground(color, LIGHT_TEXT_ON_LIGHT, DARK_TEXT_ON_LIGHT)
    : bestForeground(color, LIGHT_TEXT_ON_DARK, DARK_TEXT_ON_DARK);
}

/** Formatea un {@link Hsl} como triplete shadcn (`H S% L%`) para inyectarlo como variable. */
function tripleOf(hsl: Hsl): HslTriple {
  return triple(hsl.h, hsl.s, hsl.l);
}

/**
 * Núcleo PURO de derivación de tema a partir de colores hex. Comparte la lógica entre
 * `resolveBrandTheme` (fila de BD) y `resolveSectorFallbackTheme` (default de sector).
 * Devuelve `null` si el hex primario es inválido.
 */
function resolveHexBrandTheme(
  primaryHex: string,
  secondaryHex: string | null,
): BrandTheme | null {
  const primary = hexToHsl(primaryHex);
  if (primary === null) return null;

  // Matiz del acento: secundario válido si lo hay; si no, el propio primario.
  const secondary = secondaryHex ? hexToHsl(secondaryHex) : null;
  const accent = secondary ?? primary;

  // Primario: en claro tal cual (fidelidad de marca); en oscuro se aclara para seguir
  // siendo un acento visible sobre fondo charcoal (paralelo al +10 L del default).
  const primaryLight = triple(primary.h, primary.s, primary.l);
  const primaryDarkHsl: Hsl = {
    h: primary.h,
    s: primary.s,
    l: clamp(primary.l + 10, 56, 82),
  };
  const primaryDark = triple(primaryDarkHsl.h, primaryDarkHsl.s, primaryDarkHsl.l);

  const light: ThemeVars = {
    "--primary": primaryLight,
    "--primary-foreground": tripleOf(readableForeground(primary, "light").hsl),
    "--ring": primaryLight,
    "--info": primaryLight,
    "--info-foreground": tripleOf(readableForeground(primary, "light").hsl),
    // Lavado claro del acento (paridad con `262 60% 96%` / `262 55% 34%`).
    "--accent": triple(accent.h, clamp(accent.s, 20, 65), 96),
    "--accent-foreground": triple(accent.h, clamp(accent.s, 30, 85), 34),
  };

  const dark: ThemeVars = {
    "--primary": primaryDark,
    "--primary-foreground": tripleOf(readableForeground(primaryDarkHsl, "dark").hsl),
    "--ring": primaryDark,
    "--info": primaryDark,
    "--info-foreground": tripleOf(readableForeground(primaryDarkHsl, "dark").hsl),
    // Tinte profundo del acento (paridad con `262 40% 22%` / `262 80% 88%`).
    "--accent": triple(accent.h, clamp(accent.s, 20, 55), 22),
    "--accent-foreground": triple(accent.h, clamp(accent.s, 40, 90), 88),
  };

  return { light, dark };
}

/**
 * Traduce la fila de marca a overrides de tema, o `null` cuando NO hay que pintar nada
 * (sin fila, o color primario inválido ⇒ fallback limpio al tema por defecto). El color
 * primario alimenta botones/anillo/info; el ACENTO sutil (hover/estado activo) toma el
 * matiz del color SECUNDARIO si existe, o del primario en su defecto — conservando la
 * ESTRUCTURA de lavado claro / tinte profundo del default (nunca un bloque saturado que
 * arruine la legibilidad de los estados). No reescribe la UI premium: solo re-tinta.
 */
export function resolveBrandTheme(branding: SalonBranding | null): BrandTheme | null {
  if (branding === null) return null;
  return resolveHexBrandTheme(
    branding.primary_color,
    branding.secondary_color ?? null,
  );
}

/**
 * Fallback de sector — RETIRADO con el rebrand a Kairos: ya NO se re-tiñe el panel por
 * sector. El default de marca (primary = TINTA, acento = LATÓN `--brand`) vive en
 * `globals.css` y el panel lo HEREDA cuando el tenant no tiene `salon_branding` propio.
 *
 * Devuelve siempre `null` ("no inyectar overrides"): así login y panel comparten el
 * mismo default Kairos, sin per-sector. SOLO el branding explícito del tenant
 * (`resolveBrandTheme`) sobrescribe `--primary`/`--accent`/`--ring` en el subárbol del
 * panel (white-label intacto). Se conserva la firma `(sector)` para no tocar llamadores.
 */
export function resolveSectorFallbackTheme(_sector: SalonSector): BrandTheme | null {
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Evaluación de contraste (accesibilidad de la UI de marca)
// ─────────────────────────────────────────────────────────────────────────────

/** Veredicto de legibilidad de un color de marca usado como RELLENO (botón/encabezado). */
export interface ContrastAssessment {
  /** Mejor contraste WCAG alcanzable con el texto claro u oscuro del sistema (`[1, 21]`). */
  ratio: number;
  /** `true` si `ratio >= WCAG_AA_TEXT` (4.5:1): el color es legible con AA. */
  meetsAA: boolean;
  /** Qué texto gana el contraste: `"light"` (hueso) u `"dark"` (casi negro). */
  text: "light" | "dark";
}

/**
 * Evalúa si un color de marca es legible al usarse como RELLENO (fondo de botones,
 * encabezados y estados activos del panel) con el mejor texto claro/oscuro del sistema.
 *
 * Se mide en TEMA CLARO a propósito: es la restricción vinculante —en oscuro el primario
 * se aclara a L ≥ 56 % ({@link resolveBrandTheme}), donde el texto oscuro siempre contrasta
 * de sobra—; solo un tono MEDIO en claro puede quedar por debajo de AA. Devuelve `null`
 * si el hex no es válido (no hay nada que evaluar). La UI usa `meetsAA` para AVISAR sin
 * bloquear: aun por debajo del umbral, el panel ya pinta el texto de mayor contraste.
 */
export function assessFillLegibility(hex: string): ContrastAssessment | null {
  const color = hexToHsl(hex);
  if (color === null) return null;
  const { ratio, text } = readableForeground(color, "light");
  return { ratio, meetsAA: ratio >= WCAG_AA_TEXT, text };
}

/**
 * Hex del texto legible sobre el relleno `hex` (mejor contraste claro/oscuro), o `null`
 * si el color no es válido. Comparte la MISMA decisión que el panel para que la vista
 * previa del formulario no diverja de lo que verá el salón.
 */
export function readableForegroundHex(
  hex: string,
  mode: "light" | "dark" = "light",
): string | null {
  const color = hexToHsl(hex);
  if (color === null) return null;
  return hslToHex(readableForeground(color, mode).hsl);
}

// ─────────────────────────────────────────────────────────────────────────────
// Serialización a CSS (acotada al subárbol del panel)
// ─────────────────────────────────────────────────────────────────────────────

/*
 * Selectores acotados a la región de marca. La especificidad está ELEGIDA a propósito:
 *   · `:root [data-salon-brand]`      → (0,2,0): gana a `:root`/`.dark` (0,1,0).
 *   · `:root.dark [data-salon-brand]` → (0,3,0): gana al bloque claro en modo oscuro.
 * Así el orden de aparición del `<style>` es IRRELEVANTE (no dependemos de que vaya
 * después de globals.css): la cascada la decide la especificidad.
 */
const LIGHT_SELECTOR = `:root [${BRAND_SCOPE_ATTR}]`;
const DARK_SELECTOR = `:root.dark [${BRAND_SCOPE_ATTR}]`;

function ruleBlock(selector: string, vars: ThemeVars): string {
  const body = Object.entries(vars)
    .map(([name, value]) => `${name}:${value}`)
    .join(";");
  return `${selector}{${body}}`;
}

/**
 * Serializa los overrides a texto CSS con las dos reglas acotadas. Todos los valores son
 * TRIPLETES numéricos generados por este módulo (nunca texto libre del usuario), por lo
 * que el resultado es seguro para inyectar con `dangerouslySetInnerHTML`.
 */
export function buildBrandThemeCss(theme: BrandTheme): string {
  return `${ruleBlock(LIGHT_SELECTOR, theme.light)}\n${ruleBlock(DARK_SELECTOR, theme.dark)}`;
}
