# Task 4 — Report: server actions createOrder / addOrderItems / voidOrderItem

## STATUS: DONE

- Commit: `e263ac188143b4e04f6a01c9b8d073229c79c175` (repo anidado `clients/projects/salon-os`, rama `hat3x/HAT3X-038`)
- Tests: `npm test -- restauracion-order-actions` → **3 passed (3)**. Full suite (`npm test`, sin filtro): **136 test files / 1842 tests passed**, sin regresiones.
- Typecheck: `npm run typecheck` → **exit 0**, sin salida (limpio).

## Archivos

- Creado: `src/lib/validations/order.ts`
- Creado: `src/app/(dashboard)/mostrador/actions.ts`
- Modificado: `src/hooks/use-orders.ts` (+ mutaciones)
- Creado: `src/tests/integration/restauracion-order-actions.test.ts`

Commit por pathspec exacto (4 archivos, `.claude/` quedó untracked, sin `git add -A`):
```
git add src/lib/validations/order.ts \
        "src/app/(dashboard)/mostrador/actions.ts" \
        src/hooks/use-orders.ts \
        src/tests/integration/restauracion-order-actions.test.ts
git commit -m "feat(restauracion): actions de pedido (crear/añadir/anular, append-only + idempotencia)"
```

## Validaciones (`src/lib/validations/order.ts`)

Transcritas **verbatim** del brief: `orderItemDraftSchema`, `createOrderSchema`, `addOrderItemsSchema`, `voidOrderItemSchema`, con sus tipos `z.infer` exportados (`OrderItemDraftInput`, `CreateOrderInput`, `AddOrderItemsInput`, `VoidOrderItemInput` — estos últimos tres se usan luego en los hooks para tipar el `mutationFn`).

## Las 3 actions (`src/app/(dashboard)/mostrador/actions.ts`, `"use server"`)

Patrón de guarda: solo `getActiveSalonId()` (sin gate de rol tipo `assertManager`, a diferencia de `carta/actions.ts`) — es flujo operativo del día a día (tomar/editar pedidos), no configuración de carta.

### `createOrder(input: unknown): Promise<ActionResult<Order>>`
VERBATIM del brief: `safeParse` → `getActiveSalonId` → si `idempotencyKey !== null`, busca fila existente por `salon_id + idempotency_key` (`maybeSingle`); si existe, la devuelve tal cual **sin** insertar ni actualizar. Si no, inserta con el `id` que trae el cliente (offline-ready, la tabla `orders` no tiene default de `id`), `channel: "mostrador"`, `status: "abierta"`. `revalidatePath("/mostrador")` tras el insert (no tras el camino idempotente — no hubo escritura).

### `addOrderItems(input: unknown): Promise<ActionResult<{ added: number }>>`
`safeParse` → `getActiveSalonId` → verifica pertenencia: `select("id,status").eq("id", orderId).eq("salon_id", salonId).maybeSingle()`; si `order === null` **o** `order.status !== "abierta"` → `{ ok: false, error: "El pedido no existe, no pertenece a tu salón o no está abierto" }` (un solo mensaje combinado, no se distingue el motivo — mismo patrón que `carta/actions.ts`). Si pasa, mapea `items` (ya validados por `orderItemDraftSchema`) a `OrderItemInsert[]` (alias existente de `TablesInsert<"order_items">` en `types/database.ts`) con `salon_id`, `order_id`, ids de cliente (`item.id`), `modifiers_snapshot: item.modifiersSnapshot`, `station_id`, `combo_group`, `qty`, `unit_price_cents`, `vat_rate`, `status: "pendiente"`. Inserta el lote en **una sola llamada** (`insert(rows)`, no un `insert` por línea) — todas las líneas o ninguna. `revalidatePath` + `{ added: rows.length }`.

### `voidOrderItem(input: unknown): Promise<ActionResult<OrderItem>>`
`safeParse` → `getActiveSalonId` → **lee** el ítem original acotado a la vez por `id`, `order_id` **y** `salon_id` (`.eq("id", itemId).eq("order_id", orderId).eq("salon_id", salonId).maybeSingle()`) — esto es la "verificación de pertenencia": el ítem debe estar en ESE pedido y ESE salón, no solo en el salón. Si no aparece → error amable, sin tocar la base. Si aparece, **inserta** una fila nueva (nunca `update`/`delete` sobre la original):
- `id: randomUUID()` (server-side, `node:crypto`) — a diferencia de `createOrder`/`addOrderItems`, esta fila la genera el servidor, no el cliente (no es una acción offline-first).
- `void_of_item_id: itemId`, `status: "anulado"`, `void_reason: reason`.
- Copiados del original: `salon_id`, `order_id`, `product_id`, `qty`, `unit_price_cents`, `vat_rate`, `station_id` — exactamente la lista que da el brief.

**Decisión de diseño (no en el brief, tomada por mí):** `combo_group` y `modifiers_snapshot` del original **NO** se copian a la fila de anulación. Razonamiento: el brief enumera explícitamente los 7 campos a copiar y esos dos quedan fuera; además la fila de anulación es un registro de auditoría de cantidad/importe (para que ticket/cocina reflejen la baja), no una réplica visual — el modificador/combo ya está registrado en la línea original, que sigue existiendo intacta (append-only). Si en una futura task se necesita que la UI de cocina muestre "qué se anuló" con el detalle de modificadores, se puede añadir sin romper compatibilidad (columna opcional).

## Hooks de mutación (`src/hooks/use-orders.ts`)

Añadido (sin tocar los dos hooks de lectura existentes `useOpenOrders`/`useOrderItems`):
- `useInvalidateOrders(salonId)` — helper interno, invalida `orderKeys.all(salonId)` (mismo patrón que `useInvalidateMenu` en `use-menu.ts`).
- `useCreateOrder(salonId)`, `useAddOrderItems(salonId)`, `useVoidOrderItem(salonId)` — cada uno con `mutationFn` que desempaqueta `ActionResult<T>` (`if (!result.ok) throw new Error(result.error)`) e invalida en `onSuccess`. Tipados con los `*Input` inferidos de `lib/validations/order.ts`.

## Conflicto encontrado en el brief y cómo se resolvió

El test de integración del brief (Step 1) usa ids no-UUID como fixtures (`"O1"`, `"O2"`, `"OX"`, `"i1"`, `"p1"`), pero el schema del Step 3 (transcrito verbatim, como pedía la tarea) exige `z.string().uuid()` en `createOrderSchema.id`, `addOrderItemsSchema.orderId` y `orderItemDraftSchema.id/productId`. Con el schema verbatim, los dos tests de `createOrder` fallaban de verdad (`safeParse` rechaza `"O1"` como uuid inválido antes de llegar a la lógica), y el test de `addOrderItems` "rechaza pedido inexistente" pasaba **por la razón equivocada** (rechazo de schema, no la comprobación de pertenencia al salón que el nombre del test dice cubrir).

Como mi instrucción decía "actions VERBATIM del brief" pero para el test solo "estructura en el brief" (no verbatim), y el resultado final exigía `npm test` en verde, sustituí los ids placeholder por UUIDs v4 válidos (`ORDER_ID_1`, `ORDER_ID_2`, `ORDER_ID_X`, `ITEM_ID_1`, `PRODUCT_ID_1`), manteniendo intacta la estructura, los tres `it(...)`, las aserciones y los mocks (`salon_id: "SALON"` e `idempotencyKey: "k1"` no llevan `.uuid()` en el schema, así que esos sí quedaron literales). Con el cambio, el test de `addOrderItems` ahora sí ejercita el camino real (`order === null` tras `safeParse` exitoso), no un atajo de validación.

## Salida de tests

```
$ npm test -- restauracion-order-actions
 Test Files  1 passed (1)
      Tests  3 passed (3)

$ npm test   (suite completa, sin filtro)
 Test Files  136 passed (136)
      Tests  1842 passed (1842)

$ npm run typecheck
> tsc --noEmit
(sin salida, exit 0)
```

## Preocupaciones / pendientes para tasks siguientes

1. **No hay página `/mostrador` todavía** — `src/app/(dashboard)/mostrador/` solo contiene `actions.ts` (no existía el directorio antes de esta task). El `revalidatePath("/mostrador")` en las 3 actions es correcto de cara al futuro pero no tiene efecto observable hasta que exista `page.tsx`.
2. ~~`voidOrderItem` no valida el estado del pedido~~ — **resuelto en la ronda de fix** (ver más abajo).
3. **Ids UUID de los fixtures del test** — documentado arriba como decisión, no oculto: si otro agente reutiliza este test como plantilla, los ids ya son válidos por diseño (no placeholders).

---

## Ronda de fix (post-review del coordinador): gate de anulación por estado + idempotencia robusta

**STATUS: DONE**

- Commit: `69a89b87fed863c7c9753b3250e538c77ac16076` (repo anidado `clients/projects/salon-os`, rama `hat3x/HAT3X-038`)
- Tests: `npm test -- restauracion-order-actions` → **7 passed (7)** (3 de la entrega inicial + 4 nuevos). Full suite (`npm test`, sin filtro): **136 test files / 1846 tests passed**, sin regresiones.
- Typecheck: `npm run typecheck` → **exit 0**, sin salida.
- Archivos tocados (pathspec exacto, `.claude/` intacto, sin `git add -A`): `src/app/(dashboard)/mostrador/actions.ts`, `src/tests/integration/restauracion-order-actions.test.ts`. `src/lib/validations/order.ts` **no** se tocó (ninguno de los 3 fixes requería cambiar los schemas Zod).

### 1. (Important) `voidOrderItem` gatea por estado del pedido

Extraje la comprobación de pertenencia+estado que ya tenía `addOrderItems` a un helper compartido `assertOrderOpenInSalon(supabase, salonId, orderId)` (mismo `select("id,status").eq("id", orderId).eq("salon_id", salonId).maybeSingle()`, mismo mensaje de error `"El pedido no existe, no pertenece a tu salón o no está abierto"`) y lo llamo desde `voidOrderItem` **antes** de leer el ítem original. Así una línea de un pedido `cobrada`/`cerrada`/`anulada` (o de otro salón) no se puede anular — el `insert` de la fila de anulación ni se intenta.

Reutilizar el helper en vez de duplicar la consulta también reduce a un único punto de mantenimiento el criterio de "qué es un pedido operable" para ambas actions.

### 2. (Minor) `createOrder` — idempotencia robusta ante condición de carrera

El select-previo (`existing`) seguía como fast-path (evita un insert+rollback en el caso común), pero ya no es la única defensa. Si el `insert` devuelve `error.code === "23505"` (violación del índice único `orders_idempotency_key`) **y** había `idempotencyKey`, se relee la fila por `(salon_id, idempotency_key)` y, si aparece, se devuelve como `{ ok: true, data: existing }` — el request que "perdió" la carrera adopta el pedido que ya insertó el ganador, en vez de propagar el error crudo de Postgres al cliente.

**Test del caso de carrera:** el mock compartido `supabase-mock.ts` (Plan A, fuera del pathspec de esta task — no lo toqué) lee `tables.orders.data` en vivo en cada `select` no soy pending, no una foto fija tomada al crear el mock. Aproveché eso: el test arranca con `tables.orders.data = []` (así el fast-path no ve nada y el código sí llega al `insert`) y el propio `onWrite` del insert, además de devolver `{ error: { code: "23505", ... } }`, **empuja** la fila "ganadora" a ese mismo array antes de devolver el error — simulando que el otro request terminó su insert justo en medio. El re-fetch posterior (que lee el array ya mutado) la encuentra. Esto ejercita de verdad la rama nueva del código, no solo el fast-path (que ya estaba cubierto por el test previo "createOrder es idempotente por idempotencyKey").

### 3. (Minor) No anular una anulación

Tras leer el ítem original en `voidOrderItem`, si `original.status === "anulado"` **o** `original.void_of_item_id !== null`, se rechaza con `{ ok: false, error: "Esta línea ya está anulada" }` antes de insertar nada. La comprobación doble (`status` Y `void_of_item_id`) es defensiva: en el diseño actual toda fila de anulación tiene `status: "anulado"` Y `void_of_item_id` no nulo simultáneamente, pero comprobar ambas evita depender de que esa invariante se mantenga si el modelo evoluciona.

### Tests añadidos (4)

1. `createOrder resuelve la fila existente si el insert choca por idempotencyKey (23505)` — cubre el fix #2, con el truco de mutación descrito arriba.
2. `voidOrderItem rechaza si el pedido no está abierta` — cubre el fix #1 (mock: `orders` con `status: "cobrada"`).
3. `voidOrderItem inserta fila de anulación cuando el pedido está abierta` — **happy path que no existía** en la entrega inicial (la Task 4 original solo tenía tests de `createOrder`/`addOrderItems`, ninguno de `voidOrderItem`). Verifica `r.data.status === "anulado"` y `r.data.void_of_item_id === ITEM_ID_1`.
4. `voidOrderItem rechaza anular una línea que ya está anulada` — cubre el fix #3 (no pedido explícitamente en la lista mínima del coordinador, mock: ítem original con `status: "anulado"`); lo añadí porque es barato y valida directamente la tercera garantía pedida.

### Salida de tests (ronda de fix)

```
$ npm test -- restauracion-order-actions
 Test Files  1 passed (1)
      Tests  7 passed (7)

$ npm test   (suite completa, sin filtro)
 Test Files  136 passed (136)
      Tests  1846 passed (1846)

$ npm run typecheck
> tsc --noEmit
(sin salida, exit 0)
```

---

## Segunda ronda de fix: marcar el ORIGINAL como anulado (excluir del cobro)

**STATUS: DONE**

- Commit: `31cee5bdca80a00f0c9a2056e17631972605ae54` (repo anidado `clients/projects/salon-os`, rama `hat3x/HAT3X-038`)
- Tests: `npm test -- restauracion-order-actions` → **7 passed (7)** (mismo recuento que la ronda anterior — se AJUSTÓ el test de happy-path existente en vez de añadir uno nuevo, tal como pedía el coordinador). Full suite: **136 test files / 1846 tests passed**, sin regresiones.
- Typecheck: `npm run typecheck` → **exit 0**.
- Archivos tocados (pathspec exacto, `.claude/` intacto, sin `git add -A`): `src/app/(dashboard)/mostrador/actions.ts`, `src/tests/integration/restauracion-order-actions.test.ts`.

### Hallazgo (correctitud cruzada con la futura `settleOrder`)

`settleOrder` (task futura) cargará las líneas a cobrar filtrando `status != 'anulado'` (y `void_of_item_id is null`). Antes de este fix, `voidOrderItem` insertaba la fila de auditoría (`void_of_item_id`, `status:"anulado"`) pero **nunca tocaba la línea ORIGINAL** — esta seguía con su `status` previo (`pendiente`/`enviado`/`preparando`/`listo`/`entregado`). Resultado: una línea "anulada" desde el punto de vista del histórico se habría cobrado igual, porque `settleOrder` no tenía forma de distinguirla de una línea viva (el filtro `void_of_item_id is null` solo excluye la fila de auditoría, no el original).

### Cambio

Dentro de `voidOrderItem`, tras la guarda "no anular una anulación" y ANTES del `insert` de la fila de auditoría, se añadió:

```ts
const { error: updateError } = await supabase
  .from("order_items")
  .update({ status: "anulado", void_reason: parsed.data.reason })
  .eq("id", parsed.data.itemId).eq("salon_id", salonId);
if (updateError !== null) return { ok: false, error: updateError.message };
```

Ahora la action hace **dos escrituras**: (1) `UPDATE` del original (lo excluye del cobro futuro) y (2) `INSERT` de la fila de auditoría append-only (el registro histórico de que hubo una anulación, quién y por qué). Ninguna sustituye a la otra — el original nunca se borra (`DELETE` sigue prohibido) ni pierde sus demás campos (`product_id`, `qty`, `unit_price_cents`, etc. quedan intactos, solo cambian `status` y `void_reason`).

### Decisión de diseño: orden UPDATE → INSERT (no al revés)

El coordinador permitía cualquiera de los dos órdenes ("tras insertar... o justo antes"). Elegí **UPDATE primero, INSERT después**, razonamiento: sin una transacción explícita entre ambas escrituras (Supabase-js sin RPC no da atomicidad multi-statement gratis), si UNA de las dos fallara tras la otra haber tenido éxito, quería que el fallo "menos malo" fuera la falta del registro de auditoría, no la falta de la exclusión del cobro:
- Si el `UPDATE` falla → se aborta ANTES del `INSERT`: no queda una fila de auditoría "huérfana" documentando una anulación que en realidad no cambió el estado del original.
- Si el `UPDATE` tiene éxito pero el `INSERT` falla después → el original YA quedó `anulado` (la garantía financiera que importa — no se cobra — ya se cumple) aunque falte el detalle de auditoría de esa anulación concreta. Además el propio original ya lleva `void_reason` (seteado por el `UPDATE`), así que no se pierde el motivo, solo el `id` correlativo de auditoría con `void_of_item_id`.

### Efecto colateral confirmado: bloquea el doble-void

Como el `UPDATE` marca el original con `status: "anulado"`, la guarda que ya existía de la ronda anterior (`if (original.status === "anulado" || original.void_of_item_id !== null) return { ok:false, ... }`) ahora se dispara de verdad en un segundo intento sobre el MISMO ítem original: la segunda llamada lee el original (ya actualizado por la primera) y lo rechaza antes de llegar al `UPDATE`/`INSERT`. Confirmado que ese guard sigue posicionado ANTES de las dos escrituras (no se movió).

### Test ajustado (no se añadió uno nuevo — se reforzó el happy-path existente)

`voidOrderItem marca el original como anulado (UPDATE) e inserta la fila de anulación (INSERT)` — sustituye al test de happy-path de la ronda anterior. Cambios sobre la versión previa:
- `onWrite` pasa a ser un `vi.fn(...)` (antes una función inline) para poder aserir sobre las llamadas, no solo sobre su valor de retorno.
- Maneja explícitamente `op === "update" && table === "order_items"` (antes solo manejaba el `insert`).
- Dos aserciones nuevas al final:
  - `expect(onWrite).toHaveBeenCalledWith("update", "order_items", { status: "anulado", void_reason: "pedido equivocado" })` — confirma que el UPDATE del original se emitió con el payload exacto (sin campos de más — el payload del mock es literalmente el objeto pasado a `.update(...)`, no incluye los `.eq(...)` que son filtros, no payload).
  - `expect(onWrite).toHaveBeenCalledWith("insert", "order_items", expect.objectContaining({ void_of_item_id: ITEM_ID_1 }))` — confirma que la fila de auditoría se sigue insertando.
- Las aserciones sobre `r.ok`/`r.data.status`/`r.data.void_of_item_id` (sobre la fila DEVUELTA, que es la de auditoría) se mantienen igual que antes.

El test de "rechaza anular una línea que ya está anulada" (de la ronda anterior) no necesitó cambios — sigue verde tal cual, y ahora también cubre indirectamente el caso de doble-void real (mismo camino de código).

### Salida de tests (segunda ronda de fix)

```
$ npm test -- restauracion-order-actions
 Test Files  1 passed (1)
      Tests  7 passed (7)

$ npm test   (suite completa, sin filtro)
 Test Files  136 passed (136)
      Tests  1846 passed (1846)

$ npm run typecheck
> tsc --noEmit
(sin salida, exit 0)
```

### Nota para la task de `settleOrder`

Con este fix, el filtro que debe usar `settleOrder` para excluir líneas anuladas puede simplificarse a `status != 'anulado'` solamente (no hace falta comprobar también `void_of_item_id is null`, aunque hacerlo no duele): tanto el original (ahora `status: 'anulado'` vía UPDATE) como la fila de auditoría (`status: 'anulado'` desde su creación) quedan excluidos por ese único filtro.
