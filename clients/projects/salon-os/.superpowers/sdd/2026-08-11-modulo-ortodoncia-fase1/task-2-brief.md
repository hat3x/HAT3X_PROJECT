### Task 2: Validación Zod (ficha/tratamiento + visita)

**Files:**
- Create: `src/lib/validations/ortho.ts`
- Test: `src/tests/unit/ortho-schema.test.ts`

**Interfaces:**
- Consumes: nada (Zod puro).
- Produces: `orthoDataSchema`, `OrthoDataInput`, `OrthoDataValues`; `orthoVisitSchema`, `OrthoVisitInput`, `OrthoVisitValues`; sub-esquemas `orthoFichaSchema`, `orthoTreatmentSchema`, `orthoVisitActionsSchema`.

- [ ] **Step 1: Write the failing test**

```ts
// src/tests/unit/ortho-schema.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/unit/ortho-schema.test.ts`
Expected: FAIL — cannot find module `@/lib/validations/ortho`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/validations/ortho.ts
import { z } from "zod";

const optionalText = (max: number) =>
  z.string().trim().max(max).nullable().default(null);

export const orthoFichaSchema = z.object({
  malocclusionClass: z.enum(["I", "II-1", "II-2", "III"]).nullable().default(null),
  crowdingUpper: z.enum(["ninguno", "leve", "moderado", "severo"]).nullable().default(null),
  crowdingLower: z.enum(["ninguno", "leve", "moderado", "severo"]).nullable().default(null),
  diastema: z.boolean().default(false),
  diastemaNote: optionalText(500),
  crossbite: z.enum(["ninguna", "anterior", "posterior"]).nullable().default(null),
  overjetMm: z.number().min(-20).max(40).nullable().default(null),
  overbiteMm: z.number().min(-20).max(40).nullable().default(null),
  openBite: z.boolean().default(false),
  diagnosisNotes: optionalText(4000),
});

export const orthoTreatmentSchema = z.object({
  applianceType: z
    .enum(["brackets_metalicos", "brackets_esteticos", "alineadores", "ortopedia"])
    .nullable()
    .default(null),
  arch: z.enum(["superior", "inferior", "ambas"]).nullable().default(null),
  estimatedMonths: z.number().int().min(1).max(120).nullable().default(null),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha no válida").nullable().default(null),
  status: z.enum(["activo", "retencion", "finalizado", "cancelado"]).nullable().default(null),
  objectives: optionalText(4000),
});

export const orthoDataSchema = z.object({
  ficha: orthoFichaSchema,
  treatment: orthoTreatmentSchema,
});

export type OrthoDataInput = z.input<typeof orthoDataSchema>;
export type OrthoDataValues = z.output<typeof orthoDataSchema>;

export const orthoVisitActionsSchema = z.object({
  wireChange: z.boolean().default(false),
  wireDetail: optionalText(300),
  ligatures: z.boolean().default(false),
  elastics: z.boolean().default(false),
  elasticsDetail: optionalText(300),
  alignerDelivered: z.number().int().min(0).max(200).nullable().default(null),
});

export const orthoVisitSchema = z.object({
  visitDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha no válida"),
  appointmentId: z.string().uuid().nullable().default(null),
  actions: orthoVisitActionsSchema,
  notes: optionalText(4000),
  nextStep: optionalText(1000),
});

export type OrthoVisitInput = z.input<typeof orthoVisitSchema>;
export type OrthoVisitValues = z.output<typeof orthoVisitSchema>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/tests/unit/ortho-schema.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/validations/ortho.ts src/tests/unit/ortho-schema.test.ts
git commit -m "feat(ortodoncia): esquemas Zod ficha/tratamiento/visita"
```

---

