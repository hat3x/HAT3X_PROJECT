import { createClient } from "@/lib/supabase/client";
import type { DiningTable, DiningZone, Order } from "@/types/database";

export const tableKeys = {
  all: (salonId: string) => ["tables", salonId] as const,
  zones: (salonId: string) => [...tableKeys.all(salonId), "zones"] as const,
  tables: (salonId: string) => [...tableKeys.all(salonId), "tables"] as const,
  openOrders: (salonId: string) => [...tableKeys.all(salonId), "openOrders"] as const,
};

export async function fetchZones(salonId: string): Promise<DiningZone[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("dining_zones").select("*")
    .eq("salon_id", salonId).eq("active", true)
    .order("sort_order", { ascending: true });
  if (error !== null) throw new Error(error.message);
  return data;
}

export async function fetchTables(salonId: string): Promise<DiningTable[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("dining_tables").select("*")
    .eq("salon_id", salonId).eq("active", true)
    .order("sort_order", { ascending: true });
  if (error !== null) throw new Error(error.message);
  return data;
}

export async function fetchTableOrders(salonId: string): Promise<Order[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("orders").select("*")
    .eq("salon_id", salonId).eq("status", "abierta")
    .not("dining_table_id", "is", null)
    .order("created_at", { ascending: true });
  if (error !== null) throw new Error(error.message);
  return data;
}
