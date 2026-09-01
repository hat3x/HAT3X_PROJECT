# Task 6 — Informe de implementación

## Status: COMPLETADO

Commit: `6f460c6` (rama `hat3x/HAT3X-038`, repo anidado `clients/projects/salon-os`)

```
feat(restauracion): settleOrder — materializa pos_sale desde el pedido (patrón createSale)
 src/app/(dashboard)/mostrador/actions.ts             | 213 ++++++++++++++++++-
 src/hooks/use-orders.ts                              |  20 +-
 src/lib/validations/order.ts                         |  33 +++
 src/tests/helpers/supabase-mock.ts                   |  33 ++-
 src/tests/integration/restauracion-settle.test.ts    |  65 ++++++
 5 files changed, 382 insertions(+), 2 deletions(-)
```

`git status --short` tras el commit: solo `?? .claude/` (untracked, intacto, no tocado).

## Qué se implementó

### 1. Esquema Zod — `src/lib/validations/order.ts`

- `settleTenderSchema`: `{ method: paymentMethodEnum, amountCents: z.number().int().min(0), paymentMethodId: z.string().uuid().nullable(), reference: z.string().trim().max(120).optional() }`.
  - `method` **reutiliza** `paymentMethodEnum` de `@/lib/validations/sale` (mismo enum `pos_payment_method` del TPV) en vez de duplicarlo — es el mismo catálogo de la BD.
  - A diferencia de `tenderSchema` (TPV, `amount` como texto en euros desde un `<input>`), aquí `amountCents` ya llega como entero: el importe lo resuelve el propio flujo de cobro de mostrador, no lo teclea línea a línea el cajero.
- `settleOrderSchema`: `{ orderId: z.string().uuid(), tenders: z.array(settleTenderSchema).min(1), sendPending: z.boolean() }`.

### 2. Server action — `src/app/(dashboard)/mostrador/actions.ts`

**`settleOrder(input): Promise<ActionResult<{ saleId: string; totalCents: number }>>`**, en el orden exacto del brief:

1. `getActiveSalonId()` + `supabase.auth.getUser()` (para `sold_by`), igual que `createSale`.
2. Carga el pedido acotado por salón (`orders.select("id,status").eq("id",orderId).eq("salon_id",salonId).maybeSingle()`); `order === null` → error.
3. **Idempotencia** (ver sección dedicada abajo).
4. Carga `order_items` no anulados: `.eq("order_id",orderId).eq("salon_id",salonId).is("void_of_item_id",null).neq("status","anulado")`, con `.select("*, products(name)")`.
5. `buildSettleLines` (mapea `productName: it.products?.name ?? "Producto"`, `qty`, `unitPriceCents`, `vatRate`, `modifiersSnapshot`) + `settleTotals` — misma fuente única de verdad (`@/lib/payments`) que usa el TPV.
6. Busca `pos_session` abierta: mismo patrón exacto que `createSale` (`.eq("salon_id",salonId).eq("status","open").limit(1).maybeSingle()`); `sessionId = data?.id ?? null`.
7. Inserta `pos_sales` (`status:"completed"`, `order_id`, `session_id`, totales de `settleTotals`, `discount_cents:0`, `currency:"EUR"`, `sold_by:user.id`) → `.select("id").single()`.
8. Inserta `pos_sale_lines`, 1:1 con `buildSettleLines` (mismo orden, así `items[i]` da el `product_id` de esa línea) — `line_total_cents` vía `computeLineTotals(...).grossCents`, NO copiado de `settleTotals` (cada línea recalcula el suyo, igual que `createSale`). Si falla → `rollback()` (borra `pos_sales`, cascada arrastra líneas/pagos) → error.
9. Inserta `pos_payments` directo desde `tenders` (`{ salon_id, sale_id, session_id, method, payment_method_id: paymentMethodId, amount_cents: amountCents, reference }`). Si falla → `rollback()` → error.
10. `UPDATE orders SET status='cobrada'` acotado por `id`+`salon_id`.
11. Si `sendPending`: `UPDATE order_items SET status='enviado' WHERE salon_id=... AND order_id=... AND status='pendiente'` (mismo UPDATE que `sendOrderToStations`, inline, sin gate de error — ver "Decisiones" abajo).
12. `revalidatePath("/mostrador")`; devuelve `{ saleId, totalCents: totals.totalCents }`.

### 3. Hook — `src/hooks/use-orders.ts`

- `useSettleOrder(salonId)`: mismo patrón que el resto (`useMutation` que desempaqueta `ActionResult`, invalida `orderKeys.all(salonId)` en `onSuccess`).

### 4. Extensión de infraestructura de test — `src/tests/helpers/supabase-mock.ts`

El test dado en el brief (Step 1) usa `makeSupabaseMock` **tal cual**, sin configurar `auth`, y la action necesita `.is()`/`.neq()` en la cadena de filtros de `order_items` y `supabase.auth.getUser()` para `sold_by`. El mock compartido no soportaba ninguna de las dos cosas (confirmado con `Grep`: cero usos previos de `.is(`/`.neq(`/`.auth` sobre este mock en los 4 consumidores existentes). Se añadió, de forma puramente aditiva:
- `is: () => b` y `neq: () => b` — no-ops encadenables, mismo criterio que `eq`/`in`/`order`/`limit` ya existentes (el mock nunca filtra de verdad; `tables[table].data` ya llega preparado por el test).
- `auth.getUser()` en el objeto devuelto, con un usuario fijo por defecto (`{ id: "mock-user" }`), overridable vía el nuevo campo opcional `MockConfig.auth`.

Pasé el Fact-Forcing Gate para esta edición (listado de los 4 consumidores existentes vía `Grep`, confirmación de que ninguno usa esos métodos hoy).

### 5. Test — `src/tests/integration/restauracion-settle.test.ts`

Estructura y aserciones **exactas** del brief. Único cambio: `orderId: "O1"` → un uuid real (`settleOrderSchema.orderId` exige `.uuid()`, y "O1" no lo es — mismo motivo y mismo precedente que Task 5/Task 4, documentado en un comentario en el test). `product_id: "p1"` y `id: "i1"` del `order_item` de fixture se dejan tal cual: son datos de fila cruda leídos de Supabase, no pasan por ningún `safeParse`.

## Idempotencia

Comprueba, en este orden:
1. **Fuente autoritativa**: `pos_sales.select("id,total_cents").eq("order_id",orderId).eq("salon_id",salonId).maybeSingle()`. Si existe → `{ ok:true, data:{ saleId: existing.id, totalCents: existing.total_cents } }`, **sin volver a cobrar**.
2. Si no hay venta pero `order.status === "cobrada"` → error explícito ("pedido cobrado sin venta asociada") en vez de cobrar a ciegas una segunda vez — es un estado inconsistente que no debería darse en operación normal (p. ej. un fallo justo entre el `UPDATE orders` del paso 10 y una relectura), y prefiero superficiarlo a arriesgar una venta duplicada.

El test cubre el camino feliz (primera llamada, sin venta previa); la rama idempotente no tiene un test dedicado en esta tarea (no estaba en el Step 1 del brief) — queda como hueco de cobertura si se quiere blindar explícitamente.

## Réplica del rollback de `createSale`

Mismo patrón exacto: tras insertar la cabecera `pos_sales`, una función anidada `rollback()` borra esa fila por `id`+`salon_id` (el `on delete cascade` de las FKs arrastra `pos_sale_lines`/`pos_payments`). Se invoca si falla el insert de líneas o el de pagos. Diferencia notable frente a `createSale`: `settleOrder` **no pasa por `getPaymentGateway`/`assertTendersCoverTotal`** — inserta los `tenders` validados por Zod directo en `pos_payments`. Esto es fiel al brief (que no lista la pasarela entre las dependencias de `settleOrder`), pero significa que **no hay guardia server-side que compruebe que `Σ tenders === totalCents`** antes de cobrar — ver "Preocupaciones" abajo.

Nota de TypeScript (mismo patrón que `createSale`): dentro de la función anidada `rollback()`, `salonId!` lleva `!` — pese a la comprobación de null unas líneas antes, TS no propaga la narrowing de un `const` a una `function` declaration anidada (sí la propaga a arrow functions usadas inline, como en `.map()`); confirmado empíricamente porque `createSale` ya usa `salonId!` exactamente ahí.

## Ciclo TDD seguido

1. Creé el test del brief → `npm test -- restauracion-settle` → **FAIL** (`TypeError: settleOrder is not a function`), confirmado antes de tocar `actions.ts`.
2. Implementé schema + action + hook + extensión del mock compartido.
3. `npm test -- restauracion-settle` → falló con `Invalid uuid` (el `orderId:"O1"` del brief no pasa `.uuid()`) → sustituí por un uuid real (mismo criterio que Task 4/5) → **PASS**.
4. `npm test` (suite completa) → **138/138 archivos, 1851/1851 tests PASS**.
5. `npm run typecheck` → **exit 0**, sin salida.
6. Commit por pathspec exacto: los 4 ficheros del brief + `supabase-mock.ts` (necesario, ver arriba), sin `-A`. `.claude/` queda untracked, intacto.

## Resumen de tests

| Comando | Resultado |
|---|---|
| `npm test -- restauracion-settle` | 1 passed (1) |
| `npm run typecheck` | exit 0, sin salida |
| `npm test` (suite completa) | 138 files / 1851 tests passed |

## Preocupaciones / notas

- ~~**Sin validación server-side de cobertura del cobro**~~ — **RESUELTO en la ronda de fix** (Critical #1, ver sección abajo): `settleOrder` ahora exige `Σ tenders === totalCents` EXACTO, fail-fast, antes de escribir nada.
- ~~**Paso 10 (`orders.status='cobrada'`) NO hace rollback si falla.**~~ — **RESUELTO en la ronda de fix** (Minor #4, ver sección abajo): ahora SÍ revierte la venta si este UPDATE falla.
- **Paso 11 (`sendPending`) es best-effort**: no comprueba el `error` del UPDATE ni bloquea la respuesta si falla — el cobro ya está cerrado, mandar las líneas pendientes a cocina/barra es un efecto secundario adjunto, no una condición del cobro. Sigue así tras la ronda de fix (no estaba en el alcance pedido).
- **`npm run lint`** no se ejecutó como gate: `next lint` entra en un prompt interactivo de configuración (mismo problema ya documentado en el informe de Task 5, no introducido por esta tarea, y no estaba en la lista de gates del brief).
- La rama idempotente por **fast-path** (`pos_sales` ya existe / `order.status==='cobrada'` sin venta) sigue sin test dedicado — ver sección "Idempotencia" arriba. La rama de **backstop** (23505/carrera) SÍ quedó cubierta en la ronda de fix.
- Sin bloqueos. Todo verde.

---

## Ronda de fix (Critical + Important + Minor)

Commit: `fc40223` (rama `hat3x/HAT3X-038`, repo anidado `clients/projects/salon-os`)

```
fix(restauracion): cobertura de pagos + idempotencia de cobro con respaldo en BD
 src/app/(dashboard)/mostrador/actions.ts                       | 121 +++++++++++++--
 src/lib/validations/order.ts                                   |   3 +-
 src/tests/integration/restauracion-settle.test.ts               |  86 +++++++++--
 src/tests/unit/pos-sales-order-unique-sql.test.ts (nuevo)       |  21 +++
 supabase/migrations/20260810110000_pos_sales_order_id_unique.sql (nuevo) | 5 +
 5 files changed, 208 insertions(+), 40 deletions(-)
```

`git status --short` tras el commit: solo `?? .claude/` (untracked, intacto, no tocado).

### 1. (Critical) Cobertura de pagos

En `settleOrder`, justo después de `const totals = settleTotals(lines)` y antes de tocar la BD (ni siquiera se llega a mirar la caja abierta):

```ts
if (sumTenders(tenders) !== totals.totalCents) {
  return { ok: false, error: "Los pagos no cubren el total del pedido" };
}
```

Reutiliza `sumTenders` de `@/lib/payments` (la misma que usa `assertTendersCoverTotal` en `gateway.ts` para sumar) en vez de sumar a mano; replica la semántica EXACTA de `createSale` (Σ tenders === totalCents, ni de menos ni de más), pero devuelve el mensaje literal pedido en vez de reusar `assertTendersCoverTotal`/`PaymentValidationError` directamente — esa función lanza con un mensaje distinto y forma parte de la pasarela (`getPaymentGateway`), que `settleOrder` deliberadamente no usa (ver informe original). Fail-fast real: en ese punto no se ha escrito nada, así que no hace falta `rollback()`.

También en `src/lib/validations/order.ts`: `settleTenderSchema.amountCents` pasó de `.int().min(0)` a `.int().positive()` — un tender de 0 céntimos no es un medio de pago real.

### 2. (Important) Backstop de idempotencia en BD + catch 23505

**a. Migración** `supabase/migrations/20260810110000_pos_sales_order_id_unique.sql` (verbatim de la instrucción):
```sql
-- Kairos — Restauración · Backstop de idempotencia: una sola venta por pedido.
begin;
create unique index if not exists pos_sales_order_id_unique
  on public.pos_sales (order_id) where order_id is not null;
commit;
```
Aplicada vía Management API (mismo recipe que Task 1: `POST https://api.supabase.com/v1/projects/jztoyekixcziaicrnlce/database/query`, token `SUPABASE_API_TOKEN` de `clients/projects/denueveanueve/.env`, User-Agent de navegador) → **`(201, [])`**. Verificado en BD real con `select indexdef from pg_indexes where indexname='pos_sales_order_id_unique'` → `CREATE UNIQUE INDEX pos_sales_order_id_unique ON public.pos_sales USING btree (order_id) WHERE (order_id IS NOT NULL)`.

Test sql-coherence `src/tests/unit/pos-sales-order-unique-sql.test.ts`: lee el `.sql` con `readFileSync` y afirma que contiene `create unique index`, `pos_sales_order_id_unique` y `where order_id is not null` (mismo patrón que `restauracion-orders-sql.test.ts` de Task 1).

**b. Catch de `23505`** al insertar `pos_sales`: si `saleError.code === "23505"`, se relee `pos_sales` por `order_id`+`salon_id` (la fuente autoritativa) y, si se encuentra, se devuelve `{ ok:true, data:{ saleId, totalCents } }` de esa venta — es la venta del OTRO request, que ganó la carrera; NO se propaga el error ni se intenta crear una segunda venta. Si por lo que sea la relectura tampoco encuentra nada (caso degenerado), cae al `return { ok:false, error: saleError.message }` de siempre. El fast-path del paso 2 (comprobación previa por `order_id`) se mantiene intacto — este catch es el backstop para cuando DOS requests pasan ambos el fast-path antes de que ninguno haya insertado (condición de carrera genuina), no un reemplazo de él.

### 3. (Minor) Gate por estado del pedido

Tras la comprobación de idempotencia (que ya cubre `order.status === "cobrada"` con su propio mensaje), se añadió:
```ts
if (order.status !== "abierta") {
  return { ok: false, error: "El pedido no está abierto" };
}
```
Bloquea cobrar un pedido `"cerrada"`/`"anulada"`. No tiene test dedicado en esta ronda (no estaba en la lista de tests pedida) — el `order.status` de los fixtures existentes siempre es `"abierta"`.

### 4. (Minor) Rollback si falla el UPDATE final de `orders.status`

Si `UPDATE orders SET status='cobrada'` falla, ahora se llama a `rollback()` (borra el `pos_sale`, cascada arrastra líneas/pagos) antes de devolver el error — invierte la decisión documentada en el informe original (que explícitamente NO revertía ahí). Motivo del cambio: dejar una venta cobrada con el pedido todavía `"abierta"` es más peligroso que revertir — la UI seguiría ofreciendo cobrar el pedido, y un reintento completo (que esta vez SÍ vería la venta por el fast-path del paso 2, o por el backstop de `23505` si hay carrera) dejaría el pedido eternamente `"abierta"` con una venta ya cobrada colgando. Revertir y que el cajero reintente entero es más seguro. No tiene test dedicado (no estaba en la lista de tests pedida).

### Tests añadidos en `restauracion-settle.test.ts`

1. **Happy-path** (ya existía): sin cambios funcionales; se confirmó que sus tenders siguen sumando EXACTO el total (1760c) tras el fix Critical.
2. **(Critical) rechaza cobro insuficiente**: tenders = 1000c contra un total de 1760c → `ok:false`, mensaje `"Los pagos no cubren el total del pedido"`, y se instrumentó `onWrite` para afirmar que el INSERT de `pos_sales` NUNCA se llamó (fail-fast real, no solo el mensaje de error).
3. **(Important) backstop 23505**: la parte más delicada de reproducir con el mock estático (`makeSupabaseMock` no filtra de verdad, `tables[table].data` es fijo por test) — si `pos_sales.data` ya contuviera la venta desde el principio, el FAST-PATH del paso 2 la encontraría y el test nunca llegaría a ejercitar el catch de `23505`. Solución: `tables.pos_sales` se define como un **getter** (`get pos_sales() { return { data: posSalesData } }`) sobre una variable `let posSalesData` que empieza vacía; el `onWrite` del INSERT de `pos_sales` "aterriza" la fila ganadora de la carrera (`posSalesData = [...]`) en el mismo instante en que devuelve el error `23505` — así el fast-path (antes) ve `[]` y la relectura post-`23505` (después) ve la fila. No requirió tocar `supabase-mock.ts` de nuevo: la mutabilidad vía closure + getter ya la permite el helper compartido tal cual.

### Resultado de aplicar la migración

Management API `POST /v1/projects/jztoyekixcziaicrnlce/database/query` → **`(201, [])`**. Verificación post-aplicación: `pos_sales_order_id_unique` existe en `pg_indexes` con la definición exacta esperada (`UNIQUE INDEX ... USING btree (order_id) WHERE (order_id IS NOT NULL)`).

### Ciclo TDD / verificación

1. `npm test -- restauracion-settle pos-sales-order-unique-sql` → **4/4 tests PASS** (2 archivos).
2. `npm test` (suite completa) → **139/139 archivos, 1854/1854 tests PASS** (subió de 138/1851 tras el informe original: +1 archivo nuevo, +3 tests: el sql-coherence de la migración + 2 tests nuevos en `restauracion-settle.test.ts`).
3. `npm run typecheck` → **exit 0**, sin salida.
4. Commit por pathspec exacto (`actions.ts`, `validations/order.ts`, la migración nueva, sus 2 tests), sin `-A`. `.claude/` queda untracked, intacto.

### Resumen de tests (ronda de fix)

| Comando | Resultado |
|---|---|
| `npm test -- restauracion-settle pos-sales-order-unique-sql` | 4 passed (4) |
| `npm run typecheck` | exit 0, sin salida |
| `npm test` (suite completa) | 139 files / 1854 tests passed |

### Preocupaciones nuevas de esta ronda

- El gate del paso 3 (Minor, `order.status !== "abierta"`) y el rollback del paso 4 (Minor) no tienen test dedicado — la instrucción pedía tests solo para el Critical y el backstop del Important. Si se quiere blindar explícitamente, faltarían: un test con `order.status: "cerrada"` (espera `ok:false, "El pedido no está abierto"`), y un test donde el UPDATE final de `orders` falle (espera `ok:false` + que se haya llamado el `delete` de `pos_sales`, es decir `rollback()`).
- El backstop de `23505` solo se ejercita si la carrera ocurre DESPUÉS del fast-path del paso 2 y ANTES del insert de este mismo request — es decir, cubre la ventana de "select-luego-insert" no atómica. El índice único en BD es la garantía real; el catch de `23505` es solo la traducción de ese error de Postgres a una respuesta idempotente para el caller, en vez de un `ok:false` genérico.
- Sin bloqueos. Todo verde.
