// Resolución del salón en runtime (Salón OS es multi-tenant: UN código servido por
// subdominio). Este módulo es PURO y TESTEABLE: no importa el cliente de Supabase ni
// toca la red ni el DOM. Toda la entrada llega por argumento. Aquí vive únicamente la
// lógica DETERMINISTA de:
//   1) elegir el SLUG del salón a partir del entorno (host + query + fallback), y
//   2) mapear la fila cruda de la RPC pública get_salon_branding a un objeto de marca
//      normalizado del que se DERIVA el salon_id de la app (en vez de VITE_SALON_ID).
//
// La llamada real a la RPC vive en `salon-branding.ts`; el gating/theming en
// `salon-context.tsx`. Separar la parte pura permite testearla sin mocks de red.

/** Color principal por defecto (idéntico al default de salon_branding.primary_color). */
export const DEFAULT_PRIMARY_COLOR = '#111827';

/**
 * Slug de reserva por defecto, leído de VITE_SALON_SLUG. Es el ÚLTIMO recurso de la
 * cadena de prioridad (tras el subdominio y `?salon=`). En despliegues por subdominio
 * no se usa; sirve en local/preview donde no hay un subdominio de tenant real.
 *
 * NEUTRO por diseño: si VITE_SALON_SLUG no está definida queda '' y la app NO asume
 * ningún salón concreto (no hay slug cableado en el código) → el SalonProvider muestra
 * la pantalla controlada "salón no disponible". Cada despliegue fija su propio slug en
 * el `.env` (este usa "denueveanueve").
 */
export const FALLBACK_SALON_SLUG: string =
  (import.meta.env.VITE_SALON_SLUG as string | undefined)?.trim().toLowerCase() ?? '';

export interface SalonSlugSources {
  /** Host de la URL (window.location.hostname), p. ej. "denueveanueve.salonos.app". */
  host: string;
  /** Query string cruda (window.location.search), p. ej. "?salon=denueveanueve". */
  search: string;
  /** Slug de reserva a usar si ni el subdominio ni `?salon=` resuelven nada. */
  fallbackSlug: string;
}

/** Normaliza un slug candidato: minúsculas + sin espacios. Devuelve '' si queda vacío. */
export function normalizeSlug(raw: string | null | undefined): string {
  return (raw ?? '').trim().toLowerCase();
}

// Etiquetas de host que NUNCA son un subdominio de tenant.
const NON_TENANT_LABELS = new Set(['www']);

/** ¿El host es una IP (v4 o v6)? Las IPs no tienen subdominio de tenant. */
function isIpHost(host: string): boolean {
  // IPv4 (cuatro octetos). No valida el rango 0-255: basta con descartarlo como tenant.
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) return true;
  // IPv6: contiene ':' (con o sin corchetes). Ningún hostname DNS normal lleva ':'.
  if (host.includes(':')) return true;
  return false;
}

/** ¿El host es localhost o un subdominio de localhost (p. ej. foo.localhost)? */
function isLocalhost(host: string): boolean {
  return host === 'localhost' || host.endsWith('.localhost');
}

/**
 * Extrae el subdominio de TENANT del host, o null si no hay uno utilizable.
 *
 * Se IGNORAN (→ null): localhost / *.localhost, IPs (v4/v6), el apex (dominio+TLD,
 * p. ej. "salon.com") y el prefijo "www" (www.salon.com se trata como apex). Con un
 * subdominio real ("denueveanueve.salonos.app") devuelve la PRIMERA etiqueta.
 *
 * Limitación consciente: los sufijos públicos multi-etiqueta (p. ej. "co.uk") no se
 * resuelven con la Public Suffix List; "salon.example.co.uk" devolvería "salon"
 * (correcto), pero "example.co.uk" devolvería "example" (falso positivo). Los dominios
 * de despliegue de Salón OS usan un TLD de una sola etiqueta, así que la heurística de
 * "≥3 etiquetas ⇒ hay subdominio" es correcta para ellos; si algún día se sirviera bajo
 * un sufijo compuesto, habría que introducir aquí la PSL.
 */
export function subdomainFromHost(rawHost: string): string | null {
  const host = normalizeSlug(rawHost).replace(/\.$/, ''); // quita el punto final del FQDN
  if (!host) return null;
  if (isLocalhost(host)) return null;
  if (isIpHost(host)) return null;

  const labels = host.split('.').filter(Boolean);
  if (labels[0] === 'www') labels.shift(); // "www" no es un tenant

  // Apex (dominio + TLD ⇒ 2 etiquetas) o menos: no hay subdominio.
  if (labels.length < 3) return null;

  const sub = labels[0];
  if (!sub || NON_TENANT_LABELS.has(sub)) return null;
  return sub;
}

/** Lee el slug del parámetro `?salon=<slug>` de la query, o null si no viene. */
export function salonFromSearch(search: string): string | null {
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(search ?? '');
  } catch {
    return null;
  }
  const slug = normalizeSlug(params.get('salon'));
  return slug || null;
}

/**
 * Resuelve el SLUG del salón según la prioridad EXACTA de la tarea:
 *   1) subdominio del host   (denueveanueve.salonos.app → "denueveanueve")
 *   2) parámetro `?salon=<slug>`
 *   3) fallback (VITE_SALON_SLUG)
 * Determinista y sin efectos: toda la entrada llega por argumento (100% testeable).
 */
export function resolveSalonSlug({ host, search, fallbackSlug }: SalonSlugSources): string {
  return subdomainFromHost(host) ?? salonFromSearch(search) ?? normalizeSlug(fallbackSlug);
}

/** Conveniencia: resuelve el slug desde window.location con el fallback del entorno. */
export function resolveSalonSlugFromLocation(
  location: Pick<Location, 'hostname' | 'search'> = window.location,
  fallbackSlug: string = FALLBACK_SALON_SLUG,
): string {
  return resolveSalonSlug({ host: location.hostname, search: location.search, fallbackSlug });
}

// ── Marca del salón ──────────────────────────────────────────────────────────────

/** Fila cruda tal y como la devuelve public.get_salon_branding (6 columnas seguras). */
export interface SalonBrandingRow {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  primary_color: string | null;
  secondary_color: string | null;
}

/** Marca del salón ya normalizada para la app (camelCase, color por defecto aplicado). */
export interface SalonBranding {
  /** salons.id — de aquí se DERIVA el salon_id de la app (en vez de VITE_SALON_ID). */
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  primaryColor: string;
  secondaryColor: string | null;
}

/**
 * Mapea la respuesta de la RPC a `SalonBranding`. Acepta la forma que devuelve
 * supabase-js para una función `RETURNS TABLE`: un array de filas (o null/undefined).
 * Devuelve null si no hay fila válida (slug inexistente o salón inactivo ⇒ conjunto
 * vacío, sin error): ese null es lo que dispara la pantalla de error controlada.
 */
export function mapBrandingRow(
  data: SalonBrandingRow[] | SalonBrandingRow | null | undefined,
): SalonBranding | null {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || !row.id) return null;
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    logoUrl: row.logo_url ?? null,
    primaryColor: row.primary_color ?? DEFAULT_PRIMARY_COLOR,
    secondaryColor: row.secondary_color ?? null,
  };
}
