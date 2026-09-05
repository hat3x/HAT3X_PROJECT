import { createClient } from "@/lib/supabase/client";
import type { Salon } from "@/types/database";

/**
 * Fábrica de claves de caché para los datos generales del salón.
 * Se scopea por `salonId` para aislar tenants en la caché.
 */
export const salonSettingsKeys = {
  all: (salonId: string) => ["salon-settings", salonId] as const,
  detail: (salonId: string) =>
    [...salonSettingsKeys.all(salonId), "detail"] as const,
};

/**
 * Fila completa del salón para el formulario de ajustes.
 * `null` si no existe o no es accesible (RLS).
 */
export async function fetchSalonSettings(salonId: string): Promise<Salon | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("salons")
    .select("*")
    .eq("id", salonId)
    .maybeSingle();

  if (error !== null) {
    throw new Error(error.message);
  }
  return data;
}
