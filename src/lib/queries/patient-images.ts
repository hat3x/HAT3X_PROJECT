import { createClient } from "@/lib/supabase/client";
import type { PatientImage } from "@/types/database";

// ---------------------------------------------------------------------------
// Cache key factory
// ---------------------------------------------------------------------------

export const imageKeys = {
  all: (salonId: string) => ["patient-images", salonId] as const,
  list: (salonId: string, customerId: string) =>
    [...imageKeys.all(salonId), "list", customerId] as const,
};

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------

/**
 * Lista las imágenes/radiografías de un paciente, más recientes primero.
 * Acotada por salon_id (multi-tenant) y customer_id. Solo metadatos (fila de
 * `patient_images`): el binario vive en Storage y se resuelve con
 * `signImageUrls` (server action de `expediente/actions`) a partir de
 * `storage_path`.
 */
export async function fetchPatientImages(
  salonId: string,
  customerId: string,
): Promise<PatientImage[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("patient_images")
    .select("*")
    .eq("salon_id", salonId)
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false });

  if (error !== null) throw new Error(error.message);
  return data ?? [];
}
