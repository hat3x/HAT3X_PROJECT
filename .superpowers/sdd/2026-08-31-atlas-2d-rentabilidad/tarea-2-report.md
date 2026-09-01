# Tarea 2 — El margen, aislado — Informe

## Estado
Completada. HEAD partía de `8448ef4`. Ficheros tocados: solo los de esta tarea
(`src/lib/dinero.ts`, `src/app/dinero/horas/page.tsx`, `src/tests/dinero.test.ts`,
`src/lib/rentabilidad/margen.ts` [nuevo], `src/tests/rentabilidad/margen.test.ts` [nuevo]).
No se tocó nada de la Tarea 1 en revisión paralela.

## Nota de cuadre — opción elegida
Opción 1 (la del código del brief, tal cual): `total.horasCentimos = costeDeMinutos(minutosTotal, coste)`,
es decir, se redondea UNA vez sobre la suma de minutos del total, no sumando las
filas ya redondeadas. Se documenta en el propio código: "El total se calcula
sobre los totales, no sumando filas: así el test de cuadre comprueba de verdad
que ningún eje pierde ni duplica nada." Con la fixture del test (minutos
múltiplos de 60) ambas opciones dan el mismo resultado, pero la elegida es la
que de verdad ejercita el cuadre por totales independientes, que es lo que el
test "los dos ejes cuadran con el total del negocio" pretende comprobar.

## Verificación manual de los números del brief
Con COSTE = 3000 (30 €/h):
- Biodental: facturado 35000, gastos 4830, minutos 120 → horasCentimos = round(120*3000/60) = 6000
  → margen = 35000 − 4830 − 6000 = **24170** ✓ (coincide con el brief)
- Kairos: facturado 6000, gastos 2500, minutos 60 → horasCentimos = round(60*3000/60) = 3000
  → margen = 6000 − 2500 − 3000 = **500** ✓ (coincide con el brief)
- Total: facturado 45000, gastos 10270, minutos 210 → horasTotal = round(210*3000/60) = 10500
  → margen = 45000 − 10270 − 10500 = **24230** ✓ (coincide con el brief)

No hubo que tocar ningún número de los tests: la aritmética a mano cuadra
exactamente con el código del brief tal como está.

## Paso 1 — tests que fallan (rojo)

Comando: `npx vitest run src/tests/dinero.test.ts src/tests/rentabilidad/`

Resultado antes de implementar (`src/lib/rentabilidad/margen.ts` no existía aún
y `dinero.ts` no tenía las tres funciones nuevas):

```
 ❯ src/tests/rentabilidad/margen.test.ts (0 test)
 ❯ src/tests/dinero.test.ts (16 tests | 4 failed) 8ms
   × limitesMesMadrid > agosto (CEST) empieza a las 22:00Z del 31 de julio
     → limitesMesMadrid is not a function
   × limitesMesMadrid > enero (CET) empieza a las 23:00Z del 31 de diciembre
     → limitesMesMadrid is not a function
   × limitesMesMadrid > octubre cambia de hora dentro del mes y cada frontera lleva su desfase
     → limitesMesMadrid is not a function
   × mesDe y mesVecino > recorta y se mueve, también en el cambio de año
     → mesDe is not a function

⎯⎯⎯⎯⎯⎯ Failed Suites 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/tests/rentabilidad/margen.test.ts [ src/tests/rentabilidad/margen.test.ts ]
Error: Failed to resolve import "@/lib/rentabilidad/margen" from "src/tests/rentabilidad/margen.test.ts". Does the file exist?

 Test Files  2 failed (2)
      Tests  4 failed | 12 passed (16)
```

(Los 12 tests que pasaban eran los ya existentes de `dinero.test.ts`, sin tocar.)

## Paso 3 — implementación
- `src/lib/dinero.ts`: añadidas `limitesMesMadrid`, `mesDe`, `mesVecino` tal
  como las da el brief, con sus comentarios.
- `src/app/dinero/horas/page.tsx`: import cambiado a
  `import { hoyEnMadrid, limitesMesMadrid, mesDe } from "@/lib/dinero"`, borrada
  la función privada `mesEnCurso`, y su único uso sustituido por
  `const rango = limitesMesMadrid(mesDe(hoyEnMadrid()));`. El resto de la
  pantalla no cambió.
- `src/lib/rentabilidad/margen.ts` (nuevo): tipos `FacturaMes`, `GastoMes`,
  `TramoMes`, `Linea`, `FilaMargen`, `Rentabilidad`, `costeDeMinutos` y
  `calcularMargen`, copiados del brief con sus comentarios en español.

## Paso 4 — verde

Comando: `npx vitest run src/tests/dinero.test.ts src/tests/rentabilidad/ src/tests/horas/`

```
 ✓ src/tests/rentabilidad/margen.test.ts (10 tests) 4ms
 ✓ src/tests/horas/tramos.test.ts (13 tests) 5ms
 ✓ src/tests/dinero.test.ts (16 tests) 5ms
 ✓ src/tests/horas/abiertos.test.ts (6 tests) 3ms

 Test Files  4 passed (4)
      Tests  45 passed (45)
```

Comando: `npx tsc --noEmit`

```
EXIT:0
```

Suite entera: `npx vitest run`

```
 Test Files  81 passed (81)
      Tests  736 passed (736)
   Duration  130.92s
```

Código de salida del proceso: 0.

## Desviaciones
Ninguna respecto al brief. El código de `margen.ts` y las funciones de
`dinero.ts` se implementaron literalmente como las da el brief; los tests se
copiaron literalmente, sin ningún ajuste de valores.

## Commit
Ejecutado el paso 5, encima de `8448ef4`, solo con los ficheros de esta tarea
(`src/lib/dinero.ts`, `src/lib/rentabilidad/`, `src/app/dinero/horas/page.tsx`,
`src/tests/dinero.test.ts`, `src/tests/rentabilidad/`). No se incluyó
`.claude/settings.local.json` (modificación ajena y previa a esta tarea) ni los
directorios `clients/projects/*` sin trackear (ajenos a esta tarea).

## Ronda de arreglo 1

Hallazgo de revisión: la opción de cuadre original (redondear una vez sobre
`minutosTotal`) puede diferir en 1-2 céntimos de la suma de las filas que la
pantalla enseña justo encima del total. Contraejemplo dado por la revisión:
coste 3333, dos clientes con 1 minuto cada uno → filas 56 + 56 = 112, pero
`costeDeMinutos(2, 3333)` = 111.

**Cambio aplicado en `src/lib/rentabilidad/margen.ts`:** `total.horasCentimos`
pasa a ser la suma de `horasCentimos` de `porCliente` + `sinCliente` +
`estructura` (ya no `costeDeMinutos(minutosTotal, coste)`), y
`total.margenCentimos` se recalcula con ese nuevo `horasTotal`. Se dejó el
comentario explicando el motivo (no cuadrar con lo que se ve en pantalla) y
por qué el eje de proyectos cuadra con el mismo número "por construcción": son
las mismas líneas (tramos) las que alimentan `porProyecto` + `sinProyecto` +
`estructura`, solo agrupadas por otra clave, así que mientras un cliente y sus
tramos no se repartan entre varios proyectos (o un proyecto entre varios
clientes) de forma que un eje junte lo que el otro separa, cada grupo tiene un
grupo espejo en el otro eje con los mismos minutos y el mismo redondeo por
grupo da la misma suma.

**Test añadido en `src/tests/rentabilidad/margen.test.ts`:** coste 3333,
minutos 1/7/13/1 repartidos en dos clientes (con proyecto propio cada uno),
un tramo "sin cliente" (con proyecto) y un tramo de estructura. Afirma:
- `total.horasCentimos` es exactamente 1223, y coincide con la suma de filas
  del eje de cliente (`porCliente` + `sinCliente` + `estructura`) y con la
  suma de filas del eje de proyecto (`porProyecto` + `sinProyecto` +
  `estructura`).
- Ese valor (1223) es distinto del redondeo directo del total de minutos
  (`costeDeMinutos(22, 3333)` = 1222): la prueba fija explícitamente cuál de
  las dos cifras es la buena, para que no se pueda volver a la opción
  descartada sin que un test lo note.
- `total.margenCentimos` cuadra reconstruido por los dos ejes (mismo patrón
  que el test "los dos ejes cuadran con el total del negocio" ya existente).

Verificación de la aritmética (a mano, con `costeDeMinutos(m, c) =
Math.round(m*c/60)`, coste=3333): 1 min → 56, 7 min → 389, 13 min → 722,
1 min (estructura) → 56; suma = 1223. Redondeo directo del total (22 min) → 1222.

### Comandos y resultados

`npx vitest run src/tests/rentabilidad/`:
```
 ✓ src/tests/rentabilidad/margen.test.ts (11 tests) 5ms

 Test Files  1 passed (1)
      Tests  11 passed (11)
```

`npx tsc --noEmit`:
```
EXIT:0
```

Suite ampliada de control (`npx vitest run src/tests/dinero.test.ts src/tests/rentabilidad/ src/tests/horas/`):
```
 Test Files  4 passed (4)
      Tests  46 passed (46)
```

### Commit
Encima de HEAD (`8090ff5`, avanzado por la Tarea 3 en paralelo). Solo mis dos
ficheros: `src/lib/rentabilidad/margen.ts` y
`src/tests/rentabilidad/margen.test.ts`. No se tocó nada de `ajustes/`,
`acciones-economia.ts` ni `form-economia.test.tsx`, que son de otro agente en
paralelo.
