import { describe, it, expect } from "vitest";
import { elapsedMinutes, groupKdsItemsByOrder, groupKdsItemsByStation, type KdsItem } from "@/lib/restauracion/kds";

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

describe("groupKdsItemsByStation", () => {
  it("agrupa por nombre de estación y ordena los grupos alfabéticamente", () => {
    const groups = groupKdsItemsByStation([
      item({ id: "a", stationName: "Barra" }),
      item({ id: "b", stationName: "Cocina" }),
      item({ id: "c", stationName: "Cocina" }),
    ]);
    expect(groups.map((g) => g.stationName)).toEqual(["Barra", "Cocina"]);
    expect(groups.find((g) => g.stationName === "Cocina")!.items.map((i) => i.id)).toEqual(["b", "c"]);
  });

  it("mete las líneas sin stationName en 'Sin estación'", () => {
    const groups = groupKdsItemsByStation([
      item({ id: "a", stationName: null }),
      item({ id: "b", stationName: "Cocina" }),
    ]);
    expect(groups.map((g) => g.stationName)).toEqual(["Cocina", "Sin estación"]);
    expect(groups.find((g) => g.stationName === "Sin estación")!.items.map((i) => i.id)).toEqual(["a"]);
  });
});
