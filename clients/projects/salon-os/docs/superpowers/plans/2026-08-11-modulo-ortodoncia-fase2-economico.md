# Módulo Ortodoncia — Fase 2 (económico: plan de pago) · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Añadir a `/ortodoncia` un "Plan de pago" (presupuesto cerrado = entrada + N mensualidades) con calendario de cuotas, cobro ligero, saldos y aviso de morosidad en la agenda.

**Architecture:** 2 tablas nuevas (`ortho_payment_plan` + `ortho_installment`). El calendario se calcula en TypeScript puro y se inserta atómicamente vía RPC `create_ortho_payment_plan` (SECURITY DEFINER). La morosidad es **derivada** (cuota pendiente con `due_date < hoy`), sin cron. El cobro marca la cuota pagada (no toca TPV/caja en esta fase). La UI se construye con la skill `ui-ux-pro-max`.

**Tech Stack:** Next.js 14 App Router, TypeScript strict, Supabase (Postgres + RLS + RPC), Zod, TanStack Query v5, Vitest, Tailwind + shadcn/ui.

## Global Constraints

- Rama `hat3x/HAT3X-038` (repo `clients/projects/salon-os`, repo git propio).
- **Dinero en céntimos** (enteros); formatear con `formatMoney(cents, currency)` de `@/lib/format`.
- Todo escritura acotada por `salon_id`; sector gate `salon.sector !== "odontologia"` en cada server action.
- Gate de rol: crear/cancelar/deshacer plan = **owner/manager**; cobrar cuota = **owner/manager/staff**.
- **RSC boundary** ([[reference_salonos_rsc_boundary]]): componentes cliente NUNCA importan de `@/lib/salon`; `salonId`/`sector` se resuelven en el server page y se pasan como prop.
- Morosidad **derivada**, no almacenada. **Sin cron.** Cobro = cuota completa (`paid_amount = amount`), sin pagos parciales.
- Migraciones por Supabase Management API (`POST https://api.supabase.com/v1/projects/jztoyekixcziaicrnlce/database/migrations`, `User-Agent: Mozilla/5.0`, `Content-Type: application/sql`) — **las aplica el usuario** (en este entorno no hay token `sbp_` ni conexión directa a Postgres).
- **UI con `ui-ux-pro-max`**: la tarea de UI DEBE invocar la skill `ui-ux-pro-max` antes de escribir el componente. Estados loading/empty/error cuidados, responsive, jerarquía visual.
- Verde obligatorio antes de desplegar: `npx tsc --noEmit` = 0 y suite Vitest completa.

---

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

### Task 3: Migración (2 tablas + RLS + RPC) + tipos en database.ts

**Files:**
- Create: `supabase/migrations/20260811130000_ortho_payments.sql`
- Modify: `src/types/database.ts` (tablas `ortho_payment_plan` + `ortho_installment`, alias, y la función `create_ortho_payment_plan` en la sección `Functions`)

**Interfaces:**
- Produces: tablas + enums + RPC; tipos `OrthoPaymentPlan = Tables<"ortho_payment_plan">`, `OrthoInstallment = Tables<"ortho_installment">`; función RPC tipada.

- [ ] **Step 1: Escribir la migración**

```sql
-- supabase/migrations/20260811130000_ortho_payments.sql
-- Plan de pago de ortodoncia (Fase 2): presupuesto cerrado a plazos.
--
-- APLICACIÓN VÍA MANAGEMENT API:
--   POST https://api.supabase.com/v1/projects/jztoyekixcziaicrnlce/database/migrations
--   User-Agent: Mozilla/5.0
--   Authorization: Bearer <token>
--   Content-Type: application/sql
--   Body: <contenido de este archivo>

begin;

create type public.ortho_plan_status as enum ('activo', 'completado', 'cancelado');
create type public.ortho_installment_status as enum ('pendiente', 'pagada');

create table public.ortho_payment_plan (
  id                 uuid primary key default gen_random_uuid(),
  salon_id           uuid not null references public.salons(id) on delete cascade,
  customer_id        uuid not null,
  total_cents        integer not null check (total_cents > 0),
  down_payment_cents integer not null default 0 check (down_payment_cents >= 0),
  installment_count  integer not null check (installment_count >= 1),
  day_of_month       smallint not null check (day_of_month between 1 and 31),
  start_date         date not null,
  currency           char(3) not null default 'EUR',
  status             public.ortho_plan_status not null default 'activo',
  notes              text,
  created_by         uuid,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  check (down_payment_cents <= total_cents),
  constraint ortho_payment_plan_customer_fk
    foreign key (customer_id, salon_id)
    references public.clinical_records (customer_id, salon_id) on delete cascade,
  unique (id, salon_id)
);

-- Solo UN plan activo por paciente.
create unique index ortho_payment_plan_one_active
  on public.ortho_payment_plan (customer_id, salon_id) where status = 'activo';

create table public.ortho_installment (
  id                uuid primary key default gen_random_uuid(),
  salon_id          uuid not null,
  plan_id           uuid not null,
  customer_id       uuid not null,
  seq               smallint not null,
  due_date          date not null,
  amount_cents      integer not null check (amount_cents > 0),
  status            public.ortho_installment_status not null default 'pendiente',
  paid_at           timestamptz,
  paid_method       text,
  paid_amount_cents integer,
  created_at        timestamptz not null default now(),
  constraint ortho_installment_plan_fk
    foreign key (plan_id, salon_id)
    references public.ortho_payment_plan (id, salon_id) on delete cascade,
  unique (plan_id, seq)
);

create index ortho_installment_plan_idx on public.ortho_installment (salon_id, plan_id, seq);
create index ortho_installment_overdue_idx
  on public.ortho_installment (salon_id, customer_id, status, due_date);

alter table public.ortho_payment_plan enable row level security;
alter table public.ortho_installment  enable row level security;

create policy ortho_payment_plan_rw on public.ortho_payment_plan
  for all using (salon_id in (select app.user_salon_ids()))
  with check (salon_id in (select app.user_salon_ids()));
create policy ortho_installment_rw on public.ortho_installment
  for all using (salon_id in (select app.user_salon_ids()))
  with check (salon_id in (select app.user_salon_ids()));

-- Creación atómica del plan + sus cuotas. El calendario se calcula en la app y se
-- pasa como p_installments (array de {seq, dueDate, amountCents}). Gate owner/manager.
create or replace function public.create_ortho_payment_plan(
  p_salon_id           uuid,
  p_customer_id        uuid,
  p_total_cents        integer,
  p_down_payment_cents integer,
  p_installment_count  integer,
  p_day_of_month       integer,
  p_start_date         date,
  p_currency           text,
  p_notes              text,
  p_installments       jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_plan_id uuid;
  v_line    jsonb;
begin
  if v_uid is null then
    raise exception 'UNAUTHORIZED' using errcode = '28000';
  end if;
  perform 1 from public.salon_members
    where user_id = v_uid and salon_id = p_salon_id and role in ('owner', 'manager');
  if not found then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  perform 1 from public.ortho_payment_plan
    where salon_id = p_salon_id and customer_id = p_customer_id and status = 'activo';
  if found then
    raise exception 'PLAN_EXISTS' using errcode = '23505';
  end if;

  insert into public.ortho_payment_plan (
    salon_id, customer_id, total_cents, down_payment_cents, installment_count,
    day_of_month, start_date, currency, status, notes, created_by
  ) values (
    p_salon_id, p_customer_id, p_total_cents, p_down_payment_cents, p_installment_count,
    p_day_of_month, p_start_date, coalesce(p_currency, 'EUR'), 'activo', p_notes, v_uid
  ) returning id into v_plan_id;

  for v_line in select * from jsonb_array_elements(p_installments) loop
    insert into public.ortho_installment (salon_id, plan_id, customer_id, seq, due_date, amount_cents, status)
      values (
        p_salon_id, v_plan_id, p_customer_id,
        (v_line->>'seq')::smallint, (v_line->>'dueDate')::date, (v_line->>'amountCents')::integer,
        'pendiente'
      );
  end loop;

  return v_plan_id;
end;
$$;

revoke all on function public.create_ortho_payment_plan(uuid, uuid, integer, integer, integer, integer, date, text, text, jsonb) from public;
grant execute on function public.create_ortho_payment_plan(uuid, uuid, integer, integer, integer, integer, date, text, text, jsonb) to authenticated;

commit;
```

- [ ] **Step 2: Aplicar la migración (usuario) y verificar**

El usuario aplica el SQL en el editor de Supabase (o el controlador con token). Verificar por REST con la service-role key:
```
GET https://jztoyekixcziaicrnlce.supabase.co/rest/v1/ortho_payment_plan?select=id&limit=1
GET https://jztoyekixcziaicrnlce.supabase.co/rest/v1/ortho_installment?select=id&limit=1
```
Expected: `200 []` en ambas.

- [ ] **Step 3: Tipos en `src/types/database.ts`**

Dentro de `Database["public"]["Tables"]`, junto a las demás dentales, añadir DOS bloques (Row/Insert/Update/Relationships) para `ortho_payment_plan` y `ortho_installment`, siguiendo el molde de `ortho_visit` (mismo estilo). Columnas exactas: las del `create table` de arriba (fechas → `string`, `*_cents`/`installment_count`/`day_of_month`/`seq` → `number`, `status` → los union de enum `"activo"|"completado"|"cancelado"` y `"pendiente"|"pagada"`, nullables → `| null`, defaults → opcionales en Insert con `?`).

En la sección `Database["public"]["Functions"]` añadir:

```ts
      create_ortho_payment_plan: {
        Args: {
          p_salon_id: string;
          p_customer_id: string;
          p_total_cents: number;
          p_down_payment_cents: number;
          p_installment_count: number;
          p_day_of_month: number;
          p_start_date: string;
          p_currency: string;
          p_notes: string | null;
          p_installments: Json;
        };
        Returns: string;
      };
```

Y junto a los alias exportados:

```ts
export type OrthoPaymentPlan = Tables<"ortho_payment_plan">;
export type OrthoInstallment = Tables<"ortho_installment">;
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260811130000_ortho_payments.sql src/types/database.ts
git commit -m "feat(ortodoncia): tablas plan de pago + RPC atomica + tipos"
```

---

### Task 4: Capa de queries (lectura)

**Files:**
- Create: `src/lib/queries/ortho-payments.ts`

**Interfaces:**
- Consumes: `OrthoPaymentPlan`, `OrthoInstallment` (Task 3).
- Produces: `orthoPaymentKeys`; `fetchOrthoPaymentPlan(salonId, customerId): Promise<{ plan: OrthoPaymentPlan; installments: OrthoInstallment[] } | null>`; `fetchOverdueOrthoCounts(salonId, customerIds, todayIso): Promise<Record<string, number>>`.

- [ ] **Step 1: Escribir la implementación**

```ts
// src/lib/queries/ortho-payments.ts
import { createClient } from "@/lib/supabase/client";
import type { OrthoInstallment, OrthoPaymentPlan } from "@/types/database";

export const orthoPaymentKeys = {
  all: (salonId: string) => ["ortho-payments", salonId] as const,
  plan: (salonId: string, customerId: string) =>
    [...orthoPaymentKeys.all(salonId), "plan", customerId] as const,
  overdue: (salonId: string, customerIds: readonly string[]) =>
    [...orthoPaymentKeys.all(salonId), "overdue", [...customerIds].sort().join(",")] as const,
};

/** Plan de pago ACTIVO del paciente + sus cuotas (ordenadas por seq). `null` si no hay. */
export async function fetchOrthoPaymentPlan(
  salonId: string,
  customerId: string,
): Promise<{ plan: OrthoPaymentPlan; installments: OrthoInstallment[] } | null> {
  const supabase = createClient();

  const { data: plan, error: planErr } = await supabase
    .from("ortho_payment_plan")
    .select("*")
    .eq("salon_id", salonId)
    .eq("customer_id", customerId)
    .eq("status", "activo")
    .maybeSingle();

  if (planErr !== null) throw new Error(planErr.message);
  if (plan === null) return null;

  const { data: installments, error: instErr } = await supabase
    .from("ortho_installment")
    .select("*")
    .eq("salon_id", salonId)
    .eq("plan_id", plan.id)
    .order("seq", { ascending: true });

  if (instErr !== null) throw new Error(instErr.message);
  return { plan, installments: installments ?? [] };
}

/**
 * Nº de cuotas pendientes VENCIDAS por paciente, para el aviso de morosidad de la agenda.
 * `todayIso` = "YYYY-MM-DD" (zona horaria del salón, resuelta por el llamante).
 */
export async function fetchOverdueOrthoCounts(
  salonId: string,
  customerIds: readonly string[],
  todayIso: string,
): Promise<Record<string, number>> {
  const result: Record<string, number> = {};
  if (customerIds.length === 0) return result;

  const supabase = createClient();
  const { data, error } = await supabase
    .from("ortho_installment")
    .select("customer_id")
    .eq("salon_id", salonId)
    .in("customer_id", [...customerIds])
    .eq("status", "pendiente")
    .lt("due_date", todayIso);

  if (error !== null) throw new Error(error.message);
  for (const row of data ?? []) {
    result[row.customer_id] = (result[row.customer_id] ?? 0) + 1;
  }
  return result;
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 3: Commit**

```bash
git add src/lib/queries/ortho-payments.ts
git commit -m "feat(ortodoncia): queries plan de pago + morosidad"
```

---

### Task 5: Server actions (crear vía RPC, cobrar, deshacer, cancelar)

**Files:**
- Create: `src/app/(dashboard)/ortodoncia/payment-actions.ts`
- Test: `src/tests/unit/ortho-payment-actions.test.ts`

**Interfaces:**
- Consumes: `createOrthoPlanSchema`, `CreateOrthoPlanInput`, `payInstallmentSchema`, `PayInstallmentInput` (Task 2); `computeInstallmentSchedule` (Task 1); `Json`, `MemberRole` (types).
- Produces: `ActionResult<T>`; `createOrthoPaymentPlan(customerId, input): Promise<ActionResult<{ planId: string }>>`; `payInstallment(installmentId, input): Promise<ActionResult<null>>`; `unpayInstallment(installmentId): Promise<ActionResult<null>>`; `cancelOrthoPaymentPlan(planId): Promise<ActionResult<null>>`.

- [ ] **Step 1: Write the failing test**

```ts
// src/tests/unit/ortho-payment-actions.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";

const { getActiveSalonMock, getActiveMembershipMock, rpcMock, fromMock, getUserMock } =
  vi.hoisted(() => ({
    getActiveSalonMock: vi.fn(),
    getActiveMembershipMock: vi.fn(),
    rpcMock: vi.fn(),
    fromMock: vi.fn(),
    getUserMock: vi.fn(),
  }));

vi.mock("@/lib/salon", () => ({
  getActiveSalon: () => getActiveSalonMock(),
  getActiveMembership: () => getActiveMembershipMock(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    from: (t: string) => fromMock(t),
    rpc: (fn: string, args: unknown) => rpcMock(fn, args),
    auth: { getUser: () => getUserMock() },
  }),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { createOrthoPaymentPlan } from "@/app/(dashboard)/ortodoncia/payment-actions";

beforeEach(() => {
  vi.clearAllMocks();
  getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
});

describe("createOrthoPaymentPlan", () => {
  it("rechaza si el salón no es odontología", async () => {
    getActiveSalonMock.mockResolvedValue({ id: "s1", sector: "peluqueria" });
    const res = await createOrthoPaymentPlan("c1", {
      totalCents: 300000, downPaymentCents: 60000, installmentCount: 24, dayOfMonth: 5, startDate: "2026-08-20",
    });
    expect(res.ok).toBe(false);
  });

  it("rechaza a staff (crear plan es owner/manager)", async () => {
    getActiveSalonMock.mockResolvedValue({ id: "s1", sector: "odontologia" });
    getActiveMembershipMock.mockResolvedValue({ role: "staff" });
    const res = await createOrthoPaymentPlan("c1", {
      totalCents: 300000, downPaymentCents: 60000, installmentCount: 24, dayOfMonth: 5, startDate: "2026-08-20",
    });
    expect(res.ok).toBe(false);
  });

  it("owner: llama a la RPC con el calendario calculado y devuelve el planId", async () => {
    getActiveSalonMock.mockResolvedValue({ id: "s1", sector: "odontologia" });
    getActiveMembershipMock.mockResolvedValue({ role: "owner" });
    rpcMock.mockResolvedValue({ data: "plan-123", error: null });

    const res = await createOrthoPaymentPlan("c1", {
      totalCents: 300000, downPaymentCents: 60000, installmentCount: 24, dayOfMonth: 5, startDate: "2026-08-20",
    });

    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.planId).toBe("plan-123");
    expect(rpcMock).toHaveBeenCalledTimes(1);
    const [fn, args] = rpcMock.mock.calls[0];
    expect(fn).toBe("create_ortho_payment_plan");
    // entrada + 24 cuotas
    expect((args as { p_installments: unknown[] }).p_installments).toHaveLength(25);
    expect((args as { p_salon_id: string }).p_salon_id).toBe("s1");
  });

  it("traduce el error PLAN_EXISTS de la RPC a un mensaje claro", async () => {
    getActiveSalonMock.mockResolvedValue({ id: "s1", sector: "odontologia" });
    getActiveMembershipMock.mockResolvedValue({ role: "owner" });
    rpcMock.mockResolvedValue({ data: null, error: { message: "PLAN_EXISTS" } });
    const res = await createOrthoPaymentPlan("c1", {
      totalCents: 300000, downPaymentCents: 60000, installmentCount: 24, dayOfMonth: 5, startDate: "2026-08-20",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/ya tiene un plan/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/unit/ortho-payment-actions.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write the implementation**

```ts
// src/app/(dashboard)/ortodoncia/payment-actions.ts
"use server";

import { revalidatePath } from "next/cache";

import { computeInstallmentSchedule } from "@/lib/dental/ortho-payments";
import { getActiveMembership, getActiveSalon } from "@/lib/salon";
import { createClient } from "@/lib/supabase/server";
import {
  createOrthoPlanSchema,
  payInstallmentSchema,
  type CreateOrthoPlanInput,
  type PayInstallmentInput,
} from "@/lib/validations/ortho-payments";
import type { Json, MemberRole } from "@/types/database";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

const ERROR_NO_SALON = "No tienes un salón asignado";
const ERROR_SECTOR = "Esta sección solo está disponible en clínicas dentales";
const ERROR_ROLE = "No tienes permisos para esta acción";

const MANAGER_ROLES: readonly MemberRole[] = ["owner", "manager"];
const STAFF_ROLES: readonly MemberRole[] = ["owner", "manager", "staff"];

async function assertAccess(
  requiredRoles: readonly MemberRole[],
): Promise<{ ok: true; salonId: string } | { ok: false; error: string }> {
  const salon = await getActiveSalon();
  if (salon === null) return { ok: false, error: ERROR_NO_SALON };
  if (salon.sector !== "odontologia") return { ok: false, error: ERROR_SECTOR };
  const membership = await getActiveMembership();
  if (membership === null || !requiredRoles.includes(membership.role)) {
    return { ok: false, error: ERROR_ROLE };
  }
  return { ok: true, salonId: salon.id };
}

/** Crea el plan de pago (entrada + cuotas) de forma atómica vía RPC. Owner/manager. */
export async function createOrthoPaymentPlan(
  customerId: string,
  input: CreateOrthoPlanInput,
): Promise<ActionResult<{ planId: string }>> {
  const parsed = createOrthoPlanSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos no válidos" };
  }

  const access = await assertAccess(MANAGER_ROLES);
  if (!access.ok) return { ok: false, error: access.error };

  const schedule = computeInstallmentSchedule({
    totalCents: parsed.data.totalCents,
    downPaymentCents: parsed.data.downPaymentCents,
    installmentCount: parsed.data.installmentCount,
    dayOfMonth: parsed.data.dayOfMonth,
    startDate: parsed.data.startDate,
  });

  const supabase = createClient();
  const { data, error } = await supabase.rpc("create_ortho_payment_plan", {
    p_salon_id: access.salonId,
    p_customer_id: customerId,
    p_total_cents: parsed.data.totalCents,
    p_down_payment_cents: parsed.data.downPaymentCents,
    p_installment_count: parsed.data.installmentCount,
    p_day_of_month: parsed.data.dayOfMonth,
    p_start_date: parsed.data.startDate,
    p_currency: "EUR",
    p_notes: parsed.data.notes ?? null,
    p_installments: schedule as unknown as Json,
  });

  if (error !== null) {
    if (error.message.includes("PLAN_EXISTS")) {
      return { ok: false, error: "Este paciente ya tiene un plan de pago activo" };
    }
    return { ok: false, error: error.message };
  }

  revalidatePath("/ortodoncia");
  return { ok: true, data: { planId: data as string } };
}

/** Marca una cuota como cobrada (importe completo). Owner/manager/staff. */
export async function payInstallment(
  installmentId: string,
  input: PayInstallmentInput,
): Promise<ActionResult<null>> {
  const parsed = payInstallmentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos no válidos" };
  }

  const access = await assertAccess(STAFF_ROLES);
  if (!access.ok) return { ok: false, error: access.error };

  const supabase = createClient();

  const { data: inst, error: readErr } = await supabase
    .from("ortho_installment")
    .select("id, plan_id, amount_cents")
    .eq("id", installmentId)
    .eq("salon_id", access.salonId)
    .maybeSingle();
  if (readErr !== null) return { ok: false, error: readErr.message };
  if (inst === null) return { ok: false, error: "Cuota no encontrada" };

  const { error } = await supabase
    .from("ortho_installment")
    .update({
      status: "pagada",
      paid_at: new Date().toISOString(),
      paid_method: parsed.data.method,
      paid_amount_cents: inst.amount_cents,
    })
    .eq("id", installmentId)
    .eq("salon_id", access.salonId);
  if (error !== null) return { ok: false, error: error.message };

  // Si no quedan cuotas pendientes en el plan → marcar el plan como completado.
  const { count } = await supabase
    .from("ortho_installment")
    .select("id", { count: "exact", head: true })
    .eq("salon_id", access.salonId)
    .eq("plan_id", inst.plan_id)
    .eq("status", "pendiente");
  if ((count ?? 0) === 0) {
    await supabase
      .from("ortho_payment_plan")
      .update({ status: "completado", updated_at: new Date().toISOString() })
      .eq("id", inst.plan_id)
      .eq("salon_id", access.salonId);
  }

  revalidatePath("/ortodoncia");
  return { ok: true, data: null };
}

/** Deshace el cobro de una cuota. Owner/manager. Reabre el plan si estaba completado. */
export async function unpayInstallment(installmentId: string): Promise<ActionResult<null>> {
  const access = await assertAccess(MANAGER_ROLES);
  if (!access.ok) return { ok: false, error: access.error };

  const supabase = createClient();
  const { data: inst, error: readErr } = await supabase
    .from("ortho_installment")
    .select("id, plan_id")
    .eq("id", installmentId)
    .eq("salon_id", access.salonId)
    .maybeSingle();
  if (readErr !== null) return { ok: false, error: readErr.message };
  if (inst === null) return { ok: false, error: "Cuota no encontrada" };

  const { error } = await supabase
    .from("ortho_installment")
    .update({ status: "pendiente", paid_at: null, paid_method: null, paid_amount_cents: null })
    .eq("id", installmentId)
    .eq("salon_id", access.salonId);
  if (error !== null) return { ok: false, error: error.message };

  await supabase
    .from("ortho_payment_plan")
    .update({ status: "activo", updated_at: new Date().toISOString() })
    .eq("id", inst.plan_id)
    .eq("salon_id", access.salonId)
    .eq("status", "completado");

  revalidatePath("/ortodoncia");
  return { ok: true, data: null };
}

/** Cancela el plan (conserva el histórico de cuotas). Owner/manager. */
export async function cancelOrthoPaymentPlan(planId: string): Promise<ActionResult<null>> {
  const access = await assertAccess(MANAGER_ROLES);
  if (!access.ok) return { ok: false, error: access.error };

  const supabase = createClient();
  const { error } = await supabase
    .from("ortho_payment_plan")
    .update({ status: "cancelado", updated_at: new Date().toISOString() })
    .eq("id", planId)
    .eq("salon_id", access.salonId);
  if (error !== null) return { ok: false, error: error.message };

  revalidatePath("/ortodoncia");
  return { ok: true, data: null };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/tests/unit/ortho-payment-actions.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(dashboard)/ortodoncia/payment-actions.ts" src/tests/unit/ortho-payment-actions.test.ts
git commit -m "feat(ortodoncia): server actions plan de pago (RPC + cobro)"
```

---

### Task 6: Hooks React Query

**Files:**
- Create: `src/hooks/use-ortho-payments.ts`

**Interfaces:**
- Consumes: `orthoPaymentKeys`, `fetchOrthoPaymentPlan`, `fetchOverdueOrthoCounts` (Task 4); actions (Task 5); `CreateOrthoPlanInput`, `PayInstallmentInput` (Task 2).
- Produces: `useOrthoPaymentPlan(salonId, customerId)`; `useOverdueOrtho(salonId, customerIds, todayIso, enabled)`; `useCreateOrthoPaymentPlan(salonId, customerId)`; `usePayInstallment(salonId, customerId)`; `useUnpayInstallment(salonId, customerId)`; `useCancelOrthoPaymentPlan(salonId, customerId)`.

- [ ] **Step 1: Write the implementation**

```ts
// src/hooks/use-ortho-payments.ts
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  cancelOrthoPaymentPlan,
  createOrthoPaymentPlan,
  payInstallment,
  unpayInstallment,
} from "@/app/(dashboard)/ortodoncia/payment-actions";
import {
  fetchOrthoPaymentPlan,
  fetchOverdueOrthoCounts,
  orthoPaymentKeys,
} from "@/lib/queries/ortho-payments";
import type { CreateOrthoPlanInput, PayInstallmentInput } from "@/lib/validations/ortho-payments";

export function useOrthoPaymentPlan(salonId: string, customerId: string) {
  return useQuery({
    queryKey: orthoPaymentKeys.plan(salonId, customerId),
    queryFn: () => fetchOrthoPaymentPlan(salonId, customerId),
    enabled: customerId.length > 0,
  });
}

export function useOverdueOrtho(
  salonId: string,
  customerIds: readonly string[],
  todayIso: string,
  enabled: boolean,
) {
  return useQuery({
    queryKey: orthoPaymentKeys.overdue(salonId, customerIds),
    queryFn: () => fetchOverdueOrthoCounts(salonId, customerIds, todayIso),
    enabled: enabled && customerIds.length > 0,
  });
}

function useInvalidatePlan(salonId: string, customerId: string) {
  const queryClient = useQueryClient();
  return () =>
    void queryClient.invalidateQueries({ queryKey: orthoPaymentKeys.plan(salonId, customerId) });
}

export function useCreateOrthoPaymentPlan(salonId: string, customerId: string) {
  const invalidate = useInvalidatePlan(salonId, customerId);
  return useMutation({
    mutationFn: async (input: CreateOrthoPlanInput) => {
      const res = await createOrthoPaymentPlan(customerId, input);
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
    onSuccess: invalidate,
  });
}

export function usePayInstallment(salonId: string, customerId: string) {
  const invalidate = useInvalidatePlan(salonId, customerId);
  return useMutation({
    mutationFn: async (vars: { installmentId: string; input: PayInstallmentInput }) => {
      const res = await payInstallment(vars.installmentId, vars.input);
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
    onSuccess: invalidate,
  });
}

export function useUnpayInstallment(salonId: string, customerId: string) {
  const invalidate = useInvalidatePlan(salonId, customerId);
  return useMutation({
    mutationFn: async (installmentId: string) => {
      const res = await unpayInstallment(installmentId);
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
    onSuccess: invalidate,
  });
}

export function useCancelOrthoPaymentPlan(salonId: string, customerId: string) {
  const invalidate = useInvalidatePlan(salonId, customerId);
  return useMutation({
    mutationFn: async (planId: string) => {
      const res = await cancelOrthoPaymentPlan(planId);
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
    onSuccess: invalidate,
  });
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/use-ortho-payments.ts
git commit -m "feat(ortodoncia): hooks plan de pago"
```

---

### Task 7: UI — tarjeta "Plan de pago" (con ui-ux-pro-max) + montaje en /ortodoncia

**Files:**
- Create: `src/components/dental/ortho-payment-plan-card.tsx`
- Modify: `src/components/dental/ortodoncia-view.tsx` (montar el card como último bloque)

**Interfaces:**
- Consumes: hooks (Task 6); `computeInstallmentSchedule`, `computePlanBalance`, `isOverdue`, `ORTHO_PAYMENT_METHOD_LABELS`, `OrthoPaymentMethod` (Task 1); `formatMoney` (`@/lib/format`); `OrthoInstallment`, `OrthoPaymentPlan` (Task 3); UI `Button`,`Input`,`Label`,`Card`,`CardContent`,`CardHeader`,`CardTitle`.
- Produces: componente `OrthoPaymentPlanCard` con props `{ salonId: string; customerId: string }`.

> **OBLIGATORIO:** invoca la skill `ui-ux-pro-max` ANTES de escribir el componente y aplica sus pautas (jerarquía, estados, microinteracciones, responsive). El bloque de abajo es la **referencia de cableado** (hooks, acciones, datos, estados) — MANTÉN esa lógica intacta y eleva la capa visual con la skill. Enseña el resultado en dev server (Step 3) para validar que "se ve bien".

- [ ] **Step 1: Implementar el card** (referencia funcional — elevar visualmente con ui-ux-pro-max)

```tsx
// src/components/dental/ortho-payment-plan-card.tsx
"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  computeInstallmentSchedule,
  computePlanBalance,
  isOverdue,
  ORTHO_PAYMENT_METHOD_LABELS,
  type OrthoPaymentMethod,
} from "@/lib/dental/ortho-payments";
import { formatMoney } from "@/lib/format";
import {
  useCancelOrthoPaymentPlan,
  useCreateOrthoPaymentPlan,
  useOrthoPaymentPlan,
  usePayInstallment,
  useUnpayInstallment,
} from "@/hooks/use-ortho-payments";
import type { OrthoInstallment, OrthoPaymentPlan } from "@/types/database";

export interface OrthoPaymentPlanCardProps {
  salonId: string;
  customerId: string;
}

function eurosToCents(v: string): number {
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function OrthoPaymentPlanCard({
  salonId,
  customerId,
}: OrthoPaymentPlanCardProps): React.ReactElement {
  const planQuery = useOrthoPaymentPlan(salonId, customerId);
  const createPlan = useCreateOrthoPaymentPlan(salonId, customerId);
  const payMut = usePayInstallment(salonId, customerId);
  const unpayMut = useUnpayInstallment(salonId, customerId);
  const cancelMut = useCancelOrthoPaymentPlan(salonId, customerId);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Plan de pago</CardTitle>
      </CardHeader>
      <CardContent>
        {planQuery.isPending ? (
          <p className="text-sm text-muted-foreground">Cargando…</p>
        ) : planQuery.data ? (
          <ActivePlan
            plan={planQuery.data.plan}
            installments={planQuery.data.installments}
            onPay={(installmentId, method) => payMut.mutate({ installmentId, input: { method } })}
            onUnpay={(id) => unpayMut.mutate(id)}
            onCancel={(planId) => cancelMut.mutate(planId)}
            mutating={payMut.isPending || unpayMut.isPending || cancelMut.isPending}
          />
        ) : (
          <NewPlanForm
            onCreate={(input) => createPlan.mutate(input)}
            creating={createPlan.isPending}
            error={createPlan.isError ? (createPlan.error as Error).message : null}
          />
        )}
      </CardContent>
    </Card>
  );
}

function NewPlanForm({
  onCreate,
  creating,
  error,
}: {
  onCreate: (input: {
    totalCents: number;
    downPaymentCents: number;
    installmentCount: number;
    dayOfMonth: number;
    startDate: string;
    notes: string | null;
  }) => void;
  creating: boolean;
  error: string | null;
}): React.ReactElement {
  const [total, setTotal] = useState("");
  const [down, setDown] = useState("");
  const [count, setCount] = useState("");
  const [day, setDay] = useState("1");
  const [start, setStart] = useState(todayIso());

  const preview = useMemo(() => {
    const totalCents = eurosToCents(total);
    const downPaymentCents = eurosToCents(down);
    const installmentCount = Number(count);
    const dayOfMonth = Number(day);
    if (
      totalCents <= 0 ||
      !Number.isInteger(installmentCount) ||
      installmentCount < 1 ||
      totalCents - downPaymentCents < installmentCount
    ) {
      return null;
    }
    return computeInstallmentSchedule({
      totalCents,
      downPaymentCents,
      installmentCount,
      dayOfMonth,
      startDate: start,
    });
  }, [total, down, count, day, start]);

  function submit(): void {
    onCreate({
      totalCents: eurosToCents(total),
      downPaymentCents: eurosToCents(down),
      installmentCount: Number(count),
      dayOfMonth: Number(day),
      startDate: start,
      notes: null,
    });
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="total">Total (€)</Label>
          <Input id="total" inputMode="decimal" value={total} onChange={(e) => setTotal(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="down">Entrada (€)</Label>
          <Input id="down" inputMode="decimal" value={down} onChange={(e) => setDown(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="count">Nº de cuotas</Label>
          <Input id="count" type="number" value={count} onChange={(e) => setCount(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="day">Día de cobro</Label>
          <Input id="day" type="number" min={1} max={31} value={day} onChange={(e) => setDay(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="start">Fecha de inicio</Label>
          <Input id="start" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </div>
      </div>

      {preview && (
        <p className="text-sm text-muted-foreground">
          {preview[0]?.seq === 0 ? `Entrada ${formatMoney(preview[0].amountCents, "EUR")} + ` : ""}
          {Number(count)} cuotas de {formatMoney(preview[preview.length - 1].amountCents, "EUR")} aprox.
        </p>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button onClick={submit} disabled={creating || preview === null}>
        {creating ? "Creando…" : "Crear plan de pago"}
      </Button>
    </div>
  );
}

function ActivePlan({
  plan,
  installments,
  onPay,
  onUnpay,
  onCancel,
  mutating,
}: {
  plan: OrthoPaymentPlan;
  installments: readonly OrthoInstallment[];
  onPay: (installmentId: string, method: OrthoPaymentMethod) => void;
  onUnpay: (installmentId: string) => void;
  onCancel: (planId: string) => void;
  mutating: boolean;
}): React.ReactElement {
  const today = todayIso();
  const balance = useMemo(
    () =>
      computePlanBalance(
        installments.map((i) => ({
          status: i.status,
          dueDate: i.due_date,
          amountCents: i.amount_cents,
          paidAmountCents: i.paid_amount_cents,
        })),
        today,
      ),
    [installments, today],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
        <span>Total: <strong>{formatMoney(plan.total_cents, plan.currency)}</strong></span>
        <span>Pagado: <strong>{formatMoney(balance.paidCents, plan.currency)}</strong></span>
        <span>Pendiente: <strong>{formatMoney(balance.pendingCents, plan.currency)}</strong></span>
        {balance.overdueCount > 0 && (
          <span className="font-medium text-destructive">
            {balance.overdueCount} cuota(s) vencida(s)
          </span>
        )}
      </div>

      <ul className="divide-y rounded-lg border">
        {installments.map((i) => {
          const overdue = isOverdue({ status: i.status, dueDate: i.due_date }, today);
          return (
            <li key={i.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <span className="tabular-nums">
                {i.seq === 0 ? "Entrada" : `Cuota ${i.seq}`} · {i.due_date} ·{" "}
                {formatMoney(i.amount_cents, plan.currency)}
              </span>
              <span className="flex items-center gap-2">
                {i.status === "pagada" ? (
                  <>
                    <span className="text-emerald-600">Pagada</span>
                    <button
                      type="button"
                      className="text-xs text-muted-foreground hover:underline"
                      disabled={mutating}
                      onClick={() => onUnpay(i.id)}
                    >
                      Deshacer
                    </button>
                  </>
                ) : (
                  <>
                    <span className={overdue ? "text-destructive" : "text-muted-foreground"}>
                      {overdue ? "Vencida" : "Pendiente"}
                    </span>
                    <Button size="sm" disabled={mutating} onClick={() => onPay(i.id, "efectivo")}>
                      Cobrar
                    </Button>
                  </>
                )}
              </span>
            </li>
          );
        })}
      </ul>

      <div className="flex justify-end">
        <Button
          variant="ghost"
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          disabled={mutating}
          onClick={() => onCancel(plan.id)}
        >
          Cancelar plan
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Métodos de cobro: {Object.values(ORTHO_PAYMENT_METHOD_LABELS).join(" · ")}. (El botón "Cobrar"
        usa efectivo por defecto en esta referencia; en la versión pulida con ui-ux-pro-max, ofrece un
        selector de método antes de confirmar.)
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Montar el card en `ortodoncia-view.tsx`**

Importar `OrthoPaymentPlanCard` y renderizarlo como último bloque, tras el de "Consentimiento de ortodoncia" (dentro del `<div className="space-y-6">` que envuelve la vista):

```tsx
import { OrthoPaymentPlanCard } from "@/components/dental/ortho-payment-plan-card";
// ...
      {/* Plan de pago */}
      <OrthoPaymentPlanCard salonId={salonId} customerId={customerId} />
```

- [ ] **Step 3: Typecheck + verificación visual**

Run: `npx tsc --noEmit` → 0 errores.
Run: `npm run dev`, ir a `/ortodoncia`, elegir un paciente de Biodental. Crear un plan (p. ej. 3000 total, 600 entrada, 24 cuotas, día 5), comprobar el calendario, cobrar una cuota, deshacerla, ver saldo/morosidad. Confirmar que "se ve bien" (resultado de ui-ux-pro-max).

- [ ] **Step 4: Commit**

```bash
git add src/components/dental/ortho-payment-plan-card.tsx src/components/dental/ortodoncia-view.tsx
git commit -m "feat(ortodoncia): UI plan de pago (ui-ux-pro-max) en /ortodoncia"
```

---

### Task 8: Aviso de morosidad en la agenda

**Files:**
- Modify: `src/app/(dashboard)/appointments/page.tsx` (pasar `sector`)
- Modify: `src/app/(dashboard)/appointments/appointments-view.tsx` (badge de morosidad en la tarjeta)

**Interfaces:**
- Consumes: `useOverdueOrtho` (Task 6).
- Produces: aviso "⚠ N cuota(s) vencida(s)" en las citas de pacientes morosos, solo sector odontología.

- [ ] **Step 1: Pasar `sector` desde la página**

En `src/app/(dashboard)/appointments/page.tsx`, añadir `sector={salon.sector}` al render de `<AppointmentsView>`:

```tsx
  return (
    <AppointmentsView
      salonId={salon.id}
      salonSlug={salon.slug}
      timezone={salon.timezone}
      sector={salon.sector}
    />
  );
```

- [ ] **Step 2: Recibir `sector` y calcular morosos en la vista**

En `appointments-view.tsx`:
1. Añadir `sector` a `AppointmentsViewProps` (tipo `SalonSector` desde `@/types/database`) y a la desestructuración del componente.
2. Importar el hook y, tras `appointmentsQuery`, calcular los `customerId` del día y consultar morosidad solo si es dental:

```tsx
import type { AppointmentStatus, SalonSector } from "@/types/database";
import { useOverdueOrtho } from "@/hooks/use-ortho-payments";
// ... en props: sector: SalonSector;   y en la desestructuración: sector,

const dayCustomerIds = Array.from(
  new Set(
    (appointmentsQuery.data ?? [])
      .map((a) => a.customer_id)
      .filter((v): v is string => v !== null),
  ),
);
const overdueQuery = useOverdueOrtho(salonId, dayCustomerIds, date, sector === "odontologia");
const overdueMap = overdueQuery.data ?? {};
```

3. Pasar el contador a cada `AppointmentCard` en el `.map`:

```tsx
<AppointmentCard
  /* ...props existentes... */
  overdueCount={overdueMap[appt.customer_id ?? ""] ?? 0}
/>
```

- [ ] **Step 3: Pintar el badge en `AppointmentCard`**

Añadir `overdueCount: number` a `AppointmentCardProps` y a la desestructuración; renderizar el aviso junto al nombre del paciente cuando `overdueCount > 0` (dentro de la zona de datos del paciente):

```tsx
{overdueCount > 0 && (
  <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
    ⚠ {overdueCount} cuota{overdueCount === 1 ? "" : "s"} vencida{overdueCount === 1 ? "" : "s"}
  </span>
)}
```

- [ ] **Step 4: Typecheck + verificación**

Run: `npx tsc --noEmit` → 0 errores.
Verificar en dev: un paciente con una cuota vencida y cita hoy muestra el aviso en su tarjeta; en un salón no dental no aparece nada (ni se consulta, por `enabled: sector === "odontologia"`).

- [ ] **Step 5: Commit**

```bash
git add "src/app/(dashboard)/appointments/page.tsx" "src/app/(dashboard)/appointments/appointments-view.tsx"
git commit -m "feat(ortodoncia): aviso de morosidad en la agenda (solo dental)"
```

---

### Task 9: Verificación integral + despliegue

**Files:** ninguno nuevo.

- [ ] **Step 1: Typecheck completo** — Run: `npx tsc --noEmit` → 0 errores.
- [ ] **Step 2: Suite completa** — Run: `npx vitest run` → todo verde (previos + nuevos de plan de pago).
- [ ] **Step 3: Build** — Run: `npm run build` → exit 0, `/ortodoncia` y `/appointments` presentes.
- [ ] **Step 4: Migración aplicada** — confirmar que `ortho_payment_plan` + `ortho_installment` existen (REST 200) antes de desplegar; si no, pedírselo al usuario.
- [ ] **Step 5: Deploy** — ejecutar `scratchpad/deploy_kairos.js` (Vercel REST) y esperar READY; verificar en `https://kairosmanager.app`.

---

## Self-Review (cobertura del spec)

- **Crear presupuesto cerrado** (spec §2.1) → Tasks 1,2,3(RPC),5,7. ✔
- **Calendario generado** (spec §2.2, §4) → cálculo puro Task 1; inserción atómica Task 3/5. ✔
- **Cobro ligero** (spec §2.3, §5) → `payInstallment` Task 5; UI Task 7. ✔
- **Saldo** (spec §2.4, §6) → `computePlanBalance` Task 1; UI Task 7. ✔
- **Aviso de morosidad en la agenda** (spec §2.5, §7) → `fetchOverdueOrthoCounts` Task 4; hook Task 6; agenda Task 8. ✔
- **2 tablas + RLS + RPC atómica** (spec §3) → Task 3. ✔
- **Morosidad derivada sin cron** (spec §4) → `isOverdue`/query por `due_date < hoy`, sin cron. ✔
- **Gates de rol** (spec §5, global constraints) → owner/manager crear/cancelar/deshacer; +staff cobrar. ✔
- **UI con ui-ux-pro-max** (spec §8) → Task 7 (invocación obligatoria de la skill). ✔
- **Testing TDD + tsc 0 + suite verde + deploy** (spec §9,§10) → Tasks 1,2,5 tests; Task 9 verificación. ✔
- **Fuera de alcance** (spec §2): TPV/caja, financiación externa, recordatorio de cuota, laboratorio, post-ajuste, STL, cefalometría — NO incluidos. ✔

**Consistencia de tipos:** `computeInstallmentSchedule`/`ScheduledInstallment` (Task 1) usados en Task 5 (payload RPC) y Task 7 (preview); `computePlanBalance`/`isOverdue` (Task 1) en Task 7; `orthoPaymentKeys` idéntico Tasks 4/6; nombres de acciones (`createOrthoPaymentPlan`/`payInstallment`/`unpayInstallment`/`cancelOrthoPaymentPlan`) idénticos Tasks 5/6; `OrthoPaymentPlan`/`OrthoInstallment` (Task 3) en Tasks 4/7; `useOverdueOrtho` (Task 6) en Task 8.

**Nota de riesgo controlado:** el importe cobrado es siempre la cuota completa (sin pagos parciales); el `paid_method` por defecto en la referencia es "efectivo" — la versión final con ui-ux-pro-max añade el selector de método antes de confirmar el cobro.
