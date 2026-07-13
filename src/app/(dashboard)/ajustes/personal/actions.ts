"use server";

import { revalidatePath } from "next/cache";

import { getActiveMembership } from "@/lib/salon";
import { createClient } from "@/lib/supabase/server";
import {
  professionalSchema,
  type ProfessionalInput,
} from "@/lib/validations/professional";
import type { Professional, TablesInsert } from "@/types/database";

/** Resultado tipado de un Server Action de profesional. */
export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/** Cliente de Supabase con el tipo `Database`. */
type SupabaseServerClient = ReturnType<typeof createClient>;

/** Valores validados del profesional (specialties ya como `string[]`). */
type ProfessionalValues = ReturnType<typeof professionalSchema.parse>;

/**
 * Traduce los valores validados a un payload persistible en `professionals`.
 * `service_ids` no es una columna de la tabla: la relación N:M se sincroniza
 * aparte contra `professional_services`.
 */
function toWritePayload(
  values: ProfessionalValues,
): Omit<TablesInsert<"professionals">, "salon_id"> {
  return {
    location_id: values.location_id,
    full_name: values.full_name,
    email: values.email ?? null,
    phone: values.phone ?? null,
    specialties: values.specialties,
    color: values.color,
    active: values.active,
  };
}

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
    return { ok: false, error: "No tienes permiso para gestionar el personal" };
  }
  return { ok: true, salonId: membership.salonId };
}

/**
 * Guarda de tenant: confirma que la sede pertenece al salón activo. Impide
 * asignar el profesional a una sede de otro salón. El FK compuesto
 * `(location_id, salon_id)` lo impone también en la base; esta comprobación
 * previa devuelve un mensaje legible en vez de un error de constraint.
 */
async function assertLocationInSalon(
  supabase: SupabaseServerClient,
  salonId: string,
  locationId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("locations")
    .select("id")
    .eq("id", locationId)
    .eq("salon_id", salonId)
    .maybeSingle();

  if (error !== null) {
    return error.message;
  }
  if (data === null) {
    return "La sede seleccionada no pertenece a tu salón";
  }
  return null;
}

/**
 * Guarda de tenant para los servicios: confirma que todos los `service_ids`
 * pertenecen al salón activo antes de crear los vínculos N:M. Impide vincular
 * servicios de otro salón (el FK compuesto lo bloquearía igualmente).
 */
async function assertServicesInSalon(
  supabase: SupabaseServerClient,
  salonId: string,
  serviceIds: string[],
): Promise<string | null> {
  if (serviceIds.length === 0) {
    return null;
  }

  const { data, error } = await supabase
    .from("services")
    .select("id")
    .eq("salon_id", salonId)
    .in("id", serviceIds);

  if (error !== null) {
    return error.message;
  }
  if (data.length !== serviceIds.length) {
    return "Algún servicio seleccionado no pertenece a tu salón";
  }
  return null;
}

/** Inserta los vínculos N:M profesional → servicios. */
async function insertServiceLinks(
  supabase: SupabaseServerClient,
  salonId: string,
  professionalId: string,
  serviceIds: string[],
): Promise<string | null> {
  if (serviceIds.length === 0) {
    return null;
  }
  const rows: TablesInsert<"professional_services">[] = serviceIds.map(
    (serviceId) => ({
      professional_id: professionalId,
      service_id: serviceId,
      salon_id: salonId,
    }),
  );
  const { error } = await supabase.from("professional_services").insert(rows);
  return error !== null ? error.message : null;
}

/** Crea un profesional en el salón activo y vincula sus servicios. */
export async function createProfessional(
  input: ProfessionalInput,
): Promise<ActionResult<Professional>> {
  const parsed = professionalSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: firstIssue(parsed.error) };
  }

  const auth = await requireManagerSalonId();
  if (!auth.ok) {
    return { ok: false, error: auth.error };
  }

  const supabase = createClient();

  const locationError = await assertLocationInSalon(
    supabase,
    auth.salonId,
    parsed.data.location_id,
  );
  if (locationError !== null) {
    return { ok: false, error: locationError };
  }

  const servicesError = await assertServicesInSalon(
    supabase,
    auth.salonId,
    parsed.data.service_ids,
  );
  if (servicesError !== null) {
    return { ok: false, error: servicesError };
  }

  const { data, error } = await supabase
    .from("professionals")
    .insert({ salon_id: auth.salonId, ...toWritePayload(parsed.data) })
    .select("*")
    .single();

  if (error !== null) {
    return { ok: false, error: error.message };
  }

  const linksError = await insertServiceLinks(
    supabase,
    auth.salonId,
    data.id,
    parsed.data.service_ids,
  );
  if (linksError !== null) {
    // Evita dejar un profesional huérfano sin sus servicios si el vínculo
    // falla (no hay transacción disponible desde el cliente).
    await supabase
      .from("professionals")
      .delete()
      .eq("id", data.id)
      .eq("salon_id", auth.salonId);
    return { ok: false, error: linksError };
  }

  revalidatePath("/ajustes/personal");
  return { ok: true, data };
}

/** Actualiza un profesional y sincroniza la relación N:M de servicios. */
export async function updateProfessional(
  professionalId: string,
  input: ProfessionalInput,
): Promise<ActionResult<Professional>> {
  const parsed = professionalSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: firstIssue(parsed.error) };
  }

  const auth = await requireManagerSalonId();
  if (!auth.ok) {
    return { ok: false, error: auth.error };
  }

  const supabase = createClient();

  const locationError = await assertLocationInSalon(
    supabase,
    auth.salonId,
    parsed.data.location_id,
  );
  if (locationError !== null) {
    return { ok: false, error: locationError };
  }

  const servicesError = await assertServicesInSalon(
    supabase,
    auth.salonId,
    parsed.data.service_ids,
  );
  if (servicesError !== null) {
    return { ok: false, error: servicesError };
  }

  const { data, error } = await supabase
    .from("professionals")
    .update(toWritePayload(parsed.data))
    .eq("id", professionalId)
    .eq("salon_id", auth.salonId)
    .select("*")
    .single();

  if (error !== null) {
    return { ok: false, error: error.message };
  }

  const syncError = await syncServiceLinks(
    supabase,
    auth.salonId,
    professionalId,
    parsed.data.service_ids,
  );
  if (syncError !== null) {
    return { ok: false, error: syncError };
  }

  revalidatePath("/ajustes/personal");
  return { ok: true, data };
}

/**
 * Sincroniza los vínculos N:M: calcula el diff frente a los existentes y solo
 * inserta los nuevos y borra los retirados, dejando intactos los sin cambios.
 */
async function syncServiceLinks(
  supabase: SupabaseServerClient,
  salonId: string,
  professionalId: string,
  nextServiceIds: string[],
): Promise<string | null> {
  const { data: existing, error } = await supabase
    .from("professional_services")
    .select("service_id")
    .eq("professional_id", professionalId)
    .eq("salon_id", salonId);

  if (error !== null) {
    return error.message;
  }

  const existingIds = new Set(existing.map((row) => row.service_id));
  const nextIds = new Set(nextServiceIds);

  const toRemove = [...existingIds].filter((id) => !nextIds.has(id));
  const toAdd = [...nextIds].filter((id) => !existingIds.has(id));

  if (toRemove.length > 0) {
    const { error: removeError } = await supabase
      .from("professional_services")
      .delete()
      .eq("professional_id", professionalId)
      .eq("salon_id", salonId)
      .in("service_id", toRemove);
    if (removeError !== null) {
      return removeError.message;
    }
  }

  return insertServiceLinks(supabase, salonId, professionalId, toAdd);
}

/**
 * Elimina un profesional del salón. Los vínculos N:M en
 * `professional_services` se eliminan en cascada (FK `on delete cascade`).
 */
export async function deleteProfessional(
  professionalId: string,
): Promise<ActionResult<null>> {
  const auth = await requireManagerSalonId();
  if (!auth.ok) {
    return { ok: false, error: auth.error };
  }

  const supabase = createClient();
  const { error } = await supabase
    .from("professionals")
    .delete()
    .eq("id", professionalId)
    .eq("salon_id", auth.salonId);

  if (error !== null) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/ajustes/personal");
  return { ok: true, data: null };
}
