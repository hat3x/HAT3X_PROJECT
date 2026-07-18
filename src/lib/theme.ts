// Puente PURO entre el color de marca del salón (hex, tal cual lo guarda Salón OS en
// salons.primary_color) y los design tokens de Tailwind, que se consumen como
// `hsl(var(--token))` con tripletes "H S% L%". Sin este puente, el color del salón
// resuelto en runtime no pintaría nada: los tokens están fijados en index.css.
//
// Módulo sin efectos ni DOM: recibe un hex y devuelve el mapa de variables CSS que
// `salon-context.tsx` aplica sobre <html>. 100% testeable sin mocks.

export interface Hsl {
  /** Matiz 0–360. */ h: number;
  /** Saturación 0–100. */ s: number;
  /** Luminosidad 0–100. */ l: number;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** Parsea "#rgb" | "#rrggbb" (con o sin '#', case-insensitive) a {r,g,b} 0–255, o null. */
function parseHex(hex: string): { r: number; g: number; b: number } | null {
  const raw = (hex ?? '').trim().replace(/^#/, '');
  const full =
    raw.length === 3
      ? raw
          .split('')
          .map((c) => c + c)
          .join('')
      : raw;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

/** Convierte un color hex a HSL (h 0–360, s/l 0–100 redondeados), o null si no es válido. */
export function hexToHsl(hex: string): Hsl | null {
  const rgb = parseHex(hex);
  if (!rgb) return null;
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  let s = 0;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    switch (max) {
      case r:
        h = ((g - b) / d) % 6;
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      default:
        h = (r - g) / d + 4;
        break;
    }
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
}

/** Formatea un HSL como el triplet que consume Tailwind: "H S% L%". */
export function hslTriplet({ h, s, l }: Hsl): string {
  return `${h} ${s}% ${l}%`;
}

/** Devuelve el mismo tono con la luminosidad desplazada (clamp 0–100). */
function shiftLightness(hsl: Hsl, delta: number): Hsl {
  return { ...hsl, l: clamp(Math.round(hsl.l + delta), 0, 100) };
}

/**
 * Elige el foreground (negro/blanco, como triplet HSL) que MÁS contrasta con el color
 * dado, usando la luminancia relativa WCAG. El cruce black↔white cae en L≈0.179, así que
 * los amarillos/dorados reciben texto oscuro y los tonos oscuros texto claro.
 */
export function readableForeground(rgb: { r: number; g: number; b: number }): string {
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const luminance = 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
  return luminance > 0.179 ? '0 0% 10%' : '0 0% 98%';
}

/**
 * Deriva de un color de marca (hex) el conjunto de variables CSS de marca que la app
 * pinta. Devuelve null si el hex no es válido (→ el llamador conserva el tema por
 * defecto). Solo toca los tokens de MARCA (primary/accent/gold/sidebar + gradiente y
 * sombra dorada); los neutros (fondo, card, borde…) se mantienen.
 */
export function deriveSalonTheme(primaryHex: string): Record<string, string> | null {
  const rgb = parseHex(primaryHex);
  const hsl = hexToHsl(primaryHex);
  if (!rgb || !hsl) return null;

  const primary = hslTriplet(hsl);
  const light = hslTriplet(shiftLightness(hsl, 15));
  const dark = hslTriplet(shiftLightness(hsl, -15));
  const muted = hslTriplet({
    h: hsl.h,
    s: clamp(Math.round(hsl.s * 0.5), 0, 100),
    l: clamp(hsl.l - 25, 0, 100),
  });
  const accent = hslTriplet(shiftLightness(hsl, -10));
  const foreground = readableForeground(rgb);

  return {
    '--primary': primary,
    '--primary-foreground': foreground,
    '--ring': primary,
    '--accent': accent,
    '--accent-foreground': foreground,
    '--gold': primary,
    '--gold-light': light,
    '--gold-dark': dark,
    '--gold-muted': muted,
    '--sidebar-primary': primary,
    '--sidebar-primary-foreground': foreground,
    '--sidebar-ring': primary,
    '--gradient-gold': `linear-gradient(135deg, hsl(${primary}), hsl(${light}))`,
    '--shadow-gold': `0 4px 20px -4px hsl(${primary} / 0.25)`,
  };
}
