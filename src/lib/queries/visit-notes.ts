import { createClient } from "@/lib/supabase/client";
import type { VisitNote } from "@/types/database";

/**
 * Visita enriquecida con el profesional y su nota clínica (si existe).
 * Columnas mínimas: las necesarias para identificar la visita en la UI.
 */
export type VisitWithNote = {
  id: string;
  visited_at: string;
  service_name: string;
  amount_cents: number;
  currency: string;
  professional: { full_name: string } | null;
  note: VisitNote | null;
};

/** Fábrica de claves de caché para notas de visita (TanStack Query). */
export const visitNoteKeys = {
  all: (salonId: string) => ["visit-notes", salonId] as const,
  patient: (salonId: string, customerId: string) =>
    [...visitNoteKeys.all(salonId), customerId] as const,
};

/**
 * Devuelve todas las visitas de un paciente junto con su nota clínica
 * (null si la visita aún no tiene nota). Ordenado de más reciente a más antiguo.
 *
 * La unión visit_notes es 1:1 (visit_id es PK de visit_notes), pero Supabase JS
 * devuelve las relaciones inversas como array; normalizamos a objeto o null.
 */
export async function fetchVisitsWithNotes(
  salonId: string,
  customerId: string,
): Promise<VisitWithNote[]> {
  const supabase = createClient();

  type RawRow = {
    id: string;
    visited_at: string;
    service_name: string;
    amount_cents: number;
    currency: string;
    professional: { full_name: string } | { full_name: string }[] | null;
    visit_notes: VisitNote[] | null;
  };

  const { data, error } = await supabase
    .from("visits")
    .select(
      "id, visited_at, service_name, amount_cents, currency, " +
        "professional:professionals(full_name), " +
        "visit_notes(*)",
    )
    .eq("salon_id", salonId)
    .eq("customer_id", customerId)
    .order("visited_at", { ascending: false })
    .returns<RawRow[]>();

  if (error !== null) {
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => {
    const rawPro = row.professional;
    const professional = Array.isArray(rawPro)
      ? (rawPro[0] ?? null)
      : (rawPro ?? null);

    const notes = row.visit_notes;
    const note = Array.isArray(notes) ? (notes[0] ?? null) : null;

    return {
      id: row.id,
      visited_at: row.visited_at,
      service_name: row.service_name,
      amount_cents: row.amount_cents,
      currency: row.currency,
      professional,
      note,
    };
  });
}
