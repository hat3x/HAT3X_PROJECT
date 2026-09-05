"use server";

import { revalidatePath } from "next/cache";

import { getActiveSalonId } from "@/lib/salon";
import { createClient } from "@/lib/supabase/server";
import type { VisitNote } from "@/types/database";

type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

/** Crea una nueva nota clínica para una visita que aún no tiene ninguna. */
export async function addVisitNote(
  customerId: string,
  visitId: string,
  content: string,
): Promise<ActionResult<VisitNote>> {
  const trimmed = content.trim();
  if (trimmed === "") {
    return { ok: false, error: "El contenido de la nota no puede estar vacío." };
  }

  const salonId = await getActiveSalonId();
  if (salonId === null) {
    return { ok: false, error: "No tienes un salón asignado." };
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("visit_notes")
    .insert({
      visit_id: visitId,
      salon_id: salonId,
      content: trimmed,
      created_by: user?.id ?? null,
    })
    .select()
    .single();

  if (error !== null) {
    return { ok: false, error: error.message };
  }

  revalidatePath(`/customers/${customerId}`);
  return { ok: true, data: data as VisitNote };
}

/** Actualiza el texto de una nota clínica no firmada. */
export async function updateVisitNote(
  customerId: string,
  visitId: string,
  content: string,
): Promise<ActionResult<VisitNote>> {
  const trimmed = content.trim();
  if (trimmed === "") {
    return { ok: false, error: "El contenido de la nota no puede estar vacío." };
  }

  const salonId = await getActiveSalonId();
  if (salonId === null) {
    return { ok: false, error: "No tienes un salón asignado." };
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from("visit_notes")
    .update({ content: trimmed })
    .eq("visit_id", visitId)
    .eq("salon_id", salonId)
    .select()
    .single();

  if (error !== null) {
    return { ok: false, error: error.message };
  }

  revalidatePath(`/customers/${customerId}`);
  return { ok: true, data: data as VisitNote };
}

/**
 * Firma una nota clínica (signed: false → true).
 * La RLS solo permite esta transición; el trigger de inmutabilidad garantiza
 * que no podrá deshacerse ni que podrá editarse el contenido una vez firmada.
 */
export async function signVisitNote(
  customerId: string,
  visitId: string,
): Promise<ActionResult<VisitNote>> {
  const salonId = await getActiveSalonId();
  if (salonId === null) {
    return { ok: false, error: "No tienes un salón asignado." };
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("visit_notes")
    .update({ signed: true, signed_by: user?.id ?? null })
    .eq("visit_id", visitId)
    .eq("salon_id", salonId)
    .select()
    .single();

  if (error !== null) {
    return { ok: false, error: error.message };
  }

  revalidatePath(`/customers/${customerId}`);
  return { ok: true, data: data as VisitNote };
}
