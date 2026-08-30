"use server";

import { revalidatePath } from "next/cache";

import { getActiveMembership } from "@/lib/salon";
import { createClient } from "@/lib/supabase/server";
import {
  exceptionSchema,
  salonWeeklyScheduleSchema,
  weeklyScheduleSchema,
  type ExceptionInput,
  type SalonWeeklyScheduleInput,
  type WeeklyScheduleInput,
} from "@/lib/validations/schedule";
import type { ScheduleException, TablesInsert } from "@/types/database";

/** Resultado tipado de un Server Action de horarios. */
export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/** Cliente de Supabase con el tipo `Database`. */
type SupabaseServerClient = ReturnType<typeof createClient>;

function firstIssue(error: import("zod").ZodError): string {
  return error.issues[0]?.message ?? "Datos no válidos";
}

/**
 * Resuelve el salón activo y verifica que el rol pueda administrar ajustes.
 * Defensa en profundidad: el layout ya bloquea a `staff`, pero los Server
 * Actions se ejecutan de forma independiente y deben revalidar el permiso.
 */
async function requireManagerSalonId(): Promise<
  { ok: true; salonId: string } | { ok: false; error: string }
> {
  const membership = await getActiveMembership();
  if (membership === null) {
    return { ok: false, error: "No tienes un salón asignado" };
  }
  if (membership.role !== "owner" && membership.role !== "manager") {
    return { ok: false, error: "No tienes permiso para gestionar los horarios" };
  }
  return { ok: true, salonId: membership.salonId };
}

/**
 * Guarda de tenant: confirma que el profesional pertenece al salón activo.
 * Impide editar el horario de un profesional de otro salón (los FK compuestos
 * `(professional_id, salon_id)` lo imponen también en la base).
 */
async function assertProfessionalInSalon(
  supabase: SupabaseServerClient,
  salonId: string,
  professionalId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("professionals")
    .select("id")
    .eq("id", professionalId)
    .eq("salon_id", salonId)
    .maybeSingle();

  if (error !== null) {
    return error.message;
  }
  if (data === null) {
    return "El profesional seleccionado no pertenece a tu salón";
  }
  return null;
}

/**
 * Reemplaza el horario semanal completo de un profesional.
 *
 * El editor envía todos los tramos de la semana a la vez, así que la estrategia
 * es «borrar e insertar»: se eliminan los tramos actuales y se insertan los
 * nuevos. Como no hay transacciones desde el cliente de Supabase, si la
 * inserción falla se restaura la instantánea previa para no dejar al
 * profesional sin horario.
 */
export async function saveWeeklySchedule(
  input: WeeklyScheduleInput,
): Promise<ActionResult<null>> {
  const parsed = weeklyScheduleSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: firstIssue(parsed.error) };
  }

  const auth = await requireManagerSalonId();
  if (!auth.ok) {
    return { ok: false, error: auth.error };
  }

  const supabase = createClient();

  const professionalError = await assertProfessionalInSalon(
    supabase,
    auth.salonId,
    parsed.data.professional_id,
  );
  if (professionalError !== null) {
    return { ok: false, error: professionalError };
  }

  // Instantánea de los tramos actuales para poder restaurarlos si falla la
  // inserción (no hay transacción disponible desde el cliente).
  const { data: previous, error: snapshotError } = await supabase
    .from("professional_schedules")
    .select("*")
    .eq("salon_id", auth.salonId)
    .eq("professional_id", parsed.data.professional_id);
  if (snapshotError !== null) {
    return { ok: false, error: snapshotError.message };
  }

  const { error: deleteError } = await supabase
    .from("professional_schedules")
    .delete()
    .eq("salon_id", auth.salonId)
    .eq("professional_id", parsed.data.professional_id);
  if (deleteError !== null) {
    return { ok: false, error: deleteError.message };
  }

  if (parsed.data.slots.length > 0) {
    const rows: TablesInsert<"professional_schedules">[] = parsed.data.slots.map(
      (slot) => ({
        salon_id: auth.salonId,
        professional_id: parsed.data.professional_id,
        weekday: slot.weekday,
        start_time: slot.start_time,
        end_time: slot.end_time,
      }),
    );

    const { error: insertError } = await supabase
      .from("professional_schedules")
      .insert(rows);

    if (insertError !== null) {
      // Restaura el horario anterior para no dejarlo vacío tras el borrado.
      if (previous.length > 0) {
        await supabase.from("professional_schedules").insert(previous);
      }
      return { ok: false, error: insertError.message };
    }
  }

  revalidatePath("/ajustes/horarios");
  return { ok: true, data: null };
}

/**
 * Reemplaza el HORARIO DE APERTURA de la clínica/salón completo.
 *
 * Igual que `saveWeeklySchedule` pero a nivel de salón (sin profesional): el editor
 * envía todos los tramos de la semana y se aplica «borrar e insertar» sobre
 * `salon_opening_hours`. Si la inserción falla se restaura la instantánea previa.
 * Este horario lo intersecta el motor de disponibilidad con el de cada profesional.
 */
export async function saveSalonSchedule(
  input: SalonWeeklyScheduleInput,
): Promise<ActionResult<null>> {
  const parsed = salonWeeklyScheduleSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: firstIssue(parsed.error) };
  }

  const auth = await requireManagerSalonId();
  if (!auth.ok) {
    return { ok: false, error: auth.error };
  }

  const supabase = createClient();

  // Instantánea para restaurar si falla la inserción (sin transacción disponible).
  const { data: previous, error: snapshotError } = await supabase
    .from("salon_opening_hours")
    .select("*")
    .eq("salon_id", auth.salonId);
  if (snapshotError !== null) {
    return { ok: false, error: snapshotError.message };
  }

  const { error: deleteError } = await supabase
    .from("salon_opening_hours")
    .delete()
    .eq("salon_id", auth.salonId);
  if (deleteError !== null) {
    return { ok: false, error: deleteError.message };
  }

  if (parsed.data.slots.length > 0) {
    const rows: TablesInsert<"salon_opening_hours">[] = parsed.data.slots.map(
      (slot) => ({
        salon_id: auth.salonId,
        weekday: slot.weekday,
        start_time: slot.start_time,
        end_time: slot.end_time,
      }),
    );

    const { error: insertError } = await supabase
      .from("salon_opening_hours")
      .insert(rows);

    if (insertError !== null) {
      // Restaura el horario anterior para no dejarlo vacío tras el borrado.
      if (previous.length > 0) {
        await supabase.from("salon_opening_hours").insert(previous);
      }
      return { ok: false, error: insertError.message };
    }
  }

  revalidatePath("/ajustes/horarios");
  return { ok: true, data: null };
}

/** Valores validados de una excepción. */
type ExceptionValues = ReturnType<typeof exceptionSchema.parse>;

/**
 * Traduce los valores validados a un payload persistible en
 * `schedule_exceptions`. Cuando el profesional libra (`is_available=false`),
 * las horas se fuerzan a `null`.
 */
function toExceptionPayload(
  salonId: string,
  values: ExceptionValues,
): TablesInsert<"schedule_exceptions"> {
  const available = values.is_available;
  return {
    salon_id: salonId,
    professional_id: values.professional_id,
    exception_date: values.exception_date,
    is_available: available,
    start_time: available ? (values.start_time ?? null) : null,
    end_time: available ? (values.end_time ?? null) : null,
    reason: values.reason ?? null,
  };
}

/** Crea una excepción de horario (día libre u horario especial). */
export async function createException(
  input: ExceptionInput,
): Promise<ActionResult<ScheduleException>> {
  const parsed = exceptionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: firstIssue(parsed.error) };
  }

  const auth = await requireManagerSalonId();
  if (!auth.ok) {
    return { ok: false, error: auth.error };
  }

  const supabase = createClient();

  const professionalError = await assertProfessionalInSalon(
    supabase,
    auth.salonId,
    parsed.data.professional_id,
  );
  if (professionalError !== null) {
    return { ok: false, error: professionalError };
  }

  const { data, error } = await supabase
    .from("schedule_exceptions")
    .insert(toExceptionPayload(auth.salonId, parsed.data))
    .select("*")
    .single();

  if (error !== null) {
    // La restricción única `(professional_id, exception_date)` da un mensaje
    // técnico; se traduce a algo legible para la persona usuaria.
    if (error.code === "23505") {
      return {
        ok: false,
        error: "Ya existe una excepción para ese profesional en esa fecha",
      };
    }
    return { ok: false, error: error.message };
  }

  revalidatePath("/ajustes/horarios");
  return { ok: true, data };
}

/** Elimina una excepción de horario del salón activo. */
export async function deleteException(
  exceptionId: string,
): Promise<ActionResult<null>> {
  const auth = await requireManagerSalonId();
  if (!auth.ok) {
    return { ok: false, error: auth.error };
  }

  const supabase = createClient();
  const { error } = await supabase
    .from("schedule_exceptions")
    .delete()
    .eq("id", exceptionId)
    .eq("salon_id", auth.salonId);

  if (error !== null) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/ajustes/horarios");
  return { ok: true, data: null };
}

// ---------------------------------------------------------------------------
// Excepciones del horario de la CLÍNICA (no del profesional)
//
// Nacen de un caso concreto: Nicolás pasa consulta un martes por la tarde, pero
// SOLO ese martes. Antes la única forma de abrir era el horario semanal, que
// habría abierto la clínica todos los martes del año. Y sin poder abrir, el
// turno del profesional desaparecía —el motor cruza profesional ∩ clínica— sin
// que nada avisara de que esa configuración no iba a aplicarse.
// ---------------------------------------------------------------------------

export interface SalonOpeningExceptionInput {
  /** ISO `YYYY-MM-DD`. */
  exception_date: string;
  /** `false` = la clínica cierra ese día. `true` = turno extra, con horas. */
  is_open: boolean;
  start_time?: string | null;
  end_time?: string | null;
  reason?: string | null;
}

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Crea una excepción del horario de la clínica.
 *
 * Se valida antes de escribir porque una excepción incoherente no falla: se
 * guarda y el motor tiene que adivinar qué se quiso decir. Adivinar sobre
 * horarios termina en citas a puerta cerrada, que es justo lo que ya pasó una
 * vez.
 */
export async function createSalonOpeningException(
  input: SalonOpeningExceptionInput,
): Promise<ActionResult<{ id: string }>> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.exception_date)) {
    return { ok: false, error: "Elige una fecha válida" };
  }

  const inicio = input.start_time ?? null;
  const fin = input.end_time ?? null;

  if (input.is_open) {
    // "Abierto de null a null" no significa nada.
    if (inicio === null || fin === null) {
      return { ok: false, error: "Indica desde qué hora hasta qué hora abre" };
    }
    if (!HORA.test(inicio) || !HORA.test(fin)) {
      return { ok: false, error: "Escribe las horas como HH:MM" };
    }
    if (fin <= inicio) {
      return { ok: false, error: "La hora de fin tiene que ser posterior a la de inicio" };
    }
  } else if (inicio !== null || fin !== null) {
    // Cerrado es cerrado: unas horas ahí solo confundirían a quien lo lea.
    return { ok: false, error: "Un día cerrado no lleva horario" };
  }

  const auth = await requireManagerSalonId();
  if (!auth.ok) {
    return { ok: false, error: auth.error };
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from("salon_opening_exceptions")
    .insert({
      salon_id: auth.salonId,
      exception_date: input.exception_date,
      is_open: input.is_open,
      start_time: input.is_open ? inicio : null,
      end_time: input.is_open ? fin : null,
      reason: input.reason?.trim() || null,
    })
    .select("id")
    .single();

  if (error !== null || data === null) {
    return { ok: false, error: error?.message ?? "No se pudo guardar la excepción" };
  }

  revalidatePath("/ajustes/horarios");
  revalidatePath("/appointments");
  return { ok: true, data: { id: data.id } };
}

/** Borra una excepción del horario de la clínica. */
export async function deleteSalonOpeningException(
  exceptionId: string,
): Promise<ActionResult<null>> {
  const auth = await requireManagerSalonId();
  if (!auth.ok) {
    return { ok: false, error: auth.error };
  }

  const supabase = createClient();
  const { error } = await supabase
    .from("salon_opening_exceptions")
    .delete()
    .eq("id", exceptionId)
    .eq("salon_id", auth.salonId);

  if (error !== null) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/ajustes/horarios");
  revalidatePath("/appointments");
  return { ok: true, data: null };
}
