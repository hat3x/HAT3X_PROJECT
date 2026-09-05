### Task 1: Lógica pura del plan de pago (cálculo + saldo)

**Files:**
- Create: `src/lib/dental/ortho-payments.ts`
- Modify: `src/lib/dental/index.ts` (añadir `export * from "./ortho-payments";`)
- Test: `src/tests/unit/ortho-payments-logic.test.ts`

**Interfaces:**
- Produces: tipos `OrthoPlanStatus`, `OrthoInstallmentStatus`, `OrthoPaymentMethod`; label maps `ORTHO_PLAN_STATUS_LABELS`, `ORTHO_PAYMENT_METHOD_LABELS`; `ScheduleInput`, `ScheduledInstallment`; `computeInstallmentSchedule(input): ScheduledInstallment[]`; `BalanceInstallment`, `PlanBalance`, `computePlanBalance(installments, todayIso): PlanBalance`; `isOverdue(inst, todayIso): boolean`.

- [ ] **Step 1: Write the failing test**

```ts
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
    expect(rows[2].dueDate).toBe("2026-10-05");
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
    expect(rows[0].dueDate).toBe("2026-02-28"); // feb 2026 no bisiesto
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/unit/ortho-payments-logic.test.ts`
Expected: FAIL — cannot find module `@/lib/dental/ortho-payments`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/dental/ortho-payments.ts
/** Plan de pago de ortodoncia (Fase 2): cálculo del calendario y del saldo. Puro, sin IO. */

export type OrthoPlanStatus = "activo" | "completado" | "cancelado";
export type OrthoInstallmentStatus = "pendiente" | "pagada";
export type OrthoPaymentMethod = "efectivo" | "tarjeta" | "transferencia" | "otro";

export const ORTHO_PLAN_STATUS_LABELS: Record<OrthoPlanStatus, string> = {
  activo: "Activo",
  completado: "Completado",
  cancelado: "Cancelado",
};

export const ORTHO_PAYMENT_METHOD_LABELS: Record<OrthoPaymentMethod, string> = {
  efectivo: "Efectivo",
  tarjeta: "Tarjeta",
  transferencia: "Transferencia",
  otro: "Otro",
};

export interface ScheduleInput {
  totalCents: number;
  downPaymentCents: number;
  installmentCount: number; // N cuotas (>= 1)
  dayOfMonth: number; // 1..31 (se clampa al último día del mes)
  startDate: string; // ISO "YYYY-MM-DD"
}

export interface ScheduledInstallment {
  seq: number; // 0 = entrada, 1..N = cuotas
  dueDate: string; // ISO "YYYY-MM-DD"
  amountCents: number;
}

function daysInMonth(year: number, month0: number): number {
  return new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
}

/** Devuelve la fecha ISO `months` meses después de `iso`, con día `day` clampado al mes. */
function addMonthsClamped(iso: string, months: number, day: number): string {
  const [y, m] = iso.split("-").map(Number) as [number, number, number];
  const total0 = m - 1 + months;
  const year = y + Math.floor(total0 / 12);
  const month0 = ((total0 % 12) + 12) % 12;
  const d = Math.min(day, daysInMonth(year, month0));
  return `${year}-${String(month0 + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/**
 * Calendario del plan: entrada (seq 0, solo si down > 0, vence en start_date) + N cuotas
 * (seq 1..N, financiado repartido; el resto en céntimos va a las primeras cuotas; vencen el
 * día `dayOfMonth` de cada mes tras el de inicio). Invariante: Σ amountCents === totalCents.
 */
export function computeInstallmentSchedule(input: ScheduleInput): ScheduledInstallment[] {
  const { totalCents, downPaymentCents, installmentCount: n, dayOfMonth, startDate } = input;
  const out: ScheduledInstallment[] = [];

  if (downPaymentCents > 0) {
    out.push({ seq: 0, dueDate: startDate, amountCents: downPaymentCents });
  }

  const financed = totalCents - downPaymentCents;
  const base = Math.floor(financed / n);
  const remainder = financed - base * n;

  for (let k = 1; k <= n; k++) {
    const amountCents = base + (k <= remainder ? 1 : 0);
    out.push({ seq: k, dueDate: addMonthsClamped(startDate, k, dayOfMonth), amountCents });
  }

  return out;
}

export interface BalanceInstallment {
  status: OrthoInstallmentStatus;
  dueDate: string;
  amountCents: number;
  paidAmountCents?: number | null;
}

export interface PlanBalance {
  paidCents: number;
  pendingCents: number;
  overdueCount: number;
  nextDueDate: string | null;
  nextAmountCents: number | null;
}

export function isOverdue(
  inst: { status: OrthoInstallmentStatus; dueDate: string },
  todayIso: string,
): boolean {
  return inst.status === "pendiente" && inst.dueDate < todayIso;
}

/** Resumen de saldo derivado de las cuotas (todo en céntimos). `todayIso` = "YYYY-MM-DD". */
export function computePlanBalance(
  installments: readonly BalanceInstallment[],
  todayIso: string,
): PlanBalance {
  let paidCents = 0;
  let pendingCents = 0;
  let overdueCount = 0;
  let next: BalanceInstallment | null = null;

  for (const it of installments) {
    if (it.status === "pagada") {
      paidCents += it.paidAmountCents ?? it.amountCents;
    } else {
      pendingCents += it.amountCents;
      if (isOverdue(it, todayIso)) overdueCount += 1;
      if (next === null || it.dueDate < next.dueDate) next = it;
    }
  }

  return {
    paidCents,
    pendingCents,
    overdueCount,
    nextDueDate: next?.dueDate ?? null,
    nextAmountCents: next?.amountCents ?? null,
  };
}
```

Luego añade a `src/lib/dental/index.ts` (una línea, conservando lo existente):

```ts
export * from "./ortho-payments";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/tests/unit/ortho-payments-logic.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/dental/ortho-payments.ts src/lib/dental/index.ts src/tests/unit/ortho-payments-logic.test.ts
git commit -m "feat(ortodoncia): logica plan de pago (calendario + saldo)"
```

---

