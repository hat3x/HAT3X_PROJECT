import { describe, it, expect } from "vitest";

import { createOrthoPlanSchema, payInstallmentSchema } from "@/lib/validations/ortho-payments";

describe("createOrthoPlanSchema", () => {
  const base = {
    totalCents: 300000,
    downPaymentCents: 60000,
    installmentCount: 24,
    dayOfMonth: 5,
    startDate: "2026-08-20",
  };

  it("acepta un plan válido", () => {
    expect(createOrthoPlanSchema.safeParse(base).success).toBe(true);
  });

  it("rechaza entrada mayor que el total", () => {
    const r = createOrthoPlanSchema.safeParse({ ...base, downPaymentCents: 400000 });
    expect(r.success).toBe(false);
  });

  it("rechaza si lo financiado es menor que el nº de cuotas (cuota < 1 céntimo)", () => {
    const r = createOrthoPlanSchema.safeParse({
      ...base,
      totalCents: 10,
      downPaymentCents: 0,
      installmentCount: 24,
    });
    expect(r.success).toBe(false);
  });

  it("rechaza día de cobro fuera de 1..31", () => {
    expect(createOrthoPlanSchema.safeParse({ ...base, dayOfMonth: 0 }).success).toBe(false);
    expect(createOrthoPlanSchema.safeParse({ ...base, dayOfMonth: 32 }).success).toBe(false);
  });
});

describe("payInstallmentSchema", () => {
  it("acepta un método válido", () => {
    expect(payInstallmentSchema.safeParse({ method: "tarjeta" }).success).toBe(true);
  });
  it("rechaza un método desconocido", () => {
    expect(payInstallmentSchema.safeParse({ method: "bizum" }).success).toBe(false);
  });
});
