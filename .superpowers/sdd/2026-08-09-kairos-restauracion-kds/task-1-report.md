# Task 1 — Report: Migración order_items a la publicación Realtime

## STATUS: DONE

## Resumen

Se creó la migración idempotente que añade `public.order_items` a la publicación
`supabase_realtime` (necesaria para que el KDS de restauración reciba refresco en
tiempo real), junto con su test sql-coherence, siguiendo TDD estricto (test rojo
→ migración → test verde). La migración se aplicó a la base de datos real vía
Management API con resultado `(201, [])`, se verificó su efecto con una consulta
a `pg_publication_tables` (1 fila), y se confirmó idempotencia re-aplicándola una
segunda vez (también `(201, [])`, sin error). El commit incluye únicamente los 2
ficheros del alcance de esta tarea.

## Ficheros creados

- `clients/projects/salon-os/supabase/migrations/20260810120000_realtime_order_items.sql`
- `clients/projects/salon-os/src/tests/unit/realtime-order-items-sql.test.ts`

Ambos transcritos verbatim desde `task-1-brief.md`.

## TDD — pasos ejecutados

1. **Test creado primero** (`realtime-order-items-sql.test.ts`), satisfaciendo el
   Fact-Forcing Gate (justificación: caller = Vitest runner vía
   `npm test -- realtime-order-items-sql`; sin duplicado existente en
   `src/tests/unit/`; sin datos estructurados, solo lectura de texto SQL vía
   `readFileSync`; instrucción del usuario citada verbatim).
2. **Test ejecutado → FAIL (ENOENT)**, confirmado:
   ```
   Error: ENOENT: no such file or directory, open
   '...\clients\projects\salon-os\supabase\migrations\20260810120000_realtime_order_items.sql'
   ```
3. **Migración creada** (`20260810120000_realtime_order_items.sql`), satisfaciendo
   el Fact-Forcing Gate de igual modo (caller = el propio test + el endpoint
   `database/query` de la Management API; sin duplicado — última migración previa
   era `20260810110000_pos_sales_order_id_unique.sql`; SQL puro DDL, sin datos).
4. **Test ejecutado → PASS**:
   ```
   Test Files  1 passed (1)
        Tests  1 passed (1)
   ```
5. **`npm run typecheck` → 0 errores** (sin salida, exit limpio). No había tipos
   que cambiar, como anticipaba el encargo.

## Aplicación a la base de datos real (Management API)

Ejecutado desde la raíz del repo (`HAT3X`), token leído desde
`clients/projects/denueveanueve/.env` sin imprimirlo ni comitearlo.

- **Aplicación**: `(201, [])` — éxito.
- **Verificación** (`select schemaname, tablename from pg_publication_tables
  where pubname='supabase_realtime' and tablename='order_items'`):
  `(201, [{'schemaname': 'public', 'tablename': 'order_items'}])` — 1 fila, como
  se esperaba.
- **Re-aplicación (prueba de idempotencia)**: `(201, [])` de nuevo, sin error —
  confirma que el `do $$ ... if not exists (...) then alter publication ... end
  if; end $$;` es seguro de ejecutar más de una vez.

## Commit

- Repo: nested repo `clients/projects/salon-os` (rama `hat3x/HAT3X-038`, sin
  remoto).
- Comando: `git add <migracion> <test> && git commit -m "..."` (pathspec
  explícito, sin `-A`).
- **Hash**: `0adf4ce`
- **Mensaje**: `feat(restauracion): order_items en la publicación Realtime (KDS)`
- **Ficheros en el commit**: exactamente los 2 esperados (`2 files changed, 32
  insertions(+)`).
- `git status --short` post-commit muestra solo `?? .claude/` (untracked,
  intacto, como se pedía).

## Preocupaciones / notas

- Ninguna. La tarea era autocontenida (no toca tipos, no crea tablas ni RLS).
- El pre-commit de Git avisó de conversión LF→CRLF en ambos ficheros
  (`warning: ... LF will be replaced by CRLF`) — es el comportamiento normal de
  `core.autocrlf` en Windows, no afecta al contenido ni a los tests.
- No se tocó `.env` ni se imprimió el token en ningún momento.
