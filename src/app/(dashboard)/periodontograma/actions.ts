"use server";

import { getActiveMembership, getActiveSalon } from "@/lib/salon";
import { createClient } from "@/lib/supabase/server";
import type {
  MemberRole,
  PerioExam,
  PerioExamInsert,
  PerioSite,
  PerioSiteInsert,
  PerioTooth,
  PerioToothInsert,
} from "@/types/database";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

const ERROR_NO_SALON = "No tienes un salón asignado.";
const ERROR_SECTOR =
  "El periodontograma solo está disponible para salones del sector odontología.";
const ERROR_ROLE = "No tienes permiso para escribir en el periodontograma.";

/** Roles con permiso de escritura en el periodontograma UNA VEZ pasado el gate de sector. */
const WRITE_ROLES: readonly MemberRole[] = ["owner", "manager", "staff"];

// ---------------------------------------------------------------------------
// Gate — defensa en profundidad (sector + rol)
// ---------------------------------------------------------------------------

/**
 * Gate explícito en servidor, ADICIONAL a RLS: solo salones de sector
 * "odontologia" y solo miembros con rol de escritura pueden crear/editar el
 * periodontograma.
 *
 * Por qué hace falta un gate de app aquí (y no solo RLS): la política RLS
 * `managers_insert_perio_exam` permite a CUALQUIER owner/manager insertar en
 * `perio_exam` sin comprobar el sector del salón (solo la política
 * `dental_staff_insert_perio_exam`, pensada para el rol `staff`, exige
 * sector=odontologia). Sin este gate, un owner/manager de un salón de
 * peluquería podría escribir en el periodontograma invocando la Server Action
 * directamente. `odontograma/actions.ts` no necesita este gate porque delega
 * en el layout `SectorGate` (UI) + su propia RLS; aquí el brief pide defensa
 * en profundidad explícita dentro de la propia acción.
 */
async function assertPerioWriteAccess(): Promise<
  { ok: true; salonId: string } | { ok: false; error: string }
> {
  const salon = await getActiveSalon();
  if (salon === null) {
    return { ok: false, error: ERROR_NO_SALON };
  }
  if (salon.sector !== "odontologia") {
    return { ok: false, error: ERROR_SECTOR };
  }

  const membership = await getActiveMembership();
  if (membership === null || !WRITE_ROLES.includes(membership.role)) {
    return { ok: false, error: ERROR_ROLE };
  }

  return { ok: true, salonId: salon.id };
}

// ---------------------------------------------------------------------------
// createPerioExam
// ---------------------------------------------------------------------------

export interface CreatePerioExamInput {
  customerId: string;
  examinerId?: string | null;
  notes?: string | null;
}

/**
 * Crea la cabecera de una nueva exploración periodontal (borrador, signed=false),
 * acotada al salón activo del usuario.
 */
export async function createPerioExam(
  input: CreatePerioExamInput,
): Promise<ActionResult<PerioExam>> {
  const access = await assertPerioWriteAccess();
  if (!access.ok) return { ok: false, error: access.error };

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const payload: PerioExamInsert = {
    salon_id: access.salonId,
    customer_id: input.customerId,
    examiner_id: input.examinerId ?? null,
    notes: input.notes ?? null,
    created_by: user?.id ?? null,
  };

  const { data, error } = await supabase
    .from("perio_exam")
    .insert(payload)
    .select()
    .single();

  if (error !== null) return { ok: false, error: error.message };
  return { ok: true, data };
}

// ---------------------------------------------------------------------------
// savePerioMeasurements
// ---------------------------------------------------------------------------

/** Datos por diente a guardar (sin id/exam_id/salon_id/created_at — los añade la acción). */
export type PerioToothInput = Omit<
  PerioToothInsert,
  "id" | "exam_id" | "salon_id" | "created_at"
>;

/**
 * Medición de un sitio a guardar. Referencia el diente por `fdi_tooth` (el
 * cliente aún no conoce el `tooth_id` real hasta que se inserta `perio_tooth`);
 * la acción resuelve `fdi_tooth → tooth_id` tras insertar los dientes.
 */
export type PerioSiteInput = Omit<
  PerioSiteInsert,
  "id" | "tooth_id" | "salon_id" | "created_at"
> & { fdi_tooth: number };

export interface SavePerioMeasurementsResult {
  teeth: PerioTooth[];
  sites: PerioSite[];
}

/**
 * Guarda los datos por diente (perio_tooth) y las mediciones por sitio
 * (perio_site) de una exploración en borrador. Inserta primero los dientes
 * (para obtener sus `id`) y luego resuelve cada sitio por `fdi_tooth` antes de
 * insertar `perio_site` (que solo conoce `tooth_id`, no `fdi_tooth`).
 */
export async function savePerioMeasurements(
  examId: string,
  teeth: readonly PerioToothInput[],
  sites: readonly PerioSiteInput[],
): Promise<ActionResult<SavePerioMeasurementsResult>> {
  const access = await assertPerioWriteAccess();
  if (!access.ok) return { ok: false, error: access.error };

  const supabase = createClient();

  const teethPayload: PerioToothInsert[] = teeth.map((t) => ({
    ...t,
    exam_id: examId,
    salon_id: access.salonId,
  }));

  const { data: insertedTeeth, error: teethError } = await supabase
    .from("perio_tooth")
    .insert(teethPayload)
    .select();

  if (teethError !== null) return { ok: false, error: teethError.message };

  const toothIdByFdi = new Map<number, string>();
  for (const t of insertedTeeth ?? []) {
    toothIdByFdi.set(t.fdi_tooth, t.id);
  }

  const sitesPayload: PerioSiteInsert[] = [];
  for (const s of sites) {
    const toothId = toothIdByFdi.get(s.fdi_tooth);
    if (toothId === undefined) {
      return {
        ok: false,
        error: `No se encontró el diente ${s.fdi_tooth} entre los dientes guardados.`,
      };
    }
    const { fdi_tooth: _fdiTooth, ...rest } = s;
    sitesPayload.push({ ...rest, tooth_id: toothId, salon_id: access.salonId });
  }

  if (sitesPayload.length === 0) {
    return { ok: true, data: { teeth: insertedTeeth ?? [], sites: [] } };
  }

  const { data: insertedSites, error: sitesError } = await supabase
    .from("perio_site")
    .insert(sitesPayload)
    .select();

  if (sitesError !== null) return { ok: false, error: sitesError.message };

  return {
    ok: true,
    data: { teeth: insertedTeeth ?? [], sites: insertedSites ?? [] },
  };
}

// ---------------------------------------------------------------------------
// signPerioExam
// ---------------------------------------------------------------------------

/**
 * Firma la exploración (signed=true). A partir de aquí el trigger de BD
 * `trg_perio_exam_immutable` bloquea toda modificación posterior (y los
 * guards de `perio_tooth`/`perio_site` bloquean sus tablas hija).
 */
export async function signPerioExam(examId: string): Promise<ActionResult<PerioExam>> {
  const access = await assertPerioWriteAccess();
  if (!access.ok) return { ok: false, error: access.error };

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("perio_exam")
    .update({ signed: true, signed_by: user?.id ?? null })
    .eq("id", examId)
    .eq("salon_id", access.salonId)
    .select()
    .single();

  if (error !== null) return { ok: false, error: error.message };
  return { ok: true, data };
}
