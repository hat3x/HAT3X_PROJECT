# Tarea 5 — Informe: la pantalla de cobro

**Estado:** DONE
**Commit:** `4312c6c` — `feat(atlas): la pantalla de cobro, con los dias de retraso a la vista` (rama `feature/atlas`)

## Qué se hizo

1. **`apps/atlas/src/app/dinero/cobro/page.tsx`** (nuevo). La pantalla del brief tal cual: doble puerta con `notFound()` si el perfil no es propietario, `hoyEnMadrid()` como única fuente de «hoy», `leerCobro(sb, hoy)` → `pendientesDeCobro(periodos, facturas, hoy)`, dos tarjetas de totales, tabla de meses sin facturar y tabla de facturas vencidas con `Distintivo` (`caido` si > 30 días, `aviso` si no). Todo importe en pantalla pasa por `formatear` desde céntimos enteros; no hay ningún `float` en el fichero.
2. **`apps/atlas/src/app/dinero/page.tsx`**: enlace `Ver lo que falta por facturar y por cobrar →` a `/dinero/cobro`, justo debajo del enlace a gastos.
3. **`apps/atlas/scripts/humo.mjs`**: entrada `{ ruta: "/dinero/cobro", exige: ["Cobro"] }` en `PANTALLAS`, tras `/dinero/gastos`.
4. **Estrechamiento de tipo** (ver abajo) en `src/lib/cobro/pendientes.ts` y su copia `supabase/functions/avisar/cobro.ts`.

Al llegar, los cuatro ficheros ya estaban modificados en el árbol de trabajo (sin confirmar) por un intento anterior de esta misma tarea. Los revisé línea a línea contra el brief y contra las restricciones; eran correctos y coincidían con lo pedido, así que la aportación de esta pasada fue verificar, ejecutar las comprobaciones y confirmar.

## Cómo se estrechó el tipo

El brief escribía `f.fechaVencimiento!` dos veces. En vez de eso:

- En `Cobro`, `vencidas` pasa de `FacturaSinCobrar[]` a `(FacturaSinCobrar & { fechaVencimiento: string })[]`, con un comentario que explica que el filtro ya descarta las facturas sin plazo y que el consumidor no debe repetir la comprobación ni acallar al compilador.
- El `.filter` de `pendientesDeCobro` se escribe como type guard: `(f): f is FacturaSinCobrar & { fechaVencimiento: string } => f.fechaVencimiento !== null && ...`. Así el único `!== null` del sistema es el del filtro; el `.sort` posterior y la pantalla ya reciben `string`.
- En la pantalla, las dos aserciones **desaparecen**: `diasDeRetraso(f.fechaVencimiento, hoy)` y `FECHA.format(new Date(f.fechaVencimiento))`, con un comentario sobre por qué no hace falta el `!`.

**Por qué las dos copias siguen idénticas:** el mismo cambio se aplicó a `supabase/functions/avisar/cobro.ts`, que solo difiere del original en su cabecera de tres líneas («COPIA de … NO editar aquí»). Lo comprobé con `diff <(tail -n +4 supabase/functions/avisar/cobro.ts) src/lib/cobro/pendientes.ts` (sin salida) y con el vigilante `copias.test.ts` (en verde). El estrechamiento no introduce imports ni nada que Deno no resuelva: es solo un type guard.

## Comprobaciones (comandos y salida literal)

Desde `g:\HAT3X\CLAUDE\HAT3X\apps\atlas`.

```
$ npx vitest run src/tests/vigia/copias.test.ts
 ✓ src/tests/vigia/copias.test.ts (18 tests) 4ms
 Test Files  1 passed (1)
      Tests  18 passed (18)
```

```
$ npx tsc --noEmit
(sin salida) — exit 0
```

```
$ npx vitest run
 Test Files  70 passed (70)
      Tests  645 passed (645)
   Duration  109.37s
```

```
$ npm run build
 ✓ Compiled successfully
   Linting and checking validity of types ...
 ✓ Generating static pages (21/21)
Route (app)                              Size     First Load JS
...
├ ƒ /dinero                              2.73 kB        98.8 kB
├ ƒ /dinero/cobro                        186 B          96.2 kB
├ ƒ /dinero/gastos                       1.82 kB        97.9 kB
...
build exit=0
```

Antes del build comprobé que no hubiera servidor de desarrollo escuchando en el puerto 3000 (`netstat -ano | grep ":3000 "` sin resultado), así que no hubo conflicto en `.next`.

## Desviaciones

- **`git add` incluye dos ficheros más de los que lista el brief** (`src/lib/cobro/pendientes.ts` y `supabase/functions/avisar/cobro.ts`). Motivo: el estrechamiento de tipo que ordenó el delegador vive ahí, y confirmar la pantalla sin él dejaría `tsc` roto en el commit.
- **`scripts/humo.mjs` no se ejecutó**, según lo acordado: necesita servidor en marcha y sesión. La entrada queda añadida al array.
- Git avisa de `LF will be replaced by CRLF` en tres ficheros; es la configuración `autocrlf` del repo, no un cambio de contenido, y el vigilante de copias sigue en verde.

## Ronda de arreglo 1

Tres hallazgos Menores sobre `4312c6c`; los tres arreglados en un commit nuevo encima (sin enmendar).

1. **`diasDeRetraso` no era defensiva con `hoy`.** En `src/app/dinero/cobro/page.tsx` ahora recorta `hoy` y `vencimiento` a `slice(0, 10)` antes de pegarles `T00:00:00Z`, igual que hace `pendientesDeCobro` con `hoySolo`. Comentario en sitio con el porqué (evitar «NaN días» y la asimetría entre dos consumidores de la misma fecha).
2. **El tipo estrechado se escribía dos veces a mano.** En `src/lib/cobro/pendientes.ts` hay ahora un alias exportado `FacturaVencida = FacturaSinCobrar & { fechaVencimiento: string }`, usado tanto en `Cobro.vencidas` como en el type guard del filtro (`f is FacturaVencida`). El comentario del alias explica el estrechamiento y por qué tiene nombre.
3. **El comparador del `.sort` nunca devolvía 0.** Sustituido por `a.fechaVencimiento.slice(0, 10).localeCompare(b.fechaVencimiento.slice(0, 10))`, de tres vías; comentario sobre por qué vale sobre cadenas ISO.

Los puntos 2 y 3 se aplicaron a `supabase/functions/avisar/cobro.ts` regenerándola desde el original más su cabecera de tres líneas, así que siguen siendo byte a byte iguales por debajo de la cabecera. El fichero sigue sin imports y sin `Intl` (comprobado con grep: una sola coincidencia, la del comentario de `euros()` que dice que no se usa).

Comprobaciones:

```
$ npx vitest run src/tests/vigia/copias.test.ts
 Test Files  1 passed (1)
      Tests  18 passed (18)

$ npx tsc --noEmit
(sin salida) — exit 0

$ npx vitest run
 Test Files  70 passed (70)
      Tests  645 passed (645)
```

Build no repetido, según lo acordado.
