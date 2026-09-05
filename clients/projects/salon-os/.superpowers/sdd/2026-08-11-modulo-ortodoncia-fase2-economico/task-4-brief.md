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

