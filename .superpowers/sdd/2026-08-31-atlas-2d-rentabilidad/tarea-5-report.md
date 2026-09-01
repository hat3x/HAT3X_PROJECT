# Tarea 5 — Informe

**Estado:** completada.

**Hash del commit:** `d38892a`

**Ficheros:**
- Creado: `apps/atlas/src/app/dinero/rentabilidad/page.tsx`
- Creado: `apps/atlas/src/components/dinero/BotonCierreMes.tsx`
- Modificado: `apps/atlas/src/app/dinero/page.tsx` (enlace «Ver la rentabilidad por cliente y por proyecto →»)
- Modificado: `apps/atlas/scripts/humo.mjs` (entrada `{ ruta: "/dinero/rentabilidad", exige: ["Rentabilidad"] }`, sin ejecutar)

**Desvío del brief aplicado (Ruling 1):** en vez de `searchParams.mes!`, se guarda en `mesPedido`, se valida con la expresión regular y se cae al mes actual si no vale.

**tsc:** `npx tsc --noEmit` → código de salida 0.

**vitest:** `Test Files 83 passed (83)` / `Tests 749 passed (749)`.

**build:** `npm run build` → `✓ Compiled successfully`, `/dinero/rentabilidad` aparece en la tabla de rutas (`ƒ /dinero/rentabilidad  1.53 kB  97.6 kB`). No había servidor de desarrollo levantado en los puertos 3000/3010, así que no hizo falta pararlo.

**Dudas:** ninguna.

---

## Ronda de arreglo 1

**Estado:** completada. Parto de `a6e6351` (la otra ronda ya había quitado `costeHoraCentimos` de `BotonCierreMes` y de la pantalla; no lo he tocado).

**Hash del commit:** `e8b55ef`

**Ficheros:**
- Modificado: `apps/atlas/src/app/dinero/rentabilidad/page.tsx`
- Modificado: `apps/atlas/src/lib/rentabilidad/margen.ts`
- Modificado: `apps/atlas/src/tests/rentabilidad/margen.test.ts`

**Hallazgos atendidos:**
- Importante 1: la tarjeta «Horas» ahora es «Coste horas» (céntimos); nueva quinta tarjeta «Horas» con `formatearMinutos(r.total.minutos)`; grid a 5 columnas en `sm`.
- Importante 2: nuevo campo `facturadoSinProyectoCentimos` en `Rentabilidad` (suma de líneas de factura con `proyectoId` null), comentado; aserto en el fixture existente (`10000`) y el test de cuadre por proyecto usa el campo en vez del literal. En pantalla, la tabla «Por proyecto» pinta una fila tenue «Sin proyecto» con ese facturado y «—» en el resto; se quitó la nota al pie.
- Menor 1: frase tenue bajo la segunda tabla («La estructura es la misma línea en las dos tablas: se resta una sola vez del resultado.»).
- Menor 2: la fila «sin repartir» ahora se muestra con `gastosCentimos + horasCentimos > 0 || minutos > 0`.
- Menor 3: el array de KPIs pasó a `{ etiqueta: string; texto: string; enRojo?: boolean }[]` tipado, con `enRojo: r.total.margenCentimos < 0` en la tarjeta de resultado.

**tsc:** `npx tsc --noEmit` → código de salida 0.

**vitest (`src/tests/rentabilidad/`):** `Test Files 1 passed (1)` / `Tests 11 passed (11)`.

**vitest (suite entera):** `Test Files 83 passed (83)` / `Tests 753 passed (753)`.

**build:** `npm run build` → `✓ Compiled successfully`, `/dinero/rentabilidad` sigue en la tabla de rutas (`ƒ /dinero/rentabilidad  1.51 kB  97.6 kB`). No había servidor de desarrollo levantado en los puertos 3000/3010.

**Dudas:** ninguna.
