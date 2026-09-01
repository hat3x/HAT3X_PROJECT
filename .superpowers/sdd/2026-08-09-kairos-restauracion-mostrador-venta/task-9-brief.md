## Task 9: Nav item /mostrador (visible a staff)

**Files:**
- Modify: `…/src/components/dashboard-nav-items.ts`
- Test: `…/src/tests/unit/dashboard-nav-items.test.ts`

**Interfaces:**
- Produces: en la rama `sector === "restauracion"` de `buildDashboardNavItems`, `MOSTRADOR_ITEM = { href: "/mostrador", label: "Mostrador", icon: <lucide, p.ej. ConciergeBell> }` para TODOS los miembros; `CARTA_ITEM` sigue solo con `showSettings`.

- [ ] **Step 1: Write the failing test** — añade a `…/src/tests/unit/dashboard-nav-items.test.ts`:

```ts
it("restauración: staff ve Mostrador pero NO Carta", () => {
  const items = buildDashboardNavItems({ showSettings: false, hasPos: true, sector: "restauracion" });
  const hrefs = items.map((i) => i.href);
  expect(hrefs).toContain("/mostrador");
  expect(hrefs).not.toContain("/carta");
});
it("restauración: owner ve Mostrador y Carta", () => {
  const items = buildDashboardNavItems({ showSettings: true, hasPos: true, sector: "restauracion" });
  const hrefs = items.map((i) => i.href);
  expect(hrefs).toContain("/mostrador");
  expect(hrefs).toContain("/carta");
});
```

- [ ] **Step 2: Run to verify it fails.** `npm test -- dashboard-nav-items` → FAIL.

- [ ] **Step 3: Implement.** Importa el icono, declara `MOSTRADOR_ITEM`, y en la rama de restauración:

```ts
if (sector === "restauracion") {
  const base = withSectorLabels.slice(0, 1);
  const rest = withSectorLabels.slice(1);
  const extras = showSettings ? [MOSTRADOR_ITEM, CARTA_ITEM] : [MOSTRADOR_ITEM];
  return [...base, ...extras, ...rest];
}
```

- [ ] **Step 4: Run full suite + typecheck.** `npm test && npm run typecheck` → verde + exit 0.

- [ ] **Step 5: Commit**

```bash
git add clients/projects/salon-os/src/components/dashboard-nav-items.ts \
        clients/projects/salon-os/src/tests/unit/dashboard-nav-items.test.ts
git commit -m "feat(restauracion): item de navegación Mostrador (visible a staff)"
```

---

## Criterios de aceptación (Puerta de control Plan B)

- [ ] `npm test` y `npm run typecheck` verdes.
- [ ] Migración `orders` aplicada en `jztoyekixcziaicrnlce` (`(201, [])`, guardián OK).
- [ ] **Pagar-primero**: en `/mostrador` se arma un pedido con un producto con modificadores y un combo, se pulsa Cobrar, se materializa un `pos_sale` que **cuadra en el arqueo**, y salen ticket + comanda(s) por estación (comida→cocina, bebida→barra).
- [ ] **Cuenta abierta**: se arma un pedido, se pulsa Mandar (comanda impresa, pedido sigue abierto y aparece en cuentas abiertas), se añaden más líneas en otra tanda, y se cobra al final; el `pos_sale` cuadra.
- [ ] Anular una línea deja rastro (fila de anulación con motivo), nunca la borra.
- [ ] Reintentar Cobrar el mismo pedido no crea un segundo `pos_sale` (idempotencia).
- [ ] Un `staff` puede vender en `/mostrador` (no requiere owner/manager).

## Planes siguientes

- **Plan C — KDS**: pantalla `/cocina` por estación en tiempo real (patrón `useDayPanelRealtime`) + `alter publication supabase_realtime add table public.order_items` + `setOrderItemStatus` desde la pantalla (Entregar/Entregado).

## Notas / riesgos

- `order_number` por trigger `max+1` por salón: race teórica en alta concurrencia; aceptable en mostrador. Si molesta, migrar a secuencia por salón.
- `settleOrder` no es transaccional (como `createSale`): rollback manual por compensación. Si en producción hay descuadre, candidato a RPC transaccional (junto al minor diferido de Plan A sobre las replace-all).
- Loyalty en `settleOrder`: v1 puede omitir `awardVisit` (mostrador sin escaneo); dejar el hueco documentado para cuando se conecte fidelización a restauración.
