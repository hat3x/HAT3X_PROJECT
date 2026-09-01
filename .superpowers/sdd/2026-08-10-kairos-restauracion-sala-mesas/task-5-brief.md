## Task 5: Server actions de sala

**Files:**
- Create: `…/src/lib/validations/table.ts`, `…/src/app/(dashboard)/sala/actions.ts`
- Modify: `…/src/hooks/use-tables.ts` (mutaciones)
- Test: `…/src/tests/integration/restauracion-sala-actions.test.ts`

**Interfaces:**
- Consumes: `getActiveSalonId`, `getActiveMembership`, `canManageSettings` (`@/lib/salon`); `createClient` de `@/lib/supabase/server`; `revalidatePath`; `canTransition` de `@/lib/restauracion/tables`; `makeSupabaseMock`.
- Produces (todas `ActionResult<T>`):
  - `openTable(input: { tableId, covers })` — **operativa** (miembro). `UPDATE dining_tables set status='ocupada' where id=tableId and salon_id and status='libre'` (0 filas → `{ok:false,"La mesa no está libre"}`); si 1 fila, crea `orders` (`randomUUID`, channel `'mesa'`, `dining_table_id`, `covers`, `label`=nombre mesa, status `'abierta'`); **si el insert de order falla → revierte la mesa a `libre`** y error. Devuelve el `order`.
  - `setTableStatus(input: { tableId, from, to })` — **operativa**. Rechaza si `!canTransition(from,to)` **antes** de tocar BD. `UPDATE ... .eq("status", from)`; 0 filas → `CONFLICTO`.
  - `saveTablePosition(input: { tableId, posX, posY })` — **gestión** (managers; es edición de layout). Acota con `clampPosition`. UPDATE `pos_x`/`pos_y`.
  - `createZone`/`updateZone`/`deleteZone`, `createTable`/`updateTable`/`deleteTable` — **gestión** (managers): patrón de las actions de carta (`assertManager` vía `canManageSettings(getActiveMembership().role)`, `safeParse`, escritura acotada por `salon_id`, `revalidatePath("/sala")`).
- Produces (hooks): `useOpenTable`, `useSetTableStatus`, `useSaveTablePosition`, `useCreateZone`/`useCreateTable`/`useUpdateTable`/`useDeleteTable` — invalidan `tableKeys.all(salonId)`.

- [ ] **Step 1: Write the failing integration test**

Create `…/src/tests/integration/restauracion-sala-actions.test.ts` (usa `makeSupabaseMock`, fixtures UUID). Cubre: `openTable` rechaza si la mesa NO está libre (UPDATE 0 filas → `ok:false`); `openTable` abre + crea la cuenta cuando está libre; `setTableStatus` da CONFLICTO cuando el UPDATE condicionado afecta 0 filas; `setTableStatus` rechaza transición inválida sin tocar BD:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
const holder = vi.hoisted(() => ({ supabase: null as unknown, membership: null as unknown }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: () => holder.supabase }));
vi.mock("@/lib/salon", () => ({
  getActiveSalonId: () => Promise.resolve("SALON"),
  getActiveMembership: () => Promise.resolve(holder.membership),
  canManageSettings: (r: string | null | undefined) => r === "owner" || r === "manager",
}));
import { makeSupabaseMock } from "@/tests/helpers/supabase-mock";
import { setTableStatus } from "@/app/(dashboard)/sala/actions";
beforeEach(() => { holder.membership = { salonId: "SALON", role: "staff" }; holder.supabase = null; });

it("setTableStatus rechaza transición inválida sin tocar BD", async () => {
  const onWrite = vi.fn(() => ({}));
  holder.supabase = makeSupabaseMock({ onWrite });
  const r = await setTableStatus({ tableId: "11111111-1111-4111-8111-111111111111", from: "libre", to: "por_limpiar" });
  expect(r.ok).toBe(false);
  expect(onWrite).not.toHaveBeenCalledWith("update", expect.anything(), expect.anything());
});
```

- [ ] **Step 2: Run to verify it fails.** `npm test -- restauracion-sala-actions` → FAIL.

- [ ] **Step 3: Write validations** (`…/src/lib/validations/table.ts`): Zod `openTableSchema` (tableId uuid, covers int 1..99), `setTableStatusSchema` (tableId uuid, from/to = enum de `table_status`), `saveTablePositionSchema` (tableId uuid, posX/posY number), `zoneSchema` (name), `tableSchema` (name, zoneId uuid, capacityMin/Max int, shape enum).

- [ ] **Step 4: Write the actions** (`…/src/app/(dashboard)/sala/actions.ts`, `"use server"`, `ActionResult<T>`). Implementa según "Produces". `openTable`: orden **UPDATE-mesa-condicionado → insert-order → (si falla) revertir mesa**. `setTableStatus`: `canTransition` antes del UPDATE condicionado. CRUD zonas/mesas: patrón `assertManager()` de las actions de carta.

- [ ] **Step 5: Add mutation hooks** en `…/src/hooks/use-tables.ts` (desempaqueta `ActionResult` + invalida `tableKeys.all(salonId)`).

- [ ] **Step 6: Run + typecheck.** `npm test -- restauracion-sala-actions && npm run typecheck` → PASS + exit 0.

- [ ] **Step 7: Commit**

```bash
git add clients/projects/salon-os/src/lib/validations/table.ts \
        "clients/projects/salon-os/src/app/(dashboard)/sala/actions.ts" \
        clients/projects/salon-os/src/hooks/use-tables.ts \
        clients/projects/salon-os/src/tests/integration/restauracion-sala-actions.test.ts
git commit -m "feat(restauracion): server actions de sala (abrir mesa, estado, layout)"
```

---

