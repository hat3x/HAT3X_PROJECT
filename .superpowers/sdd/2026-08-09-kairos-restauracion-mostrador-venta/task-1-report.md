# Task 1 — Informe: migración orders/order_items + pos_sales.order_id

## STATUS: DONE

## Resumen

Implementada la migración de pedidos de mostrador (Plan B, sector restauración) siguiendo TDD según el brief: test → migración → tipos TS → aplicación real vía Management API → typecheck → commit.

## Ficheros

- `clients/projects/salon-os/supabase/migrations/20260810100000_restauracion_orders.sql` (nuevo)
- `clients/projects/salon-os/src/tests/unit/restauracion-orders-sql.test.ts` (nuevo)
- `clients/projects/salon-os/src/types/database.ts` (modificado)

## Pasos ejecutados

1. **Test (Step 1)**: creado `restauracion-orders-sql.test.ts` verbatim del brief.
2. **Confirmación de fallo (Step 2)**: `npm test -- restauracion-orders-sql` → `ENOENT` (el `.sql` aún no existía), como se esperaba.
3. **Migración (Step 3)**: creada `20260810100000_restauracion_orders.sql` a partir del SQL del brief.
4. **Test verde (Step 4)**: al ejecutar, 4/5 tests pasaban y 1 fallaba — ver "Desviación" abajo. Corregido y confirmado 5/5 verdes.
5. **Tipos + aplicación + typecheck (Step 5)**:
   - `src/types/database.ts`: añadidos alias `OrderStatus`, `OrderItemStatus` (con sus valores del enum), entradas `orders`/`order_items` en `Database.public.Tables` (Row/Insert/Update/Relationships — `id` **requerido** en `Insert` de ambas tablas, ya que no llevan `default gen_random_uuid()`), ampliado `pos_sales.Row/Insert/Update` con `order_id: string | null` + su `Relationships` entry (`pos_sales_order_id_fkey` → `orders(id, salon_id)`), añadidas ambas claves a `public.Enums`, y alias de dominio `Order`/`OrderInsert`/`OrderItem`/`OrderItemInsert` al final del fichero (sección "Alias de dominio", junto a `ComboComponent`).
   - Migración aplicada a la BD real vía Management API (`REF=jztoyekixcziaicrnlce`) → **`(201, [])`**.
   - Verificación post-aplicación en BD real: `orders`/`order_items` existen (`pg_tables`), **6** políticas RLS en ambas tablas (coincide con el umbral del guardián `_cnt < 6`), y `pos_sales.order_id` existe en `information_schema.columns`.
   - `npm run typecheck` → **exit 0**.
6. **Commit (Step 6)**: `git add` solo los 3 ficheros por pathspec (nunca `-A`) + commit con el mensaje exacto del brief.

## Desviación del brief (verbatim → funcional)

El SQL del brief (Step 3) genera las políticas RLS de `orders`/`order_items` mediante un bucle `do $$ ... foreach t in array[...] loop execute format('... "members_insert_%1$s" ...', t) ... end loop; end $$;`. Con placeholders `%1$s`/`%1$I`, el texto **literal** `members_insert_orders` nunca aparece en el fichero `.sql` (solo aparece la plantilla `members_insert_%1$s`). Pero el test del propio brief (Step 1) hace `expect(SQL).toContain("members_insert_orders")` sobre el **texto crudo** del `.sql` (vía `readFileSync`, sin ejecutar Postgres) — con la transcripción verbatim, ese assert **fallaba** (4/5 tests, no los 5 prometidos en Step 4).

**Corrección aplicada**: sustituido el bloque `do $$ ... loop ...` por políticas RLS explícitas y nombradas literalmente (`members_select_orders`, `members_insert_orders`, `members_update_orders`, `members_select_order_items`, `members_insert_order_items`, `members_update_order_items`) — mismo comportamiento de seguridad (miembros: SELECT/INSERT/UPDATE; sin DELETE, append-only), mismo guardián (`_cnt < 6`), pero siguiendo el estilo ya establecido en el resto del esquema (p. ej. `combo_components.sql`, `pos_base.sql`), que usa políticas explícitas en vez de bucles dinámicos con `format()`. Con esto los 5 tests pasan y el SQL aplicado en BD real es funcionalmente idéntico a la intención del brief.

Todo lo demás (enums, tablas `orders`/`order_items`, FKs compuestas, `pos_sales.order_id`, trigger `app.set_order_number`, índices, guardián) se transcribió verbatim del brief.

## Resultado de tests

- `npm test -- restauracion-orders-sql` → **5/5 tests PASS**.
- `npm test -- restauracion` (suite completa restauración, Plan A + Plan B) → **8 ficheros / 36 tests PASS**.
- `npm test` (suite completa del proyecto) → **133 ficheros / 1835 tests PASS**, sin regresiones.

## Resultado de aplicar la migración

Management API `POST /v1/projects/jztoyekixcziaicrnlce/database/query` → **`(201, [])`**.
Verificado en BD real tras aplicar: `orders`/`order_items` existen, 6 políticas RLS, `pos_sales.order_id` presente.

## Typecheck

`npm run typecheck` (`tsc --noEmit`) → **exit 0**.

## Commit

```
ad2c14f feat(restauracion): pedidos de mostrador (orders/order_items, append-only)
 3 files changed, 384 insertions(+)
 create mode 100644 src/tests/unit/restauracion-orders-sql.test.ts
 create mode 100644 supabase/migrations/20260810100000_restauracion_orders.sql
```
(repo anidado `clients/projects/salon-os`, rama `hat3x/HAT3X-038`, sin remoto — commit local únicamente)

## Preocupaciones

- La única desviación de "verbatim" es la sustitución del bucle RLS dinámico por políticas explícitas, documentada arriba — necesaria porque la transcripción literal no cumplía el propio criterio de aceptación del brief (Step 4: "PASS (5 tests)"). Si el equipo prefiere el estilo de bucle `format()` por consistencia con otra parte del código, habría que ajustar el test en su lugar (no lo hice, ya que el test se pidió transcribir verbatim y pasa tal cual con la migración corregida).
- No se hizo backfill de `pos_sales.order_id` (no aplica: proyecto en desarrollo, sin datos de producción, columna nueva nullable).
- `.claude/` sigue untracked en el repo anidado (no tocado, según instrucción).
