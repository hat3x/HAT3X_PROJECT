import { createClient } from "@/lib/supabase/client";
import type { Order, OrderItem } from "@/types/database";

export const orderKeys = {
  all: (salonId: string) => ["orders", salonId] as const,
  open: (salonId: string) => [...orderKeys.all(salonId), "open"] as const,
  detail: (salonId: string, orderId: string) => [...orderKeys.all(salonId), "detail", orderId] as const,
};

export async function fetchOpenOrders(salonId: string): Promise<Order[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("orders").select("*")
    .eq("salon_id", salonId).eq("status", "abierta")
    .order("created_at", { ascending: true });
  if (error !== null) throw new Error(error.message);
  return data;
}

export async function fetchOrderItems(salonId: string, orderId: string): Promise<OrderItem[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("order_items").select("*")
    .eq("salon_id", salonId).eq("order_id", orderId)
    .order("created_at", { ascending: true });
  if (error !== null) throw new Error(error.message);
  return data;
}
