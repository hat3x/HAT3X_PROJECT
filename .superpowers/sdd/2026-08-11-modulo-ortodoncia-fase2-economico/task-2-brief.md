### Task 2: Validación Zod (crear plan + cobrar cuota)

**Files:**
- Create: `src/lib/validations/ortho-payments.ts`
- Test: `src/tests/unit/ortho-payments-schema.test.ts`

**Interfaces:**
- Produces: `createOrthoPlanSchema`, `CreateOrthoPlanInput`, `CreateOrthoPlanValues`; `payInstallmentSchema`, `PayInstallmentInput`.

- [ ] **Step 1: Write the failing test**

```ts
// src/tests/unit/ortho-payments-schema.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/unit/ortho-payments-schema.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/validations/ortho-payments.ts
import { z } from "zod";

export const createOrthoPlanSchema = z
  .object({
    totalCents: z.number().int().min(1),
    downPaymentCents: z.number().int().min(0),
    installmentCount: z.number().int().min(1).max(120),
    dayOfMonth: z.number().int().min(1).max(31),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha no válida"),
    notes: z.string().trim().max(2000).nullable().default(null),
  })
  .refine((v) => v.downPaymentCents <= v.totalCents, {
    message: "La entrada no puede superar el total",
    path: ["downPaymentCents"],
  })
  .refine((v) => v.totalCents - v.downPaymentCents >= v.installmentCount, {
    message: "El importe a financiar es menor que el número de cuotas",
    path: ["installmentCount"],
  });

export type CreateOrthoPlanInput = z.input<typeof createOrthoPlanSchema>;
export type CreateOrthoPlanValues = z.output<typeof createOrthoPlanSchema>;

export const payInstallmentSchema = z.object({
  method: z.enum(["efectivo", "tarjeta", "transferencia", "otro"]),
});

export type PayInstallmentInput = z.input<typeof payInstallmentSchema>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/tests/unit/ortho-payments-schema.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/validations/ortho-payments.ts src/tests/unit/ortho-payments-schema.test.ts
git commit -m "feat(ortodoncia): esquemas Zod plan de pago"
```

---

