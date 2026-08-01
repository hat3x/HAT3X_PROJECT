import { isExpiringSoon, isLowStock } from "@/lib/stock";
import { createClient } from "@/lib/supabase/client";
import type { Product, StockMovement } from "@/types/database";

// ---------------------------------------------------------------------------
// Cache key factory
// ---------------------------------------------------------------------------

export const stockKeys = {
  all: (salonId: string) => ["stock", salonId] as const,
  products: (salonId: string) => [...stockKeys.all(salonId), "products"] as const,
  movements: (salonId: string, productId: string) =>
    [...stockKeys.all(salonId), "movements", productId] as const,
  lowStock: (salonId: string) => [...stockKeys.all(salonId), "low-stock"] as const,
  expiringSoon: (salonId: string, days: number) =>
    [...stockKeys.all(salonId), "expiring-soon", days] as const,
};

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------

/**
 * Catálogo de productos ACTIVOS del salón con su stock/mínimo/unidad,
 * ordenado alfabéticamente. A diferencia de `fetchProducts`
 * (`@/lib/queries/products.ts`, que soporta búsqueda + incluir inactivos
 * para la tabla de gestión del catálogo), esta consulta es la fuente base
 * del inventario: siempre trae todo el catálogo activo, sin filtros de UI.
 */
export async function fetchProductsWithStock(salonId: string): Promise<Product[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("salon_id", salonId)
    .eq("active", true)
    .order("name", { ascending: true });

  if (error !== null) throw new Error(error.message);
  return data ?? [];
}

/** Últimos movimientos de stock de un producto, más recientes primero. */
export async function fetchStockMovements(
  salonId: string,
  productId: string,
): Promise<StockMovement[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("stock_movement")
    .select("*")
    .eq("salon_id", salonId)
    .eq("product_id", productId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error !== null) throw new Error(error.message);
  return data ?? [];
}

/**
 * Productos activos cuyo stock está en (o por debajo de) su mínimo de
 * reposición. PostgREST no compara dos columnas entre sí en un `.eq`/`.lte`,
 * así que se filtra en cliente con `isLowStock` sobre `fetchProductsWithStock`
 * — asumible en v1 (catálogos de salón: decenas/centenas de productos, no
 * miles).
 */
export async function fetchLowStock(salonId: string): Promise<Product[]> {
  const products = await fetchProductsWithStock(salonId);
  return products.filter((p) => isLowStock(p.stock, p.min_stock));
}

/**
 * Movimientos de ENTRADA con caducidad próxima (≤ `days`) o ya caducada.
 * v1 aproximado: lista movimientos de entrada con `expiry` informado, sin
 * calcular el "remaining" real del lote (cuánto de esa entrada sigue en
 * stock tras salidas/mermas posteriores) — basta para el aviso de la UI.
 */
export async function fetchExpiringSoon(
  salonId: string,
  days: number,
): Promise<StockMovement[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("stock_movement")
    .select("*")
    .eq("salon_id", salonId)
    .eq("kind", "entrada")
    .not("expiry", "is", null)
    .order("expiry", { ascending: true });

  if (error !== null) throw new Error(error.message);
  return (data ?? []).filter((m) => isExpiringSoon(m.expiry, days));
}
