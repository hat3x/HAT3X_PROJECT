## Task 8: Nav restauración — añadir Sala y retirar Caja (vender)

**Files:**
- Modify: `…/src/components/dashboard-nav-items.ts`
- Test: `…/src/tests/unit/dashboard-nav-items.test.ts`

**Contexto:** hoy la rama `sector === "restauracion"` de `buildDashboardNavItems` inserta `[MOSTRADOR_ITEM, COCINA_ITEM, (CARTA_ITEM si showSettings)]` tras "Panel", y `rest` arrastra la operativa común, que incluye **"Caja" (`/tpv`)** de `PRIMARY_NAV_ITEMS`. Decisión de producto: en restauración se **vende** en Mostrador/Sala, así que "Caja" (pantalla de vender) sobra; **"Arqueo" (`/arqueo`)** se mantiene (abrir/cerrar turno + Z, solo managers, ya vive en su propia sección).

**Interfaces:** Produces `SALA_ITEM = { href: "/sala", label: "Sala", icon: <lucide, p.ej. Armchair o LayoutPanelTop> }`. En la rama de restauración: (a) añadir `SALA_ITEM` tras `MOSTRADOR_ITEM`; (b) **filtrar** `/tpv` de `rest`.

- [ ] **Step 1: Write the failing test** — en `…/src/tests/unit/dashboard-nav-items.test.ts`:

```ts
it("restauración: staff ve Mostrador, Sala y Cocina; NO Caja ni Carta", () => {
  const items = buildDashboardNavItems({ showSettings: false, hasPos: true, sector: "restauracion" });
  const hrefs = items.map((i) => i.href);
  expect(hrefs).toContain("/mostrador");
  expect(hrefs).toContain("/sala");
  expect(hrefs).toContain("/cocina");
  expect(hrefs).not.toContain("/tpv"); // "Caja" (vender) se retira: se vende en Mostrador/Sala
  expect(hrefs).not.toContain("/carta");
});
it("restauración: manager ve Sala y conserva Arqueo; sigue sin Caja", () => {
  const items = buildDashboardNavItems({ showSettings: true, hasPos: true, sector: "restauracion" });
  const hrefs = items.map((i) => i.href);
  expect(hrefs).toContain("/sala");
  expect(hrefs).toContain("/arqueo");
  expect(hrefs).not.toContain("/tpv");
});
```

- [ ] **Step 2: Run to verify it fails.** `npm test -- dashboard-nav-items` → FAIL.

- [ ] **Step 3: Implement.** Importa el icono y declara `SALA_ITEM`. Reescribe la rama de restauración:

```ts
if (sector === "restauracion") {
  // Se vende en Mostrador/Sala → "Caja" (/tpv, pantalla de vender) se retira del menú.
  // "Arqueo" (/arqueo) se mantiene: abrir/cerrar turno + cierre Z, donde caen los cobros.
  const base = withSectorLabels.slice(0, 1); // Panel
  const rest = withSectorLabels.slice(1).filter((item) => item.href !== "/tpv");
  const extras = showSettings
    ? [MOSTRADOR_ITEM, SALA_ITEM, COCINA_ITEM, CARTA_ITEM]
    : [MOSTRADOR_ITEM, SALA_ITEM, COCINA_ITEM];
  return [...base, ...extras, ...rest];
}
```

Actualiza el comentario JSDoc de la rama de restauración para reflejar Sala + la retirada de Caja.

- [ ] **Step 4: Run full suite + typecheck.** `npm test && npm run typecheck` → verde + exit 0.

- [ ] **Step 5: Commit**

```bash
git add clients/projects/salon-os/src/components/dashboard-nav-items.ts \
        clients/projects/salon-os/src/tests/unit/dashboard-nav-items.test.ts
git commit -m "feat(restauracion): nav Sala + retirar Caja de vender (se vende en Mostrador/Sala)"
```

---

## Criterios de aceptación (Puerta de control)

- [ ] `npm test` y `npm run typecheck` verdes.
- [ ] Migraciones aplicadas en `jztoyekixcziaicrnlce` (`(201, [])`, guardián OK; `dining_tables`/`orders` en `pg_publication_tables`).
- [ ] En `/sala`: se ve el plano por zona; abrir una mesa libre (comensales) la pone ocupada; **Añadir** productos → aparecen en `/cocina`.
- [ ] Tocar una mesa ocupada muestra **comanda + tiempo sentados + total + comensales**.
- [ ] **Cobrar** la mesa materializa un `pos_sale` (cuadra en arqueo) y la mesa pasa a `por_limpiar`; **Limpiar** → `libre`.
- [ ] El plano se **actualiza en tiempo real** entre dos pantallas.
- [ ] `staff` no ve el modo edición; owner/manager arrastra una mesa y su posición **persiste**.
- [ ] En el sector restauración, el menú **ya no muestra "Caja"** (`/tpv`) y sí **"Arqueo"** (managers).

## Notas / riesgos

- `openTable` no es transaccional (como `createSale`/`settleOrder`): compensación manual (revertir mesa a `libre` si falla el insert del pedido).
- `saveTablePosition` gateada a managers (edición de layout), aunque la RLS de `dining_tables` UPDATE es de miembro (para el cambio de estado operativo). El split se refuerza a nivel de action.
- Cobro de mesa = orquestación en la UI: `settleOrder` (reuso) + `setTableStatus`. No se duplica lógica fiscal. Cae en la `pos_session` abierta desde `/arqueo`.
- Tras construir: sembrar unas mesas demo en `demoresto` (zona Salón con 4-5 mesas) para ver `/sala` en el local ya abierto.
