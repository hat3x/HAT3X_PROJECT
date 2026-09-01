## Task 5: Server actions sendOrderToStations / setOrderItemStatus

**Files:**
- Modify: `…/src/app/(dashboard)/mostrador/actions.ts`, `…/src/lib/validations/order.ts`, `…/src/hooks/use-orders.ts`
- Test: `…/src/tests/integration/restauracion-order-status.test.ts`

**Interfaces:**
- Produces:
  - `sendOrderToStations(input: { orderId }): Promise<ActionResult<{ sent: number }>>` — UPDATE ítems `pendiente`→`enviado` acotado por `salon_id`+`order_id`+`status='pendiente'`. El pedido sigue `abierta`.
  - `setOrderItemStatus(input: { itemId; from; to }): Promise<ActionResult<OrderItem>>` — transición segura: UPDATE `.eq("id").eq("salon_id").eq("status", from)`; si no afecta filas → error `CONFLICTO`.
- Produces (hooks): `useSendOrderToStations`, `useSetOrderItemStatus`.

- [ ] **Step 1: Write the failing test**

Create `…/src/tests/integration/restauracion-order-status.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
const holder = vi.hoisted(() => ({ supabase: null as unknown }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: () => holder.supabase }));
vi.mock("@/lib/salon", () => ({ getActiveSalonId: () => Promise.resolve("SALON") }));
import { makeSupabaseMock } from "@/tests/helpers/supabase-mock";
import { setOrderItemStatus } from "@/app/(dashboard)/mostrador/actions";
beforeEach(() => { holder.supabase = null; });

it("setOrderItemStatus da CONFLICTO si el estado esperado ya cambió", async () => {
  holder.supabase = makeSupabaseMock({ onWrite: (op: string) => op === "update" ? { data: [] } : {} });
  const r = await setOrderItemStatus({ itemId: "i1", from: "enviado", to: "listo" });
  expect(r.ok).toBe(false);
  if (!r.ok) expect(r.error.toLowerCase()).toContain("conflicto");
});
```

- [ ] **Step 2: Run to verify it fails.** `npm test -- restauracion-order-status` → FAIL.

- [ ] **Step 3: Implement** las 2 actions en `mostrador/actions.ts` (+ esquemas `sendOrderToStationsSchema`/`setOrderItemStatusSchema` en `validations/order.ts`). `setOrderItemStatus`: `.update({ status: to }).eq("id", itemId).eq("salon_id", salonId).eq("status", from).select("*")`; si `data.length === 0` → `{ ok:false, error:"CONFLICTO: el estado ya cambió" }`. `sendOrderToStations`: `.update({ status:"enviado" }).eq("salon_id", salonId).eq("order_id", orderId).eq("status","pendiente").select("id")` → cuenta.

- [ ] **Step 4: Add hooks + run + typecheck.** `npm test -- restauracion-order-status && npm run typecheck` → PASS + exit 0.

- [ ] **Step 5: Commit**

```bash
git add "clients/projects/salon-os/src/app/(dashboard)/mostrador/actions.ts" \
        clients/projects/salon-os/src/lib/validations/order.ts \
        clients/projects/salon-os/src/hooks/use-orders.ts \
        clients/projects/salon-os/src/tests/integration/restauracion-order-status.test.ts
git commit -m "feat(restauracion): mandar a estaciones + transición de estado segura"
```

---

