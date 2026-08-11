import { describe, it, expect } from "vitest";

import { orthoDataSchema, orthoVisitSchema } from "@/lib/validations/ortho";

describe("orthoDataSchema", () => {
  it("acepta una ficha/tratamiento vacíos (todo opcional)", () => {
    const result = orthoDataSchema.safeParse({ ficha: {}, treatment: {} });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.ficha.malocclusionClass).toBeNull();
      expect(result.data.ficha.diastema).toBe(false);
    }
  });

  it("acepta valores válidos de enums y mm", () => {
    const result = orthoDataSchema.safeParse({
      ficha: { malocclusionClass: "II-1", overjetMm: 4, diastema: true },
      treatment: { applianceType: "alineadores", estimatedMonths: 24, status: "activo" },
    });
    expect(result.success).toBe(true);
  });

  it("rechaza un enum inválido de aparatología", () => {
    const result = orthoDataSchema.safeParse({
      ficha: {},
      treatment: { applianceType: "invisible-brand-x" },
    });
    expect(result.success).toBe(false);
  });
});

describe("orthoVisitSchema", () => {
  it("acepta una visita mínima con fecha ISO", () => {
    const result = orthoVisitSchema.safeParse({
      visitDate: "2026-08-12",
      actions: { wireChange: true },
    });
    expect(result.success).toBe(true);
  });

  it("rechaza una fecha con formato no-ISO", () => {
    const result = orthoVisitSchema.safeParse({ visitDate: "12/08/2026", actions: {} });
    expect(result.success).toBe(false);
  });
});
