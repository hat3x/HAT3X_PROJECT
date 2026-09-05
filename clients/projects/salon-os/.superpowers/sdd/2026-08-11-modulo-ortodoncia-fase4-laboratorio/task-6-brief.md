### Task 6: Hooks React Query

**Files:**
- Create: `src/hooks/use-lab-orders.ts`

**Interfaces:**
- Consumes: `labOrderKeys`, `fetchLabOrders` (Task 4); actions (Task 5); `CreateLabOrderInput`, `MarkLabDateInput` (Task 2).
- Produces: `useLabOrders(salonId, customerId)`; `useCreateLabOrder(salonId, customerId)`; `useMarkLabOrderReceived(salonId, customerId)`; `useMarkLabOrderDelivered(salonId, customerId)`; `useDeleteLabOrder(salonId, customerId)`.

- [ ] **Step 1: Write the implementation** (patrón calcado de `src/hooks/use-ortho-payments.ts`)

```ts
// src/hooks/use-lab-orders.ts
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createLabOrder,
  deleteLabOrder,
  markLabOrderDelivered,
  markLabOrderReceived,
} from "@/app/(dashboard)/ortodoncia/lab-actions";
import { fetchLabOrders, labOrderKeys } from "@/lib/queries/lab-orders";
import type { CreateLabOrderInput, MarkLabDateInput } from "@/lib/validations/lab-orders";

export function useLabOrders(salonId: string, customerId: string) {
  return useQuery({
    queryKey: labOrderKeys.list(salonId, customerId),
    queryFn: () => fetchLabOrders(salonId, customerId),
    enabled: customerId.length > 0,
  });
}

function useInvalidate(salonId: string, customerId: string) {
  const queryClient = useQueryClient();
  return () =>
    void queryClient.invalidateQueries({ queryKey: labOrderKeys.list(salonId, customerId) });
}

export function useCreateLabOrder(salonId: string, customerId: string) {
  const invalidate = useInvalidate(salonId, customerId);
  return useMutation({
    mutationFn: async (input: CreateLabOrderInput) => {
      const res = await createLabOrder(customerId, input);
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
    onSuccess: invalidate,
  });
}

export function useMarkLabOrderReceived(salonId: string, customerId: string) {
  const invalidate = useInvalidate(salonId, customerId);
  return useMutation({
    mutationFn: async (vars: { orderId: string; input: MarkLabDateInput }) => {
      const res = await markLabOrderReceived(vars.orderId, vars.input);
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
    onSuccess: invalidate,
  });
}

export function useMarkLabOrderDelivered(salonId: string, customerId: string) {
  const invalidate = useInvalidate(salonId, customerId);
  return useMutation({
    mutationFn: async (vars: { orderId: string; input: MarkLabDateInput }) => {
      const res = await markLabOrderDelivered(vars.orderId, vars.input);
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
    onSuccess: invalidate,
  });
}

export function useDeleteLabOrder(salonId: string, customerId: string) {
  const invalidate = useInvalidate(salonId, customerId);
  return useMutation({
    mutationFn: async (orderId: string) => {
      const res = await deleteLabOrder(orderId);
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
    onSuccess: invalidate,
  });
}
```

- [ ] **Step 2: Typecheck** — `npx tsc --noEmit` → 0.
- [ ] **Step 3: Commit**

```bash
git add src/hooks/use-lab-orders.ts
git commit -m "feat(ortodoncia): hooks pedidos de laboratorio"
```

---

