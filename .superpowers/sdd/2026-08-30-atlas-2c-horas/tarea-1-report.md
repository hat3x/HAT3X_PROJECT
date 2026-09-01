# Tarea 1 — La tabla `fichajes` y sus dos garantías — Informe

## Qué se hizo

Se siguieron los cinco pasos del brief tal cual, sin desviaciones sobre el
contenido de la migración ni del test:

1. **Migración** `apps/atlas/supabase/migrations/20260830100000_fichajes.sql`
   creada con el contenido exacto del brief: tabla `fichajes` (con los dos
   checks de fecha/origen), el índice único parcial `fichajes_uno_en_curso`
   (una entrada en curso por persona), los índices de consulta por usuario,
   cliente y proyecto, los `grant` a `authenticated`/`service_role`, RLS
   activado y las dos políticas `fichajes_propios` (for all, propio) y
   `fichajes_propietario_ve` (for select, `atlas_es_propietario()`).
2. **Aplicación y tipos:** `npx supabase migration up --local` (nunca
   `db reset`) y `npm run tipos`, con `src/types/supabase.ts` regenerado y
   confirmado en el commit.
3. **Test** `apps/atlas/src/tests/esquema/fichajes.test.ts` creado con el
   contenido exacto del brief (limpieza previa por correo, guardas de
   identificador vacío, `pg.end()` en `finally`).
4. **Ejecución** del fichero de test dos veces seguidas: 7/7 en ambas
   corridas, confirmando que la limpieza de `beforeAll`/`afterAll` funciona.
5. **Commit** de los tres ficheros (migración, test, tipos regenerados).

## Comprobación previa de la ambigüedad resuelta

Antes de ejecutar el test se comprobó por consulta directa a
`pg_constraint` el nombre real que Postgres asignó a los dos checks de
tabla:

```
[
  { conname: 'fichajes_check',  def: 'CHECK (((fin IS NULL) OR (fin > inicio)))' },
  { conname: 'fichajes_check1', def: "CHECK (((origen = 'atlas'::text) OR (fin IS NOT NULL)))" },
  { conname: 'fichajes_origen_check', def: "CHECK ((origen = ANY (ARRAY['atlas'::text, 'anadido'::text])))" }
]
```

Los dos checks de tabla sin nombre explícito se llamaron `fichajes_check` y
`fichajes_check1`, tal y como anticipa el brief. La expresión regular
`/fichajes_check/` del test casa con ambos sin ningún ajuste. No hizo falta
tocar el test ni la migración.

## Comandos exactos y salida

### Paso 2 — aplicar migración

```
$ cd apps/atlas && npx supabase migration up --local
Connecting to local database...
Applying migration 20260830100000_fichajes.sql...
{"applied":["G:\\HAT3X\\CLAUDE\\HAT3X\\apps\\atlas\\supabase\\migrations\\20260830100000_fichajes.sql"],"message":"Migrations applied"}
```

```
$ npm run tipos

> atlas@0.1.0 tipos
> supabase gen types typescript --local > src/types/supabase.ts

Connecting to db 5432
```

Verificado que `fichajes` aparece en `src/types/supabase.ts` (tabla y sus
tres `foreignKeyName`: `fichajes_cliente_id_fkey`,
`fichajes_proyecto_id_fkey`, `fichajes_usuario_id_fkey`).

### Paso 4 — ejecutar el test, dos veces seguidas

**Primera corrida:**

```
$ npx vitest run src/tests/esquema/fichajes.test.ts

 RUN  v2.1.9 G:/HAT3X/CLAUDE/HAT3X/apps/atlas

stderr | src/tests/esquema/fichajes.test.ts
Multiple GoTrueClient instances detected in the same browser context. It is not an error, but this should be avoided as it may produce undefined behavior when used concurrently under the same storage key.

stderr | src/tests/esquema/fichajes.test.ts
Multiple GoTrueClient instances detected in the same browser context. It is not an error, but this should be avoided as it may produce undefined behavior when used concurrently under the same storage key.

 ✓ src/tests/esquema/fichajes.test.ts (7 tests) 578ms

 Test Files  1 passed (1)
      Tests  7 passed (7)
   Start at  09:45:01
   Duration  1.77s (transform 34ms, setup 118ms, collect 124ms, tests 578ms, environment 702ms, prepare 95ms)
```

**Segunda corrida (misma sesión, sin reiniciar nada):**

```
$ npx vitest run src/tests/esquema/fichajes.test.ts

 RUN  v2.1.9 G:/HAT3X/CLAUDE/HAT3X/apps/atlas

stderr | src/tests/esquema/fichajes.test.ts
Multiple GoTrueClient instances detected in the same browser context. It is not an error, but this should be avoided as it may produce undefined behavior when used concurrently under the same storage key.

stderr | src/tests/esquema/fichajes.test.ts
Multiple GoTrueClient instances detected in the same browser context. It is not an error, but this should be avoided as it may produce undefined behavior when used concurrently under the same storage key.

 ✓ src/tests/esquema/fichajes.test.ts (7 tests) 584ms

 Test Files  1 passed (1)
      Tests  7 passed (7)
   Start at  09:45:09
   Duration  1.85s (transform 34ms, setup 121ms, collect 127ms, tests 584ms, environment 754ms, prepare 96ms)
```

El aviso `Multiple GoTrueClient instances detected...` es un `stderr`
informativo de `@supabase/supabase-js` (se crean dos clientes anon con
distinta `storageKey` a propósito, uno por usuario de prueba); no es un
fallo y ya aparece igual en los tests hermanos de `esquema/`.

### `npx tsc --noEmit`

Sin salida (limpio):

```
$ npx tsc --noEmit
(sin salida)
```

### Suite entera

```
$ npx vitest run
...
 Test Files  72 passed (72)
      Tests  660 passed (660)
   Start at  09:45:25
   Duration  112.95s (transform 721ms, setup 8.00s, collect 6.86s, tests 29.57s, environment 52.32s, prepare 6.41s)
```

72 ficheros de test, 660 tests, todos en verde. Ninguna regresión sobre las
18 migraciones/tests previos.

## Desviaciones y motivo

Ninguna. La migración y el test se usaron literalmente tal como los trae el
brief. La única comprobación adicional fue verificar el nombre real de los
checks de tabla en `pg_constraint` antes de correr el test (ver sección de
ambigüedad arriba) — no requirió ningún cambio de código, solo confirmó que
el regex del brief ya era correcto.

## Commit

Ficheros comprometidos:
- `apps/atlas/supabase/migrations/20260830100000_fichajes.sql`
- `apps/atlas/src/tests/esquema/fichajes.test.ts`
- `apps/atlas/src/types/supabase.ts`

Mensaje: `feat(atlas): la tabla de fichajes, con una sola en curso por persona`
