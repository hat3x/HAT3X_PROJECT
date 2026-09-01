## Task 4: Queries + hooks de sala (con Realtime)

**Files:**
- Create: `…/src/lib/queries/tables.ts`, `…/src/hooks/use-tables.ts`
- Test: `…/src/tests/unit/table-keys.test.ts`

**Interfaces:**
- Consumes: `createClient` de `@/lib/supabase/client`; tipos `DiningZone`, `DiningTable`, `Order`; `useQuery`/`useQueryClient`.
- Produces:
  - `tableKeys`: `all(salonId)`, `zones(salonId)`, `tables(salonId)`, `openOrders(salonId)`.
  - `fetchZones(salonId)`, `fetchTables(salonId)` (todas las mesas activas del salón, con `zone_id`, `status`, `pos_x/y`, etc.).
  - `fetchTableOrders(salonId)` — pedidos abiertos con `dining_table_id` no nulo (para mapear mesa→cuenta en la vista): `orders` `status='abierta'` `dining_table_id is not null`.
  - Hooks: `useZones(salonId)`, `useTables(salonId)`, `useTableOrders(salonId)`, `useTablesRealtime(salonId)` (patrón `use-day-panel-realtime.ts`: canal `sala-${salonId}`, suscrito a `dining_tables` filtrado por `salon_id`, invalida `tableKeys.all(salonId)`; una segunda suscripción a `orders` en el mismo canal). Los hooks de mutación se añaden en la Task 5.

- [ ] **Step 1: Write the failing test**

Create `…/src/tests/unit/table-keys.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { tableKeys } from "@/lib/queries/tables";

describe("tableKeys", () => {
  it("deriva sub-keys del salón", () => {
    expect(tableKeys.all("s1")).toEqual(["tables", "s1"]);
    expect(tableKeys.tables("s1")).toEqual(["tables", "s1", "tables"]);
    expect(tableKeys.openOrders("s1")).toEqual(["tables", "s1", "openOrders"]);
  });
});
```

- [ ] **Step 2: Run to verify it fails.** `npm test -- table-keys` → FAIL.

- [ ] **Step 3: Write queries** — Create `…/src/lib/queries/tables.ts` con `tableKeys` + `fetchZones`/`fetchTables`/`fetchTableOrders` (todos `.eq("salon_id", salonId)`, `throw` en error), patrón idéntico a `queries/orders.ts`.

- [ ] **Step 4: Write hooks** — Create `…/src/hooks/use-tables.ts` (`"use client"`): `useZones`/`useTables`/`useTableOrders` (useQuery), y `useTablesRealtime` copiando `use-day-panel-realtime.ts` (tabla `dining_tables`, filter `salon_id=eq.${salonId}`, invalida `tableKeys.all(salonId)`; añade un segundo `.on("postgres_changes", { table:"orders", filter... })` en el mismo canal para reaccionar también a aperturas/cobros).

- [ ] **Step 5: Run + typecheck.** `npm test -- table-keys && npm run typecheck` → PASS + exit 0.

- [ ] **Step 6: Commit**

```bash
git add clients/projects/salon-os/src/lib/queries/tables.ts \
        clients/projects/salon-os/src/hooks/use-tables.ts \
        clients/projects/salon-os/src/tests/unit/table-keys.test.ts
git commit -m "feat(restauracion): queries y hooks de sala (lectura + Realtime)"
```

---

