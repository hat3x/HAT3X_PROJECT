## Task 9: Activar el sector restauración en la navegación

**Files:**
- Modify: `…/src/lib/sector/registry.ts`, `…/src/components/dashboard-nav-items.ts`
- Test: `…/src/tests/unit/dashboard-nav-items.test.ts` (ampliar el existente)

**Interfaces:**
- Consumes: `SECTOR_REGISTRY`, `buildDashboardNavItems`.
- Produces: con `sector: "restauracion"` la nav deja de mostrar "Próximamente" y muestra el item **Carta** (`/carta`) para owner/manager.

- [ ] **Step 1: Write the failing nav test**

Añade a `…/src/tests/unit/dashboard-nav-items.test.ts`:

```ts
it("restauración: owner ve el item Carta y NO 'Próximamente'", () => {
  const items = buildDashboardNavItems({ showSettings: true, hasPos: true, sector: "restauracion" });
  const hrefs = items.map((i) => i.href);
  expect(hrefs).toContain("/carta");
  expect(hrefs).not.toContain("/proximamente");
});
it("restauración: staff (sin settings) no cae en 'Próximamente'", () => {
  const items = buildDashboardNavItems({ showSettings: false, hasPos: false, sector: "restauracion" });
  expect(items.map((i) => i.href)).not.toContain("/proximamente");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd clients/projects/salon-os && npm test -- dashboard-nav-items`
Expected: FAIL (hoy `restauracion.implemented === false` → devuelve "Próximamente").

- [ ] **Step 3: Activate the sector**

En `…/src/lib/sector/registry.ts`, en la entrada `restauracion`, cambia `implemented: false` → `implemented: true`.

- [ ] **Step 4: Add the Carta nav item for restauración**

En `…/src/components/dashboard-nav-items.ts`:
1. Importa un icono de `lucide-react` (p.ej. `UtensilsCrossed`) en el bloque de imports.
2. Declara la constante: `export const CARTA_ITEM: NavItem = { href: "/carta", label: "Carta", icon: UtensilsCrossed };`.
3. En `buildDashboardNavItems`, añade la rama de sector justo antes del `return withSectorLabels` genérico:

```ts
if (sector === "restauracion") {
  // "Carta" es gestión (owner/manager): solo si showSettings.
  return showSettings
    ? [...withSectorLabels.slice(0, 1), CARTA_ITEM, ...withSectorLabels.slice(1)]
    : withSectorLabels;
}
```

- [ ] **Step 5: Run the test + full suite + typecheck**

Run: `cd clients/projects/salon-os && npm test && npm run typecheck`
Expected: toda la suite verde + exit 0. (Verifica que no rompes los tests de nav de peluquería/odontología.)

- [ ] **Step 6: Commit**

```bash
git add clients/projects/salon-os/src/lib/sector/registry.ts \
        clients/projects/salon-os/src/components/dashboard-nav-items.ts \
        clients/projects/salon-os/src/tests/unit/dashboard-nav-items.test.ts
git commit -m "feat(restauracion): activar sector y navegación de carta"
```

---

## Criterios de aceptación (Puerta de control Plan A)

- [ ] `npm test` y `npm run typecheck` verdes.
- [ ] Las 3 migraciones aplicadas en `jztoyekixcziaicrnlce` (cada `run()` devolvió `(201, [])`, guardianes con `raise notice`, sin excepción).
- [ ] Un usuario owner de un salón con `sector = restauracion` entra en `/carta`, crea categorías/estaciones, da de alta un producto con IVA/alérgenos/estación, define un grupo de modificadores y un combo con ruteo por pieza.
- [ ] Se importa por CSV una porción de la carta de 100M (montaditos + bebidas + un combo) y las filas válidas quedan creadas; los errores de fila se informan sin abortar.
- [ ] Un usuario `staff` no ve el item "Carta" y `/carta` le redirige a `/dashboard`.
- [ ] El sector restauración ya no muestra "Próximamente".

---

## Planes siguientes (contexto, no alcance de este plan)

- **Plan B — Venta de mostrador:** migración `orders`/`order_items` (append-only, UUID cliente, idempotencia) + `alter table pos_sales add column order_id` (FK compuesta) + RPCs `create_order`/`send_order_to_stations`/`settle_order` (SECURITY DEFINER, `search_path=''`, gate por rol, tests sql-coherence) + rejilla táctil `/mostrador` + dos flujos (pagar-primero / cuenta abierta) + comanda impresa (reusar `buildTicketDocumentHtml`) + CHECK `unit_price_cents >= 0`.
- **Plan C — KDS:** pantalla `/cocina` por estación + hook Realtime (patrón `useDayPanelRealtime`) + `alter publication supabase_realtime add table public.order_items` (sin precedente en el repo — crear en migración) + transiciones de estado concurrentes-seguras.
