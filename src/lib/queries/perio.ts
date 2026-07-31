import { createClient } from "@/lib/supabase/client";
import type { PerioExam, PerioSite, PerioTooth } from "@/types/database";

// ---------------------------------------------------------------------------
// Cache key factory
// ---------------------------------------------------------------------------

export const perioKeys = {
  all: (salonId: string) => ["perio", salonId] as const,
  exams: (salonId: string, customerId: string) =>
    [...perioKeys.all(salonId), "exams", customerId] as const,
  exam: (salonId: string, examId: string) =>
    [...perioKeys.all(salonId), "exam", examId] as const,
};

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------

/**
 * Lista las exploraciones periodontales de un paciente, más recientes primero.
 * Acotada por salon_id (multi-tenant) y customer_id.
 */
export async function fetchPerioExams(
  salonId: string,
  customerId: string,
): Promise<PerioExam[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("perio_exam")
    .select("*")
    .eq("salon_id", salonId)
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false });

  if (error !== null) throw new Error(error.message);
  return data ?? [];
}

/** Detalle completo de una exploración: cabecera + dientes + sitios. */
export interface PerioExamDetail {
  exam: PerioExam;
  teeth: PerioTooth[];
  sites: PerioSite[];
}

/**
 * Carga una exploración periodontal completa: la cabecera, los dientes
 * (`perio_tooth`, por `exam_id`) y los sitios de sondaje de esos dientes
 * (`perio_site`, por `tooth_id IN (...)`). Todas las queries acotadas por
 * `salon_id`. Si la exploración no existe (o no pertenece al salón), lanza.
 */
export async function fetchPerioExam(
  salonId: string,
  examId: string,
): Promise<PerioExamDetail> {
  const supabase = createClient();

  const { data: exam, error: examError } = await supabase
    .from("perio_exam")
    .select("*")
    .eq("salon_id", salonId)
    .eq("id", examId)
    .single();

  if (examError !== null) throw new Error(examError.message);

  const { data: teeth, error: teethError } = await supabase
    .from("perio_tooth")
    .select("*")
    .eq("salon_id", salonId)
    .eq("exam_id", examId);

  if (teethError !== null) throw new Error(teethError.message);

  const toothIds = (teeth ?? []).map((t) => t.id);

  if (toothIds.length === 0) {
    return { exam, teeth: teeth ?? [], sites: [] };
  }

  const { data: sites, error: sitesError } = await supabase
    .from("perio_site")
    .select("*")
    .eq("salon_id", salonId)
    .in("tooth_id", toothIds);

  if (sitesError !== null) throw new Error(sitesError.message);

  return { exam, teeth: teeth ?? [], sites: sites ?? [] };
}

// ---------------------------------------------------------------------------
// Helper puro — agrupación de sitios por diente
// ---------------------------------------------------------------------------

/**
 * Agrupa un array plano de `perio_site` por `tooth_id`.
 *
 * NOTA: `perio_site` no tiene `fdi_tooth` (solo `perio_tooth` lo tiene) — la
 * relación diente↔FDI vive un nivel arriba. Este helper agrupa por la FK real
 * de la tabla (`tooth_id`); el caller cruza con `teeth` (por `id`) si necesita
 * el número FDI.
 */
export function groupSitesByToothId(
  sites: readonly PerioSite[],
): Map<string, PerioSite[]> {
  const map = new Map<string, PerioSite[]>();
  for (const s of sites) {
    const existing = map.get(s.tooth_id);
    if (existing === undefined) {
      map.set(s.tooth_id, [s]);
    } else {
      existing.push(s);
    }
  }
  return map;
}
