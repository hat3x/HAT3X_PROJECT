import { createClient } from "@/lib/supabase/client";
import type { Prescription, PrescriptionItem } from "@/types/database";

// ---------------------------------------------------------------------------
// Cache key factory
// ---------------------------------------------------------------------------

export const prescriptionKeys = {
  all: (salonId: string) => ["prescriptions", salonId] as const,
  list: (salonId: string, customerId: string) =>
    [...prescriptionKeys.all(salonId), "list", customerId] as const,
  items: (salonId: string, prescriptionId: string) =>
    [...prescriptionKeys.all(salonId), "items", prescriptionId] as const,
};

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------

/**
 * Lista las recetas (cabeceras) de un paciente, más recientes primero.
 * Acotada por salon_id (multi-tenant) y customer_id.
 */
export async function fetchPrescriptions(
  salonId: string,
  customerId: string,
): Promise<Prescription[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("prescription")
    .select("*")
    .eq("salon_id", salonId)
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false });

  if (error !== null) throw new Error(error.message);
  return data ?? [];
}

/**
 * Lista los renglones de medicación de una receta, en el orden de `position`.
 * Acotada por salon_id (multi-tenant) y prescription_id.
 */
export async function fetchPrescriptionItems(
  salonId: string,
  prescriptionId: string,
): Promise<PrescriptionItem[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("prescription_item")
    .select("*")
    .eq("salon_id", salonId)
    .eq("prescription_id", prescriptionId)
    .order("position", { ascending: true });

  if (error !== null) throw new Error(error.message);
  return data ?? [];
}
