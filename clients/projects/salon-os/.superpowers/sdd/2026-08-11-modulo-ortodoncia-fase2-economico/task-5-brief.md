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

