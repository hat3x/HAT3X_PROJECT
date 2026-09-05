import { createClient } from "@/lib/supabase/client";
import type { LabOrder } from "@/types/database";

export const labOrderKeys = {
  all: (salonId: string) => ["lab-orders", salonId] as const,
  list: (salonId: string, customerId: string) =>
    [...labOrderKeys.all(salonId), "list", customerId] as const,
};

/** Pedidos a laboratorio del paciente (más reciente primero). */
export async function fetchLabOrders(salonId: string, customerId: string): Promise<LabOrder[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("lab_order")
    .select("*")
    .eq("salon_id", salonId)
    .eq("customer_id", customerId)
    .order("sent_at", { ascending: false })
    .order("created_at", { ascending: false });

  if (error !== null) throw new Error(error.message);
  return data ?? [];
}
