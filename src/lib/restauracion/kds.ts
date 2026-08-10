export interface KdsItem {
  id: string;
  orderId: string;
  orderNumber: number;
  orderLabel: string | null;
  stationId: string | null;
  stationName: string | null;
  productName: string;
  qty: number;
  status: string;
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

export function elapsedMinutes(createdAtIso: string, now: Date): number {
  const ms = now.getTime() - new Date(createdAtIso).getTime();
  return Math.max(0, Math.floor(ms / 60000));
}
