// src/tests/unit/ortho-payments-logic.test.ts
import { describe, it, expect } from "vitest";

import {
  computeInstallmentSchedule,
  computePlanBalance,
  isOverdue,
} from "@/lib/dental/ortho-payments";

describe("computeInstallmentSchedule", () => {
  it("genera entrada + N cuotas y la suma cuadra con el total", () => {
    const rows = computeInstallmentSchedule({
      totalCents: 300000,
      downPaymentCents: 60000,
      installmentCount: 24,
      dayOfMonth: 5,
      startDate: "2026-08-20",
    });
    expect(rows[0]).toEqual({ seq: 0, dueDate: "2026-08-20", amountCents: 60000 });
    expect(rows).toHaveLength(25); // entrada + 24
    expect(rows[1]).toEqual({ seq: 1, dueDate: "2026-09-05", amountCents: 10000 });
    expect(rows[2]!.dueDate).toBe("2026-10-05");
    const sum = rows.reduce((a, r) => a + r.amountCents, 0);
    expect(sum).toBe(300000);
  });

  it("reparte el resto en céntimos en las primeras cuotas (suma exacta)", () => {
    const rows = computeInstallmentSchedule({
      totalCents: 100000,
      downPaymentCents: 0,
      installmentCount: 3,
      dayOfMonth: 1,
      startDate: "2026-01-15",
    });
    // sin entrada (down 0); 100000/3 = 33333 resto 1 → 33334,33333,33333
    expect(rows.map((r) => r.amountCents)).toEqual([33334, 33333, 33333]);
    expect(rows.reduce((a, r) => a + r.amountCents, 0)).toBe(100000);
  });

  it("clampa el día del mes cuando el mes es más corto", () => {
    const rows = computeInstallmentSchedule({
      totalCents: 12000,
      downPaymentCents: 0,
      installmentCount: 1,
      dayOfMonth: 31,
      startDate: "2026-01-15",
    });
    expect(rows[0]!.dueDate).toBe("2026-02-28"); // feb 2026 no bisiesto
  });
});

describe("computePlanBalance", () => {
  const installments = [
    { seq: 0, dueDate: "2026-08-20", amountCents: 60000, status: "pagada" as const, paidAmountCents: 60000 },
    { seq: 1, dueDate: "2026-09-05", amountCents: 10000, status: "pendiente" as const, paidAmountCents: null },
    { seq: 2, dueDate: "2026-10-05", amountCents: 10000, status: "pendiente" as const, paidAmountCents: null },
  ];
  it("calcula pagado/pendiente, vencidas y próxima cuota", () => {
    const b = computePlanBalance(installments, "2026-09-10");
    expect(b.paidCents).toBe(60000);
    expect(b.pendingCents).toBe(20000);
    expect(b.overdueCount).toBe(1); // la del 09-05 vencida el 09-10
    expect(b.nextDueDate).toBe("2026-09-05");
    expect(b.nextAmountCents).toBe(10000);
  });
});

describe("isOverdue", () => {
  it("pendiente con vencimiento pasado = vencida", () => {
    expect(isOverdue({ status: "pendiente", dueDate: "2026-09-05" }, "2026-09-10")).toBe(true);
  });
  it("pagada nunca es vencida", () => {
    expect(isOverdue({ status: "pagada", dueDate: "2026-09-05" }, "2026-09-10")).toBe(false);
  });
});
