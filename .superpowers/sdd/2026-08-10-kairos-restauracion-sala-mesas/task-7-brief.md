## Task 7: Plano de sala arrastrable (`/sala`)

**Files:**
- Create: `…/src/app/(dashboard)/sala/{layout.tsx,page.tsx,sala-view.tsx,table-node.tsx,floor-editor.tsx}`
- Test: `…/src/tests/unit/table-node.test.tsx`

**Interfaces:**
- Consumes: `useZones`/`useTables`/`useTableOrders`/`useTablesRealtime`/`useOpenTable`/`useSaveTablePosition`/`useCreateZone`/`useCreateTable` (`@/hooks/use-tables`), `TablePanel`, `tableTone` (`@/lib/restauracion/tables`), `getActiveMembership`/`canManageSettings` (`@/lib/salon`), `SectorGate` (patrón de `carta/layout.tsx`).
- Produces: ruta `/sala` (sector restauración, staff). `layout.tsx` = `SectorGate required="restauracion"` (sin gate de rol). `page.tsx` resuelve `salonId` + `role`. `sala-view.tsx`: `useTablesRealtime` + indicador "En directo"; selector de zona; lienzo con las mesas en `pos_x`/`pos_y` (`table-node.tsx`), color por `tableTone(status)`; tocar mesa libre → diálogo "Abrir mesa" (comensales) → `useOpenTable`; tocar mesa ocupada → `TablePanel`; **Añadir** desde el panel navega a `/mostrador?order=<id>` (reusa el flujo de pedido con la cuenta de la mesa). **Modo edición** (solo si `canManageSettings(role)`): arrastrar `table-node` actualiza `pos_x`/`pos_y` (con `clampPosition`) y al soltar llama `useSaveTablePosition`; botones para crear zona/mesa.

- [ ] **Step 1: Write the failing component test** — Create `…/src/tests/unit/table-node.test.tsx`. `TableNode` con `{ table, tone, editable, onSelect, onDragEnd }` renderiza el nombre de la mesa y aplica clase/atributo según `tone`; al hacer click (no editable) llama `onSelect`. Arrastre real → verificación manual.

- [ ] **Step 2: Run to verify it fails.** `npm test -- table-node` → FAIL.

- [ ] **Step 3: Implement** `layout.tsx`, `page.tsx`, `table-node.tsx`, `sala-view.tsx`, `floor-editor.tsx`. Arrastre con **eventos de puntero nativos** (`onPointerDown/Move/Up`) sobre contenedor `position:relative`; mesas `position:absolute` en `%` de `pos_x`/`pos_y`. Cronómetro: `useState(() => new Date())` + `setInterval(30s)` para `now`, pasado a `TablePanel`. Reusa el patrón de estado de `mostrador-view.tsx`.

- [ ] **Step 4: Run test + full suite + typecheck.** `npm test -- table-node && npm test && npm run typecheck` → verde + exit 0.

- [ ] **Step 5: Commit**

```bash
git add "clients/projects/salon-os/src/app/(dashboard)/sala/" \
        clients/projects/salon-os/src/tests/unit/table-node.test.tsx
git commit -m "feat(restauracion): plano de sala arrastrable (/sala) en tiempo real"
```

---

