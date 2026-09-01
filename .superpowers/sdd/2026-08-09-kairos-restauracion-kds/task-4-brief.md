## Task 4: UI del KDS (`/cocina`)

**Files:**
- Create: `…/src/app/(dashboard)/cocina/{layout.tsx,page.tsx,cocina-view.tsx,station-column.tsx,order-ticket-card.tsx}`
- Test: `…/src/tests/unit/order-ticket-card.test.tsx`

**Interfaces:**
- Consumes: `useKdsItems`/`useKdsRealtime` (`@/hooks/use-kds`), `useSetOrderItemStatus` (`@/hooks/use-orders`, Plan B), `groupKdsItemsByOrder`/`elapsedMinutes` (`@/lib/restauracion/kds`).
- Produces: ruta `/cocina` (sector restauración, staff — SIN gate de rol). Columnas por estación; cada pedido como tarjeta con nº de pedido, etiqueta, cronómetro, líneas (qty × nombre + modificadores) y botones **Entregar**/**Entregado** por línea.

- [ ] **Step 1: Write the failing component test** — Create `…/src/tests/unit/order-ticket-card.test.tsx`. Mockea `@/hooks/use-orders` (`useSetOrderItemStatus`) con `vi.hoisted`. Contrato de `OrderTicketCard`: dado un `KdsOrderGroup` con un ítem en estado `enviado`, renderiza el nº de pedido, el nombre del producto, y un botón `getByRole("button", {name:/entregar/i})`; al pulsarlo llama `setOrderItemStatus.mutate` con `{ itemId, from: "enviado", to: "listo" }`. Para un ítem `listo`, muestra botón `getByRole("button", {name:/entregado/i})` que llama con `{ from:"listo", to:"entregado" }`.

- [ ] **Step 2: Run to verify it fails.** `npm test -- order-ticket-card` → FAIL.

- [ ] **Step 3: Implement.**
  - `layout.tsx` = `SectorGate required="restauracion"` (SIN gate de rol — staff).
  - `page.tsx` resuelve `salonId` (patrón `products/page.tsx`) → `<CocinaView salonId={salonId} />`.
  - `cocina-view.tsx` (`"use client"`): `useKdsRealtime(salonId)` (+ indicador "En directo") + `useKdsItems(salonId)`; agrupa los ítems por `stationName` en columnas (`station-column.tsx`), y dentro de cada columna agrupa por pedido con `groupKdsItemsByOrder` → `order-ticket-card.tsx`. Refresco del cronómetro cada 30 s (un `setInterval` que fuerza re-render con `useState(now)`; el `now` NO entra en lógica pura, solo se pasa a `elapsedMinutes`).
  - `order-ticket-card.tsx`: nº de pedido grande, etiqueta, cronómetro (color según minutos: verde <5, ámbar 5-10, rojo >10), líneas con qty×nombre + modificadores, y por línea: **Entregar** (`useSetOrderItemStatus().mutate({ itemId, from: item.status, to: "listo" })`) si `status !== "listo"`, y **Entregado** (`{ from:"listo", to:"entregado" }`) si `status === "listo"`. Si `mutate` devuelve CONFLICTO, no hace falta acción extra (el Realtime refresca).
  - `station-column.tsx`: encabezado de estación + lista de tarjetas.
  - Componentes shadcn de `src/components/ui/`. Modo pantalla grande (columnas amplias).

- [ ] **Step 4: Run test + full suite + typecheck.** `npm test -- order-ticket-card && npm test && npm run typecheck` → verde + exit 0.

- [ ] **Step 5: Commit**

```bash
git add "clients/projects/salon-os/src/app/(dashboard)/cocina/" \
        clients/projects/salon-os/src/tests/unit/order-ticket-card.test.tsx
git commit -m "feat(restauracion): pantalla de cocina KDS (/cocina) en tiempo real"
```

---

