import { describe, it, expect } from "vitest";

import { createLabOrderSchema, markLabDateSchema } from "@/lib/validations/lab-orders";
import { orthoTreatmentSchema } from "@/lib/validations/ortho";

describe("createLabOrderSchema", () => {
  const base = { kind: "alineadores", labName: "Lab X", sentAt: "2026-08-10" };
  it("acepta un pedido válido", () => {
    expect(createLabOrderSchema.safeParse(base).success).toBe(true);
  });
  it("rechaza un kind inválido", () => {
    expect(createLabOrderSchema.safeParse({ ...base, kind: "corona" }).success).toBe(false);
  });
  it("rechaza fecha no-ISO", () => {
    expect(createLabOrderSchema.safeParse({ ...base, sentAt: "10/08/2026" }).success).toBe(false);
  });
});

describe("markLabDateSchema", () => {
  it("acepta fecha ISO", () => {
    expect(markLabDateSchema.safeParse({ date: "2026-08-12" }).success).toBe(true);
  });
  it("rechaza fecha no-ISO", () => {
    expect(markLabDateSchema.safeParse({ date: "hoy" }).success).toBe(false);
  });
});

describe("orthoTreatmentSchema alignerTotal", () => {
  it("acepta alignerTotal entero y nulo (default)", () => {
    expect(orthoTreatmentSchema.safeParse({ alignerTotal: 24 }).success).toBe(true);
    expect(orthoTreatmentSchema.safeParse({}).success).toBe(true); // default null
  });
  it("rechaza alignerTotal 0", () => {
    expect(orthoTreatmentSchema.safeParse({ alignerTotal: 0 }).success).toBe(false);
  });
});
