## Task 6: Panel de mesa (`table-panel.tsx`)

**Files:**
- Create: `…/src/app/(dashboard)/sala/table-panel.tsx`
- Test: `…/src/tests/unit/table-panel.test.tsx`

**Interfaces:**
- Consumes: `useOrderItems` (`@/hooks/use-orders`), `useSetTableStatus` (`@/hooks/use-tables`), `useSettleOrder` (`@/hooks/use-orders`), `settleTotals` (`@/lib/restauracion/order`), `elapsedMinutes` (`@/lib/restauracion/kds`), `formatMoney` (`@/lib/format`).
- Produces: `TablePanel` — dado `{ table: DiningTable; order: Order | null; salonId: string; now: Date; onClose; onAdd }`: muestra la comanda (líneas de `useOrderItems(salonId, order?.id)`), el **cronómetro** `elapsedMinutes(order.created_at, now)`, el **total** (`settleTotals` sobre las líneas no anuladas), los **comensales** (`order.covers`), el **estado**, y botones **Añadir** (`onAdd`), **Pedir cuenta** (`useSetTableStatus` → cuenta_pedida), **Cobrar** (reusa `useSettleOrder`; al ok, `setTableStatus` → por_limpiar), **Limpiar** (`setTableStatus` → libre).

- [ ] **Step 1: Write the failing component test** — Create `…/src/tests/unit/table-panel.test.tsx`. Mockea `@/hooks/use-orders` y `@/hooks/use-tables` con `vi.hoisted`. Contrato mínimo: dado un pedido con líneas, renderiza el total y los comensales, y muestra `getByRole("button", {name:/añadir/i})` y `/cobrar/i`.

- [ ] **Step 2: Run to verify it fails.** `npm test -- table-panel` → FAIL.

- [ ] **Step 3: Implement** `table-panel.tsx` según "Produces". El cobro orquesta `useSettleOrder(...).mutate(..., { onSuccess: () => setTableStatus({ tableId, from: table.status, to:'por_limpiar' }) })`. `elapsedMinutes` recibe `now` (del padre).

- [ ] **Step 4: Run + full suite + typecheck.** `npm test -- table-panel && npm test && npm run typecheck` → verde + exit 0.

- [ ] **Step 5: Commit**

```bash
git add "clients/projects/salon-os/src/app/(dashboard)/sala/table-panel.tsx" \
        clients/projects/salon-os/src/tests/unit/table-panel.test.tsx
git commit -m "feat(restauracion): panel de mesa (comanda + tiempo + total + acciones)"
```

---

