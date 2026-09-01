# Task 6 — Informe: validaciones Zod + server actions de carta

**STATUS:** COMPLETADO
**Commit:** `df322aa199017fc2036cf305d09dda9bd096cc5d` — rama `hat3x/HAT3X-038` (repo anidado `clients/projects/salon-os`)
**Mensaje:** `feat(restauracion): server actions y validaciones de carta`

---

## 1. Ficheros

| Fichero | Tipo | Líneas |
|---|---|---|
| `src/lib/validations/menu.ts` | nuevo | 80 |
| `src/app/(dashboard)/carta/actions.ts` | nuevo | 356 |
| `src/tests/helpers/supabase-mock.ts` | nuevo (extraído) | 80 |
| `src/tests/integration/restauracion-carta-actions.test.ts` | nuevo | 46 |
| `src/hooks/use-menu.ts` | modificado (+217/-1) | — |
| `src/tests/integration/tenant-isolation.test.ts` | modificado (import del helper extraído) | — |

## 2. Server actions escritas (TODAS las del "Produces")

Todas en `src/app/(dashboard)/carta/actions.ts`, cabecera `"use server"`, mismo patrón que los 2 ejemplos del brief:

1. `assertManager()` — helper compartido: `getActiveMembership()` → `canManageSettings(role)` → si es válido, `getActiveSalonId()`; si no, `null`.
2. `safeParse` de Zod **antes** de tocar Supabase (falla rápido, sin llamar a la BD).
3. Gate de rol con `assertManager()` — mensaje uniforme `"No tienes permiso para gestionar la carta"`.
4. Escritura acotada por `salon_id` (`.eq("id", id).eq("salon_id", salonId)` en updates/deletes; `salon_id: salonId` en inserts).
5. `revalidatePath("/carta")` tras cada mutación con éxito.
6. Retorno `ActionResult<T> = { ok: true; data: T } | { ok: false; error: string }`.

**Categorías:** `createCategory`, `updateCategory(id, input)`, `deleteCategory(id)`
**Estaciones:** `createStation`, `updateStation(id, input)`, `deleteStation(id)` — misma forma que categoría (tabla `stations`)
**Productos:** `createMenuProduct`, `updateMenuProduct(id, input)`, `deleteMenuProduct(id)`
**Modificadores/combos:**
- `saveModifierGroup(input)` — inserta o actualiza el grupo (`modifier_groups`) y SIEMPRE reemplaza sus `modifiers` (delete + insert, acotado por `salon_id` y `group_id`)
- `setProductModifierGroups(productId, groupIds)` — reemplaza filas de `product_modifier_groups` del producto (delete + insert acotado por `salon_id` y `product_id`)
- `saveCombo(comboProductId, pieces)` — borra e inserta `combo_components` de ese combo (delete + insert acotado por `salon_id` y `combo_product_id`)

## 3. Hooks de mutación añadidos a `use-menu.ts`

Patrón `useCreateProduct` (`use-products.ts`): desempaquetan `ActionResult` (`if (!result.ok) throw new Error(result.error)`) e invalidan `menuKeys.all(salonId)` en `onSuccess` (vía un helper interno `useInvalidateMenu(salonId)`).

- `useCreateCategory`, `useUpdateCategory`, `useDeleteCategory`
- `useCreateStation`, `useUpdateStation` (extra, no pedido explícitamente pero necesario para simetría con `deleteStation`/`createStation` — ver §5), `useDeleteStation`
- `useSaveMenuProduct` (unifica create/update de producto: si el objeto de entrada trae `id`, llama a `updateMenuProduct`; si no, a `createMenuProduct`), `useDeleteMenuProduct`
- `useSaveModifierGroup`, `useSetProductModifierGroups`
- `useSaveCombo`

Todos los del mínimo pedido están presentes: `useCreateCategory`, `useUpdateCategory`, `useDeleteCategory`, `useCreateStation`, `useSaveMenuProduct`, `useDeleteMenuProduct`, `useSaveModifierGroup`, `useSaveCombo`, `useSetProductModifierGroups`.

## 4. Resultado de tests (salida real)

**Paso 1 — extracción del mock, verde antes de tocar nada más:**
```
npm test -- tenant-isolation
 Test Files  1 passed (1)
      Tests  10 passed (10)
```

**Paso 3 — test nuevo, FALLA como se esperaba (actions no existían):**
```
npm test -- restauracion-carta-actions
FAIL  src/tests/integration/restauracion-carta-actions.test.ts
Error: Failed to resolve import "@/app/(dashboard)/carta/actions" ... Does the file exist?
```

**Paso 7 — tras escribir actions.ts + hooks, verde:**
```
npm test -- restauracion-carta-actions tenant-isolation
 Test Files  2 passed (2)
      Tests  13 passed (13)
```

**Typecheck:**
```
npm run typecheck
(exit 0, sin output — limpio)
```
(Hubo un fallo intermedio: `TS2552: Cannot find name 'updateStation'` por un import olvidado en `use-menu.ts`; corregido añadiéndolo a la lista de imports de `@/app/(dashboard)/carta/actions` antes del commit.)

**Suite completa del proyecto (verificación adicional, no pedida explícitamente pero ejecutada por prudencia):**
```
npm test
 Test Files  130 passed (130)
      Tests  1816 passed (1816)
```

## 5. Decisiones de diseño (lo que el brief dejaba abierto)

### `saveModifierGroup` — upsert con `id` opcional en el propio input
El brief da `modifierGroupSchema` **verbatim** sin campo `id`, pero pide UNA sola función `saveModifierGroup(input)` (no un par create/update) que "inserta el grupo y reemplaza sus modifiers". Para que una sola función pueda decidir "es un grupo nuevo" vs "es una actualización" sin un segundo parámetro fuera del spec (`saveModifierGroup(input)`, un solo argumento), añadí un **segundo esquema** `saveModifierGroupSchema` en `validations/menu.ts` — misma forma que `modifierGroupSchema` (que se deja intacta y exportada, verbatim, tal cual pide el brief) más `id: z.string().uuid().nullable().default(null)`.
- `id === null` → `insert` en `modifier_groups`.
- `id` con valor → `update` acotado por `.eq("id", id).eq("salon_id", salonId)`.
- En ambos casos, después: `delete` de `modifiers` del grupo (acotado por `group_id` + `salon_id`) seguido de `insert` de las `modifiers` del payload (si hay alguna) — esto es el "reemplaza sus modifiers" literal del brief, funciona igual para grupo nuevo (delete es no-op) que para grupo existente (reemplazo real).

### `setProductModifierGroups(productId, groupIds)` — validación de la lista de ids
No había esquema Zod dado para esto. Añadí `modifierGroupIdsSchema = z.array(z.string().uuid())` en `validations/menu.ts` para validar `groupIds` antes de tocar la BD, siguiendo el mismo patrón `safeParse` que el resto de actions. Implementación: `delete` de `product_modifier_groups` del producto (acotado por `product_id` + `salon_id`) seguido de `insert` de una fila por cada `groupId` (con `sort_order` = índice en el array), si la lista no está vacía.

### `saveCombo(comboProductId, pieces)` — tipo de `pieces`
Tampoco había esquema para las piezas del combo. Definí `comboPieceSchema` (`componentProductId: uuid`, `qty: int ≥ 1` default `1`, `stationIdOverride: uuid nullable` default `null`) y `comboPiecesSchema = z.array(comboPieceSchema)`, mapeando 1:1 a las columnas de `combo_components` (`component_product_id`, `qty`, `station_id_override`). Reutilicé el nombre `ComboPieceInput` pero es un tipo **distinto** de la interfaz `ComboPiece` que ya existe en `src/lib/restauracion/menu.ts` (esa es para la lógica pura de expansión de combo — `expandCombo` — y trae campos que no existen en la tabla, como `stationId` el de por-defecto del producto). No reutilicé esa interfaz para no mezclar "forma de dominio para cálculo" con "forma de persistencia validada por Zod".

### `useUpdateStation` (hook extra no listado explícitamente)
El brief pide como mínimo `useCreateStation` (sin `useUpdateStation`/`useDeleteStation` explícitos en la lista corta, aunque sí en el `Produces` de las server actions). Añadí `useUpdateStation` y `useDeleteStation` junto a `useCreateStation` por completitud/simetría con categorías (que si tienen los 3 hooks explícitos) — no cuesta nada y evita que la UI de estaciones tenga que llamar a la server action directamente sin pasar por React Query.

### `useSaveMenuProduct` unifica create/update
El "Produces" pide `useSaveMenuProduct` (no `useCreateMenuProduct`/`useUpdateMenuProduct` por separado), así que el hook recibe `{ id?: string; input: MenuProductInput }` y decide internamente `createMenuProduct` vs `updateMenuProduct(id, ...)` según si `id` viene definido.

## 6. Preocupaciones / seguimiento

- **No hay UI para `/carta` todavía** — esta tarea es solo la capa de datos (validaciones + actions + hooks). El directorio `src/app/(dashboard)/carta/` ahora solo contiene `actions.ts`; falta el `page.tsx`/componentes cliente que consuman estos hooks (probablemente otra task del plan).
- **`saveModifierGroup`/`setProductModifierGroups`/`saveCombo` no están cubiertas por el test de integración** — el brief solo pedía tests para `createCategory` (positivo + gate de rol) y `createMenuProduct` (rechazo Zod). Las 3 actions "abiertas" están probadas solo indirectamente por `npm run typecheck` (tipos correctos) y por lectura manual del patrón; no hay test de integración que ejercite el flujo delete+insert de modifiers/combo_components contra el mock. Si se quiere subir la confianza, un siguiente paso natural sería añadir 2-3 casos más a `restauracion-carta-actions.test.ts` cubriendo el reemplazo (p. ej. verificar que `onWrite` ve primero un `delete` y luego un `insert` en `combo_components`).
- **Esquemas Zod adicionales no vinieron "verbatim" del brief** (`saveModifierGroupSchema`, `modifierGroupIdsSchema`, `comboPieceSchema`/`comboPiecesSchema`) — documentados arriba en §5 con la justificación de cada uno; revisar si el diseño de `id` opcional dentro del input de `saveModifierGroup` encaja con lo que espera la UI que se construya después (alternativa: dos funciones separadas `createModifierGroup`/`updateModifierGroup`, más simétrico con categoría/estación/producto pero no era lo que pedía el "Produces").

---

## 7. Ronda de fix — pre-validación de pertenencia al salón (hallazgo Important, no bloqueante)

**STATUS:** COMPLETADO
**Commit:** `10dcf3eea7f353a089e95970b49575b31e17b5ca` — rama `hat3x/HAT3X-038` (repo anidado `clients/projects/salon-os`)
**Mensaje:** `fix(restauracion): pre-validacion de pertenencia al salon en setProductModifierGroups/saveCombo`

### Contexto del hallazgo

El aislamiento multi-tenant real ya estaba garantizado por los FK compuestos `(id, salon_id)` de `product_modifier_groups` y `combo_components` — un insert con un `product_id`/`group_id`/`component_product_id`/`station_id_override` de otro salón ya fallaría en la base. El hallazgo era de **paridad de convención**: el resto del repo (`ajustes/personal/actions.ts`, con `assertLocationInSalon`/`assertServicesInSalon`) siempre hace una comprobación previa en servidor para devolver un mensaje legible en español en vez de dejar que el cliente vea un error crudo de constraint de Postgres. `setProductModifierGroups` y `saveCombo` no tenían esa comprobación previa.

### Qué se hizo

En `src/app/(dashboard)/carta/actions.ts`:

- Añadido `type SupabaseServerClient = ReturnType<typeof createClient>;` (mismo patrón que `ajustes/personal/actions.ts`) para tipar los helpers de guarda.
- **`assertProductAndGroupsInSalon(supabase, salonId, productId, groupIds)`** (usada en `setProductModifierGroups`, justo después de `assertManager()` y antes del delete+insert):
  - `select id from products where id = productId and salon_id = salonId` vía `.maybeSingle()` — si no hay fila, falla.
  - Si `groupIds` no está vacío: `select id from modifier_groups where salon_id = salonId and id in (groupIds)` — si `groups.length !== groupIds.length`, falla.
  - Mensaje único combinado: `"El producto o alguno de los grupos no pertenece a tu salón"` (no se distingue cuál de los dos falló, tal como pidió el coordinador).
- **`assertComboProductsInSalon(supabase, salonId, comboProductId, pieces)`** (usada en `saveCombo`): junta `comboProductId` + todos los `componentProductId` (deduplicados con `Set`) en UNA consulta `select id from products where salon_id = salonId and id in (...)`; si el conteo no cuadra, `"El combo o alguna de sus piezas no pertenece a tu salón"`.
- **`assertComboStationOverridesInSalon(supabase, salonId, pieces)`** (usada en `saveCombo`, tras la anterior): recoge los `stationIdOverride` NO nulos (deduplicados); si la lista está vacía no consulta nada (`return null`); si no, `select id from stations where salon_id = salonId and id in (...)`; si el conteo no cuadra, `"La estación de ruteo de alguna pieza no pertenece a tu salón"`.
- Ambas actions llaman a sus guardas nuevas **después** de `assertManager()` (gate de rol + salón) y **antes** del `delete`+`insert` existente — la parte transaccional (borra e inserta no atómico) queda intacta, tal como se pidió, no se tocó.
- **NO se tocó `saveModifierGroup`** (su hallazgo Minor de esquema queda deferido, tal como se indicó).

### Tests nuevos (en `src/tests/integration/restauracion-carta-actions.test.ts`)

Añadidos dos `describe` nuevos con 3 tests cada uno (reject por entidad que falla + control positivo), usando `makeSupabaseMock` con `tables` configurando qué filas "existen" para simular pertenencia/no pertenencia:

**`setProductModifierGroups — pertenencia al salón`:**
1. `"rechaza si el producto no pertenece al salón"` — mock `products: { data: [] }` → `maybeSingle()` devuelve `null` → `ok:false`.
2. `"rechaza si algún grupo de modificadores no pertenece al salón"` — producto existe, pero `modifier_groups` solo devuelve 1 de los 2 ids pedidos → `ok:false`.
3. `"guarda cuando el producto y los grupos pertenecen al salón (control positivo)"` — ambas consultas cuadran → `ok:true`.

**`saveCombo — pertenencia al salón`:**
1. `"rechaza si alguna pieza del combo no pertenece al salón"` — `products` solo devuelve el combo, no la pieza → `ok:false`.
2. `"rechaza si la estación de ruteo de una pieza no pertenece al salón"` — productos cuadran, `stations: { data: [] }` (no aparece la estación) → `ok:false`.
3. `"guarda el combo cuando piezas y estaciones pertenecen al salón (control positivo)"` — todo cuadra → `ok:true`.

**Salida real:**
```
npm test -- restauracion-carta-actions
 Test Files  1 passed (1)
      Tests  9 passed (9)
```
(3 tests originales + 6 nuevos de pertenencia al salón.)

```
npm test -- restauracion-carta-actions tenant-isolation
 Test Files  2 passed (2)
      Tests  19 passed (19)
```

**Typecheck:**
```
npm run typecheck
(exit 0, sin output — limpio, sin errores nuevos)
```

### Ficheros tocados en esta ronda

Solo los 2 que se pedían (por pathspec, sin `git add -A`, `.claude/` intacto):
- `src/app/(dashboard)/carta/actions.ts` (modificado, +119/-1 según `git show --stat`)
- `src/tests/integration/restauracion-carta-actions.test.ts` (modificado, +94/-1)

No fue necesario tocar `src/lib/validations/menu.ts` — las comprobaciones de pertenencia son consultas directas a Supabase dentro de las actions, no validación de forma/tipo de Zod.
