## Task 3: Queries + hooks del KDS (con Realtime)

**Files:**
- Create: `…/src/lib/queries/kds.ts`, `…/src/hooks/use-kds.ts`
- Test: `…/src/tests/unit/kds-keys.test.ts`

**Interfaces:**
- Consumes: `createClient` de `@/lib/supabase/client`; `type KdsItem` de `@/lib/restauracion/kds`; `useQuery`/`useQueryClient`.
- Produces:
  - `kdsKeys`: `all(salonId)`, `items(salonId)`.
  - `fetchKdsItems(salonId): Promise<KdsItem[]>` — lee `order_items` con `status in ('enviado','preparando','listo')`, `void_of_item_id is null`, join `products(name)`, `stations(name)` y `orders(order_number, label, created_at)`, acotado por `salon_id`, ordenado por `created_at` ascendente; mapea a `KdsItem`.
  - `useKdsItems(salonId)`: `useQuery`.
  - `useKdsRealtime(salonId): "connecting" | "connected" | "error"` — patrón EXACTO de `src/hooks/use-day-panel-realtime.ts`: canal `kds-order-items-${salonId}`, suscripción `postgres_changes` `{ event:"*", schema:"public", table:"order_items", filter:`salon_id=eq.${salonId}` }`, en cada cambio `queryClient.invalidateQueries({ queryKey: kdsKeys.all(salonId) })`; cleanup con `removeChannel`.

- [ ] **Step 1: Write the failing test**

Create `…/src/tests/unit/kds-keys.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { kdsKeys } from "@/lib/queries/kds";

describe("kdsKeys", () => {
  it("deriva sub-keys del salón", () => {
    expect(kdsKeys.all("s1")).toEqual(["kds", "s1"]);
    expect(kdsKeys.items("s1")).toEqual(["kds", "s1", "items"]);
  });
});
```

- [ ] **Step 2: Run to verify it fails.** `npm test -- kds-keys` → FAIL.

- [ ] **Step 3: Write the queries** — Create `…/src/lib/queries/kds.ts`:

```ts
import { createClient } from "@/lib/supabase/client";
import type { KdsItem } from "@/lib/restauracion/kds";

export const kdsKeys = {
  all: (salonId: string) => ["kds", salonId] as const,
  items: (salonId: string) => [...kdsKeys.all(salonId), "items"] as const,
};

const ACTIVE_STATUSES = ["enviado", "preparando", "listo"] as const;

export async function fetchKdsItems(salonId: string): Promise<KdsItem[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("order_items")
    .select(
      "id, order_id, station_id, product_id, qty, status, modifiers_snapshot, created_at, " +
        "products(name), stations(name), orders(order_number, label, created_at)",
    )
    .eq("salon_id", salonId)
    .is("void_of_item_id", null)
    .in("status", ACTIVE_STATUSES as unknown as string[])
    .order("created_at", { ascending: true });
  if (error !== null) throw new Error(error.message);
  return (data ?? []).map((row): KdsItem => {
    const mods = Array.isArray(row.modifiers_snapshot)
      ? (row.modifiers_snapshot as Array<{ name?: string }>).map((m) => m.name ?? "").filter((n) => n.length > 0)
      : [];
    return {
      id: row.id, orderId: row.order_id,
      orderNumber: row.orders?.order_number ?? 0, orderLabel: row.orders?.label ?? null,
      stationId: row.station_id, stationName: row.stations?.name ?? null,
      productName: row.products?.name ?? "Producto", qty: row.qty, status: row.status,
      modifiers: mods, createdAt: row.created_at,
    };
  });
}
```

> Nota: los joins embebidos de supabase-js pueden requerir un tipo de fila auxiliar o `as` para que `npm run typecheck` quede a 0 sin `any` amplio. Usa un tipo de fila embebida explícito si hace falta.

- [ ] **Step 4: Write the hooks** — Create `…/src/hooks/use-kds.ts` (`"use client"`). `useKdsItems` = `useQuery(kdsKeys.items(salonId), () => fetchKdsItems(salonId))`. `useKdsRealtime` = copia estructural de `src/hooks/use-day-panel-realtime.ts` cambiando: nombre de canal `kds-order-items-${salonId}`, `table: "order_items"`, e invalidando `kdsKeys.all(salonId)`.

- [ ] **Step 5: Run test + typecheck.** `npm test -- kds-keys && npm run typecheck` → PASS + exit 0.

- [ ] **Step 6: Commit**

```bash
git add clients/projects/salon-os/src/lib/queries/kds.ts \
        clients/projects/salon-os/src/hooks/use-kds.ts \
        clients/projects/salon-os/src/tests/unit/kds-keys.test.ts
git commit -m "feat(restauracion): queries y hooks del KDS (lectura + Realtime)"
```

---

