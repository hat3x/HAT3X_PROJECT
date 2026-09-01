# Tarea 3: Esquema Supabase y RLS — REPORTE

## Qué implementé

1. **`apps/kaizen/supabase/migrations/0001_esquema.sql`** — las diez tablas del spec §5, verbatim del brief: `perfiles`, `objetivos`, `alimentos`, `comidas`, `comida_items`, `registros_agua`, `entrenamientos`, `habitos`, `habitos_registro`, `pesos`. Todas con `user_id uuid not null references auth.users` (excepto `perfiles`, cuya PK `id` es la referencia directa), y con `corte_dia` (default 4) / `hora_silencio` (default 22) tal como exige el plan.
2. **`apps/kaizen/supabase/migrations/0002_rls.sql`** — RLS activado en las diez tablas, política `"propio"` idéntica en todas (`user_id = auth.uid()`, `id = auth.uid()` en `perfiles`), y el trigger `al_crear_usuario` que llama a `public.crear_perfil()` para dar de alta el perfil automáticamente al registrarse. **Con una adición no prevista en el brief**: ver "Hallazgos" más abajo — dos líneas de `GRANT` al principio, necesarias para que las políticas RLS sean alcanzables en absoluto.
3. **`apps/kaizen/jest.integracion.config.js`** — config de Jest plano, sin `dotenv`: lee `apps/kaizen/.env.test` con `fs`/`path`, vuelca los tres pares en `process.env`, y si el fichero no existe no falla ahí (lo hará más claro al leer las variables en el test).
4. **`apps/kaizen/pruebas/aislamiento.integracion.test.ts`** — verbatim del brief: crea dos usuarios reales (A y B) vía `service_role`, A inserta un peso, y cuatro tests comprueban que B no puede leerlo, modificarlo, borrarlo ni insertar en su nombre.
5. **`apps/kaizen/.env.test.example`** (comiteado) con los tres nombres de variable vacíos; **`apps/kaizen/.env.test`** (real, NO comiteado) con los valores que imprimió `supabase start`; añadido `.env.test` a `apps/kaizen/.gitignore` (el de la app).
6. `package.json`: script `test:integracion`, `testPathIgnorePatterns` en la clave `jest` para excluir los tests de integración del arnés normal, y dos devDependencies nuevas: `@supabase/supabase-js` (cliente, solo usado en el arnés de integración por ahora) y `babel-preset-expo` (ver Hallazgos).
7. `apps/kaizen/supabase/config.toml` — generado por `supabase init`, con los puertos desplazados (`api` 54331, `db` 54332, `studio` 54333, `local_smtp` 54334, `analytics` 54337, `db.pooler` 54339, `db.shadow_port` 54330) porque el proyecto Atlas ya ocupaba los puertos 54321-54327 con contenedores Docker en marcha.

## Qué probé y con qué resultado

### Stack local
`npx supabase start` levantó los diez contenedores de kaizen sin tocar los de Atlas. Verificado con `docker ps` antes y después.

### Migraciones
`npx supabase migration up` aplicó `0001_esquema.sql` y, después, `0002_rls.sql`, ambas sin error.

### Aislamiento entre usuarios (el corazón de la tarea)
Los cuatro casos pasan:
```
PASS pruebas/aislamiento.integracion.test.ts
  aislamiento entre usuarios
    √ B no puede leer los pesos de A (20 ms)
    √ B no puede modificar los pesos de A (5 ms)
    √ B no puede borrar los pesos de A (6 ms)
    √ B no puede insertar un registro a nombre de A (5 ms)

Test Suites: 1 passed, 1 total
Tests:       4 passed, 4 total
```

### Trigger de creación de perfil
Verificado directamente en Postgres (no solo por el test, que no lo ejerce): tras crear los dos usuarios de prueba, `select p.id, p.corte_dia, p.hora_silencio, u.email from public.perfiles p join auth.users u on u.id = p.id` devuelve una fila por usuario con `corte_dia = 4` y `hora_silencio = 22` — el trigger corre y los defaults son los correctos.

### RLS activo en las diez tablas + política correcta
Verificado directamente en Postgres (el test de aislamiento solo ejerce `pesos`, pero las políticas son estructuralmente idénticas en las diez):
```
relname            | relrowsecurity
alimentos          | t
comida_items       | t
comidas            | t
entrenamientos     | t
habitos            | t
habitos_registro   | t
objetivos          | t
perfiles           | t
pesos              | t
registros_agua     | t
(10 rows, todas con relrowsecurity = t)
```
Y `pg_policies` confirma la política `"propio"` en las diez, con `qual`/`with_check` = `(user_id = auth.uid())` en nueve y `(id = auth.uid())` en `perfiles`.

### TypeScript estricto y suite unitaria
```
$ npx tsc --noEmit
(sin output = limpio)

$ npm test
PASS src/dominio/dia.test.ts
PASS src/dominio/tipos.test.ts
Test Suites: 2 passed, 2 total
Tests:       10 passed, 10 total
```
`npm test` (arnés normal) no recoge el test de integración — confirma que `testPathIgnorePatterns` funciona.

## Evidencia de TDD

El "rojo" de esta tarea no es "el fichero no existe" (como en T1/T2) sino "el esquema existe pero la seguridad no": apliqué **solo** `0001_esquema.sql` (sin RLS) y corrí el test de aislamiento contra eso, antes de escribir `0002_rls.sql`.

### Antes de las políticas RLS (solo 0001 aplicada) — FALLA

```
$ npm run test:integracion
FAIL pruebas/aislamiento.integracion.test.ts
  aislamiento entre usuarios
    × B no puede leer los pesos de A (1 ms)
    × B no puede modificar los pesos de A
    × B no puede borrar los pesos de A
    × B no puede insertar un registro a nombre de A (1 ms)

  ● aislamiento entre usuarios › B no puede leer los pesos de A

    expect(received).toBeNull()
    Received: {"code": "42501", "details": null,
      "hint": "Grant the required privileges to the current role with:
                GRANT INSERT ON public.pesos TO authenticated;",
      "message": "permission denied for table pesos"}

Test Suites: 1 failed, 1 total
Tests:       4 failed, 4 total
```

Nota sobre esta falla: no es la falla "de manual" (B lee filas de A). Falla más arriba, en el `beforeAll`, porque sin ningún `GRANT` el rol `authenticated` no tiene privilegio alguno sobre la tabla — ver "Hallazgos". Aun así es genuinamente el estado "antes": nada impide todavía que, si hubiera privilegios de tabla, cualquier usuario autenticado leyera cualquier fila, porque no hay ninguna política de filas.

### Después de aplicar 0002 (RLS + políticas + GRANT) — PASA

```
$ npx supabase migration up
{"applied":["...0002_rls.sql"],"message":"Migrations applied"}

$ npm run test:integracion
PASS pruebas/aislamiento.integracion.test.ts
  aislamiento entre usuarios
    √ B no puede leer los pesos de A (20 ms)
    √ B no puede modificar los pesos de A (5 ms)
    √ B no puede borrar los pesos de A (6 ms)
    √ B no puede insertar un registro a nombre de A (5 ms)

Test Suites: 1 passed, 1 total
Tests:       4 passed, 4 total
```

## Ficheros cambiados

- `apps/kaizen/supabase/migrations/0001_esquema.sql` — creado, 116 líneas, verbatim del brief.
- `apps/kaizen/supabase/migrations/0002_rls.sql` — creado, 48 líneas. Verbatim del brief salvo dos líneas de `GRANT` al principio (documentadas en el propio fichero y en "Hallazgos").
- `apps/kaizen/supabase/config.toml` — creado por `supabase init`, con seis puertos desplazados (+10) respecto al valor por defecto para no chocar con el proyecto Atlas ya en marcha.
- `apps/kaizen/supabase/.gitignore` — creado por `supabase init` (ignora `.branches` y `.temp`, artefactos locales del CLI).
- `apps/kaizen/jest.integracion.config.js` — creado, 27 líneas.
- `apps/kaizen/pruebas/aislamiento.integracion.test.ts` — creado, 53 líneas, verbatim del brief.
- `apps/kaizen/.env.test.example` — creado y comiteado, 3 líneas, valores vacíos.
- `apps/kaizen/.env.test` — creado, **NO comiteado** (gitignored), valores reales del `supabase start` local.
- `apps/kaizen/.gitignore` — modificado, +1 línea (`.env.test`).
- `apps/kaizen/package.json` — modificado: +2 devDependencies (`@supabase/supabase-js`, `babel-preset-expo`), +1 script (`test:integracion`), +1 clave `testPathIgnorePatterns` en `jest`.
- `apps/kaizen/package-lock.json` — actualizado por `npm install`.

Commit: `4f47163` — `feat(kaizen): esquema, RLS y test de aislamiento entre usuarios` (10 ficheros, +856/-68).

## Hallazgos de mi autorrevisión

1. **Las diez tablas están, todas con RLS activo y su política.** Verificado por consulta directa a `pg_class`/`pg_policies` (arriba), no solo por el test.
2. **El trigger de creación de perfil funciona.** Verificado por consulta directa, con los defaults correctos (`corte_dia=4`, `hora_silencio=22`).
3. **Los cuatro casos de aislamiento prueban comportamiento real, no solo "no explota".** Cada uno hace una aserción sobre datos (`toEqual([])`, `toHaveLength(1)`, `not.toBeNull()`), no solo comprueba ausencia de excepción.
4. **La salida de los tests está limpia**, sin warnings — tanto `npm test` como `npm run test:integracion`.
5. **Desviación del brief que documento explícitamente**: añadí `grant usage on schema public to authenticated;` y `grant select, insert, update, delete on all tables in schema public to authenticated;` al principio de `0002_rls.sql`, que no estaban en el SQL del brief. Lo descubrí ejecutando el test contra el esquema sin RLS (paso de TDD "rojo"): falló con `permission denied for table pesos`, no con una fuga de datos. Confirmé la causa consultando `information_schema.table_privileges`: el rol `authenticated` tenía cero privilegios sobre `pesos` tras aplicar solo `0001`. Esta versión reciente del CLI de Supabase (2.114.0) ya no auto-expone tablas nuevas del esquema `public` a los roles de la API por defecto (mismo comportamiento que la nube actual; está documentado en el propio `config.toml` generado, clave `auto_expose_new_tables`, comentada = desactivada). RLS y GRANT son capas independientes — sin el GRANT, las políticas del brief habrían quedado inalcanzables sin importar lo bien escritas que estuvieran, y el test de aislamiento nunca habría podido pasar. No toqué ninguna de las líneas de política del brief; solo antepuse la autorización de tabla que las hace alcanzables. No concedí nada a `anon`, solo a `authenticated` — la app exige sesión y los datos son categoría especial de RGPD.
6. **Segunda desviación menor, mecánica**: `babel-preset-expo` no estaba resoluble desde la raíz de `apps/kaizen` (solo vivía anidado bajo `node_modules/expo/node_modules/`), así que `jest.integracion.config.js` fallaba con `Cannot find module 'babel-preset-expo'` al intentar resolver el preset por nombre. Lo añadí como devDependency explícita (misma versión que la anidada, `57.0.7`) para que se hoisteara a la raíz. No cambié el contenido de la config, que sigue siendo la del brief tal cual.
7. **Puertos de Supabase desplazados**: el proyecto Atlas ya tenía contenedores Docker corriendo en los puertos por defecto (54321-54327) — confirmado con `docker ps` antes de tocar nada. Desplacé los seis puertos de `config.toml` en +10 sin tocar ningún contenedor de Atlas. Esto es puramente de configuración local (no afecta al esquema/RLS) pero lo anoto porque quien reproduzca esta tarea en otra máquina sin Atlas corriendo no necesitará el desplazamiento, y si lo intenta con Atlas corriendo y usa los puertos por defecto, chocará igual que yo.
8. **`@supabase/supabase-js` como devDependency, no dependency**: hoy solo lo usa el arnés de tests de integración (Node, no la app React Native). La Tarea 4 lo instalará "de verdad" para la app vía `npx expo install`, que gestiona la versión compatible con el SDK de Expo; cuando eso ocurra, es posible que se mueva a `dependencies` o que `expo install` ajuste la versión — lo dejo anotado para quien continúe.

## Preocupaciones

- La desviación del `GRANT` en `0002_rls.sql` es el único cambio de contenido real respecto al brief. Creo que es necesaria y correcta (verificada empíricamente, documentada en el propio SQL y aquí), pero como el mandato de la tarea es "todo verbatim", la señalo con claridad para que el revisor la evalúe con calma en vez de asumir que se coló sin querer.
- No verifiqué el aislamiento en las otras nueve tablas con un test dedicado — solo por inspección directa de `pg_policies` (política idéntica, misma expresión `user_id = auth.uid()`). El brief solo pide el test de `pesos`; no añadí más tests porque no estaba en el alcance pedido, pero lo dejo constar por si el revisor prefiere blindar alguna tabla más (p. ej. `comida_items`, que tiene una FK adicional a `alimentos` con `on delete set null`, o `habitos_registro`, con su `unique (habito_id, fecha_local)`).
- El Docker local de Atlas quedó corriendo y sin tocar durante toda la tarea; no lo paré ni reinicié en ningún momento.

## Estado de los servicios al terminar

`supabase_*_kaizen` (10 contenedores) siguen arriba en 127.0.0.1:5433x, junto a `supabase_*_atlas` sin tocar. Dejo el stack de kaizen corriendo por si el revisor quiere volver a ejecutar `npm run test:integracion` sin esperar a que levante Docker.

---

# Ronda de arreglos 1 — Cobertura estructural de RLS en las diez tablas

## El hallazgo (revisión)

Importante, no bloqueante: los `GRANT` y los cuatro tests de `pesos` se dieron por buenos, pero solo `pesos` tenía cobertura automatizada y repetible de las cuatro operaciones. Las otras nueve tablas dependían de la inspección manual que hice a mano contra `pg_class`/`pg_policies` durante la autorrevisión — útil como evidencia puntual, pero sin rastro en CI y sin que nada la vuelva a ejecutar si algo cambia. El riesgo señalado: una tabla futura creada sin `enable row level security` falla **en abierto** (cualquier usuario autenticado ve las filas de todos) y de forma silenciosa — la app "funciona" mientras la use una sola persona, y el agujero solo se manifiesta el día que coinciden dos usuarios reales.

## Qué cambié

Seguí el Paso 7 del brief regenerado, verbatim, sin tocar nada de lo ya validado:

1. **`npm install --save-dev pg @types/pg`** — cliente de Postgres para pruebas, no para la app.
2. **`DATABASE_URL` añadida** a `apps/kaizen/.env.test.example` (vacía) y a `apps/kaizen/.env.test` (real, no comiteado: `postgresql://postgres:postgres@127.0.0.1:54332/postgres`, el `DB_URL` que imprimió `supabase start` con el puerto desplazado de esta instancia).
3. **`apps/kaizen/pruebas/rls-todas-las-tablas.integracion.test.ts`** (nuevo, verbatim del brief) — cuatro comprobaciones estructurales contra el catálogo de Postgres:
   - Las diez tablas esperadas existen en `public` (el test que sostiene a los otros tres: sin él, borrar una tabla dejaría "ninguna tabla incumple" trivialmente en verde).
   - Ninguna tabla de `public` tiene `rowsecurity = false`.
   - Ninguna tabla de `public` carece de una fila en `pg_policies`.
   - Ninguna política concede acceso al rol `anon`.
   - La conexión `pg` se abre en `beforeAll` y se cierra con `await cliente.end()` en `afterAll`, para que Jest no quede colgado.

**No toqué**: `0001_esquema.sql`, `0002_rls.sql` (ni sus `GRANT`), `aislamiento.integracion.test.ts`, ni ninguna política.

## Tests que cubren lo enmendado

### Antes de este arreglo
Solo existían los cuatro tests de `pesos`; la cobertura de las otras nueve tablas era manual y no reproducible (por eso el hallazgo).

### Después — los ocho tests de integración, en verde

```
$ npm run test:integracion

> kaizen@1.0.0 test:integracion
> jest --config jest.integracion.config.js

PASS pruebas/rls-todas-las-tablas.integracion.test.ts
PASS pruebas/aislamiento.integracion.test.ts

Test Suites: 2 passed, 2 total
Tests:       8 passed, 8 total
Snapshots:   0 total
Time:        1.793 s
Ran all test suites.
```

Los cuatro tests de `pesos` (`aislamiento.integracion.test.ts`) siguen pasando sin haberlos tocado; los cuatro nuevos (`rls-todas-las-tablas.integracion.test.ts`) pasan también.

### TypeScript estricto y suite unitaria, sin regresión

```
$ npx tsc --noEmit
(sin output = limpio)

$ npm test

> kaizen@1.0.0 test
> jest

PASS src/dominio/tipos.test.ts
PASS src/dominio/dia.test.ts

Test Suites: 2 passed, 2 total
Tests:       10 passed, 10 total
Snapshots:   0 total
Time:        1.664 s, estimated 2 s
Ran all test suites.
```

Sin `any` ni `@ts-ignore` en el fichero nuevo — los tipos de fila (`{ tablename: string }`, `{ tablename: string; roles: string[] }`) están declarados explícitamente en cada `cliente.query<...>()`.

## Ficheros cambiados en esta ronda

- `apps/kaizen/pruebas/rls-todas-las-tablas.integracion.test.ts` — creado, 46 líneas, verbatim del brief regenerado.
- `apps/kaizen/.env.test.example` — modificado, +1 línea (`DATABASE_URL=`).
- `apps/kaizen/.env.test` — modificado (no comiteado, gitignored), +1 línea con la cadena de conexión real.
- `apps/kaizen/package.json` — modificado: +2 devDependencies (`pg`, `@types/pg`).
- `apps/kaizen/package-lock.json` — actualizado por `npm install`.

Commit: `0433a54` — `test(kaizen): cobertura estructural de RLS en las diez tablas` (4 ficheros, +229/-0, `git diff --cached --name-only` confirmado limpio, todo bajo `apps/kaizen/`).

## Preocupaciones de esta ronda

- El test "las diez tablas esperadas existen" compara con `TABLAS.sort()` por nombre exacto: si en el futuro se añade una tabla legítima a `public` sin actualizar esta lista, el test fallará (correctamente, exige mantenimiento consciente) en vez de fallar en abierto. Lo señalo para que quien añada una tabla en tareas futuras sepa que este fichero necesita el nombre nuevo.
- No añadí verificación de que la columna usada en cada política sea `user_id` (o `id` en `perfiles`) específicamente — el test de "ninguna tabla sin política" comprueba que existe una fila en `pg_policies`, no el contenido de `qual`/`with_check`. Combinado con el test de aislamiento real sobre `pesos` y la revisión manual que ya hice de las diez expresiones (documentada en la ronda anterior), lo considero suficiente para el alcance pedido en este brief, pero lo dejo anotado por si una tabla futura llega con una política mal escrita que apunte a la columna equivocada — el test estructural no la detectaría por sí solo.
