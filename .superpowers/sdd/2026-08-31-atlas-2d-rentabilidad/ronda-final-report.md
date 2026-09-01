# Ronda final — Atlas 2D Rentabilidad

Rama `feature/atlas`, base `60640bd`. Un solo commit encima de HEAD. Sin migraciones, sin `!` fuera de tests, céntimos enteros.

## Qué se hizo por punto

### I1 — `listarFacturas` con rango de fechas
- `src/lib/db/facturas.ts`: `listarFacturas(sb, filtros)` acepta `desde?: string` y `hasta?: string` (ISO `AAAA-MM-DD`) sobre `fecha_emision`: `gte(desde)` inclusivo, `lt(hasta)` **exclusivo**. El comentario documenta cuál es cuál y avisa de que `listarGastos` usa `hasta` inclusivo. Se mantiene `limit(200)` para el historial sin filtro.
- `src/lib/db/rentabilidad.ts`: llama a `listarFacturas(sb, { desde: desdeDia, hasta: hastaDia })` y el filtro en memoria queda solo en `estado === "emitida"`.
- Test nuevo en `src/tests/db/facturas.test.ts`: «con desde/hasta, una factura fuera del rango no sale (hasta exclusivo)». Bordes elegidos a propósito: `desde = 2026-07-04` (cae sobre la factura 2, inclusivo) y `hasta = 2026-08-04` (cae sobre las de agosto, exclusivo); solo sale la 2.

### I2 — con y sin IVA
- `src/components/dinero/ResumenMargen.tsx`: etiquetas «Facturado (base)» y «Gastos (base)», con comentario.
- `src/app/dinero/page.tsx`: frase tenue bajo los cuatro totales: «Aquí, importes totales con IVA: es caja. En Rentabilidad, bases sin IVA: es margen.»

### I3 — test de esquema sobre estado compartido
- `src/tests/esquema/economia-ajustes.test.ts`: el test pasa a llamarse «tiene una sola fila» y afirma `rows.length === 1` y `coste_hora >= 0`. Comentario: la fila la escriben otros tests y el propietario; el valor no es invariante.

### M1 — un cajón, una fila (revisión del Ruling 6)
- `src/lib/rentabilidad/margen.ts`: `Linea` gana `facturadoCentimos`; `sinProyecto.facturadoCentimos` = suma de líneas de factura con `proyectoId` null; `sinCliente` y `estructura` llevan 0 (una factura siempre tiene cliente). Eliminado `facturadoSinProyectoCentimos` de `Rentabilidad`. `linea()` recibe el facturado como primer argumento.
- `src/tests/rentabilidad/margen.test.ts`: aserciones de `sinCliente`/`estructura` incluyen `facturadoCentimos: 0`; el cuadre por proyecto usa `r.sinProyecto.facturadoCentimos` (y `r2.sinProyecto.facturadoCentimos` en el caso del coste impar).
- `src/app/dinero/rentabilidad/page.tsx`: `Tabla` pierde la prop `facturadoSinEje` y la fila «Sin proyecto». La fila `extraNombre` («De clientes sin proyecto» / «De proyectos sin cliente») pinta facturado (o «—» si es 0), gastos, horas, coste y margen = facturado − gastos − coste horas (en rojo si negativo). `hayActividad` también cuenta el facturado. Comentario con el porqué.

### M3 — validación del mes en `cierres.ts`
- `cerrarMes` y `reabrirMes` rechazan `mes` que no case `/^\d{4}-(0[1-9]|1[0-2])$/` con `{ ok: false, error: "El mes tiene que ser AAAA-MM." }` antes de tocar la base.
- Test en `src/tests/db/rentabilidad.test.ts`: «un mes que no es AAAA-MM se rechaza sin tocar la base», con `"2090-13"`, `"2090-3"`, `"2090-03-01"`, `"marzo"` y `""` contra las dos funciones.

### M4 — meses futuros
- `src/app/dinero/rentabilidad/page.tsx`: `esActual` → `esPasado = mes < mesActual`; «siguiente →» y `BotonCierreMes` solo si `esPasado`. Comentario explicando que con `!esActual` un mes futuro tecleado en la URL enseñaba ambos.

### Documentación
- `src/lib/db/rentabilidad.ts`: el comentario de los cortes dice que `resumen-dinero.ts` corta por día inclusivo y aquí por día exclusivo, y por qué no se unifican (uno resume caja solo con `date`; este combina `date` y `timestamptz`, y «primer día del mes siguiente a las 00:00» es el único corte que significa lo mismo para ambos).
- `MANTENIMIENTO.md`, «La rentabilidad no cuadra»: punto 5 nuevo — un mes cerrado congela el coste de la hora, NO los datos; si cambia, es alguien moviendo un gasto/factura/fichaje con fecha de ese mes.

## Comandos y salidas

```
$ npx tsc --noEmit; echo "TSC_EXIT=$?"
TSC_EXIT=0
```

```
$ npx vitest run
 Test Files  83 passed (83)
      Tests  755 passed (755)
   Start at  19:20:48
   Duration  167.68s (transform 1.01s, setup 12.85s, collect 10.83s, tests 35.27s, environment 83.43s, prepare 10.03s)
VITEST_EXIT=0
```

```
$ npm run build
├ ƒ /dinero                              2.73 kB        98.8 kB
├ ƒ /dinero/rentabilidad                 1.51 kB        97.6 kB
...
ƒ  (Dynamic)  server-rendered on demand
BUILD_EXIT=0
```

Comprobación de `!` (aserción no nula) fuera de tests sobre los ficheros tocados: sin resultados.

## Desviaciones

- Ninguna de fondo. Detalle de M1: en la fila «De clientes sin proyecto» el margen se pinta con su signo real (rojo si negativo) en vez del «−importe» fijo que tenía la línea extra, porque ahora puede ser positivo; la fila de estructura conserva el «−» porque nunca factura.
- El test de I1 no crea una factura nueva: reutiliza las tres del `beforeAll` (junio, julio, agosto) y elige los bordes de forma que compruebe a la vez el inclusivo y el exclusivo.
- Este informe no va en el commit: `.superpowers/` está en `.gitignore`.
