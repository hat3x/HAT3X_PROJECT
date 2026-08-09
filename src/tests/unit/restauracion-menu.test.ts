import { describe, it, expect } from "vitest";
import { effectiveUnitPriceCents, expandCombo } from "@/lib/restauracion/menu";

describe("effectiveUnitPriceCents", () => {
  it("suma los deltas de los modificadores al precio base", () => {
    expect(effectiveUnitPriceCents(500, [{ priceDeltaCents: 80 }, { priceDeltaCents: 0 }])).toBe(580);
  });
  it("nunca baja de 0 aunque los deltas sean negativos", () => {
    expect(effectiveUnitPriceCents(100, [{ priceDeltaCents: -300 }])).toBe(0);
  });
  it("sin modificadores devuelve el precio base", () => {
    expect(effectiveUnitPriceCents(1250, [])).toBe(1250);
  });
});

describe("expandCombo", () => {
  const pieces = [
    { componentProductId: "food", qty: 1, stationId: "cocina", stationOverrideId: null },
    { componentProductId: "drink", qty: 1, stationId: "cocina", stationOverrideId: "barra" },
  ];
  it("enruta cada pieza a su estación (override gana) y pone precio 0", () => {
    const lines = expandCombo(1, pieces);
    expect(lines).toEqual([
      { productId: "food", qty: 1, stationId: "cocina", unitPriceCents: 0 },
      { productId: "drink", qty: 1, stationId: "barra", unitPriceCents: 0 },
    ]);
  });
  it("multiplica las cantidades por la cantidad de combos", () => {
    const lines = expandCombo(3, pieces);
    expect(lines[0]!.qty).toBe(3);
    expect(lines[1]!.qty).toBe(3);
  });
});
