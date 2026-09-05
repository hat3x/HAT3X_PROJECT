/**
 * Lógica PURA de control de stock/inventario de material (todos los sectores,
 * sin gate de sector — peluquería y odontología consumen material por igual).
 *
 * Espejo conceptual de `@/lib/dental/treatment.ts` y `@/lib/loyalty/points.ts`:
 * sin IO, sin reloj ambiental (`now` se inyecta) → 100 % determinista y
 * testeable. La orquestación con la BD (fetch del producto, insert del
 * movimiento, update de `products.stock`, gate de rol) vive en
 * `@/app/(dashboard)/products/stock-actions.ts`.
 */
import { differenceInCalendarDays, parseISO } from "date-fns";

import type { StockMovementKind } from "@/types/database";

// ---------------------------------------------------------------------------
// Tipos y etiquetas de display (español)
// ---------------------------------------------------------------------------

/** Los cuatro tipos de movimiento de stock, en el orden en que se muestran en la UI. */
export const STOCK_MOVEMENT_KINDS: readonly StockMovementKind[] = [
  "entrada",
  "salida",
  "ajuste",
  "merma",
];

export const STOCK_KIND_LABELS: Record<StockMovementKind, string> = {
  entrada: "Entrada",
  salida: "Salida",
  ajuste: "Ajuste",
  merma: "Merma",
};

// ---------------------------------------------------------------------------
// Cálculo de stock — applyMovement / movementDelta
// ---------------------------------------------------------------------------

/**
 * Delta CON SIGNO que se persiste en `stock_movement.quantity` (magnitud ya
 * aplicada al stock, no la cifra "en bruto" que introduce el usuario):
 *   - `entrada` → `+|quantity|`
 *   - `salida` | `merma` → `-|quantity|`
 *   - `ajuste` → `quantity` (el NUEVO TOTAL) menos el stock actual — puede ser
 *     positivo o negativo según si el ajuste sube o baja el stock.
 */
export function movementDelta(
  currentStock: number,
  kind: StockMovementKind,
  quantity: number,
): number {
  if (kind === "ajuste") {
    return quantity - currentStock;
  }
  if (kind === "entrada") {
    return Math.abs(quantity);
  }
  // salida | merma
  return -Math.abs(quantity);
}

/**
 * Nuevo stock tras aplicar el movimiento. Para `ajuste`, `quantity` ES el
 * nuevo total (se devuelve tal cual, vía `currentStock + movementDelta(...)`,
 * que para `ajuste` es `currentStock + (quantity - currentStock) = quantity`).
 * Construida a partir de `movementDelta` para que ambas funciones sean
 * consistentes por definición.
 *
 * NO clampa a 0: si una `salida`/`merma` excede el stock disponible, devuelve
 * un valor negativo y es responsabilidad del caller (la Server Action)
 * detectarlo y rechazar el movimiento con un error ("No hay suficiente
 * stock."). Esta función es puro cálculo, sin reglas de negocio de rechazo.
 */
export function applyMovement(
  currentStock: number,
  kind: StockMovementKind,
  quantity: number,
): number {
  return currentStock + movementDelta(currentStock, kind, quantity);
}

// ---------------------------------------------------------------------------
// Alertas — stock bajo mínimo / caducidad próxima
// ---------------------------------------------------------------------------

/**
 * `true` si el producto está en (o por debajo de) su mínimo de reposición.
 * Un producto sin control de stock (`stock === null`) nunca está "bajo
 * mínimo" — no hay existencia que comparar.
 */
export function isLowStock(stock: number | null, minStock: number): boolean {
  if (stock === null) return false;
  return stock <= minStock;
}

/**
 * `true` si `expiry` (fecha `YYYY-MM-DD`) caduca en `days` días o menos, o ya
 * caducó. `now` se inyecta para tests deterministas (por defecto, el reloj
 * real, igual patrón que `addDaysIso` de `@/lib/loyalty/points.ts`). Sin
 * fecha de caducidad ⇒ `false` (nada que alertar).
 */
export function isExpiringSoon(
  expiry: string | null,
  days = 60,
  now: Date = new Date(),
): boolean {
  if (expiry === null) return false;
  const daysUntilExpiry = differenceInCalendarDays(parseISO(expiry), now);
  return daysUntilExpiry <= days;
}
