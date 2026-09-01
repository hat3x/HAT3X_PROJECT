## Task 4: Server actions createOrder / addOrderItems / voidOrderItem

**Files:**
- Create: `…/src/lib/validations/order.ts`, `…/src/app/(dashboard)/mostrador/actions.ts`
- Modify: `…/src/hooks/use-orders.ts` (mutaciones)
- Test: `…/src/tests/integration/restauracion-order-actions.test.ts`

**Interfaces:**
- Consumes: `getActiveSalonId`, `createClient` de `@/lib/supabase/server`, `revalidatePath`, `makeSupabaseMock`.
- Produces (todas `ActionResult<T>`):
  - `createOrder(input: { id; label; idempotencyKey }): Promise<ActionResult<Order>>` — inserta con `id` de cliente; si `idempotencyKey` ya existe en el salón, devuelve el existente.
  - `addOrderItems(input: { orderId; items }): Promise<ActionResult<{ added: number }>>` — verifica que `orderId` pertenece al salón y está `abierta`; inserta `order_items` con ids de cliente acotados por salón.
  - `voidOrderItem(input: { orderId; itemId; reason }): Promise<ActionResult<OrderItem>>` — inserta fila de anulación (`void_of_item_id`, `status:"anulado"`, `void_reason`) copiando datos del ítem original; NO borra.
- Produces (hooks): `useCreateOrder`, `useAddOrderItems`, `useVoidOrderItem`.

- [ ] **Step 1: Write the failing integration test**

Create `…/src/tests/integration/restauracion-order-actions.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
const holder = vi.hoisted(() => ({ supabase: null as unknown }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: () => holder.supabase }));
vi.mock("@/lib/salon", () => ({ getActiveSalonId: () => Promise.resolve("SALON") }));
import { makeSupabaseMock } from "@/tests/helpers/supabase-mock";
import { createOrder, addOrderItems } from "@/app/(dashboard)/mostrador/actions";

beforeEach(() => { holder.supabase = null; });

describe("order actions", () => {
  it("createOrder inserta con id de cliente", async () => {
    holder.supabase = makeSupabaseMock({
      tables: { orders: { data: [] } },
      onWrite: (op: string, table: string) =>
        op === "insert" && table === "orders"
          ? { data: [{ id: "O1", salon_id: "SALON", status: "abierta" }] } : {},
    });
    const r = await createOrder({ id: "O1", label: null, idempotencyKey: "k1" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.id).toBe("O1");
  });

  it("createOrder es idempotente por idempotencyKey", async () => {
    holder.supabase = makeSupabaseMock({
      tables: { orders: { data: [{ id: "O1", salon_id: "SALON", idempotency_key: "k1", status: "abierta" }] } },
    });
    const r = await createOrder({ id: "O2", label: null, idempotencyKey: "k1" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.id).toBe("O1");
  });

  it("addOrderItems rechaza pedido de otro salón / inexistente", async () => {
    holder.supabase = makeSupabaseMock({ tables: { orders: { data: [] } } });
    const r = await addOrderItems({ orderId: "OX", items: [
      { id: "i1", productId: "p1", qty: 1, unitPriceCents: 500, vatRate: 10, stationId: null, comboGroup: null, modifiersSnapshot: [] },
    ]});
    expect(r.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails.** `npm test -- restauracion-order-actions` → FAIL.

- [ ] **Step 3: Write validations** — Create `…/src/lib/validations/order.ts`:

```ts
import { z } from "zod";

export const orderItemDraftSchema = z.object({
  id: z.string().uuid(),
  productId: z.string().uuid(),
  qty: z.number().int().positive(),
  unitPriceCents: z.number().int().min(0),
  vatRate: z.number().min(0).max(100).default(10),
  stationId: z.string().uuid().nullable(),
  comboGroup: z.string().nullable(),
  modifiersSnapshot: z.array(z.object({ name: z.string(), priceDeltaCents: z.number().int() })).default([]),
});
export type OrderItemDraftInput = z.infer<typeof orderItemDraftSchema>;

export const createOrderSchema = z.object({
  id: z.string().uuid(),
  label: z.string().trim().max(120).nullable(),
  idempotencyKey: z.string().max(200).nullable(),
});
export const addOrderItemsSchema = z.object({
  orderId: z.string().uuid(),
  items: z.array(orderItemDraftSchema).min(1),
});
export const voidOrderItemSchema = z.object({
  orderId: z.string().uuid(),
  itemId: z.string().uuid(),
  reason: z.string().trim().min(1).max(200),
});
```

- [ ] **Step 4: Write the actions** — Create `…/src/app/(dashboard)/mostrador/actions.ts` (cabecera `"use server"`). `createOrder`:

```ts
"use server";
import { revalidatePath } from "next/cache";
import { getActiveSalonId } from "@/lib/salon";
import { createClient } from "@/lib/supabase/server";
import { addOrderItemsSchema, createOrderSchema, voidOrderItemSchema } from "@/lib/validations/order";
import type { Order, OrderItem } from "@/types/database";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

export async function createOrder(input: unknown): Promise<ActionResult<Order>> {
  const parsed = createOrderSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  const salonId = await getActiveSalonId();
  if (salonId === null) return { ok: false, error: "No tienes un salón asignado" };
  const supabase = createClient();

  if (parsed.data.idempotencyKey !== null) {
    const { data: existing } = await supabase.from("orders").select("*")
      .eq("salon_id", salonId).eq("idempotency_key", parsed.data.idempotencyKey).maybeSingle();
    if (existing) return { ok: true, data: existing };
  }
  const { data, error } = await supabase.from("orders").insert({
    id: parsed.data.id, salon_id: salonId, label: parsed.data.label,
    idempotency_key: parsed.data.idempotencyKey, channel: "mostrador", status: "abierta",
  }).select("*").single();
  if (error !== null) return { ok: false, error: error.message };
  revalidatePath("/mostrador");
  return { ok: true, data };
}
```

`addOrderItems`: `safeParse` → `getActiveSalonId` → verifica `orderId` en el salón y `status='abierta'` (`.from("orders").select("id,status").eq("id").eq("salon_id").maybeSingle()`; si no existe o no abierta → error) → inserta `items` mapeados a `TablesInsert<"order_items">[]` (con `salon_id`, `order_id`, ids de cliente, `modifiers_snapshot`) → `revalidatePath`. `voidOrderItem`: lee el ítem original (acotado por salón), inserta fila de anulación (`void_of_item_id: itemId`, `status:"anulado"`, `void_reason`, copiando `product_id/qty/station_id/order_id/salon_id`); nunca DELETE.

- [ ] **Step 5: Add mutation hooks** en `…/src/hooks/use-orders.ts`: `useCreateOrder`/`useAddOrderItems`/`useVoidOrderItem` (desempaqueta `ActionResult` + `invalidateQueries(orderKeys.all(salonId))`).

- [ ] **Step 6: Run + typecheck.** `npm test -- restauracion-order-actions && npm run typecheck` → PASS + exit 0.

- [ ] **Step 7: Commit**

```bash
git add clients/projects/salon-os/src/lib/validations/order.ts \
        "clients/projects/salon-os/src/app/(dashboard)/mostrador/actions.ts" \
        clients/projects/salon-os/src/hooks/use-orders.ts \
        clients/projects/salon-os/src/tests/integration/restauracion-order-actions.test.ts
git commit -m "feat(restauracion): actions de pedido (crear/añadir/anular, append-only + idempotencia)"
```

---

