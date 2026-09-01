# Task 5 — Report

## STATUS: DONE

## Files created / modified

- `clients/projects/salon-os/src/lib/validations/table.ts` (nuevo) — Zod: `tableStatusEnum`/`tableShapeEnum` (espejo de `TableStatusValue`/`TableShape`); `openTableSchema` (tableId uuid, covers int 1..99); `setTableStatusSchema` (tableId uuid, from/to enum); `saveTablePositionSchema` (tableId uuid, posX/posY number); `zoneSchema` (name + sortOrder, misma forma que `categorySchema` de carta); `tableSchema` (name, zoneId uuid, capacityMin/Max int, shape enum, sortOrder) con `.refine` que reutiliza `validCapacity` (`@/lib/restauracion/tables`, Task 3) en vez de repetir la regla min≤max a mano.
- `clients/projects/salon-os/src/app/(dashboard)/sala/actions.ts` (nuevo, `"use server"`) — `ActionResult<T>`:
  - `openTable` (operativa, solo `getActiveSalonId`): `UPDATE dining_tables SET status='ocupada' WHERE id AND salon_id AND status='libre'` con `.select("*")`; 0 filas → `{ok:false,"La mesa no está libre"}` sin tocar `orders`. Si 1 fila: `INSERT orders` (`id: randomUUID()`, `channel:'mesa'`, `dining_table_id`, `covers`, `label: table.name` tomado del propio `.select()` del UPDATE — sin consulta aparte —, `status:'abierta'`). Si el insert falla: compensa `UPDATE dining_tables SET status='libre'` (ignora su resultado, igual criterio que `rollback()` en `settleOrder`) y propaga el error ORIGINAL del insert.
  - `setTableStatus` (operativa): `canTransition(from,to)` (`@/lib/restauracion/tables`) ANTES de tocar BD → `{ok:false,"Transición no válida"}` sin ninguna query. Luego `UPDATE ... WHERE id AND salon_id AND status=from`; 0 filas → `CONFLICTO: el estado de la mesa ya cambió`.
  - `saveTablePosition` (gestión, `assertManager()`): `pos_x`/`pos_y` acotados con `clampPosition` antes del UPDATE — el servidor no confía en que el cliente ya haya limitado el arrastre.
  - `createZone`/`updateZone`/`deleteZone`, `createTable`/`updateTable`/`deleteTable` (gestión): patrón EXACTO de `carta/actions.ts` (`assertManager` → `safeParse` → escritura acotada por `salon_id` → `revalidatePath("/sala")`). Sin guarda de pertenencia aparte para `zone_id`: el FK compuesto `dining_tables_zone_fkey` (zone_id, salon_id) ya lo garantiza en la base (paridad con el mismo razonamiento que usa `carta/actions.ts` sobre sus propios FKs).
- `clients/projects/salon-os/src/hooks/use-tables.ts` (modificado) — añadidos `useOpenTable`/`useSetTableStatus`/`useSaveTablePosition`/`useCreateZone`/`useUpdateZone`/`useDeleteZone`/`useCreateTable`/`useUpdateTable`/`useDeleteTable`: cada uno `useMutation` que desempaqueta `ActionResult` (lanza si `ok:false`) e invalida `tableKeys.all(salonId)` en `onSuccess` (vía `useInvalidateTables`, mismo patrón que `useInvalidateMenu`/`useInvalidateOrders`). Se añadieron `useUpdateZone`/`useDeleteZone` además de lo mínimo listado en el brief, por paridad de CRUD completo con las acciones de zona (igual que `use-menu.ts` expone el trío completo para categorías/estaciones).
- `clients/projects/salon-os/src/tests/integration/restauracion-sala-actions.test.ts` (nuevo) — 5 tests: (1) `openTable` rechaza si la mesa NO está libre (UPDATE 0 filas), sin llamar `insert` en `orders`; (2) `openTable` abre + crea la cuenta cuando está libre (verifica `label` = nombre de mesa, `dining_table_id`, `status:'abierta'`, y que `onWrite` recibió el `update` y el `insert` esperados); (3) `openTable` revierte la mesa a `libre` si el insert del pedido falla (compensación manual — test añadido más allá del mínimo del brief, cubre explícitamente el contrato de rollback); (4) `setTableStatus` da CONFLICTO cuando el UPDATE condicionado afecta 0 filas; (5) `setTableStatus` rechaza transición inválida sin tocar BD (test literal del brief).

## Commit

- `3eac19b` — `feat(restauracion): server actions de sala (abrir mesa, estado, layout)` (rama `hat3x/HAT3X-038`, repo anidado `clients/projects/salon-os`). Staged por pathspec exacto (los 4 ficheros); `git status` confirmado limpio salvo `.claude/` (untracked, no tocado, no relacionado con esta tarea).

## Tests

`npm test -- restauracion-sala-actions` → 1 test file, 5 tests, PASS (rojo confirmado antes de crear `sala/actions.ts`: fallo de resolución de import, luego verde tras implementar). `npm run typecheck` (`tsc --noEmit`) → exit 0. Suite completa: `npm test` → **151 test files, 1891 tests, todos PASS**.

## Dudas

Ninguna. `covers` se pasa a `orders.covers` tal cual valida el schema (1..99); no hay lógica adicional de aforo por zona en esta tarea. El editor visual del plano y los formularios de zonas/mesas (UI) quedan para una tarea posterior — aquí solo van server actions + hooks de mutación.
