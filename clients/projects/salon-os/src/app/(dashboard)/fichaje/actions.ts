"use server";

import { revalidatePath } from "next/cache";

import { getActiveSalonId } from "@/lib/salon";
import { createClient } from "@/lib/supabase/server";

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/**
 * Ficha ENTRADA del usuario actual: crea una fila de time_clock con clock_in=now
 * y clock_out=NULL. Si ya tiene un fichaje abierto, no crea otro (idempotente).
 */
export async function clockIn(): Promise<ActionResult<{ id: string }>> {
  const salonId = await getActiveSalonId();
  if (salonId === null) return { ok: false, error: "No tienes un salón asignado" };

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user === null) return { ok: false, error: "No autenticado" };

  // ¿Ya hay un fichaje abierto? Entonces no se crea otro (ya está dentro).
  const { data: open } = await supabase
    .from("time_clock")
    .select("id")
    .eq("salon_id", salonId)
    .eq("user_id", user.id)
    .is("clock_out", null)
    .maybeSingle();
  if (open) return { ok: true, data: { id: open.id } };

  const { data, error } = await supabase
    .from("time_clock")
    .insert({ salon_id: salonId, user_id: user.id })
    .select("id")
    .single();

  if (error !== null || !data) return { ok: false, error: "No se pudo fichar la entrada" };

  revalidatePath("/fichaje");
  return { ok: true, data: { id: data.id } };
}

/**
 * Ficha SALIDA del usuario actual: rellena clock_out=now en su fichaje abierto.
 * Si no tiene ninguno abierto, devuelve un error legible.
 */
export async function clockOut(): Promise<ActionResult<null>> {
  const salonId = await getActiveSalonId();
  if (salonId === null) return { ok: false, error: "No tienes un salón asignado" };

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user === null) return { ok: false, error: "No autenticado" };

  const { data: open } = await supabase
    .from("time_clock")
    .select("id")
    .eq("salon_id", salonId)
    .eq("user_id", user.id)
    .is("clock_out", null)
    .maybeSingle();
  if (!open) return { ok: false, error: "No tienes ninguna entrada sin cerrar" };

  const { error } = await supabase
    .from("time_clock")
    .update({ clock_out: new Date().toISOString() })
    .eq("id", open.id)
    .eq("salon_id", salonId);

  if (error !== null) return { ok: false, error: "No se pudo fichar la salida" };

  revalidatePath("/fichaje");
  return { ok: true, data: null };
}
