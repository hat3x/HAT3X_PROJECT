// Resolución del salón en RUNTIME (Salón OS · white-label multi-tenant).
//
// Este módulo es PURO: sin dependencias de React ni de Supabase, para poder
// probarlo en aislamiento (ver salon.test.ts). La parte con efectos (llamar a
// la RPC, cachear, pintar la pantalla de carga/error) vive en:
//   · salon-branding.ts  → fetchSalonBranding(slug) (envuelve la RPC)
//   · salon-context.tsx   → <SalonProvider> / useSalon() (React)
//
// El identificador del salón (salon_id) YA NO se lee de VITE_SALON_ID: se deriva
// del salón resuelto en runtime (branding.id). VITE_SALON_SLUG queda solo como
// FALLBACK de último recurso cuando el host no trae subdominio y no hay ?salon.

/** Origen del que se resolvió el slug del salón, por orden de prioridad. */
export type SalonSlugSource = 'subdomain' | 'query' | 'env' | 'none';

export interface ResolveSalonSlugInput {
  /** `window.location.hostname`, p.ej. `jotabarber.salonos.app`. */
  hostname: string;
  /** `window.location.search`, p.ej. `?salon=jotabarber`. */
  search?: string;
  /** Fallback de build-time (`VITE_SALON_SLUG`). */
  envSlug?: string | null;
}

export interface ResolvedSalonSlug {
  /** El slug resuelto, o null si no se pudo resolver por ninguna vía. */
  slug: string | null;
  source: SalonSlugSource;
}

/** Un slug es kebab-case en minúsculas: coincide con la CHECK de `salons.slug`. */
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Etiqueta DNS/slug válida: kebab en minúsculas y ≤ 63 caracteres. */
const isValidSlug = (v: string): boolean => v.length > 0 && v.length <= 63 && SLUG_RE.test(v);

/** Normaliza una entrada libre (query/env) a un candidato de slug, o null. */
const normalizeSlug = (raw: string | null | undefined): string | null => {
  if (!raw) return null;
  const v = raw.trim().toLowerCase();
  return isValidSlug(v) ? v : null;
};

const IPV4_RE = /^\d{1,3}(?:\.\d{1,3}){3}$/;

/**
 * Extrae el subdominio-salón del host, o null si el host no lo tiene.
 * Ignora localhost, *.localhost, IPs (v4/v6), un `www` inicial y el apex desnudo.
 *
 * Heurística de apex: se asume un dominio raíz de DOS etiquetas (p.ej.
 * `salonos.app`), que es el del despliegue; un host con > 2 etiquetas tiene
 * subdominio (la primera). No se usa la Public Suffix List: para un apex de
 * 3+ niveles (p.ej. `example.co.uk`) esto trataría `example` como subdominio.
 * Fuera de alcance a propósito, porque el despliegue es `*.salonos.app`.
 */
const extractSubdomain = (rawHost: string): string | null => {
  // Normaliza: minúsculas, sin espacios, sin puerto, sin punto final (FQDN).
  let host = rawHost.trim().toLowerCase();
  if (!host) return null;
  host = host.replace(/:\d+$/, '').replace(/\.$/, '');
  if (!host) return null;

  // IPs → sin subdominio. IPv6 lleva ':' (o corchetes); IPv4 es d.d.d.d.
  if (host.includes(':') || host.startsWith('[')) return null;
  if (IPV4_RE.test(host)) return null;

  // localhost y *.localhost (túneles/dev) → sin subdominio.
  if (host === 'localhost') return null;
  const allLabels = host.split('.');
  if (allLabels[allLabels.length - 1] === 'localhost') return null;

  // Ignora un `www` inicial y reevalúa: `www.jotabarber.salonos.app` → jotabarber;
  // `www.salonos.app` → apex.
  const labels = allLabels[0] === 'www' ? allLabels.slice(1) : allLabels;

  // Apex desnudo (≤ 2 etiquetas: `salonos.app`, o una sola etiqueta) → sin subdominio.
  if (labels.length <= 2) return null;

  const candidate = labels[0];
  return isValidSlug(candidate) ? candidate : null;
};

/**
 * Resuelve el slug del salón siguiendo la prioridad del white-label:
 *   1) subdominio del host (`jotabarber.salonos.app` → `jotabarber`)
 *   2) parámetro `?salon=<slug>`
 *   3) fallback `VITE_SALON_SLUG` (pasado como `envSlug`)
 * Función PURA: no lee `window` ni `import.meta`; recibe todo por parámetro.
 */
export function resolveSalonSlug(input: ResolveSalonSlugInput): ResolvedSalonSlug {
  const fromSubdomain = extractSubdomain(input.hostname);
  if (fromSubdomain) return { slug: fromSubdomain, source: 'subdomain' };

  const params = new URLSearchParams(input.search ?? '');
  const fromQuery = normalizeSlug(params.get('salon'));
  if (fromQuery) return { slug: fromQuery, source: 'query' };

  const fromEnv = normalizeSlug(input.envSlug ?? null);
  if (fromEnv) return { slug: fromEnv, source: 'env' };

  return { slug: null, source: 'none' };
}

/** Fila cruda que devuelve la RPC `public.get_salon_branding` (snake_case). */
export interface SalonBrandingRow {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  primary_color: string;
  secondary_color: string | null;
}

/** Branding del salón resuelto, en camelCase, para consumir en la app. */
export interface SalonBranding {
  /** `salons.id` (uuid opaco). De aquí se deriva el salon_id de todas las lecturas. */
  id: string;
  /** Nombre comercial del salón. */
  name: string;
  /** Slug público (kebab). */
  slug: string;
  /** URL del logo, o null si el salón aún no tiene branding. */
  logoUrl: string | null;
  /** Color principal `#rrggbb` (la RPC garantiza un valor por defecto). */
  primaryColor: string;
  /** Color de acento `#rrggbb`, o null. */
  secondaryColor: string | null;
}

/**
 * Mapea la fila cruda de la RPC al shape camelCase de la app.
 * Devuelve null cuando la RPC no trae fila (slug inexistente o salón inactivo)
 * o —defensivamente— si la fila no trae `id`.
 */
export function mapSalonBrandingRow(
  row: SalonBrandingRow | null | undefined
): SalonBranding | null {
  if (!row || !row.id) return null;
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    logoUrl: row.logo_url,
    primaryColor: row.primary_color,
    secondaryColor: row.secondary_color,
  };
}

// La derivación del tema white-label (color de marca → tokens de acento, con el
// foreground elegido por CONTRASTE WCAG AA) vive ahora en salon-theme.ts
// (resolveBrandTheme). Este módulo se queda solo con la resolución del slug y el
// mapeo de la fila de branding: una única fuente de verdad para el tema.
