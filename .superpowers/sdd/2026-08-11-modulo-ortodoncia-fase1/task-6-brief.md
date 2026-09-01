### Task 6: Hooks React Query

**Files:**
- Create: `src/hooks/use-ortodoncia.ts`

**Interfaces:**
- Consumes: `orthoKeys`, `fetchOrthoData`, `fetchOrthoVisits` (Task 4); `saveOrthoData`, `addOrthoVisit`, `deleteOrthoVisit` (Task 5); `OrthoDataInput`, `OrthoVisitInput` (Task 2).
- Produces: `useOrthoData(salonId, customerId)`, `useOrthoVisits(salonId, customerId)`, `useSaveOrthoData(salonId, customerId)`, `useAddOrthoVisit(salonId, customerId)`, `useDeleteOrthoVisit(salonId, customerId)`.

- [ ] **Step 1: Write the implementation**

```ts
// src/hooks/use-ortodoncia.ts
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  addOrthoVisit,
  deleteOrthoVisit,
  saveOrthoData,
} from "@/app/(dashboard)/ortodoncia/actions";
import { fetchOrthoData, fetchOrthoVisits, orthoKeys } from "@/lib/queries/ortho";
import type { OrthoDataInput, OrthoVisitInput } from "@/lib/validations/ortho";

export function useOrthoData(salonId: string, customerId: string) {
  return useQuery({
    queryKey: orthoKeys.data(salonId, customerId),
    queryFn: () => fetchOrthoData(salonId, customerId),
    enabled: customerId.length > 0,
  });
}

export function useOrthoVisits(salonId: string, customerId: string) {
  return useQuery({
    queryKey: orthoKeys.visits(salonId, customerId),
    queryFn: () => fetchOrthoVisits(salonId, customerId),
    enabled: customerId.length > 0,
  });
}

export function useSaveOrthoData(salonId: string, customerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: OrthoDataInput) => {
      const result = await saveOrthoData(customerId, input);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: orthoKeys.data(salonId, customerId),
      });
    },
  });
}

export function useAddOrthoVisit(salonId: string, customerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: OrthoVisitInput) => {
      const result = await addOrthoVisit(customerId, input);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: orthoKeys.visits(salonId, customerId),
      });
    },
  });
}

export function useDeleteOrthoVisit(salonId: string, customerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (visitId: string) => {
      const result = await deleteOrthoVisit(visitId);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: orthoKeys.visits(salonId, customerId),
      });
    },
  });
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/use-ortodoncia.ts
git commit -m "feat(ortodoncia): hooks React Query"
```

---

