import { describe, it, expect } from "vitest";
import { canTransition, clampPosition, tableTone, validCapacity } from "@/lib/restauracion/tables";

describe("canTransition", () => {
  it("acepta las transiciones válidas del ciclo de mesa", () => {
    expect(canTransition("libre", "ocupada")).toBe(true);
    expect(canTransition("ocupada", "cuenta_pedida")).toBe(true);
    expect(canTransition("ocupada", "por_limpiar")).toBe(true);
    expect(canTransition("cuenta_pedida", "por_limpiar")).toBe(true);
    expect(canTransition("por_limpiar", "libre")).toBe(true);
  });
  it("rechaza saltos inválidos", () => {
    expect(canTransition("libre", "por_limpiar")).toBe(false);
    expect(canTransition("por_limpiar", "ocupada")).toBe(false);
    expect(canTransition("ocupada", "libre")).toBe(false);
  });
});

describe("validCapacity / clampPosition / tableTone", () => {
  it("capacidad válida", () => {
    expect(validCapacity(2, 4)).toBe(true);
    expect(validCapacity(0, 4)).toBe(false);
    expect(validCapacity(4, 2)).toBe(false);
  });
  it("acota posición a 0..100", () => {
    expect(clampPosition(-5)).toBe(0);
    expect(clampPosition(140)).toBe(100);
    expect(clampPosition(37.5)).toBe(37.5);
  });
  it("color por estado", () => {
    expect(tableTone("libre")).toBe("free");
    expect(tableTone("ocupada")).toBe("busy");
    expect(tableTone("cuenta_pedida")).toBe("bill");
    expect(tableTone("por_limpiar")).toBe("cleaning");
  });
});
