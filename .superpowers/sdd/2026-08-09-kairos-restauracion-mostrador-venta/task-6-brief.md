## Task 6: Server action settleOrder (materializa pos_sale)

**Files:**
- Modify: `…/src/app/(dashboard)/mostrador/actions.ts`, `…/src/lib/validations/order.ts`, `…/src/hooks/use-orders.ts`
- Test: `…/src/tests/integration/restauracion-settle.test.ts`

**Interfaces:**
- Consumes: `computeSaleTotals`/`computeLineTotals` de `@/lib/payments`; `buildSettleLines`/`settleTotals` de `@/lib/restauracion/order`; patrón de `createSale` (`src/app/(dashboard)/tpv/actions.ts`) para insertar `pos_sales`/`pos_sale_lines`/`pos_payments` + `session_id` + rollback.
- Produces: `settleOrder(input: { orderId; tenders: Array<{ method; amountCents; paymentMethodId; reference? }>; sendPending: boolean }): Promise<ActionResult<{ saleId: string; totalCents: number }>>`.
  - **Idempotencia**: si el pedido ya está `cobrada` o ya existe `pos_sales` con `order_id = orderId`, devuelve ese sale sin cobrar de nuevo.
  - Carga `order_items` no anulados (`.eq("order_id").is("void_of_item_id", null).neq("status","anulado")`, join `products(name)`); `buildSettleLines` + `settleTotals`.
  - Si `sendPending`, transiciona `pendiente`→`enviado` (pagar-primero).
  - Inserta `pos_sales` (`status:"completed"`, `order_id`, `session_id` de la caja abierta, totales) → `pos_sale_lines` → `pos_payments` (patrón `createSale`, rollback manual) → `orders.status='cobrada'`.

- [ ] **Step 1: Write the failing integration test**

Create `…/src/tests/integration/restauracion-settle.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
const holder = vi.hoisted(() => ({ supabase: null as unknown }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: () => holder.supabase }));
vi.mock("@/lib/salon", () => ({ getActiveSalonId: () => Promise.resolve("SALON") }));
import { makeSupabaseMock } from "@/tests/helpers/supabase-mock";
import { settleOrder } from "@/app/(dashboard)/mostrador/actions";
beforeEach(() => { holder.supabase = null; });

it("settleOrder materializa un pos_sale desde el pedido", async () => {
  holder.supabase = makeSupabaseMock({
    tables: {
      orders: { data: [{ id: "O1", salon_id: "SALON", status: "abierta" }] },
      order_items: { data: [
        { id:"i1", salon_id:"SALON", order_id:"O1", product_id:"p1", qty:2, unit_price_cents:880, vat_rate:10, status:"enviado", void_of_item_id:null, modifiers_snapshot:[], products:{ name:"Hamburguesa" } },
      ] },
      pos_sessions: { data: [{ id: "SESS1" }] },
      pos_sales: { data: [] },
    },
    onWrite: (op: string, table: string) => op==="insert" && table==="pos_sales" ? { data:[{ id:"S1" }] } : {},
  });
  const r = await settleOrder({ orderId:"O1", tenders:[{ method:"efectivo", amountCents:1760, paymentMethodId:null }], sendPending:true });
  expect(r.ok).toBe(true);
  if (r.ok) { expect(r.data.saleId).toBe("S1"); expect(r.data.totalCents).toBe(1760); }
});
```

- [ ] **Step 2: Run to verify it fails.** `npm test -- restauracion-settle` → FAIL.

- [ ] **Step 3: Implement `settleOrder`** en `mostrador/actions.ts`, replicando la estructura de `createSale` (léela: `src/app/(dashboard)/tpv/actions.ts`). Pasos: cargar pedido (guard salón + estado); si idempotente, retornar el sale existente; cargar ítems no anulados (join `products(name)`); `buildSettleLines`+`settleTotals`; buscar `pos_session` abierta (patrón `createSale`); insertar `pos_sales` (con `order_id`, `session_id`, totales, `status:"completed"`, `sold_by:user.id`); insertar `pos_sale_lines` (rollback: borrar la venta si falla); insertar `pos_payments` (rollback); `update orders set status='cobrada'`; si `sendPending` mandar pendientes; `revalidatePath("/mostrador")`; devolver `{ saleId, totalCents }`.

- [ ] **Step 4: Add hook + run + full suite + typecheck.** `useSettleOrder`. `npm test -- restauracion-settle && npm test && npm run typecheck` → verde + exit 0.

- [ ] **Step 5: Commit**

```bash
git add "clients/projects/salon-os/src/app/(dashboard)/mostrador/actions.ts" \
        clients/projects/salon-os/src/lib/validations/order.ts \
        clients/projects/salon-os/src/hooks/use-orders.ts \
        clients/projects/salon-os/src/tests/integration/restauracion-settle.test.ts
git commit -m "feat(restauracion): settleOrder — materializa pos_sale desde el pedido (patrón createSale)"
```

---

