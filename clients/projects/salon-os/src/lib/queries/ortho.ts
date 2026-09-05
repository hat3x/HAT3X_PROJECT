import {
  EMPTY_ORTHO_FICHA,
  EMPTY_ORTHO_TREATMENT,
  type OrthoData,
} from "@/lib/dental/ortho";
import { createClient } from "@/lib/supabase/client";
import type { OrthoVisit } from "@/types/database";

export const orthoKeys = {
  all: (salonId: string) => ["ortho", salonId] as const,
  data: (salonId: string, customerId: string) =>
    [...orthoKeys.all(salonId), "data", customerId] as const,
  visits: (salonId: string, customerId: string) =>
    [...orthoKeys.all(salonId), "visits", customerId] as const,
};

/**
 * Lee la ficha + tratamiento ortho desde clinical_records.data.ortho.
 * Devuelve SIEMPRE una forma completa (rellena con EMPTY_* lo que falte),
 * para que el formulario sea controlado sin ramas por null.
 */
export async function fetchOrthoData(
  salonId: string,
  customerId: string,
): Promise<OrthoData> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("clinical_records")
    .select("data")
    .eq("salon_id", salonId)
    .eq("customer_id", customerId)
    .maybeSingle();

  if (error !== null) throw new Error(error.message);

  const raw = (data?.data ?? {}) as Record<string, unknown>;
  const ortho = (raw.ortho ?? {}) as Partial<OrthoData>;
  return {
    ficha: { ...EMPTY_ORTHO_FICHA, ...(ortho.ficha ?? {}) },
    treatment: { ...EMPTY_ORTHO_TREATMENT, ...(ortho.treatment ?? {}) },
  };
}

/** Timeline de visitas ortho (más reciente primero). */
export async function fetchOrthoVisits(
  salonId: string,
  customerId: string,
): Promise<OrthoVisit[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("ortho_visit")
    .select("*")
    .eq("salon_id", salonId)
    .eq("customer_id", customerId)
    .order("visit_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error !== null) throw new Error(error.message);
  return data ?? [];
}
