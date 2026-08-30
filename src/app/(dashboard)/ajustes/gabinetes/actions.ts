"use server";

import { revalidatePath } from "next/cache";

import { canManageSettings, getActiveMembership, getActiveSalon } from "@/lib/salon";
import { createClient } from "@/lib/supabase/server";

/**
 * Alta y baja de gabinetes (B2).
 *
 * El gabinete es un recurso compartido: dos profesionales pueden trabajar a la
 * vez, pero no en el mismo sillón. Dar de alta el primero CAMBIA cómo se
 * calculan los huecos —a partir de ahí, una cita sin sillón libre deja de
 * ofrecerse—, así que es una decisión de quien gestiona el salón.
 */

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

async function requireManager(): Promise<
  { ok: true; salonId: string } | { ok: false; error: string }
> {
  const salon = await getActiveSalon();
  if (salon === null) return { ok: false, error: "No tienes un salón asignado." };
  if (salon.sector !== "odontologia") {
    return { ok: false, error: "Los gabinetes son propios de clínicas dentales." };
  }
  const membership = await getActiveMembership();
  if (membership === null || !canManageSettings(membership.role)) {
    return { ok: false, error: "No tienes permiso para gestionar gabinetes." };
  }
  return { ok: true, salonId: salon.id };
}

export async function createOperatory(input: {
  name: string;
}): Promise<ActionResult<{ id: string }>> {
  const name = input.name.trim();
  if (name === "") {
    return { ok: false, error: "Ponle nombre al gabinete" };
  }
  if (name.length > 120) {
    return { ok: false, error: "El nombre es demasiado largo" };
  }

  const auth = await requireManager();
  if (!auth.ok) return { ok: false, error: auth.error };

  const supabase = createClient();
  const { data, error } = await supabase
    .from("operatory")
    .insert({ salon_id: auth.salonId, name })
    .select("id")
    .single();

  if (error !== null || data === null) {
    // Dos gabinetes con el mismo nombre harían imposible saber de cuál habla la
    // agenda; el mensaje técnico de Postgres no lo explica.
    if (error?.code === "23505") {
      return { ok: false, error: "Ya hay un gabinete con ese nombre" };
    }
    return { ok: false, error: error?.message ?? "No se pudo crear el gabinete" };
  }

  revalidatePath("/ajustes/gabinetes");
  revalidatePath("/appointments");
  return { ok: true, data: { id: data.id } };
}

/**
 * Activa o desactiva un gabinete. NO se borra: las citas que se atendieron en
 * él quedarían sin explicación, y un gabinete desactivado sigue contando su
 * historia aunque ya no se use.
 */
export async function setOperatoryActive(input: {
  id: string;
  active: boolean;
}): Promise<ActionResult<null>> {
  const auth = await requireManager();
  if (!auth.ok) return { ok: false, error: auth.error };

  const supabase = createClient();
  const { error } = await supabase
    .from("operatory")
    .update({ active: input.active })
    .eq("id", input.id)
    .eq("salon_id", auth.salonId);

  if (error !== null) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/ajustes/gabinetes");
  revalidatePath("/appointments");
  return { ok: true, data: null };
}
