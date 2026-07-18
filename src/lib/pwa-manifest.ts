// Marca PWA en RUNTIME para Salón OS (multi-tenant: un mismo build servido por varios
// subdominios). El manifest ESTÁTICO (public/manifest.webmanifest) es NEUTRO e
// instalable por sí mismo; una vez resuelto el salón, aquí construimos un manifest
// por-tenant (nombre, theme_color, iconos) y lo enchufamos al <link rel="manifest">
// como Blob, además de actualizar theme-color y apple-touch-icon.
//
// Es BEST-EFFORT. Ver README (sección PWA) para la limitación consciente: iOS y el
// manifest del PRIMER render (antes de que corra JS) no reciben la marca por-tenant;
// una instalación 100% por-salón en todas las plataformas exige servir el manifest por
// subdominio o hacer builds por-tenant.
//
// La parte PURA (`buildSalonManifest`) es 100% testeable sin DOM; `applySalonPwaBranding`
// es la fina capa de I/O sobre el documento, toda guardada y reversible.

/** Datos de marca del salón que necesita la capa PWA (subconjunto de SalonBranding). */
export interface PwaBrandingInput {
  name: string;
  primaryColor: string;
  logoUrl: string | null;
}

/** Fondo/tema neutro por defecto (coincide con el theme-color estático de index.html). */
export const NEUTRAL_THEME_COLOR = '#1a1610';

/** Icono neutro por defecto, siempre válido para instalabilidad (SVG servido estático). */
export const DEFAULT_ICON_PATH = '/icon.svg';

/** Forma mínima (parcial) de un Web App Manifest; suficiente para lo que generamos. */
export interface WebAppManifest {
  name: string;
  short_name: string;
  description: string;
  lang: string;
  dir: 'ltr';
  start_url: string;
  scope: string;
  display: 'standalone';
  orientation: 'portrait';
  background_color: string;
  theme_color: string;
  icons: Array<{ src: string; sizes: string; type?: string; purpose?: string }>;
}

/** Normaliza un color de marca a un `theme_color` válido (`#rgb`/`#rrggbb`), o el neutro. */
export function normalizeThemeColor(raw: string | null | undefined): string {
  const v = (raw ?? '').trim();
  if (/^#?[0-9a-fA-F]{3}$/.test(v) || /^#?[0-9a-fA-F]{6}$/.test(v)) {
    return v.startsWith('#') ? v : `#${v}`;
  }
  return NEUTRAL_THEME_COLOR;
}

/** short_name recomendado ≤ 12 caracteres: usa el nombre o su primera palabra recortada. */
export function shortNameFor(name: string): string {
  const n = (name ?? '').trim() || 'Staff';
  if (n.length <= 12) return n;
  const firstWord = n.split(/\s+/)[0];
  return (firstWord.length <= 12 ? firstWord : firstWord.slice(0, 12)).trim();
}

/**
 * Construye el Web App Manifest por-tenant a partir de la marca del salón. PURO: sin DOM
 * ni red. El icono neutro por defecto va SIEMPRE al final para garantizar instalabilidad
 * aunque el salón no tenga logo (o su URL falle); si hay logo, se ofrece primero.
 */
export function buildSalonManifest(branding: PwaBrandingInput): WebAppManifest {
  const name = (branding.name ?? '').trim() || 'Salón';
  const icons: WebAppManifest['icons'] = [];
  if (branding.logoUrl) {
    icons.push({ src: branding.logoUrl, sizes: 'any', purpose: 'any' });
  }
  icons.push({
    src: DEFAULT_ICON_PATH,
    sizes: 'any',
    type: 'image/svg+xml',
    purpose: 'any maskable',
  });

  return {
    name: `${name} · Staff`,
    short_name: shortNameFor(name),
    description: `Panel interno del equipo de ${name}.`,
    lang: 'es',
    dir: 'ltr',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: NEUTRAL_THEME_COLOR,
    theme_color: normalizeThemeColor(branding.primaryColor),
    icons,
  };
}

// ── Capa de I/O sobre el documento (no testeada por unidad; toda guardada) ──────────

function upsertMeta(name: string, content: string): () => void {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  const created = !el;
  const prev = el?.getAttribute('content') ?? null;
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute('name', name);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
  return () => {
    if (created) el?.remove();
    else if (prev !== null) el?.setAttribute('content', prev);
  };
}

function upsertIconLink(rel: string, href: string): () => void {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  const created = !el;
  const prev = el?.getAttribute('href') ?? null;
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', rel);
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
  return () => {
    if (created) el?.remove();
    else if (prev !== null) el?.setAttribute('href', prev);
  };
}

/**
 * Aplica la marca del salón al documento: manifest por-tenant (Blob), theme-color y, si
 * el salón trae logo, apple-touch-icon. Devuelve una función que revierte TODO (restaura
 * el manifest estático, el theme-color previo, los iconos y revoca el Blob URL).
 * Segura fuera del navegador (SSR/tests): si no hay `document`, es un no-op.
 */
export function applySalonPwaBranding(branding: PwaBrandingInput): () => void {
  if (typeof document === 'undefined') return () => {};

  const manifest = buildSalonManifest(branding);
  const cleanups: Array<() => void> = [];

  // 1) Manifest por-tenant como Blob, sustituyendo el href del <link rel="manifest">.
  const link = document.head.querySelector<HTMLLinkElement>('link[rel="manifest"]');
  if (link) {
    const prevHref = link.getAttribute('href');
    let blobUrl: string | null = null;
    try {
      const blob = new Blob([JSON.stringify(manifest)], { type: 'application/manifest+json' });
      blobUrl = URL.createObjectURL(blob);
      link.setAttribute('href', blobUrl);
    } catch {
      blobUrl = null; // sin soporte de Blob/URL: dejamos el manifest estático intacto.
    }
    cleanups.push(() => {
      if (prevHref) link.setAttribute('href', prevHref);
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    });
  }

  // 2) Color de tema de la barra del sistema.
  cleanups.push(upsertMeta('theme-color', manifest.theme_color));

  // 3) Icono de "añadir a pantalla de inicio" (iOS/Android) desde el logo del salón.
  if (branding.logoUrl) {
    cleanups.push(upsertIconLink('apple-touch-icon', branding.logoUrl));
  }

  return () => {
    for (const undo of cleanups.reverse()) undo();
  };
}
