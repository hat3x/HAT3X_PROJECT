# Tarea 2 — Migración Realtime (dining_tables + orders) — Reporte

## Resumen
Se añadió `dining_tables` y `orders` a la publicación `supabase_realtime` mediante una migración idempotente, siguiendo TDD (test que falla → migración → test que pasa → aplicación en producción → commit).

## Archivos creados
- `clients/projects/salon-os/src/tests/unit/realtime-dining-sql.test.ts`
- `clients/projects/salon-os/supabase/migrations/20260810140000_realtime_dining.sql`

## Flujo TDD

### Step 1-2: Test que falla
Se creó el test sql-coherence (`realtime-dining-sql.test.ts`) leyendo el archivo de migración inexistente. Ejecución `npm test -- realtime-dining-sql`:

```
FAIL  src/tests/unit/realtime-dining-sql.test.ts [ src/tests/unit/realtime-dining-sql.test.ts ]
Error: ENOENT: no such file or directory, open '...\supabase\migrations\20260810140000_realtime_dining.sql'
 Test Files  1 failed (1)
```

Confirmado: FALLA como se esperaba (archivo de migración no existe).

### Step 3: Migración escrita
`20260810140000_realtime_dining.sql` — bloque `do $$ ... end $$` con guardas `if not exists (select 1 from pg_publication_tables ...)` antes de cada `alter publication supabase_realtime add table public.dining_tables` / `public.orders`. Idempotente, consistente con el patrón ya usado en `20260810120000_realtime_order_items.sql` (Plan C).

### Step 4: Test pasa
```
 Test Files  1 passed (1)
      Tests  1 passed (1)
   Duration  1.21s
```

### Step 5: Aplicación en producción (Management API)
Script `apply_realtime_dining.py` en el scratchpad (plantilla reusada de `apply_sala_migration.py`), lee `SUPABASE_API_TOKEN` de `clients/projects/denueveanueve/.env`, hace `POST https://api.supabase.com/v1/projects/jztoyekixcziaicrnlce/database/query`.

Salida exacta:
```
APPLY: 201 []
```

Éxito — `(201, [])` sin error, DDL aplicado correctamente. Al ser idempotente, es seguro re-ejecutar (no falla aunque `dining_tables`/`orders` ya estuvieran en la publicación).

### Step 6: Commit
Verificado `git status` antes de stagear — solo los 2 archivos de la tarea estaban untracked (además de `.claude/`, preexistente y no tocado, dejado fuera). Commit por pathspec exacto (nunca `git add -A`):

```
commit d4aabff
feat(restauracion): dining_tables + orders en la publicación Realtime (plano)
 2 files changed, 33 insertions(+)
 create mode 100644 src/tests/unit/realtime-dining-sql.test.ts
 create mode 100644 supabase/migrations/20260810140000_realtime_dining.sql
```

Rama: `hat3x/HAT3X-038` (repo anidado `clients/projects/salon-os`).

## Notas / decisiones
- Se siguió el brief al pie de la letra (contenido de test y migración copiados literalmente de `task-2-brief.md`).
- El script de aplicación (`apply_realtime_dining.py`) quedó en el scratchpad de sesión, no en el repo (es una herramienta operativa puntual, igual que su plantilla `apply_sala_migration.py`).
- Durante la ejecución, el harness activó un "Fact-Forcing Gate" en cada `Write` (test, migración, script scratchpad, este mismo reporte) exigiendo justificación antes de crear archivos; se respondió con los hechos solicitados (caller, ausencia de duplicados, estructura de datos, cita literal de la instrucción) y se reintentó — sin impacto en el resultado final, solo en el flujo de herramientas.

## Dudas
Ninguna. La tarea se completó sin ambigüedades: el brief traía valores exactos (nombres de archivo, contenido SQL/TS, mensaje de commit) y todo encajó con el patrón ya establecido por la migración Realtime previa de `order_items`.
