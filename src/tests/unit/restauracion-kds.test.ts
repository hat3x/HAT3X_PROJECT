import { describe, it, expect } from "vitest";
import { elapsedMinutes, groupKdsItemsByOrder, type KdsItem } from "@/lib/restauracion/kds";

function item(over: Partial<KdsItem>): KdsItem {
  return {
    id: "i", orderId: "o", orderNumber: 1, orderLabel: null, stationId: "s", stationName: "Cocina",
    productName: "X", qty: 1, status: "enviado", modifiers: [], createdAt: "2026-08-10T12:00:00Z", ...over,
  };
}

describe("groupKdsItemsByOrder", () => {
  it("agrupa por pedido y ordena los grupos por createdAt ascendente", () => {
    const groups = groupKdsItemsByOrder([
      item({ id: "a", orderId: "o2", orderNumber: 2, createdAt: "2026-08-10T12:05:00Z" }),
      item({ id: "b", orderId: "o1", orderNumber: 1, createdAt: "2026-08-10T12:00:00Z" }),
      item({ id: "c", orderId: "o1", orderNumber: 1, createdAt: "2026-08-10T12:00:00Z" }),
    ]);
    expect(groups.map((g) => g.orderId)).toEqual(["o1", "o2"]);
    expect(groups[0]!.items.map((i) => i.id)).toEqual(["b", "c"]);
  });
});

describe("elapsedMinutes", () => {
  it("cuenta minutos enteros transcurridos, nunca negativo", () => {
    expect(elapsedMinutes("2026-08-10T12:00:00Z", new Date("2026-08-10T12:07:30Z"))).toBe(7);
    expect(elapsedMinutes("2026-08-10T12:00:00Z", new Date("2026-08-10T11:59:00Z"))).toBe(0);
  });
});
