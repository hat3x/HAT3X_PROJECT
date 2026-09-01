## Task 8: UI de mostrador (`/mostrador`)

**Files:**
- Create: `…/src/app/(dashboard)/mostrador/{layout.tsx,page.tsx,mostrador-view.tsx,product-grid.tsx,order-panel.tsx,modifier-picker-dialog.tsx,open-orders-bar.tsx,payment-sheet.tsx}`
- Test: `…/src/tests/unit/order-panel.test.tsx`

**Interfaces:**
- Consumes: `useMenuCategories`/`useMenuProducts`/`useStations` (`@/hooks/use-menu`), `useOpenOrders`/`useCreateOrder`/`useAddOrderItems`/`useSendOrderToStations`/`useSettleOrder` (`@/hooks/use-orders`), `buildOrderItemDrafts`/`settleTotals` (`@/lib/restauracion/order`), `printKitchenComanda` + `printTicketDocument`.
- Produces: ruta `/mostrador` (sector restauración; visible a **staff**). Flujo: `product-grid` (categoría→producto→`modifier-picker-dialog`→`buildOrderItemDrafts`→estado local), `order-panel` (líneas + total con `settleTotals` + **Mandar**/**Cobrar**), `payment-sheet` (tenders + cambio, patrón `tpv/payment-dialog.tsx`), `open-orders-bar` (reabrir cuentas).

- [ ] **Step 1: Write the failing component test** — Create `…/src/tests/unit/order-panel.test.tsx`. Mockea `@/hooks/use-orders` con `vi.hoisted`. Contrato mínimo de `OrderPanel`: dadas unas líneas, renderiza cada línea + el total (`settleTotals`) + botones `getByRole("button", {name:/mandar/i})` y `getByRole("button", {name:/cobrar/i})`; al pulsar Cobrar dispara el flujo de pago (mock).

- [ ] **Step 2: Run to verify it fails.** `npm test -- order-panel` → FAIL.

- [ ] **Step 3: Implement.** `layout.tsx` = `SectorGate required="restauracion"` (SIN gate de rol — staff vende). `page.tsx` resuelve `salonId`. `mostrador-view.tsx` (`"use client"`): estado local del pedido (drafts con `crypto.randomUUID()`), `product-grid` (categorías `Tabs`/botones grandes + productos; producto con grupos de modificadores → `modifier-picker-dialog` respetando min/max → `buildOrderItemDrafts`), `order-panel` (líneas + `settleTotals` + **Mandar** [crea pedido si no existe con uuid cliente + `addOrderItems` + `sendOrderToStations` + `printKitchenComanda` por estación] y **Cobrar** [`payment-sheet` → `settleOrder` → `printTicketDocument` + comanda si pagar-primero]), `open-orders-bar` (`useOpenOrders` → reabrir). Reusa `formatMoney`; sigue el patrón de estado de `tpv-view.tsx`.

- [ ] **Step 4: Run test + full suite + typecheck.** `npm test -- order-panel && npm test && npm run typecheck` → verde + exit 0.

- [ ] **Step 5: Commit**

```bash
git add "clients/projects/salon-os/src/app/(dashboard)/mostrador/" \
        clients/projects/salon-os/src/tests/unit/order-panel.test.tsx
git commit -m "feat(restauracion): rejilla de mostrador (/mostrador) con dos flujos y comanda"
```

---

