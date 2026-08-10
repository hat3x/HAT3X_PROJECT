import type { OrderItemStatus } from "@/types/database";

export interface KdsItem {
  id: string;
  orderId: string;
  orderNumber: number;
  orderLabel: string | null;
  stationId: string | null;
  stationName: string | null;
  productName: string;
  qty: number;
  status: OrderItemStatus;
  modifiers: string[];
  createdAt: string;
}

export interface KdsOrderGroup {
  orderId: string;
  orderNumber: number;
  orderLabel: string | null;
  createdAt: string;
  items: KdsItem[];
}

export function groupKdsItemsByOrder(items: readonly KdsItem[]): KdsOrderGroup[] {
  const byOrder = new Map<string, KdsOrderGroup>();
  for (const it of items) {
    const existing = byOrder.get(it.orderId);
    if (existing === undefined) {
      byOrder.set(it.orderId, {
        orderId: it.orderId, orderNumber: it.orderNumber, orderLabel: it.orderLabel,
        createdAt: it.createdAt, items: [it],
      });
    } else {
      existing.items.push(it);
    }
  }
  return [...byOrder.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** Estación sentinela para líneas sin `stationId` asignado en la carta (o
 * cuyo join no resolvió nombre): agrupa ahí en vez de perderlas
 * silenciosamente de la vista de cocina. */
export const UNASSIGNED_STATION = "Sin estación";

export interface KdsStationGroup {
  stationName: string;
  items: KdsItem[];
}

/**
 * Agrupa las líneas activas del KDS por nombre de estación (`stationName`),
 * usando `UNASSIGNED_STATION` cuando la línea no tiene estación asociada.
 * Ordena las estaciones alfabéticamente (locale "es") para un orden estable
 * entre renders. Lógica pura subida desde `cocina-view.tsx` (Task 4 fix) para
 * poder testearla sin montar componentes.
 */
export function groupKdsItemsByStation(items: readonly KdsItem[]): KdsStationGroup[] {
  const byStation = new Map<string, KdsItem[]>();
  for (const item of items) {
    const key = item.stationName ?? UNASSIGNED_STATION;
    const list = byStation.get(key) ?? [];
    list.push(item);
    byStation.set(key, list);
  }
  return [...byStation.entries()]
    .map(([stationName, stationItems]) => ({ stationName, items: stationItems }))
    .sort((a, b) => a.stationName.localeCompare(b.stationName, "es"));
}

export function elapsedMinutes(createdAtIso: string, now: Date): number {
  const ms = now.getTime() - new Date(createdAtIso).getTime();
  return Math.max(0, Math.floor(ms / 60000));
}
