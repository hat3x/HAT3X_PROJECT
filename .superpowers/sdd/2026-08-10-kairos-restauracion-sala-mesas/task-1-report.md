# Task 1 — Migración mesas + zonas + enlace con orders — Reporte

**STATUS: DONE**

## Qué hice

Seguí el flujo TDD del brief paso a paso, dentro del repo anidado
`clients/projects/salon-os` (rama `hat3x/HAT3X-038`).

1. **Test que falla** — creé
   `src/tests/unit/restauracion-sala-sql.test.ts` (verbatim del brief).
   `npm test -- restauracion-sala-sql` → **FAIL** con `ENOENT` (el fichero de
   migración aún no existía), confirmando el punto de partida correcto.

2. **Migración** — creé
   `supabase/migrations/20260810130000_restauracion_sala.sql` (verbatim del
   brief): enums `public.table_shape` (`round|square`) y `public.table_status`
   (`libre|ocupada|cuenta_pedida|por_limpiar`); tablas `public.dining_zones` y
   `public.dining_tables` con clave compuesta `(id, salon_id)` en ambas;
   `dining_tables.zone_id` FK compuesta hacia `dining_zones`; constraint
   `capacity_max >= capacity_min`; columnas nuevas `orders.dining_table_id` /
   `orders.covers` con FK compuesta hacia `dining_tables`; triggers
   `updated_at`; índices; RLS con 8 políticas (select miembros, gestión
   owner/manager en zonas, select+update miembros / insert+delete
   owner/manager en mesas); guardián `do $guard$` que exige ≥8 políticas.

   `npm test -- restauracion-sala-sql` → **PASS** (4/4).

3. **Tipos TS** — en `src/types/database.ts` añadí, siguiendo el patrón exacto
   de `menu_categories`/`stations`/`orders`:
   - Alias `TableShape` (`"round" | "square"`) y `TableStatus`
     (`"libre" | "ocupada" | "cuenta_pedida" | "por_limpiar"`), junto a los
     demás alias de enum en la cabecera del fichero.
   - Bloques `dining_zones` y `dining_tables` completos (Row/Insert/Update/
     Relationships), insertados entre `order_items` y `stock_movement`.
   - Amplié `orders.Row/Insert/Update` con `dining_table_id: string | null` y
     `covers: number | null`, y añadí la entrada `orders_dining_table_id_fkey`
     a `orders.Relationships`.
   - Añadí `table_shape`/`table_status` a `Database["public"]["Enums"]`.
   - Añadí alias de conveniencia `DiningZone`/`DiningTable` junto a los demás
     alias de dominio, al final del fichero (misma convención que
     `Order`/`OrderItem`).

   `npm run typecheck` → **exit 0** (sin output, limpio). Además corrí la
   suite completa (`npm test`) como comprobación extra por tocar un fichero
   importado por ~197 ficheros del proyecto: **147 test files / 1879 tests
   passed**, sin regresiones.

4. **Aplicación en producción** — escribí
   `scratchpad/apply_sala_migration.py` (reutilizando el patrón de
   `scratchpad/provision_demo_resto.py`): lee `SUPABASE_API_TOKEN` de
   `clients/projects/denueveanueve/.env`, hace `POST` a
   `https://api.supabase.com/v1/projects/jztoyekixcziaicrnlce/database/query`
   con el contenido íntegro del `.sql` como `query`, cabeceras
   `Authorization: Bearer <token>`, `Content-Type: application/json` y el
   `User-Agent` de navegador requerido.

   Resultado: **`APPLY: 201 []`** — DDL aplicado correctamente.

   Añadí una verificación adicional (`scratchpad/verify_sala_migration.py`)
   consultando `pg_policies`/`information_schema`/`pg_type` en producción para
   confirmar que el guardián y el esquema quedaron como se esperaba:

   ```
   VERIFY: 201 [{
     'policy_count': 8,
     'has_dining_table_id': 1,
     'has_covers': 1,
     'has_table_shape': 1,
     'has_table_status': 1,
     'zones_key': 1,
     'tables_key': 1,
     'orders_fkey': 1
   }]
   ```

   Todo confirmado: 8 políticas RLS, ambas columnas nuevas en `orders`, ambos
   enums, ambas claves compuestas `_id_salon_key`, y la FK
   `orders_dining_table_id_fkey` presentes en producción.

5. **Commit** — por pathspec, solo los 3 ficheros de la tarea (verifiqué con
   `git status` antes y después que no se coló nada de `.claude/` ni de otros
   clientes):

   ```
   git add supabase/migrations/20260810130000_restauracion_sala.sql \
           src/tests/unit/restauracion-sala-sql.test.ts \
           src/types/database.ts
   git commit -m "feat(restauracion): sala — zonas, mesas y enlace de la cuenta con la mesa"
   ```

   Commit: `eccf976ebd46cb745e95f4aeacdde8cc639d5bd7`
   (rama `hat3x/HAT3X-038`, sin remoto — no se hizo push).

## Resultado exacto de aplicar la migración

- Apply: `status=201`, body=`[]`
- Verify (post-apply): `status=201`, body=`[{'policy_count': 8, 'has_dining_table_id': 1, 'has_covers': 1, 'has_table_shape': 1, 'has_table_status': 1, 'zones_key': 1, 'tables_key': 1, 'orders_fkey': 1}]`

## Salida resumida de tests

- `npm test -- restauracion-sala-sql`:
  ```
  Test Files  1 passed (1)
       Tests  4 passed (4)
  ```
- `npm test` (suite completa, comprobación extra):
  ```
  Test Files  147 passed (147)
       Tests  1879 passed (1879)
  ```
- `npm run typecheck`: exit 0, sin output.

## Desviaciones / dudas

- **Ninguna desviación respecto al brief.** La cláusula `on delete set null
  (dining_table_id)` (con lista de columnas entre paréntesis) se dejó tal
  cual venía en el brief: antes de aplicar comprobé que esa misma sintaxis ya
  está viva en producción en la migración previa
  `20260810100000_restauracion_orders.sql` (`orders_session_id_fkey ... on
  delete set null (session_id)`, `pos_sales_order_id_fkey ... on delete set
  null (order_id)`, `order_items_station_id_fkey ... on delete set null
  (station_id)`), así que no hizo falta el fallback a `on delete set null`
  a secas. La aplicación real lo confirmó: `201 []` sin errores.
- No toqué `orders.channel` ni ningún enum de canal — confirmado que es
  `text` libre, fuera del alcance de esta tarea (tal como indicó el
  controlador).
- El fichero `src/types/database.ts` es compartido por ~197 ficheros del
  proyecto; el cambio es puramente aditivo (nuevas tablas, nuevos enums,
  columnas nuevas opcionales/nullable en `orders`), por eso corrí la suite
  completa además del test específico, para descartar regresiones. Todo en
  verde.
