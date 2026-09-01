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

