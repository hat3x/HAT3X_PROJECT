/**
 * Marca (white-label) del salón — HELPERS PUROS, constantes y contrato de errores.
 *
 * Núcleo SIN dependencias de red de la capa de branding (FASE 4A → 4B): valida
 * colores, mapea MIME→extensión y construye la clave del objeto de Storage según la
 * CONVENCIÓN DE RUTA del README (`salon-logos/{salon_id}/logo.<ext>`). Al no tocar
 * Supabase, se puede probar como funciones puras (mismo espíritu que
 * `@/lib/loyalty/points` o `@/lib/customers/normalize-phone`).
 *
 * Todas las constantes son ESPEJO de la verdad SQL de FASE 4A:
 *   · `HEX_COLOR_PATTERN` / `DEFAULT_PRIMARY_COLOR` ← `20260718110000_salon_branding.sql`
 *     (misma regex que el CHECK de `salon_branding.primary_color` y el default `#111827`).
 *   · `MAX_LOGO_BYTES` / `LOGO_MIME_EXTENSIONS` ← `20260718130000_storage_salon_logos.sql`
 *     (`file_size_limit` = 2 MiB y la lista `allowed_mime_types` del bucket).
 * Si el esquema cambia, el test de coherencia TS↔SQL lo delata.
 */
import type { SalonBranding } from "@/types/database";

export type { SalonBranding } from "@/types/database";

/** Bucket público donde viven los BYTES del logo (migración 20260718130000). */
export const SALON_LOGOS_BUCKET = "salon-logos";

/**
 * Color por defecto de la marca. ESPEJO del `default '#111827'` de
 * `salon_branding.primary_color`: cuando aún no hay fila, la app pinta con este color
 * (igual que hace el `coalesce(...,'#111827')` de `get_salon_branding`).
 */
export const DEFAULT_PRIMARY_COLOR = "#111827";

/**
 * Patrón hex `#rrggbb` (6 dígitos, con almohadilla, case-insensitive). MISMA regex
 * que el CHECK de `salon_branding` y que `professionals.color` — una sola convención
 * de color en todo el esquema. Sin atajo de 3 dígitos ni alfa de 8.
 */
export const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

/** Tamaño máximo del logo. ESPEJO del `file_size_limit` del bucket (2 MiB). */
export const MAX_LOGO_BYTES = 2_097_152;

/**
 * MIME admitidos por el bucket `salon-logos` → extensión canónica del objeto. El
 * conjunto de claves ES la lista `allowed_mime_types` de la migración; el valor es la
 * extensión con la que se nombra `{salon_id}/logo.<ext>`.
 */
export const LOGO_MIME_EXTENSIONS = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "image/avif": "avif",
} as const;

/** MIME de imagen admitido por el bucket (unión derivada del catálogo). */
export type AllowedLogoMime = keyof typeof LOGO_MIME_EXTENSIONS;

/** Lista de MIME admitidos (para validar y para mensajes de error legibles). */
export const ALLOWED_LOGO_MIME_TYPES = Object.keys(
  LOGO_MIME_EXTENSIONS,
) as AllowedLogoMime[];

/** Código de error de dominio de la marca → estado HTTP con el que traducirlo. */
export type BrandingErrorCode =
  | "unauthorized"
  | "forbidden"
  | "invalid_request"
  | "not_found"
  | "internal";

/**
 * Error de dominio de la marca, con estado HTTP asociado (patrón de
 * `LoyaltyActionError`). El borde (Server Action / Route Handler) lo traduce a su
 * respuesta; `invalid_request` (400) es el que se levanta al validar un color ANTES
 * de que la BD dispare su CHECK.
 */
export class BrandingError extends Error {
  constructor(
    public readonly code: BrandingErrorCode,
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "BrandingError";
  }
}

/** `true` si `value` es un color hex `#rrggbb` válido (tras `trim`). */
export function isValidHexColor(value: unknown): value is string {
  return typeof value === "string" && HEX_COLOR_PATTERN.test(value.trim());
}

/**
 * Valida un color hex `#rrggbb` y devuelve su forma normalizada (`trim`). Lanza
 * `BrandingError('invalid_request', 400, …)` con un mensaje LEGIBLE si no cumple —la
 * red de seguridad que evita que el usuario tope con el críptico `CHECK` de Postgres
 * (`new row ... violates check constraint`). `label` personaliza el mensaje
 * ("El color principal"/"El color secundario").
 */
export function assertValidHexColor(value: string, label = "El color"): string {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!HEX_COLOR_PATTERN.test(normalized)) {
    throw new BrandingError(
      "invalid_request",
      400,
      `${label} debe estar en formato #RRGGBB`,
    );
  }
  return normalized;
}

/** `true` si `mime` es un tipo de imagen admitido por el bucket `salon-logos`. */
export function isAllowedLogoMime(mime: string): mime is AllowedLogoMime {
  return Object.prototype.hasOwnProperty.call(LOGO_MIME_EXTENSIONS, mime);
}

/** Extensión canónica (`png|jpg|webp|svg|avif`) para un MIME admitido. */
export function logoExtensionForMime(mime: AllowedLogoMime): string {
  return LOGO_MIME_EXTENSIONS[mime];
}

/**
 * Clave del objeto dentro del bucket, según la convención del README:
 *
 *     {salon_id}/logo.<ext>
 *
 * El PRIMER segmento es SIEMPRE el `salon_id` — es lo que la política de escritura de
 * `storage.objects` usa para autorizar (`app.storage_object_salon_id(name)`). El
 * nombre canónico `logo.<ext>` implica un logo por salón (se sobrescribe con upsert).
 */
export function buildLogoObjectPath(salonId: string, extension: string): string {
  return `${salonId}/logo.${extension}`;
}

/**
 * URL del logo LISTA PARA `<img src>`, con CACHE-BUSTING por `updated_at`.
 *
 * El objeto vive SIEMPRE en la ruta canónica `{salon_id}/logo.<ext>` y se sube con
 * `upsert` + `cacheControl: 3600`. Al REEMPLAZAR el logo con la misma extensión, la
 * URL pública NO cambia → el navegador (y el CDN de Storage) sirven la imagen vieja
 * cacheada hasta 1 h y el usuario ve "el mismo logo de siempre". Sufijar `?v=updated_at`
 * cambia la URL en cada escritura (la fila bumpea `updated_at`) y fuerza la recarga.
 *
 * Es la ÚNICA vía por la que la UI debe pintar el logo (header del panel y vista previa
 * de Ajustes → Marca), para que ambos no vuelvan a divergir. Devuelve `null` si aún no
 * hay logo (la UI cae al fallback de marca genérica).
 */
export function buildLogoSrc(
  branding: Pick<SalonBranding, "logo_url" | "updated_at"> | null,
): string | null {
  const url = branding?.logo_url ?? null;
  if (url === null || url.trim() === "") return null;
  const version = branding?.updated_at ?? "";
  return `${url}?v=${encodeURIComponent(version)}`;
}

/**
 * Fusiona un color secundario entrante con su forma persistible. `undefined` = "no
 * tocar"; `null`/cadena vacía = "limpiar el acento" (→ `null`); un hex se valida.
 * Devuelve `undefined` cuando no hay cambio, o el valor (`string`/`null`) a escribir.
 */
export function normalizeSecondaryColor(
  value: string | null | undefined,
): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || (typeof value === "string" && value.trim() === "")) {
    return null;
  }
  return assertValidHexColor(value, "El color secundario");
}

/** Re-export del tipo de fila para consumidores de la capa de branding. */
export type Branding = SalonBranding;
