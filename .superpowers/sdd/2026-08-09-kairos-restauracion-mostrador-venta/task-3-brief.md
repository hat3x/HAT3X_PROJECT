## Task 3: Queries + hooks de pedidos

**Files:**
- Create: `…/src/lib/queries/orders.ts`, `…/src/hooks/use-orders.ts`
- Test: `…/src/tests/unit/order-keys.test.ts`

**Interfaces:**
- Consumes: `createClient` de `@/lib/supabase/client`; tipos `Order`, `OrderItem`.
- Produces: `orderKeys` (`all`/`open`/`detail`); `fetchOpenOrders(salonId)`; `fetchOrderItems(salonId, orderId)`; hooks `useOpenOrders(salonId)`, `useOrderItems(salonId, orderId)`.

- [ ] **Step 1: Write the failing test**

Create `…/src/tests/unit/order-keys.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { orderKeys } from "@/lib/queries/orders";

describe("orderKeys", () => {
  it("deriva sub-keys del salón", () => {
    expect(orderKeys.all("s1")).toEqual(["orders", "s1"]);
    expect(orderKeys.open("s1")).toEqual(["orders", "s1", "open"]);
    expect(orderKeys.detail("s1", "o1")).toEqual(["orders", "s1", "detail", "o1"]);
  });
});
```

- [ ] **Step 2: Run to verify it fails.** `npm test -- order-keys` → FAIL.

- [ ] **Step 3: Write queries** — Create `…/src/lib/queries/orders.ts`:

```ts
import { createClient } from "@/lib/supabase/client";
import type { Order, OrderItem } from "@/types/database";

export const orderKeys = {
  all: (salonId: string) => ["orders", salonId] as const,
  open: (salonId: string) => [...orderKeys.all(salonId), "open"] as const,
  detail: (salonId: string, orderId: string) => [...orderKeys.all(salonId), "detail", orderId] as const,
};

export async function fetchOpenOrders(salonId: string): Promise<Order[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("orders").select("*")
    .eq("salon_id", salonId).eq("status", "abierta")
    .order("created_at", { ascending: true });
  if (error !== null) throw new Error(error.message);
  return data;
}

export async function fetchOrderItems(salonId: string, orderId: string): Promise<OrderItem[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("order_items").select("*")
    .eq("salon_id", salonId).eq("order_id", orderId)
    .order("created_at", { ascending: true });
  if (error !== null) throw new Error(error.message);
  return data;
}
```

- [ ] **Step 4: Write hooks** — Create `…/src/hooks/use-orders.ts`:

```ts
"use client";
import { useQuery } from "@tanstack/react-query";
import { fetchOpenOrders, fetchOrderItems, orderKeys } from "@/lib/queries/orders";

export function useOpenOrders(salonId: string) {
  return useQuery({ queryKey: orderKeys.open(salonId), queryFn: () => fetchOpenOrders(salonId) });
}
export function useOrderItems(salonId: string, orderId: string | null) {
  return useQuery({
    queryKey: orderKeys.detail(salonId, orderId ?? "none"),
    queryFn: () => fetchOrderItems(salonId, orderId as string),
    enabled: orderId !== null,
  });
}
```

- [ ] **Step 5: Run + typecheck.** `npm test -- order-keys && npm run typecheck` → PASS + exit 0.

- [ ] **Step 6: Commit**

```bash
git add clients/projects/salon-os/src/lib/queries/orders.ts \
        clients/projects/salon-os/src/hooks/use-orders.ts \
        clients/projects/salon-os/src/tests/unit/order-keys.test.ts
git commit -m "feat(restauracion): queries y hooks de pedidos"
```

---

