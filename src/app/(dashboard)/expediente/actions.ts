"use server";

/**
 * Server actions de EXPEDIENTE CLÍNICO (odontología): consentimientos
 * informados (`consents`) + imágenes/radiografías (`patient_images`).
 *
 * Mismo patrón que `planes/actions.ts` / `periodontograma/actions.ts`: gate
 * explícito de sector (odontologia) + rol en servidor, ADICIONAL a RLS,
 * porque las políticas `consents_rw`/`patient_images_rw` acotan por
 * `salon_id` pero no comprueban el sector del salón — sin este gate un
 * owner/manager de un salón de peluquería podría escribir aquí invocando la
 * Server Action directamente.
 *
 * Inmutabilidad de `consents`: el trigger `consents_guard_signed` (BD) ya
 * impide editar un consentimiento firmado/revocado; `canSignConsent`/
 * `canRevokeConsent` (`@/lib/dental/consents`) son la MISMA máquina de
 * estados comprobada aquí ANTES de tocar la BD, para devolver un error
 * legible en vez del mensaje crudo del trigger.
 *
 * Imágenes: el binario vive en el bucket PRIVADO `patient-media`
 * (`{salon_id}/{customer_id}/{uuid}.{ext}`, ver migración
 * `20260801110000_consents_images.sql`); el acceso es SIEMPRE vía signed URL
 * (`signImageUrls`), nunca `getPublicUrl` (el bucket no es público).
 */
import { getConsentTemplate, canRevokeConsent, canSignConsent, isImageModality } from "@/lib/dental/consents";
import { getActiveMembership, getActiveSalon } from "@/lib/salon";
import { createClient } from "@/lib/supabase/server";
import type {
  Consent,
  ConsentInsert,
  ConsentType,
  MemberRole,
  PatientImage,
  PatientImageInsert,
} from "@/types/database";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

const ERROR_NO_SALON = "No tienes un salón asignado.";
const ERROR_SECTOR =
  "El expediente clínico (consentimientos e imágenes) solo está disponible para salones del sector odontología.";
const ERROR_ROLE = "No tienes permiso para escribir en el expediente clínico.";

/** Roles con permiso de escritura general UNA VEZ pasado el gate de sector. */
const WRITE_ROLES: readonly MemberRole[] = ["owner", "manager", "staff"];

/** Roles con permiso de borrado de consentimientos. `staff` queda excluido. */
const DELETE_ROLES: readonly MemberRole[] = ["owner", "manager"];

/** Bucket privado de imágenes/radiografías clínicas (migración 20260801110000). */
const PATIENT_MEDIA_BUCKET = "patient-media";

/** MIME de imagen admitidos al subir (radiografías/fotos exportadas como imagen). */
const ALLOWED_IMAGE_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
type AllowedImageMime = (typeof ALLOWED_IMAGE_MIME_TYPES)[number];

/** Tamaño máximo de una imagen subida. */
const MAX_IMAGE_BYTES = 15 * 1024 * 1024; // 15 MiB

/** Segundos de validez de una signed URL de `patient-media`. */
const SIGNED_URL_TTL_SECONDS = 3600;

// ---------------------------------------------------------------------------
// Gate — defensa en profundidad (sector + rol), igual que planes/actions.ts
// ---------------------------------------------------------------------------

async function assertExpedienteAccess(
  requiredRoles: readonly MemberRole[] = WRITE_ROLES,
): Promise<{ ok: true; salonId: string } | { ok: false; error: string }> {
  const salon = await getActiveSalon();
  if (salon === null) {
    return { ok: false, error: ERROR_NO_SALON };
  }
  if (salon.sector !== "odontologia") {
    return { ok: false, error: ERROR_SECTOR };
  }

  const membership = await getActiveMembership();
  if (membership === null || !requiredRoles.includes(membership.role)) {
    return { ok: false, error: ERROR_ROLE };
  }

  return { ok: true, salonId: salon.id };
}

// ---------------------------------------------------------------------------
// createConsent
// ---------------------------------------------------------------------------

export interface CreateConsentInput {
  customerId: string;
  type: ConsentType;
  title?: string;
  body?: string;
  templateVersion?: string;
  treatmentPlanId?: string | null;
  fdiCode?: number | null;
}

/**
 * Crea un consentimiento informado en estado `'pending'`. Si `title`/`body`
 * no vienen informados, usa la plantilla por defecto de `type`
 * ({@link getConsentTemplate}) — así el profesional puede crear el registro
 * sin escribir el texto legal a mano, y sustituirlo si necesita un texto a
 * medida.
 */
export async function createConsent(input: CreateConsentInput): Promise<ActionResult<Consent>> {
  const access = await assertExpedienteAccess();
  if (!access.ok) return { ok: false, error: access.error };

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const template = getConsentTemplate(input.type);

  const payload: ConsentInsert = {
    salon_id: access.salonId,
    customer_id: input.customerId,
    type: input.type,
    title: input.title ?? template.title,
    body: input.body ?? template.body,
    template_version: input.templateVersion ?? template.version,
    treatment_plan_id: input.treatmentPlanId ?? null,
    fdi_code: input.fdiCode ?? null,
    status: "pending",
    created_by: user?.id ?? null,
  };

  const { data, error } = await supabase.from("consents").insert(payload).select().single();

  if (error !== null) return { ok: false, error: error.message };
  return { ok: true, data };
}

// ---------------------------------------------------------------------------
// signConsent
// ---------------------------------------------------------------------------

export interface SignConsentInput {
  signedByPatient: string;
}

/**
 * Firma un consentimiento (`'pending' → 'signed'`), fijando `signed_at` y
 * `signed_by_patient`. Verifica {@link canSignConsent} sobre el estado ACTUAL
 * leído de BD antes de escribir (el trigger `consents_guard_signed` es la
 * última línea de defensa, pero aquí devolvemos un mensaje legible).
 */
export async function signConsent(
  consentId: string,
  input: SignConsentInput,
): Promise<ActionResult<Consent>> {
  const access = await assertExpedienteAccess();
  if (!access.ok) return { ok: false, error: access.error };

  const supabase = createClient();

  const { data: existing, error: fetchError } = await supabase
    .from("consents")
    .select("*")
    .eq("id", consentId)
    .eq("salon_id", access.salonId)
    .single();

  if (fetchError !== null) return { ok: false, error: fetchError.message };

  if (!canSignConsent(existing.status)) {
    return {
      ok: false,
      error: `No se puede firmar un consentimiento en estado '${existing.status}'.`,
    };
  }

  const { data, error } = await supabase
    .from("consents")
    .update({
      status: "signed",
      signed_at: new Date().toISOString(),
      signed_by_patient: input.signedByPatient,
    })
    .eq("id", consentId)
    .eq("salon_id", access.salonId)
    .select()
    .single();

  if (error !== null) return { ok: false, error: error.message };
  return { ok: true, data };
}

// ---------------------------------------------------------------------------
// revokeConsent
// ---------------------------------------------------------------------------

/**
 * Revoca un consentimiento (`'signed' → 'revoked'`), fijando `revoked_at` y
 * `revoked_by`. Verifica {@link canRevokeConsent} sobre el estado ACTUAL
 * antes de escribir. A partir de aquí el registro es inmutable (trigger de BD).
 */
export async function revokeConsent(consentId: string): Promise<ActionResult<Consent>> {
  const access = await assertExpedienteAccess();
  if (!access.ok) return { ok: false, error: access.error };

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: existing, error: fetchError } = await supabase
    .from("consents")
    .select("*")
    .eq("id", consentId)
    .eq("salon_id", access.salonId)
    .single();

  if (fetchError !== null) return { ok: false, error: fetchError.message };

  if (!canRevokeConsent(existing.status)) {
    return {
      ok: false,
      error: `No se puede revocar un consentimiento en estado '${existing.status}'.`,
    };
  }

  const { data, error } = await supabase
    .from("consents")
    .update({
      status: "revoked",
      revoked_at: new Date().toISOString(),
      revoked_by: user?.id ?? null,
    })
    .eq("id", consentId)
    .eq("salon_id", access.salonId)
    .select()
    .single();

  if (error !== null) return { ok: false, error: error.message };
  return { ok: true, data };
}

// ---------------------------------------------------------------------------
// deleteConsent — solo 'pending' (owner/manager)
// ---------------------------------------------------------------------------

/**
 * Borra un consentimiento, solo si sigue en `'pending'` (un `'signed'`/
 * `'revoked'` es inmutable — el trigger de BD también lo bloquearía, pero
 * aquí devolvemos un mensaje legible antes de intentarlo). Requiere rol
 * owner/manager.
 */
export async function deleteConsent(consentId: string): Promise<ActionResult<{ id: string }>> {
  const access = await assertExpedienteAccess(DELETE_ROLES);
  if (!access.ok) return { ok: false, error: access.error };

  const supabase = createClient();

  const { data: existing, error: fetchError } = await supabase
    .from("consents")
    .select("status")
    .eq("id", consentId)
    .eq("salon_id", access.salonId)
    .single();

  if (fetchError !== null) return { ok: false, error: fetchError.message };

  if (existing.status !== "pending") {
    return {
      ok: false,
      error: `Solo se puede borrar un consentimiento pendiente (estado actual: '${existing.status}').`,
    };
  }

  const { error } = await supabase
    .from("consents")
    .delete()
    .eq("id", consentId)
    .eq("salon_id", access.salonId);

  if (error !== null) return { ok: false, error: error.message };
  return { ok: true, data: { id: consentId } };
}

// ---------------------------------------------------------------------------
// uploadPatientImage
// ---------------------------------------------------------------------------

function isAllowedImageMime(mime: string): mime is AllowedImageMime {
  return (ALLOWED_IMAGE_MIME_TYPES as readonly string[]).includes(mime);
}

/** Extensión canónica del objeto en Storage para un MIME de imagen admitido. */
function imageExtensionForMime(mime: AllowedImageMime): string {
  switch (mime) {
    case "image/png":
      return "png";
    case "image/jpeg":
      return "jpg";
    case "image/webp":
      return "webp";
  }
}

/** Lee un campo de texto opcional de un FormData; cadena vacía cuenta como ausente. */
function readOptionalString(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  if (typeof value !== "string" || value.length === 0) return null;
  return value;
}

/**
 * Sube una imagen/radiografía clínica al bucket privado `patient-media` y
 * crea su fila de metadatos en `patient_images`.
 *
 * Recibe `FormData` (no un `File` suelto) porque los argumentos de una
 * Server Action deben ser serializables y `File` no lo es — mismo patrón que
 * `saveSalonLogo` (`ajustes/marca/actions.ts`). Claves esperadas: `file`
 * (File), `customerId`, `modality`, y opcionalmente `fdiCode`, `note`,
 * `treatmentPlanId`.
 *
 * Convención de path: `{salon_id}/{customerId}/{uuid}.{ext}` (README de la
 * migración). Valida MIME de imagen (`png|jpeg|webp`) y tamaño (≤ 15 MiB) EN
 * SERVIDOR con mensajes legibles antes de tocar Storage.
 */
export async function uploadPatientImage(formData: FormData): Promise<ActionResult<PatientImage>> {
  const access = await assertExpedienteAccess();
  if (!access.ok) return { ok: false, error: access.error };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Selecciona un archivo de imagen." };
  }

  const contentType = (file.type ?? "").trim().toLowerCase();
  if (!isAllowedImageMime(contentType)) {
    return {
      ok: false,
      error: `Formato de imagen no admitido. Usa: ${ALLOWED_IMAGE_MIME_TYPES.join(", ")}.`,
    };
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return { ok: false, error: "La imagen supera el tamaño máximo de 15 MiB." };
  }

  const customerId = readOptionalString(formData, "customerId");
  if (customerId === null) {
    return { ok: false, error: "Falta el paciente (customerId)." };
  }

  const modality = readOptionalString(formData, "modality");
  if (modality === null || !isImageModality(modality)) {
    return { ok: false, error: "Falta o no es válida la modalidad de la imagen." };
  }

  const fdiCodeRaw = readOptionalString(formData, "fdiCode");
  const fdiCode = fdiCodeRaw === null ? null : Number(fdiCodeRaw);
  if (fdiCode !== null && !Number.isFinite(fdiCode)) {
    return { ok: false, error: "El código FDI no es un número válido." };
  }

  const note = readOptionalString(formData, "note");
  const treatmentPlanId = readOptionalString(formData, "treatmentPlanId");

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const extension = imageExtensionForMime(contentType);
  const objectPath = `${access.salonId}/${customerId}/${crypto.randomUUID()}.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from(PATIENT_MEDIA_BUCKET)
    .upload(objectPath, await file.arrayBuffer(), { contentType, upsert: false });

  if (uploadError !== null) {
    return { ok: false, error: `No se pudo subir la imagen: ${uploadError.message}` };
  }

  const payload: PatientImageInsert = {
    salon_id: access.salonId,
    customer_id: customerId,
    treatment_plan_id: treatmentPlanId,
    fdi_code: fdiCode,
    modality,
    storage_path: objectPath,
    mime: contentType,
    note,
    created_by: user?.id ?? null,
  };

  const { data, error } = await supabase.from("patient_images").insert(payload).select().single();

  if (error !== null) {
    // La fila no se creó: no dejar el objeto huérfano en Storage.
    await supabase.storage.from(PATIENT_MEDIA_BUCKET).remove([objectPath]);
    return { ok: false, error: error.message };
  }
  return { ok: true, data };
}

// ---------------------------------------------------------------------------
// deletePatientImage
// ---------------------------------------------------------------------------

/** Borra el objeto de Storage (`storage_path`) y la fila de metadatos. */
export async function deletePatientImage(imageId: string): Promise<ActionResult<{ id: string }>> {
  const access = await assertExpedienteAccess();
  if (!access.ok) return { ok: false, error: access.error };

  const supabase = createClient();

  const { data: existing, error: fetchError } = await supabase
    .from("patient_images")
    .select("storage_path")
    .eq("id", imageId)
    .eq("salon_id", access.salonId)
    .single();

  if (fetchError !== null) return { ok: false, error: fetchError.message };

  const { error: removeError } = await supabase.storage
    .from(PATIENT_MEDIA_BUCKET)
    .remove([existing.storage_path]);

  if (removeError !== null) {
    return { ok: false, error: `No se pudo borrar el archivo: ${removeError.message}` };
  }

  const { error } = await supabase
    .from("patient_images")
    .delete()
    .eq("id", imageId)
    .eq("salon_id", access.salonId);

  if (error !== null) return { ok: false, error: error.message };
  return { ok: true, data: { id: imageId } };
}

// ---------------------------------------------------------------------------
// signImageUrls
// ---------------------------------------------------------------------------

/**
 * Devuelve un mapa `storage_path → signedUrl` (válida 1 h) para pintar
 * miniaturas en la galería. El bucket `patient-media` es PRIVADO
 * (`public=false`): nunca se usa `getPublicUrl`, siempre signed URL.
 *
 * Usa el cliente de SESIÓN: la RLS de lectura de `storage.objects`
 * (`patient_media_members_read`) ya permite a cualquier miembro del salón
 * dueño del path firmar sus propios objetos, así que un `path` de OTRO salón
 * simplemente no se resuelve (queda fuera del mapa devuelto) en vez de
 * lanzar. Rutas que no existen o no pertenecen al salón se omiten del mapa
 * (fallo parcial: un elemento roto no tumba el resto de la galería).
 */
export async function signImageUrls(paths: string[]): Promise<ActionResult<Record<string, string>>> {
  const access = await assertExpedienteAccess();
  if (!access.ok) return { ok: false, error: access.error };

  if (paths.length === 0) return { ok: true, data: {} };

  const supabase = createClient();
  const { data, error } = await supabase.storage
    .from(PATIENT_MEDIA_BUCKET)
    .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);

  if (error !== null) return { ok: false, error: error.message };

  const map: Record<string, string> = {};
  for (const entry of data ?? []) {
    if (entry.path !== null && entry.error === null) {
      map[entry.path] = entry.signedUrl;
    }
  }
  return { ok: true, data: map };
}
