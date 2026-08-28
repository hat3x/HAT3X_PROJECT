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
import { buildConsentPdf } from "@/lib/dental/consent-pdf";
import { consentFingerprint } from "@/lib/dental/consent-seal";
import { getConsentTemplate, canRevokeConsent, canSignConsent, isImageModality } from "@/lib/dental/consents";
import {
  isMeaningfulSignature,
  signatureBounds,
  strokesToSvgPath,
  type SignatureStroke,
} from "@/lib/dental/signature";
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
const ALLOWED_IMAGE_MIME_TYPES = ["image/png", "image/jpeg", "image/webp", "application/pdf"] as const;
type AllowedImageMime = (typeof ALLOWED_IMAGE_MIME_TYPES)[number];

/** Tamaño máximo de una imagen subida. */
const MAX_IMAGE_BYTES = 25 * 1024 * 1024; // 25 MiB

/** Segundos de validez de una signed URL de `patient-media`. */
const SIGNED_URL_TTL_SECONDS = 3600;

// ---------------------------------------------------------------------------
// Gate — defensa en profundidad (sector + rol), igual que planes/actions.ts
// ---------------------------------------------------------------------------

async function assertExpedienteAccess(
  requiredRoles: readonly MemberRole[] = WRITE_ROLES,
): Promise<
  { ok: true; salonId: string; salonName: string } | { ok: false; error: string }
> {
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

  // `salonName` va en la cabecera del PDF del consentimiento; el resto de
  // llamantes lo ignoran sin enterarse.
  return { ok: true, salonId: salon.id, salonName: salon.name };
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
  /** Nombre con el que el paciente se identifica al firmar. */
  signedByPatient: string;
  /** Trazo capturado en la tableta. Sin él no hay firma. */
  strokes: SignatureStroke[];
  /** Dispositivo desde el que se firmó, para el registro (`navigator.userAgent`). */
  device?: string;
}

/** Envuelve el trazo en un SVG autónomo, que es lo que se archiva. */
function signatureSvg(strokes: SignatureStroke[]): string {
  const bounds = signatureBounds(strokes);
  // `isMeaningfulSignature` ya garantiza que hay puntos; el fallback existe
  // solo para no depender de ese orden desde aquí.
  const { minX, minY, maxX, maxY } = bounds ?? { minX: 0, minY: 0, maxX: 1, maxY: 1 };
  const pad = 4;
  const width = maxX - minX + pad * 2;
  const height = maxY - minY + pad * 2;

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX - pad} ${minY - pad} ${width} ${height}">`,
    `<path d="${strokesToSvgPath(strokes)}" fill="none" stroke="#111" stroke-width="1.6"`,
    ` stroke-linecap="round" stroke-linejoin="round"/>`,
    `</svg>`,
  ].join("");
}

/**
 * Firma un consentimiento (`'pending' → 'signed'`) con una firma MANUSCRITA.
 *
 * Verifica {@link canSignConsent} sobre el estado ACTUAL leído de BD antes de
 * escribir (el trigger `consents_guard_signed` es la última línea de defensa,
 * pero aquí devolvemos un mensaje legible).
 *
 * Tres decisiones que sostienen el valor probatorio de la firma:
 *
 *  1. **El trazo es obligatorio.** Un nombre tecleado es una anotación, no una
 *     firma. Se rechaza ANTES de tocar la BD.
 *  2. **El sello se calcula con el contenido leído de BD**, nunca con lo que
 *     manda el navegador: quien firma controla su navegador, así que un sello
 *     sobre contenido enviado por el cliente no probaría nada.
 *  3. **Primero se archiva el trazo, después se marca como firmado.** Un
 *     consentimiento marcado como firmado cuyo trazo se perdió es peor que uno
 *     sin firmar: aparenta prueba donde no la hay.
 */
export async function signConsent(
  consentId: string,
  input: SignConsentInput,
): Promise<ActionResult<Consent>> {
  const access = await assertExpedienteAccess();
  if (!access.ok) return { ok: false, error: access.error };

  if (!isMeaningfulSignature(input.strokes)) {
    return {
      ok: false,
      error: "La firma está vacía o es demasiado breve. Pide al paciente que firme de nuevo.",
    };
  }

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

  // Archivar el trazo ANTES de marcar nada (decisión 3).
  const signaturePath = `${access.salonId}/${existing.customer_id}/consent-${consentId}.svg`;
  const { error: uploadError } = await supabase.storage
    .from(PATIENT_MEDIA_BUCKET)
    .upload(signaturePath, new Blob([signatureSvg(input.strokes)], { type: "image/svg+xml" }), {
      contentType: "image/svg+xml",
      upsert: false,
    });

  if (uploadError !== null) {
    return { ok: false, error: `No se pudo guardar la firma: ${uploadError.message}` };
  }

  // Sello sobre el contenido GUARDADO (decisión 2).
  const signatureHash = consentFingerprint({
    title: existing.title,
    body: existing.body,
    templateVersion: existing.template_version,
  });

  const signedAt = new Date().toISOString();

  // El PDF sellado: el documento que se archiva y el que se imprime si alguien
  // lo reclama. Lleva dentro el texto firmado, el trazo y el sello, para poder
  // comprobarlo sin abrir la aplicación.
  const documentPath = `${access.salonId}/${existing.customer_id}/consent-${consentId}.pdf`;
  const pdf = await buildConsentPdf({
    title: existing.title,
    body: existing.body,
    templateVersion: existing.template_version,
    signedByPatient: input.signedByPatient,
    signedAt,
    signatureHash,
    salonName: access.salonName,
    strokes: input.strokes,
  });

  // La copia a un `Uint8Array` propio no es ceremonia: `pdf-lib` devuelve un
  // array cuyo buffer TypeScript tipa como `ArrayBufferLike`, que no encaja en
  // `BlobPart`. Copiarlo deja un buffer concreto y evita el cast.
  const { error: pdfError } = await supabase.storage
    .from(PATIENT_MEDIA_BUCKET)
    .upload(documentPath, new Blob([new Uint8Array(pdf)], { type: "application/pdf" }), {
      contentType: "application/pdf",
      upsert: false,
    });

  if (pdfError !== null) {
    // Igual que con el trazo: si no se puede archivar el documento, la firma no
    // se da por hecha. Se retira el trazo ya subido para no dejar restos.
    await supabase.storage.from(PATIENT_MEDIA_BUCKET).remove([signaturePath]);
    return { ok: false, error: `No se pudo archivar el consentimiento: ${pdfError.message}` };
  }

  const { data, error } = await supabase
    .from("consents")
    .update({
      status: "signed",
      signed_at: signedAt,
      signed_by_patient: input.signedByPatient,
      signature_path: signaturePath,
      signature_hash: signatureHash,
      signed_device: input.device ?? null,
      document_uri: documentPath,
    })
    .eq("id", consentId)
    .eq("salon_id", access.salonId)
    .select()
    .single();

  if (error !== null) {
    // La fila no quedó firmada: retirar el trazo y el PDF huérfanos para no
    // dejar basura en el bucket ni documentos que aparenten una firma que no
    // existe en la ficha.
    await supabase.storage.from(PATIENT_MEDIA_BUCKET).remove([signaturePath, documentPath]);
    return { ok: false, error: error.message };
  }
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
    case "application/pdf":
      return "pdf";
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
    return { ok: false, error: "Selecciona un archivo." };
  }

  const contentType = (file.type ?? "").trim().toLowerCase();
  if (!isAllowedImageMime(contentType)) {
    return {
      ok: false,
      error: `Formato no admitido. Usa: ${ALLOWED_IMAGE_MIME_TYPES.join(", ")}.`,
    };
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return { ok: false, error: "El archivo supera el tamaño máximo de 25 MiB." };
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
