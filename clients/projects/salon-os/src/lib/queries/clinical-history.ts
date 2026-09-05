import { createClient } from "@/lib/supabase/client";

/**
 * Entrada del historial clínico / evolutivo del paciente (tabla clinical_history).
 * Importado del software dental de origen; también destino de la actividad
 * clínica continua. Ver 20260806120000_clinical_history.sql.
 */
export type ClinicalHistoryEntry = {
  id: string;
  occurred_on: string;
  kind: string | null;
  category: "clinica" | "comunicacion" | "nota" | "otro";
  note: string | null;
  fdi_tooth: number | null;
  amount_cents: number | null;
  done: boolean;
  professional: string | null;
};

/** Fábrica de claves de caché para el historial clínico (TanStack Query). */
export const clinicalHistoryKeys = {
  all: (salonId: string) => ["clinical-history", salonId] as const,
  patient: (salonId: string, customerId: string) =>
    [...clinicalHistoryKeys.all(salonId), customerId] as const,
};

/**
 * Máximo de entradas cargadas por paciente. El evolutivo puede tener cientos de
 * entradas; se muestran las más recientes y se filtra por categoría en cliente.
 */
export const CLINICAL_HISTORY_LIMIT = 600;

/**
 * Devuelve el historial clínico de un paciente, de más reciente a más antiguo.
 */
export async function fetchClinicalHistory(
  salonId: string,
  customerId: string,
): Promise<ClinicalHistoryEntry[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("clinical_history")
    .select(
      "id, occurred_on, kind, category, note, fdi_tooth, amount_cents, done, professional",
    )
    .eq("salon_id", salonId)
    .eq("customer_id", customerId)
    .order("occurred_on", { ascending: false })
    .limit(CLINICAL_HISTORY_LIMIT)
    .returns<ClinicalHistoryEntry[]>();

  if (error !== null) {
    throw new Error(error.message);
  }

  return data ?? [];
}
