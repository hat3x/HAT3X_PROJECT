/**
 * Tests unitarios de la lógica PURA de fidelización (`@/lib/loyalty/points`).
 *
 * Es el corazón sensible del add-on: cálculo de puntos (con la corrección de
 * unidades céntimos/200), hitos 3/5/8/10, formato del código de recompensa,
 * descuento del cupón y caducidad a 90 días. Se prueba directamente, sin BD ni
 * red: el reloj y la aleatoriedad se inyectan.
 */
import { describe, it, expect } from "vitest";

import {
  addDaysIso,
  computeCouponDiscountCents,
  computeLinePoints,
  computeVisitPoints,
  formatRewardCode,
  milestoneForVisitCount,
  randomRewardSuffix,
} from "@/lib/loyalty/points";
import { LOYALTY_MILESTONES } from "@/lib/loyalty/types";

describe("computeLinePoints — puntos por línea", () => {
  it("regla por defecto: ceil(price_cents / 200) ≈ 1 punto por cada 2 €", () => {
    expect(computeLinePoints({ price_cents: 2000 })).toBe(10); // 20 € → 10
    expect(computeLinePoints({ price_cents: 4500 })).toBe(23); // 45 € → 22,5 → 23
    expect(computeLinePoints({ price_cents: 1 })).toBe(1); // 0,01 € → ceil(0,005)
    expect(computeLinePoints({ price_cents: 0 })).toBe(0);
  });

  it("NO usa la fórmula sin corregir (/2): 20 € da 10 puntos, no 1000", () => {
    // Guarda de regresión de la corrección de unidades más importante de la nota.
    expect(computeLinePoints({ price_cents: 2000 })).not.toBe(1000);
  });

  it("el override manual de puntos tiene prioridad sobre el precio", () => {
    expect(computeLinePoints({ price_cents: 9999, points: 5 })).toBe(5);
    expect(computeLinePoints({ price_cents: 9999, points: 0 })).toBe(0);
  });

  it("admite un ratio de puntos configurable (centsPerPoint)", () => {
    // 1 punto por cada 1 € → ceil(price_cents / 100).
    expect(computeLinePoints({ price_cents: 2000 }, 100)).toBe(20);
    expect(computeLinePoints({ price_cents: 150 }, 100)).toBe(2); // 1,5 € → 2
  });

  it("rechaza precios/overrides/ratios no válidos", () => {
    expect(() => computeLinePoints({ price_cents: -1 })).toThrow();
    expect(() => computeLinePoints({ price_cents: 10.5 })).toThrow();
    expect(() => computeLinePoints({ price_cents: 100, points: -2 })).toThrow();
    expect(() => computeLinePoints({ price_cents: 100, points: 1.5 })).toThrow();
    expect(() => computeLinePoints({ price_cents: 100 }, 0)).toThrow();
  });
});

describe("computeVisitPoints — agregación de la visita", () => {
  it("suma puntos y precio de todas las líneas", () => {
    const { pointsTotal, priceCentsTotal } = computeVisitPoints([
      { price_cents: 4500 }, // 23
      { price_cents: 2000 }, // 10
    ]);
    expect(pointsTotal).toBe(33);
    expect(priceCentsTotal).toBe(6500);
  });

  it("respeta overrides por línea en la suma", () => {
    const { pointsTotal, priceCentsTotal } = computeVisitPoints([
      { price_cents: 4500, points: 1 },
      { price_cents: 2000 }, // 10
    ]);
    expect(pointsTotal).toBe(11);
    expect(priceCentsTotal).toBe(6500);
  });

  it("una visita sin líneas suma 0 (el guard de 'sin líneas' está en awardVisit)", () => {
    expect(computeVisitPoints([])).toEqual({ pointsTotal: 0, priceCentsTotal: 0 });
  });
});

describe("milestoneForVisitCount — hitos 3/5/8/10", () => {
  it("devuelve el hito SOLO en la coincidencia exacta", () => {
    expect(milestoneForVisitCount(3)?.rewardType).toBe("SCALP_DIAGNOSIS");
    expect(milestoneForVisitCount(5)?.rewardType).toBe("EXPRESS_TREATMENT");
    expect(milestoneForVisitCount(8)?.rewardType).toBe("RETAIL_VOUCHER");
    expect(milestoneForVisitCount(10)?.rewardType).toBe("PACK_UPGRADE");
  });

  it("no hay hito entre valores ni a partir de la visita 11", () => {
    for (const n of [0, 1, 2, 4, 6, 7, 9, 11, 12, 20]) {
      expect(milestoneForVisitCount(n)).toBeNull();
    }
  });

  it("el catálogo tiene exactamente los 4 hitos de la réplica v1", () => {
    expect(LOYALTY_MILESTONES.map((m) => m.visits)).toEqual([3, 5, 8, 10]);
  });
});

describe("randomRewardSuffix + formatRewardCode — código RW-XXX-YYYYYY", () => {
  it("mapea cada byte al alfabeto alfanumérico MAYÚSCULAS (byte % 36)", () => {
    // Índices 0='A', 1='B', 2='C', 25='Z', 26='0', 35='9'.
    const bytes = Uint8Array.from([0, 1, 2, 25, 26, 35]);
    expect(randomRewardSuffix(() => bytes, 6)).toBe("ABCZ09");
  });

  it("envuelve los bytes ≥ 36 (módulo del alfabeto)", () => {
    // 36 % 36 = 0 → 'A'; 255 % 36 = 3 → 'D'.
    expect(randomRewardSuffix(() => Uint8Array.from([36, 255]), 2)).toBe("AD");
  });

  it("compone RW-<3 primeras del tipo, en mayúsculas>-<sufijo>", () => {
    expect(formatRewardCode("SCALP_DIAGNOSIS", "ABC123")).toBe("RW-SCA-ABC123");
    expect(formatRewardCode("express_treatment", "Z9Y8X7")).toBe("RW-EXP-Z9Y8X7");
  });

  it("el sufijo por defecto tiene 6 caracteres", () => {
    const suffix = randomRewardSuffix(() => Uint8Array.from([1, 2, 3, 4, 5, 6]));
    expect(suffix).toHaveLength(6);
  });
});

describe("computeCouponDiscountCents — descuento del cupón", () => {
  it("aplica el porcentaje con redondeo comercial", () => {
    expect(computeCouponDiscountCents(2000, 10)).toBe(200); // 10 % de 20 €
    expect(computeCouponDiscountCents(999, 10)).toBe(100); // 99,9 → 100
  });

  it("nunca supera el importe total (saturación) y un 100 % iguala el total", () => {
    expect(computeCouponDiscountCents(5000, 100)).toBe(5000);
  });

  it("rechaza importes o porcentajes fuera de rango", () => {
    expect(() => computeCouponDiscountCents(-1, 10)).toThrow();
    expect(() => computeCouponDiscountCents(100.5, 10)).toThrow();
    expect(() => computeCouponDiscountCents(1000, 0)).toThrow();
    expect(() => computeCouponDiscountCents(1000, 150)).toThrow();
  });
});

describe("addDaysIso — caducidad a 90 días", () => {
  it("suma exactamente 90 días en UTC", () => {
    const now = new Date("2026-07-16T00:00:00.000Z");
    expect(addDaysIso(now, 90)).toBe("2026-10-14T00:00:00.000Z");
  });

  it("conserva la hora del instante base", () => {
    const now = new Date("2026-01-01T09:30:00.000Z");
    expect(addDaysIso(now, 90)).toBe("2026-04-01T09:30:00.000Z");
  });
});
