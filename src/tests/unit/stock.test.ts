import { describe, it, expect } from "vitest";

import {
  STOCK_KIND_LABELS,
  STOCK_MOVEMENT_KINDS,
  applyMovement,
  isExpiringSoon,
  isLowStock,
  movementDelta,
} from "@/lib/stock";
import type { StockMovementKind } from "@/types/database";

// ---------------------------------------------------------------------------
// STOCK_MOVEMENT_KINDS / STOCK_KIND_LABELS
// ---------------------------------------------------------------------------

describe("STOCK_MOVEMENT_KINDS / STOCK_KIND_LABELS", () => {
  it("define los cuatro tipos de movimiento", () => {
    expect(STOCK_MOVEMENT_KINDS).toEqual(["entrada", "salida", "ajuste", "merma"]);
  });

  it("tiene una etiqueta en español para cada tipo", () => {
    expect(STOCK_KIND_LABELS).toEqual({
      entrada: "Entrada",
      salida: "Salida",
      ajuste: "Ajuste",
      merma: "Merma",
    });
    for (const kind of STOCK_MOVEMENT_KINDS) {
      expect(typeof STOCK_KIND_LABELS[kind]).toBe("string");
    }
  });
});

// ---------------------------------------------------------------------------
// movementDelta
// ---------------------------------------------------------------------------

describe("movementDelta", () => {
  it("entrada: delta positivo = |quantity|, aunque quantity venga negativo", () => {
    expect(movementDelta(10, "entrada", 5)).toBe(5);
    expect(movementDelta(10, "entrada", -5)).toBe(5);
  });

  it("salida: delta negativo = -|quantity|", () => {
    expect(movementDelta(10, "salida", 3)).toBe(-3);
    expect(movementDelta(10, "salida", -3)).toBe(-3);
  });

  it("merma: delta negativo = -|quantity|, igual que salida", () => {
    expect(movementDelta(10, "merma", 2)).toBe(-2);
  });

  it("ajuste: delta = nuevoTotal - currentStock (puede ser positivo, negativo o cero)", () => {
    expect(movementDelta(10, "ajuste", 15)).toBe(5);
    expect(movementDelta(10, "ajuste", 4)).toBe(-6);
    expect(movementDelta(10, "ajuste", 10)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// applyMovement
// ---------------------------------------------------------------------------

describe("applyMovement", () => {
  it("entrada: suma la magnitud al stock actual", () => {
    expect(applyMovement(10, "entrada", 5)).toBe(15);
  });

  it("salida: resta la magnitud al stock actual", () => {
    expect(applyMovement(10, "salida", 3)).toBe(7);
  });

  it("merma: resta la magnitud al stock actual, igual que salida", () => {
    expect(applyMovement(10, "merma", 2)).toBe(8);
  });

  it("ajuste: el nuevo stock ES quantity (el nuevo total), sin importar currentStock", () => {
    expect(applyMovement(10, "ajuste", 25)).toBe(25);
    expect(applyMovement(999, "ajuste", 0)).toBe(0);
  });

  it("salida que excede el stock disponible: devuelve NEGATIVO (no clampa) — el caller valida", () => {
    expect(applyMovement(3, "salida", 10)).toBe(-7);
  });

  it("merma que excede el stock disponible: también devuelve negativo", () => {
    expect(applyMovement(1, "merma", 5)).toBe(-4);
  });

  it("es consistente con movementDelta: currentStock + movementDelta(...) === applyMovement(...)", () => {
    const cases: Array<[number, StockMovementKind, number]> = [
      [10, "entrada", 5],
      [10, "salida", 3],
      [10, "merma", 2],
      [10, "ajuste", 25],
      [3, "salida", 10],
    ];
    for (const [currentStock, kind, quantity] of cases) {
      expect(applyMovement(currentStock, kind, quantity)).toBe(
        currentStock + movementDelta(currentStock, kind, quantity),
      );
    }
  });
});

// ---------------------------------------------------------------------------
// isLowStock
// ---------------------------------------------------------------------------

describe("isLowStock", () => {
  it("stock por debajo del mínimo ⇒ true", () => {
    expect(isLowStock(2, 5)).toBe(true);
  });

  it("stock igual al mínimo ⇒ true (el límite cuenta como bajo mínimo)", () => {
    expect(isLowStock(5, 5)).toBe(true);
  });

  it("stock por encima del mínimo ⇒ false", () => {
    expect(isLowStock(10, 5)).toBe(false);
  });

  it("producto sin control de stock (null) ⇒ false, nunca 'bajo mínimo'", () => {
    expect(isLowStock(null, 5)).toBe(false);
  });

  it("mínimo 0 (sin umbral de reposición): solo stock 0 es 'bajo mínimo'", () => {
    expect(isLowStock(0, 0)).toBe(true);
    expect(isLowStock(1, 0)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isExpiringSoon
// ---------------------------------------------------------------------------

describe("isExpiringSoon", () => {
  const NOW = new Date("2026-08-01T12:00:00.000Z");

  it("sin fecha de caducidad ⇒ false", () => {
    expect(isExpiringSoon(null, 60, NOW)).toBe(false);
  });

  it("caduca dentro de la ventana de días ⇒ true", () => {
    expect(isExpiringSoon("2026-09-15", 60, NOW)).toBe(true); // 45 días
  });

  it("caduca justo en el límite de la ventana ⇒ true (inclusivo)", () => {
    expect(isExpiringSoon("2026-09-30", 60, NOW)).toBe(true); // exactamente 60 días
  });

  it("caduca después de la ventana ⇒ false", () => {
    expect(isExpiringSoon("2026-12-01", 60, NOW)).toBe(false); // 122 días
  });

  it("ya caducado (fecha pasada) ⇒ true", () => {
    expect(isExpiringSoon("2026-01-01", 60, NOW)).toBe(true);
  });

  it("respeta un umbral de días distinto al por defecto (9 días de diferencia)", () => {
    expect(isExpiringSoon("2026-08-10", 10, NOW)).toBe(true);
    expect(isExpiringSoon("2026-08-10", 7, NOW)).toBe(false);
  });
});
