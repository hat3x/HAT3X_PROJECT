# Ronda final — Atlas 2C Horas

Rama `feature/atlas`, base `3f1e081`. Un solo commit encima (hash al final). Sin migraciones nuevas ni editadas.

## Qué se hizo, por punto

### C1.1 — `parar()` cierra por tope
`src/lib/db/fichajes.ts`: `parar(sb, ahoraMs)` lee primero el abierto (`id, inicio, nota`); si `ahora - inicio > TOPE_HORAS`, cierra en `inicio + 16 h` con `origen='anadido'` y `nota = "Cerrado por tope: el fin es reconstruido, no medido"` (constante exportada `NOTA_TOPE`; si había nota, se antepone con « · »). Si no, cierra en `ahora`. El `update` va por `id` + `usuario_id` + `fin is null` y sigue devolviendo `{ok:false}` con 0 filas. Comentario largo con el porqué. `acciones-fichajes.ts`: `pararFichaje` pasa `Date.now()`.
Tests (`src/tests/db/fichajes.test.ts`): «parar uno de dos horas cierra en ahora y sigue siendo medido» y «parar uno de veinte horas cierra en inicio + tope, como añadido y con nota» (el inicio se inserta por SQL porque `empezar` siempre ficha en `now()`).

### C1.2 — borrar un tramo propio
`borrarTramo(sb, id)` en `fichajes.ts` (`delete().eq(id).eq(usuario_id, yo).select("id")`, `{ok:false, error:"Ese tramo no existe o no es tuyo."}` con 0 filas). Acción `borrarFichaje(id)` en `acciones-fichajes.ts`, revalida `/dinero/horas` y el layout. Componente cliente nuevo `src/components/dinero/BotonBorrarTramo.tsx` (`confirm()`, error con `role="alert"`, `finally` para no dejar el botón muerto). En la tabla de `/dinero/horas`, columna «Acciones» (cabecera `sr-only`) con el botón solo cuando `t.usuarioId === perfil.id`.
Tests: «borrar un tramo propio lo quita; uno inexistente lo dice» y, en el bloque RLS, «el colaborador no puede borrar el tramo del dueño; el suyo sí».

### C1.3 — texto del aviso y copia Deno
`src/lib/horas/abiertos.ts`: `cuerpo` = «Si ya no estás trabajando, páralo: se cerrará a las 16 horas y quedará marcado como añadido. Si fue menos, bórralo desde Horas y añade el tramo bueno.» También se corrigió el comentario de `TOPE_HORAS` («hay que cerrarlo y corregir el fin» ya no era verdad). Copiado entero a `supabase/functions/avisar/fichajes.ts` con la cabecera de tres líneas intacta. `abiertos.test.ts`: `/ciérralo/i` → `/páralo/i`. `copias.test.ts` en verde (21 tests).

### I1 — el colaborador llega a Horas
`BarraLateral.tsx`: función `destino(href)` que manda «Dinero» a `/dinero/horas` si `!esPropietario`; `activa` sigue calculándose con el `href` original (`startsWith("/dinero")`). `page.tsx` de horas: el enlace «← Dinero» solo se pinta si `esPropietario`. Comentarios con el porqué en ambos.

### I2 — destino del volcado y README
`scripts/migrar/fichajes.ts`: `URL_PG = process.env.ATLAS_PG || URL_PG_LOCAL`, documentado en cabecera. `apps/fichaje/README.md`: «Su histórico se vuelca con `apps/atlas/scripts/migrar/fichajes.ts` (`origen='anadido'`).»

### M2 — «Sin permiso»
`tramos.ts`: nueva constante `SIN_PERMISO`; `agrupar` recibe el rótulo para «id sin nombre» y `porCliente`/`porProyecto` pasan `SIN_PERMISO` (persona sigue con «Sin nombre»; sin id sigue «Sin asignar»). Test nuevo en `tramos.test.ts`.

### M3 — `nombresDe*`
`page.tsx` usa `nombresDeProyectos`/`nombresDeClientes` y pasa los arrays tal cual a `FormTramo` (ya son `{id, nombre}`).

### M4 — `ultimoInicio`
`ultimoInicio(sb)` en `fichajes.ts` (`select inicio order desc limit 1 maybeSingle`). La pantalla lo pide en el `Promise.all` y lo usa en «Último fichaje». `resumir` conserva `ultimoInicio` en su tipo (no se pidió quitarlo y otros tests lo cubren). Test: un tramo de julio del colaborador no aparece en el rango de agosto pero sí en `ultimoInicio`.

### M5 — guarda en `avisarDeFichajes`
`supabase/functions/avisar/index.ts`: `inicioPorFichaje.get(...)` sin `!`; si es `undefined`, `noComprobados.push(a.usuarioId); continue;`.

### M6 — `nombres.test.ts`
Limpieza previa por correo (`listUsers` + `deleteUser`) y de clientes/proyectos `%-nombres-db` antes de `createUser`; `pg.end()` en `finally`.

### M7 + test que faltaba — migrador
`convertir` devuelve además `restosDescartados`; `descartados` solo cuenta tramos enteros. El `console.log` del informe enseña ambos. Tests ajustados (`descartados` 0 / `restosDescartados` 1 para 16 h + 30 s) y nuevo: 16 h + 60 s inserta la segunda fila de exactamente un minuto.

## Comandos y salidas

```
$ npx tsc --noEmit; echo "TSC_EXIT=$?"
TSC_EXIT=0
```

```
$ npx vitest run
 Test Files  79 passed (79)
      Tests  717 passed (717)
   Start at  11:43:46
   Duration  122.64s (transform 693ms, setup 8.68s, collect 7.40s, tests 31.87s, environment 56.94s, prepare 7.00s)
```

```
$ npm run build
├ ƒ /dinero/horas                        1.66 kB        97.7 kB
...
ƒ  (Dynamic)  server-rendered on demand
BUILD_EXIT=0
```

No había servidor de desarrollo levantado (`netstat` sin escucha en 3000/3010), así que no hubo que pararlo.

## Desviaciones

- **I2, nombre de la variable.** Ni `traer.ts` ni `transacciones.ts` leen una URL de Atlas del entorno: `traer.ts` usa `process.env` con nombres `ORIGEN_PG` / `ATLAS_URL` / `ATLAS_SERVICE_KEY` (obligatorias, vía `requerido()`), y `transacciones.ts` usa `--destino` por argumento con el local por defecto. Se ha seguido la forma de `traer.ts` (`process.env`, sufijo `_PG`, prefijo `ATLAS_`) con el valor por defecto de `transacciones.ts`: `ATLAS_PG`, opcional, local si falta.
- **C1.1, dos consultas.** `parar` ahora hace un `select` antes del `update` (hace falta el `inicio` para decidir). El `update` conserva el filtro `fin is null`, así que si otro cliente lo cierra entre medias devuelve 0 filas y `{ok:false}`, no un doble cierre.
- **M4.** `ResumenHoras.ultimoInicio` se mantiene (sigue siendo correcto para «el último del mes» y hay tests que lo usan); la pantalla ya no lo lee.
- **Primer intento de tsc** falló por un `});` de más en `tramos.test.ts` (el test nuevo quedó fuera del `describe`); corregido antes de la corrida de vitest que se pega arriba.
- Nada quedó sin hacer.
