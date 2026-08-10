import { createClient } from "@/lib/supabase/client";
import type { KdsItem } from "@/lib/restauracion/kds";
import type { Json, OrderItemStatus } from "@/types/database";

/** Factoría de query keys del KDS (scoped por salonId). */
export const kdsKeys = {
  all: (salonId: string) => ["kds", salonId] as const,
  items: (salonId: string) => [...kdsKeys.all(salonId), "items"] as const,
};

const ACTIVE_STATUSES: OrderItemStatus[] = ["enviado", "preparando", "listo"];

/**
 * Fila de `order_items` con los joins embebidos (`products`, `stations`,
 * `orders`) que consume el KDS. Solo declara las columnas realmente pedidas
 * en el `.select()` de abajo — ver `.returns<KdsItemRow[]>()`, el patrón que
 * ya usa `src/lib/queries/insurers.ts` para tipar joins de supabase-js.
 */
interface KdsItemRow {
  id: string;
  order_id: string;
  station_id: string | null;
  product_id: string;
  qty: number;
  status: OrderItemStatus;
  modifiers_snapshot: Json;
  created_at: string;
  products: { name: string } | null;
  stations: { name: string } | null;
  orders: { order_number: number | null; label: string | null; created_at: string } | null;
}

/**
 * Líneas de pedido "activas" (enviadas, en preparación o listas) para el
 * Kitchen Display System. Acotada por `salon_id` (multi-tenant), ignora
 * líneas anuladas (`void_of_item_id is null`) y ordena por antigüedad (FIFO)
 * para que la cocina/barra despache en el orden en que entraron.
 */
export async function fetchKdsItems(salonId: string): Promise<KdsItem[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("order_items")
    .select(
      "id, order_id, station_id, product_id, qty, status, modifiers_snapshot, created_at, " +
        "products(name), stations(name), orders(order_number, label, created_at)",
    )
    .eq("salon_id", salonId)
    .is("void_of_item_id", null)
    .in("status", ACTIVE_STATUSES)
    .order("created_at", { ascending: true })
    .returns<KdsItemRow[]>();

  if (error !== null) throw new Error(error.message);

  return (data ?? []).map((row): KdsItem => {
    const mods = Array.isArray(row.modifiers_snapshot)
      ? (row.modifiers_snapshot as Array<{ name?: string }>)
          .map((m) => m.name ?? "")
          .filter((n) => n.length > 0)
      : [];
    return {
      id: row.id,
      orderId: row.order_id,
      orderNumber: row.orders?.order_number ?? 0,
      orderLabel: row.orders?.label ?? null,
      stationId: row.station_id,
      stationName: row.stations?.name ?? null,
      productName: row.products?.name ?? "Producto",
      qty: row.qty,
      status: row.status,
      modifiers: mods,
      createdAt: row.created_at,
    };
  });
}
