# Tarea 3 — El tipo de aviso, y su disparo diario

## Qué se hizo

Se siguieron los cinco pasos del brief en orden, desde `apps/atlas` en la rama `feature/atlas` (Supabase local ya levantado con las migraciones anteriores aplicadas):

1. **Migración** `apps/atlas/supabase/migrations/20260829170000_aviso_cobro.sql`, copiada tal cual del brief:
   - Columna `notificaciones.tipo` (`text not null default 'incidencia'`, `check (tipo in ('incidencia','cobro'))`), que deja intacto el código del bloque 1 (sigue insertando sin nombrar la columna).
   - Índice parcial `notificaciones_cobro_del_dia` sobre `(usuario_id, enviada_en desc) where tipo = 'cobro'`.
   - Función `atlas_disparar_cobro()` (`security definer`), reutilizando la Edge Function `avisar` con `{"cobro": true}` en el cuerpo.
   - Sus tres `revoke` (`public`, `anon`, `authenticated`) inmediatamente después del `create or replace function`, siguiendo el patrón de `20260829140000_permisos_funciones.sql` — sin ellos, `create or replace` habría dejado la función expuesta en `/rest/v1/rpc`.
   - `cron.schedule('atlas-cobro', '7 9 * * *', ...)`.
2. **Aplicación**: `npx supabase migration up --local` (aplicada sin error) y `npm run tipos` (regenera `src/types/supabase.ts`; diff de solo 4 líneas añadidas, el campo `tipo`).
3. **Test** `apps/atlas/src/tests/esquema/aviso-cobro.test.ts`, con el defecto del brief corregido (ver abajo).
4. **Ejecución del test** — ver salida literal más abajo.
5. **Commit** — ver hash más abajo.

## El defecto del brief y cómo se corrigió

El test original insertaba en `notificaciones` con `usuario_id = '00000000-0000-0000-0000-000000000000'`. Esa columna tiene clave foránea a `perfiles(id)`, así que Postgres rechaza la fila por la foránea **antes** de llegar a evaluar el `check` de `tipo`: el test pasaría, pero por el motivo equivocado, y dejaría de proteger nada el día que alguien borrase el `check`.

Corrección aplicada:

- En `beforeAll` se crea un usuario real en `auth.users` (correo fijo `aviso-cobro@atlas.test`, mismo patrón que `src/tests/esquema/personas.test.ts`) y su `perfiles` correspondiente. Antes de crearlo se borra cualquier resto de una corrida anterior que hubiera muerto antes de su `afterAll` (`DELETE FROM auth.users WHERE email = $1`), cumpliendo la regla de limpiar también antes de crear.
- El test del `check` inserta con `usuario_id = idUsuario` (el perfil real), de modo que el único motivo posible de fallo es el `check` de `tipo`.
- El `.rejects.toThrow(...)` se afinó de `/tipo/` (que también habría casado con el mensaje de la violación de foránea del brief original, que menciona la columna `usuario_id` y su tipo de dato) a `/violates check constraint "notificaciones_tipo_check"/`, anclado al nombre exacto que Postgres genera por convención (`<tabla>_<columna>_check`, verificado contra `pg_constraint` antes de escribir el test). Solo así el test falla si alguien borra el `check` real.
- `afterAll` borra `notificaciones` del usuario de prueba y luego `auth.users` (que arrastra `perfiles` por `on delete cascade`), todo envuelto en `try {...} finally { await pg.end(); }` para garantizar el cierre de la conexión aunque la limpieza falle.
- Se dejaron comentarios en español explicando el porqué de cada decisión (FK antes que check, regex anclado, limpieza defensiva).

## Comando y salida — test suelto

```
$ npx vitest run src/tests/esquema/aviso-cobro.test.ts
```

```
 RUN  v2.1.9 G:/HAT3X/CLAUDE/HAT3X/apps/atlas

 ✓ src/tests/esquema/aviso-cobro.test.ts (4 tests) 45ms

 Test Files  1 passed (1)
      Tests  4 passed (4)
   Start at  21:00:27
   Duration  1.19s (transform 28ms, setup 119ms, collect 52ms, tests 45ms, environment 711ms, prepare 92ms)
```

## Comando y salida — suite entera

```
$ npx tsc --noEmit
```
(sin salida — limpio)

```
$ npx vitest run
```

```
 Test Files  70 passed (70)
      Tests  642 passed (642)
   Start at  21:00:48
   Duration  111.36s (transform 711ms, setup 7.62s, collect 8.74s, tests 29.00s, environment 50.00s, prepare 6.07s)
```

Incluye, sin regresiones, los tests del bloque 1 que tocan `notificaciones`: `src/tests/esquema/vigilancia.test.ts` (5 tests), `src/tests/esquema/rls.test.ts` (8 tests), `src/tests/esquema/personas.test.ts` (6 tests), `src/tests/db/push.test.ts` (11 tests), `src/tests/esquema/planificador.test.ts` (6 tests) — todos en verde.

## Verificación adicional

- Se confirmó contra `pg_constraint` que el `check` de `tipo` se llama exactamente `notificaciones_tipo_check` antes de anclar el regex del test.
- `git diff --stat -- apps/atlas/src/lib/cobro/pendientes.ts apps/atlas/src/lib/db/cobro.ts` no mostró ninguna línea: ninguno de los dos ficheros de las tareas 1 y 2 fue tocado.

## Desviaciones

Ninguna respecto al brief, salvo la corrección explícitamente pedida en el defecto del test (documentada arriba). La migración se copió verbatim de los cinco pasos del brief.

## Commit

```
0d7cd00 feat(atlas): el tipo de aviso de cobro y su disparo diario
 3 files changed, 166 insertions(+)
 create mode 100644 apps/atlas/src/tests/esquema/aviso-cobro.test.ts
 create mode 100644 apps/atlas/supabase/migrations/20260829170000_aviso_cobro.sql
 (modificado) apps/atlas/src/types/supabase.ts
```
