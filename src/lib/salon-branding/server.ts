/**
 * Marca (white-label) del salón — capa de datos de SERVIDOR (FASE 4A → 4B).
 *
 * CONSUME el backend de productización ya construido (FASE 4A); NO crea tablas ni
 * buckets. Superficie:
 *   · Lectura — `getActiveSalonBranding()` lee `public.salon_branding` del salón
 *     activo con la SESIÓN autenticada (RLS `members_select_salon_branding`).
 *   · Logo   — `uploadActiveSalonLogo` / `removeActiveSalonLogo` suben/quitan el
 *     fichero en el bucket `salon-logos` bajo la convención `{salon_id}/logo.<ext>`
 *     y persisten la URL pública en `salon_branding.logo_url`.
 *   · Colores — `updateActiveSalonColors` valida el hex EN SERVIDOR (mensaje legible
 *     antes de que dispare el CHECK de la BD) y hace upsert de la fila 1:1.
 *   · Gating — `getActiveSalonBrandingForApp(feature)` lee `salon_features` con la
 *     misma semántica que `app.salon_has_feature` (vía `@/lib/salon-features`) para
 *     que las PWA cliente/staff decidan en runtime si operar y con qué marca pintarse.
 *
 * ── Seguridad ────────────────────────────────────────────────────────────────
 * Todo pasa por el cliente RLS de la SESIÓN: las políticas de FASE 4A ya restringen
 * la ESCRITURA de `salon_branding` y del bucket a owner/manager (`app.has_salon_role`),
 * así que NO se usa el cliente admin (no hace falta bypasear RLS; sería reducir la
 * defensa). Además, como en `@/app/(dashboard)/ajustes/datos/actions`, se comprueba el
 * rol en TS (`canManageSettings`) para devolver un 401/403 LEGIBLE antes de topar con
 * la RLS. USO EXCLUSIVO DE SERVIDOR (cookies de sesión, `next/cache`).
 */
import { revalidatePath } from "next/cache";

import { canManageSettings, getActiveMembership } from "@/lib/salon";
import { salonHasFeature } from "@/lib/salon-features";
import { createClient } from "@/lib/supabase/server";
import type { Database, SalonFeature, TablesInsert } from "@/types/database";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  ALLOWED_LOGO_MIME_TYPES,
  BrandingError,
  DEFAULT_PRIMARY_COLOR,
  MAX_LOGO_BYTES,
  SALON_LOGOS_BUCKET,
  assertValidHexColor,
  buildLogoObjectPath,
  isAllowedLogoMime,
  logoExtensionForMime,
  normalizeSecondaryColor,
  type SalonBranding,
} from "./branding";

export { BrandingError } from "./branding";
export type { SalonBranding } from "./branding";

/** Gate de entitlements del salón activo (conveniencia para los consumidores). */
export { activeSalonHasFeature } from "@/lib/salon";

type SessionClient = SupabaseClient<Database>;

/** Columnas que devuelven las lecturas/escrituras (fila completa de la marca). */
const BRANDING_COLUMNS =
  "salon_id, logo_url, primary_color, secondary_color, created_at, updated_at";

/**
 * Rutas que renderizan la marca del salón y deben purgarse tras una escritura. Hoy la
 * página de edición (Ajustes → Marca, FASE 4B); a medida que el panel/apps se pinten
 * con la marca en runtime, se ampliará esta lista.
 */
export const BRANDING_REVALIDATE_PATHS = ["/ajustes/marca"] as const;

function revalidateBranding(): void {
  for (const path of BRANDING_REVALIDATE_PATHS) {
    revalidatePath(path);
  }
}

// -----------------------------------------------------------------------------
// Autorización (cliente RLS de la sesión)
// -----------------------------------------------------------------------------

interface ManageContext {
  salonId: string;
  supabase: SessionClient;
}

/**
 * Exige sesión + rol owner/manager sobre el salón activo, y devuelve un cliente RLS
 * para operar. Defensa en profundidad: la RLS de FASE 4A ya restringe la escritura a
 * owner/manager; aquí se anticipa un 401/403 LEGIBLE.
 */
async function requireBrandingManager(): Promise<ManageContext> {
  const membership = await getActiveMembership();
  if (membership === null) {
    throw new BrandingError("unauthorized", 401, "No tienes un salón asignado.");
  }
  if (!canManageSettings(membership.role)) {
    throw new BrandingError(
      "forbidden",
      403,
      "No tienes permiso para editar la marca del salón.",
    );
  }
  return { salonId: membership.salonId, supabase: createClient() };
}

// -----------------------------------------------------------------------------
// Lectura
// -----------------------------------------------------------------------------

/** Lee la fila de marca de `salonId` con el cliente dado. `null` si aún no existe. */
async function readSalonBranding(
  supabase: SessionClient,
  salonId: string,
): Promise<SalonBranding | null> {
  const { data, error } = await supabase
    .from("salon_branding")
    .select(BRANDING_COLUMNS)
    .eq("salon_id", salonId)
    .maybeSingle();

  if (error !== null) {
    throw new BrandingError("internal", 500, "No se pudo cargar la marca del salón.");
  }
  return data;
}

/**
 * Marca del salón ACTIVO del usuario autenticado (sesión + RLS). Devuelve la fila, o
 * `null` si no hay sesión/salón o el salón aún no tiene marca personalizada (en cuyo
 * caso la app pinta con {@link DEFAULT_PRIMARY_COLOR}).
 */
export async function getActiveSalonBranding(): Promise<SalonBranding | null> {
  const membership = await getActiveMembership();
  if (membership === null) return null;
  const supabase = createClient();
  return readSalonBranding(supabase, membership.salonId);
}

// -----------------------------------------------------------------------------
// Escritura (upsert 1:1)
// -----------------------------------------------------------------------------

/**
 * Upsert de la fila 1:1 (`onConflict: salon_id`). PostgREST solo actualiza las
 * columnas presentes en el payload → omitir `logo_url` en un cambio de color lo
 * PRESERVA (y viceversa). Traduce el CHECK del color (23514) y el deny de RLS (42501)
 * a errores de dominio legibles por si algo esquiva la validación TS.
 */
async function upsertBranding(
  supabase: SessionClient,
  payload: TablesInsert<"salon_branding">,
): Promise<SalonBranding> {
  const { data, error } = await supabase
    .from("salon_branding")
    .upsert(payload, { onConflict: "salon_id" })
    .select(BRANDING_COLUMNS)
    .single();

  if (error !== null || data === null) {
    if (error?.code === "23514") {
      throw new BrandingError(
        "invalid_request",
        400,
        "El color debe estar en formato #RRGGBB.",
      );
    }
    if (error?.code === "42501") {
      throw new BrandingError(
        "forbidden",
        403,
        "No tienes permiso para editar la marca del salón.",
      );
    }
    throw new BrandingError("internal", 500, "No se pudo guardar la marca del salón.");
  }
  return data;
}

/** Entrada de {@link updateActiveSalonColors}. */
export interface SalonColorsInput {
  /** Color principal `#rrggbb` (opcional: si se omite, se conserva el actual). */
  primaryColor?: string;
  /**
   * Color de acento `#rrggbb`. `undefined` = no tocar; `null`/vacío = limpiar el
   * acento; un hex se valida y se guarda.
   */
  secondaryColor?: string | null;
}

/**
 * Escribe los colores de marca del salón activo con VALIDACIÓN DE HEX EN SERVIDOR: si
 * el formato no es `#rrggbb`, lanza `BrandingError('invalid_request', 400, …)` con un
 * mensaje LEGIBLE ANTES de tocar la BD (así el usuario nunca ve el críptico CHECK de
 * Postgres). Owner/manager; upsert de la fila 1:1 (crea `primary_color` con el default
 * si aún no había fila). Revalida las rutas de marca.
 */
export async function updateActiveSalonColors(
  input: SalonColorsInput,
): Promise<SalonBranding> {
  const hasPrimary = input.primaryColor !== undefined;
  const hasSecondary = input.secondaryColor !== undefined;
  if (!hasPrimary && !hasSecondary) {
    throw new BrandingError("invalid_request", 400, "No hay cambios de color que guardar.");
  }

  // Validación de formato ANTES de la BD (mensaje legible antes del CHECK).
  const primaryColor = hasPrimary
    ? assertValidHexColor(input.primaryColor as string, "El color principal")
    : undefined;
  const secondaryColor = normalizeSecondaryColor(input.secondaryColor);

  const { salonId, supabase } = await requireBrandingManager();
  const current = await readSalonBranding(supabase, salonId);

  const payload: TablesInsert<"salon_branding"> = {
    salon_id: salonId,
    // NOT NULL: al crear la fila por primera vez hay que dar un primario; en un update
    // que solo toca el secundario, reafirmar el actual es un no-op.
    primary_color: primaryColor ?? current?.primary_color ?? DEFAULT_PRIMARY_COLOR,
  };
  if (hasSecondary) {
    payload.secondary_color = secondaryColor ?? null;
  }

  const branding = await upsertBranding(supabase, payload);
  revalidateBranding();
  return branding;
}

// -----------------------------------------------------------------------------
// Logo (bucket salon-logos)
// -----------------------------------------------------------------------------

/** Entrada de {@link uploadActiveSalonLogo}. */
export interface SalonLogoUpload {
  /** Bytes de la imagen (lo que devuelve `await file.arrayBuffer()` en un action). */
  data: ArrayBuffer | Uint8Array | Blob;
  /** MIME real de la imagen; debe estar en {@link ALLOWED_LOGO_MIME_TYPES}. */
  contentType: string;
}

/** Resultado de subir un logo: la fila de marca actualizada + ruta y URL pública. */
export interface SalonLogoResult {
  branding: SalonBranding;
  /** Clave del objeto en el bucket: `{salon_id}/logo.<ext>`. */
  path: string;
  /** URL pública servida por Storage (la que queda en `logo_url`). */
  publicUrl: string;
}

/** Longitud en bytes de un cuerpo aceptado por el SDK de Storage. */
function byteLengthOf(data: ArrayBuffer | Uint8Array | Blob): number {
  if (data instanceof Uint8Array) return data.byteLength;
  if (data instanceof ArrayBuffer) return data.byteLength;
  return data.size; // Blob
}

/**
 * Borra, best-effort, los logos PREVIOS del salón cuyo nombre difiera del que se acaba
 * de subir (p. ej. al cambiar de `logo.png` a `logo.webp`). No aborta la subida si la
 * limpieza falla: el `logo_url` ya apunta al objeto correcto; un huérfano solo ocupa
 * espacio, no rompe nada.
 */
async function removeOtherLogoObjects(
  supabase: SessionClient,
  salonId: string,
  keepName: string,
): Promise<void> {
  try {
    const { data: objects } = await supabase.storage
      .from(SALON_LOGOS_BUCKET)
      .list(salonId);
    const stale = (objects ?? [])
      .filter((object) => object.name !== keepName)
      .map((object) => `${salonId}/${object.name}`);
    if (stale.length > 0) {
      await supabase.storage.from(SALON_LOGOS_BUCKET).remove(stale);
    }
  } catch (error) {
    console.error("[salon-branding] no se pudieron limpiar logos previos", {
      salonId,
      error,
    });
  }
}

/**
 * Sube (o REEMPLAZA) el logo del salón activo en el bucket `salon-logos` bajo la clave
 * canónica `{salon_id}/logo.<ext>` (upsert = sobrescribe), limpia logos previos con
 * otra extensión, y persiste la URL pública en `salon_branding.logo_url`. Valida MIME
 * y tamaño (≤ 2 MiB) EN SERVIDOR con mensajes legibles. Owner/manager. Revalida.
 */
export async function uploadActiveSalonLogo(
  input: SalonLogoUpload,
): Promise<SalonLogoResult> {
  const contentType = (input.contentType ?? "").trim().toLowerCase();
  if (!isAllowedLogoMime(contentType)) {
    throw new BrandingError(
      "invalid_request",
      400,
      `Formato de imagen no admitido. Usa: ${ALLOWED_LOGO_MIME_TYPES.join(", ")}.`,
    );
  }
  const size = byteLengthOf(input.data);
  if (size === 0) {
    throw new BrandingError("invalid_request", 400, "El archivo del logo está vacío.");
  }
  if (size > MAX_LOGO_BYTES) {
    throw new BrandingError(
      "invalid_request",
      400,
      "El logo supera el tamaño máximo de 2 MiB.",
    );
  }

  const { salonId, supabase } = await requireBrandingManager();
  const current = await readSalonBranding(supabase, salonId);

  const extension = logoExtensionForMime(contentType);
  const path = buildLogoObjectPath(salonId, extension);

  const { error: uploadError } = await supabase.storage
    .from(SALON_LOGOS_BUCKET)
    .upload(path, input.data, { contentType, upsert: true, cacheControl: "3600" });
  if (uploadError !== null) {
    throw new BrandingError("internal", 500, `No se pudo subir el logo: ${uploadError.message}`);
  }

  await removeOtherLogoObjects(supabase, salonId, `logo.${extension}`);

  const publicUrl = supabase.storage
    .from(SALON_LOGOS_BUCKET)
    .getPublicUrl(path).data.publicUrl;

  const branding = await upsertBranding(supabase, {
    salon_id: salonId,
    // primary_color es NOT NULL: si aún no había fila, se crea con el default.
    primary_color: current?.primary_color ?? DEFAULT_PRIMARY_COLOR,
    logo_url: publicUrl,
  });

  revalidateBranding();
  return { branding, path, publicUrl };
}

/**
 * Quita el logo del salón activo: borra los objetos del salón en el bucket y pone
 * `salon_branding.logo_url = null` (solo si ya existía fila; sin fila no hay nada que
 * limpiar). Owner/manager. Revalida. Devuelve la fila resultante, o `null` si el salón
 * no tenía marca.
 */
export async function removeActiveSalonLogo(): Promise<SalonBranding | null> {
  const { salonId, supabase } = await requireBrandingManager();

  const { data: objects, error: listError } = await supabase.storage
    .from(SALON_LOGOS_BUCKET)
    .list(salonId);
  if (listError === null && objects !== null && objects.length > 0) {
    const paths = objects.map((object) => `${salonId}/${object.name}`);
    const { error: removeError } = await supabase.storage
      .from(SALON_LOGOS_BUCKET)
      .remove(paths);
    if (removeError !== null) {
      throw new BrandingError("internal", 500, `No se pudo borrar el logo: ${removeError.message}`);
    }
  }

  const current = await readSalonBranding(supabase, salonId);
  if (current === null) {
    return null;
  }

  const { data, error } = await supabase
    .from("salon_branding")
    .update({ logo_url: null })
    .eq("salon_id", salonId)
    .select(BRANDING_COLUMNS)
    .single();
  if (error !== null || data === null) {
    if (error?.code === "42501") {
      throw new BrandingError(
        "forbidden",
        403,
        "No tienes permiso para editar la marca del salón.",
      );
    }
    throw new BrandingError("internal", 500, "No se pudo actualizar la marca del salón.");
  }

  revalidateBranding();
  return data;
}

// -----------------------------------------------------------------------------
// Gating (entitlements) para las apps white-label
// -----------------------------------------------------------------------------

/** Marca del salón activo + si el add-on `feature` está contratado y activo. */
export interface SalonBrandingForApp {
  /** `true` si el salón tiene el add-on `feature` (fila presente y `enabled=true`). */
  enabled: boolean;
  /** Marca del salón (o `null` si aún no la ha personalizado). */
  branding: SalonBranding | null;
}

/**
 * Resuelve, en UNA llamada, la marca del salón activo y el estado de un add-on. Lee
 * `salon_features` con la MISMA semántica que `app.salon_has_feature` (opt-in: fila
 * presente y `enabled=true`) vía {@link salonHasFeature}. Pensado para que las PWA
 * cliente/staff (FASE 4B) decidan en runtime si operar (`enabled`) y con qué identidad
 * pintarse (`branding`). Sin sesión/salón ⇒ `{ enabled: false, branding: null }`
 * (deny-by-default de negocio, igual que el gate SQL).
 */
export async function getActiveSalonBrandingForApp(
  feature: SalonFeature,
): Promise<SalonBrandingForApp> {
  const membership = await getActiveMembership();
  if (membership === null) {
    return { enabled: false, branding: null };
  }
  const supabase = createClient();
  const [enabled, branding] = await Promise.all([
    salonHasFeature(supabase, membership.salonId, feature),
    readSalonBranding(supabase, membership.salonId),
  ]);
  return { enabled, branding };
}
