### Task 2: Validación Zod (pedido + alignerTotal en tratamiento)

**Files:**
- Create: `src/lib/validations/lab-orders.ts`
- Modify: `src/lib/validations/ortho.ts` (añadir `alignerTotal` a `orthoTreatmentSchema`)
- Test: `src/tests/unit/lab-orders-schema.test.ts`

**Interfaces:**
- Produces: `createLabOrderSchema`, `CreateLabOrderInput`; `markLabDateSchema`, `MarkLabDateInput`. Extiende `orthoTreatmentSchema` con `alignerTotal`.

- [ ] **Step 1: Write the failing test**

```ts
// src/tests/unit/lab-orders-schema.test.ts
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
```

> **Nota para el implementador:** `orthoTreatmentSchema.safeParse({})` debe seguir pasando (todos los campos con default/optional). Si en el schema actual algún campo es requerido sin default, ajusta el test para incluir un objeto de tratamiento mínimo válido en vez de `{}`, pero **no cambies** la obligatoriedad de campos existentes. Lo que se verifica aquí es únicamente que `alignerTotal` acepta entero, nulo por defecto, y rechaza 0.

- [ ] **Step 2: Run test to verify it fails** — Run: `npx vitest run src/tests/unit/lab-orders-schema.test.ts` → FAIL.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/validations/lab-orders.ts
import { z } from "zod";

export const createLabOrderSchema = z.object({
  kind: z.enum(["modelo", "retenedor", "alineadores", "ortopedia", "otro"]),
  labName: z.string().trim().max(200).nullable().default(null),
  sentAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha no válida"),
  notes: z.string().trim().max(2000).nullable().default(null),
});

export type CreateLabOrderInput = z.input<typeof createLabOrderSchema>;

export const markLabDateSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha no válida"),
});

export type MarkLabDateInput = z.input<typeof markLabDateSchema>;
```

En `src/lib/validations/ortho.ts`, dentro de `orthoTreatmentSchema` (junto a los demás campos):
```ts
  alignerTotal: z.number().int().min(1).max(120).nullable().default(null),
```

- [ ] **Step 4: Run test to verify it passes** — Run: `npx vitest run src/tests/unit/lab-orders-schema.test.ts` → PASS. `npx tsc --noEmit` → 0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/validations/lab-orders.ts src/lib/validations/ortho.ts src/tests/unit/lab-orders-schema.test.ts
git commit -m "feat(ortodoncia): esquemas Zod pedido laboratorio + alignerTotal"
```

---

