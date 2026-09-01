## Task 5: Nav item /cocina (staff)

**Files:**
- Modify: `…/src/components/dashboard-nav-items.ts`
- Test: `…/src/tests/unit/dashboard-nav-items.test.ts`

**Interfaces:**
- Produces: en la rama `sector === "restauracion"` de `buildDashboardNavItems`, `COCINA_ITEM = { href: "/cocina", label: "Cocina", icon: <lucide, p.ej. ChefHat> }` para TODOS los miembros (staff), junto a `MOSTRADOR_ITEM`; `CARTA_ITEM` sigue solo con `showSettings`.

- [ ] **Step 1: Write the failing test** — añade a `…/src/tests/unit/dashboard-nav-items.test.ts`:

```ts
it("restauración: staff ve Mostrador y Cocina, no Carta", () => {
  const items = buildDashboardNavItems({ showSettings: false, hasPos: true, sector: "restauracion" });
  const hrefs = items.map((i) => i.href);
  expect(hrefs).toContain("/mostrador");
  expect(hrefs).toContain("/cocina");
  expect(hrefs).not.toContain("/carta");
});
```

- [ ] **Step 2: Run to verify it fails.** `npm test -- dashboard-nav-items` → FAIL.

- [ ] **Step 3: Implement.** Importa el icono, declara `COCINA_ITEM`, y en la rama de restauración añade `COCINA_ITEM` a los `extras` que ven todos los miembros (junto a `MOSTRADOR_ITEM`):

```ts
if (sector === "restauracion") {
  const base = withSectorLabels.slice(0, 1);
  const rest = withSectorLabels.slice(1);
  const extras = showSettings
    ? [MOSTRADOR_ITEM, COCINA_ITEM, CARTA_ITEM]
    : [MOSTRADOR_ITEM, COCINA_ITEM];
  return [...base, ...extras, ...rest];
}
```

- [ ] **Step 4: Run full suite + typecheck.** `npm test && npm run typecheck` → verde + exit 0.

- [ ] **Step 5: Commit**

```bash
git add clients/projects/salon-os/src/components/dashboard-nav-items.ts \
        clients/projects/salon-os/src/tests/unit/dashboard-nav-items.test.ts
git commit -m "feat(restauracion): item de navegación Cocina (KDS, staff)"
```

---

## Criterios de aceptación (Puerta de control Plan C)

- [ ] `npm test` y `npm run typecheck` verdes.
- [ ] Migración de publicación aplicada en `jztoyekixcziaicrnlce` (`(201, [])`); `order_items` en `pg_publication_tables`.
- [ ] Al **Mandar** un pedido desde `/mostrador`, sus líneas aparecen en `/cocina` en la columna de su estación (comida→cocina, bebida→barra) **en tiempo real** (sin recargar).
- [ ] **Entregar** una línea la marca `listo`; **Entregado** la saca de la pantalla; el cambio se refleja en cualquier otra pantalla abierta (Realtime).
- [ ] Dos pantallas marcando la misma línea: la segunda recibe CONFLICTO sin romperse (el Realtime la refresca).
- [ ] Un `staff` puede usar `/cocina` (no requiere owner/manager).

## Notas / riesgos

- El cronómetro usa `order_items.created_at` como proxy de "hora de envío" (no hay `sent_at` dedicado). Suficiente para v1; si se quiere exactitud, añadir `sent_at` en una migración futura.
- `useSetOrderItemStatus` rechaza `to='anulado'` y exige `from` correcto (Plan B) → el KDS pasa `from: item.status`; ante CONFLICTO, el Realtime refresca el estado real.
- Si el Realtime no dispara, comprobar que la Task 1 (ALTER PUBLICATION) se aplicó de verdad: es el gotcha conocido del repo.
