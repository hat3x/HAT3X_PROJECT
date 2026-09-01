# SDD ledger — plan: docs/superpowers/plans/2026-08-30-atlas-2c-horas.md

Spec: docs/superpowers/specs/2026-08-29-atlas-bloque-2-economia-design.md (§4.6, §5, §6.2, §8, §10).
Rama: feature/atlas. Plan confirmado en 2bd5123. Briefs extraídos a mano (los
encabezados son «Tarea N», y `task-brief` busca «Task N»).

## Barrido previo

| Par | Produce / consume | Hallazgo |
|---|---|---|
| T1 ↔ T3 | políticas `fichajes_propios` (all, propio) y `fichajes_propietario_ve` (select) / tests: colab ve lo suyo, dueño ve a los dos, dueño no edita ajeno | coherente |
| T1 ↔ T3/T7 | FK `usuario_id … on delete restrict` / limpiezas de test y volcado | los briefs borran `fichajes` antes que el usuario; coherente |
| T2 ↔ T3 | `Tramo`, `TOPE_HORAS` / `db/fichajes.ts` los importa | coherente |
| T2 ↔ T6 | `abiertos.ts` sin imports ni Intl / copia a Deno `fichajes.ts` | coherente; `tramos.ts` importa de `abiertos.ts` pero NO se copia |
| T3 ↔ T4/T5 | `EntradaFichaje`, `EntradaTramo`, `Ok` / acciones y formularios | firmas coinciden |
| T4 ↔ T5 | `anadirFichaje` revalida `/dinero/horas` / la pantalla vive ahí | coherente |
| T6 ↔ 2B | `registrar(..., tipo)` y `notificaciones_tipo_check` / migración suelta y recrea el check | nombre confirmado por el test del 2B |
| T7 ↔ T1 | `origen='anadido'` exige `fin not null` / el volcado descarta los abiertos | coherente |

| Tarea | Consistencia interna | Hallazgo |
|---|---|---|
| T1 | 7 tests vs migración | «solo admite una en curso» limpia lo que crea; visibilidad cuenta 1/2 tras los inserts previos: correcto |
| T2 | 17 tests vs código | `abierto({inicio: AHORA-10.9h})` → floor 10 ✓; sort desc ✓ |
| T3 | 13 tests vs código | `parar` sin filas → error, no ok ✓; unión externa para proyecto invisible: PostgREST devuelve null en la relación |
| T4 | test `getByLabelText(/proyecto/i)` | el `<select>` lleva `aria-label` Y un `<span class=sr-only>` dentro del `<label>`: dos etiquetas para el mismo elemento. Ruling 1 |
| T5 | `mesEnCurso` | `hour % 24` cubre el «24» que `en-US hour12:false` da a medianoche ✓ |
| T6 | rama y candado | `abiertos!.find(...)!` con dos `!`: ruling 2 |
| T7 | `require.main === module` | depende de si `scripts/migrar` es CJS o ESM; el brief ya manda copiar la forma del resto |

Ruling 1 (T4): el `<select>` se etiqueta SOLO con `aria-label`; se quita el
`<span class="sr-only">` de dentro del `<label>` para que el elemento no tenga
dos nombres accesibles. Coste si me equivoco: ninguno funcional.

Ruling 2 (T6): en `avisarDeFichajes`, en vez de `abiertos!.find(...)!`, se
construye un `Map<id, inicio>` antes del bucle y se lee de ahí; un `!` que
miente es lo que la tarea 5 del 2B ya tuvo que quitar. Coste si me equivoco:
ninguno.

## Tarea 1
- BASE: 2bd5123
- Implementada por a0847430dc2e7e33c. Commit 0ff99d3. 7/7 dos corridas; suite 660/660.
- Tarea 1: revisión — cumplimiento ✅, calidad aprobada, 2 Menores archivados (Ruling 3: el acoplamiento de orden entre `it` es el patrón de todos los tests de esquema del repo; el nombre autogenerado del check estaba aceptado en el brief). Confirmado: FOR ALL + FOR SELECT no amplían UPDATE/DELETE al propietario.
- Tarea 1: complete (commit 0ff99d3). Suite 660/660.

## Tarea 2
- BASE: 0ff99d3
- Implementada por a70710a66615374ec. Commit db1fdbb. 17/17.
  Ruling 4: se ACEPTA la corrección del implementador en `abiertos.ts`: el brief componía «fichado en sin asignar» y el test exigía «fichado sin asignar»; el test es la especificación del texto, y la preposición pasa a formar parte de `donde`. Coste si me equivoco: ninguno.
- Tarea 2: revisión — cumplimiento ✅, calidad aprobada con 2 Menores. Ronda de arreglo 1/5 para el primero (porPersona rotula «Sin asignar» a un usuario sin nombre: pasa a «Sin nombre», con test). Ruling 5: el segundo (NaN si `inicio` no parsea) se archiva: `fichajes.inicio` es `timestamptz not null`, inalcanzable desde la base.
- Tarea 2: fix round 1/5 (commit ede2c5f, 18/18). Re-revisión en marcha.

## Tarea 3
- BASE: ede2c5f (despachada en paralelo con la re-revisión de la 2: ficheros disjuntos)
- Tarea 2: re-revisión ADDRESSED, sin roturas. complete (commits db1fdbb..ede2c5f). 18/18.
- Tarea 3: implementada por a7d614ab73e57ae39. Commit ce2081c. 13/13 dos corridas; suite 691/691. Desviación: proyectos.tipo=web-app (el check rechaza web).
- HALLAZGO del controlador: `npx tsc --noEmit` da 7 errores (TS18048/TS2532) en src/tests/horas/abiertos.test.ts y src/tests/db/fichajes.test.ts, por `noUncheckedIndexedAccess` sobre `const [x] = …` / `r[0]`. Código de MI brief. El informe de la tarea 2 dijo «tsc limpio» y no lo estaba; el de la 3 lo reportó como heredado. Ruling 6: se arregla en una ronda sobre la tarea 3 (mismo agente, un commit) usando `?.`/guardas, sin tocar código de producción. Lección para el ledger: verificar `tsc` yo mismo tras cada tarea, no fiarme del informe.
- Tarea 3: fix round 1/5 (tsc a 0; commit 7b18217).
- Tarea 3: revisión — cumplimiento ✅, calidad con 1 Importante (dos asertos de propietario en fichajes.test.ts:201/213 sin filtrar por `mios`: suponen base vacía en el rango; código de mi brief) + 1 Menor (comentario del corte por `inicio` en listarTramos). Ronda 2/5 con los dos.
- Tarea 3: fix round 2/5 (soloMios + comentario del corte; commit d1554b1). tsc verificado por mí: 0. Re-revisión en marcha.

## Tarea 4
- BASE: d1554b1 (en paralelo con la re-revisión de la 3; ficheros disjuntos)
- Tarea 3: re-revisión 3/3 ADDRESSED. complete (commits ce2081c..d1554b1). 13/13.
- Tarea 4: implementada por a1d8da256bbfcc87c; no confirmó por su protocolo de git, confirmado por el controlador como 43c2e26 (el plan lo manda y el usuario ordenó ejecutar el plan). Suite 695/695, tsc 0.
- Tarea 4: revisión en marcha.

## Tarea 5
- BASE: 43c2e26 (en paralelo con la revisión de la 4; ficheros disjuntos)
- Tarea 4: revisión — cumplimiento ✅, calidad con 2 Importantes (mt-auto sin efecto en BarraLateral; listarProyectos/listarClientes traen contratos_visibles y agregan para quedarse con id+nombre, 4 consultas de más por página) + 2 Menores (hidratación del cronómetro; dependencia del useEffect). Ronda 1/5 con los cuatro. Ruling 7: se crean `nombresDeProyectos`/`nombresDeClientes` ligeros (`select id,nombre order nombre`) en sus módulos; el marco no necesita cuotas ni contratos. Ruling 8: el cronómetro no se pinta hasta montar (`ahora` nace null), que es la única forma de que servidor y cliente pinten lo mismo.
- Tarea 5: implementada por a265c8acb51e0665e. Commit 1975441. Suite 695/695, build ok, tsc 0. Desviación: destructuración de `hoy.split` sustituida por slices (noUncheckedIndexedAccess; brief mío).
- Tarea 5: revisión — cumplimiento ✅, calidad con 1 Importante (la tabla calcula la duración sin `minutosDe`, así que un cerrado de 20 h se ve como 20 h en la fila y suma 16 h al total) + 1 Menor (el comentario de FormTramo no avisa del caso «viaje»). Ronda 1/5 con los dos. Ruling 9: la ronda corre en paralelo con la de la tarea 4 porque los ficheros son disjuntos (horas/page.tsx y FormTramo vs marco/*, layout, proyectos.ts, clientes.ts); si hubiera conflicto, git lo diría al confirmar.
- Tarea 4: fix round 1/5 (commit 159fa80: nav flex-1, nombresDe*, cronómetro tras montar, dependencia primitiva; suite 697/697, tsc 0). Re-revisión en marcha.
- Tarea 4: re-revisión 4/4 ADDRESSED, sin roturas. complete (commits 43c2e26, 159fa80).
- Tarea 5: fix round 1/5 (commit 7d448bc; suite 697/697, tsc 0). Re-revisión en marcha.

## Tarea 6
- BASE: 7d448bc
- Tarea 5: re-revisión 2/2 ADDRESSED. complete (commits 1975441, 7d448bc).
- Tarea 6: implementada por a0d3380c066f4f7dc. Commit 8ed27e1. Suite 704/704, tsc 0. Extrajo `enviarA` con un 7.º parámetro `ahora` (un solo instante por ciclo para ultima_ok_en). Revisión en marcha.

## Tarea 7
- BASE: 8ed27e1 (en paralelo con la revisión de la 6; ficheros disjuntos)
- Tarea 7: implementada por a793b2243aaf1cb94. Commit 0504fcb. Suite 708/708, tsc 0. Volcado: 5 tramos, idempotente; los 3 slugs sin cliente (la base local solo tiene clientes demo-*). Había 2 propietarios: usó --usuario. Revisión en marcha.
- Tarea 6: revisión — cumplimiento ✅; la rama de cobro idéntica tras `enviarA`. 1 Importante (service-role-lee no cubre `proyectos`, que la rama nueva embebe) + 4 Menores (dos verdades de las 10 h sin atar; candado que se cierra aunque el envío falle, sin decirlo; resto `enviable` en cobro; «cinco copias» en docs cuando son siete). Ronda 1/5 con los cinco. Ruling 10: la migración ya aplicada no se toca; la nota que ata `interval 10 hours` a `AVISO_HORAS` va en MANTENIMIENTO junto al cron y en un comentario de `abiertos.ts` (y su copia, que el vigilante mantiene igual).
- Tarea 7: revisión — cumplimiento ✅, calidad con 2 Menores (resto de partición <1 min no pasa por MINIMO_MS; --limpiar filtra solo por nota). Ronda 1/5 con los dos. Ruling 11: el resto menor de un minuto se descarta y se cuenta —treinta segundos no son un minuto y «sin perder minutos» sigue siendo cierto—; --limpiar añade `origen = anadido`. El `!` en tests sigue el precedente mayoritario del repo: no es hallazgo.
- Tarea 6: fix round 1/5 (commit c5ad1d4; suite 709/709, tsc 0). Re-revisión en marcha.
- Tarea 6: re-revisión 5/5 ADDRESSED, sin roturas. complete (commits 8ed27e1, c5ad1d4).
- Tarea 7: fix round 1/5 (commit 3f1e081; migrar 21/21, tsc 0). Historia lineal comprobada tras las rondas en paralelo. Re-revisión y revisión final de la rama en marcha.

## Revisión final de la rama
- Rango: 2bd5123..3f1e081
- Tarea 7: re-revisión — 1 ADDRESSED, 1 NOT (falta el caso «resto de exactamente un minuto sí se inserta»). Va a la ronda final.
- Revisión final: diseño cubierto con huecos; calidad buena. 1 Crítico, 3 Importantes, 7 Menores.

Ruling 12 (C1): `parar()` sobre un abierto de más de TOPE_HORAS lo cierra en
`inicio + TOPE_HORAS` y lo marca `origen='anadido'` con nota «cerrado por
tope: el fin es reconstruido». El fin no se midió: se reconstruyó, y eso es
exactamente lo que `anadido` significa. Así deja de ser indistinguible de una
jornada honesta. Además se añade `borrarTramo` (solo filas propias, RLS lo
garantiza) con botón en la tabla de horas para las propias: borrar + añadir
con FormTramo es la corrección mínima que el aviso promete. El texto del
aviso pasa a decir la verdad («se cerrará a las 16 h y quedará marcado; si
fue menos, bórralo y añádelo bien»). Coste si me equivoco: un tope que
alguien considere agresivo; se cambia una constante.
Ruling 13 (I1): la entrada «Dinero» de la barra apunta a /dinero/horas para
quien no es propietario, y el enlace «← Dinero» de la pantalla de horas solo
se pinta al propietario. Coste: ninguno.
Ruling 14 (I2): `URL_PG` del volcado sale del entorno como los scripts
vecinos (con el local por defecto), y el README de apps/fichaje deja de
afirmar que el histórico «está volcado»: dice cómo volcarlo. El volcado
contra producción es parte del despliegue, que el usuario ha dejado para
después. Coste: ninguno.
Ruling 15 (I3, móvil): SE APARCA. La columna fija `w-56` es anterior al 2C;
el usuario quiere un .apk, así que el marco responsive es trabajo del bloque
de despliegue/PWA, no de este plan. Puntero para entonces.
Ruling 16 (M1, solapes): SE APARCA. Comprobar solape exige consulta en
`validarTramo`, que es pura; el diseño no lo pide. Puntero para 2D si la
rentabilidad lo necesita.
M2, M3, M4, M5, M6, M7 y el caso del minuto exacto: se arreglan en la ronda.
- Ronda final de arreglos: commit d7f6d64 (ab58100fc70458a77). Suite 717/717, build ok, tsc 0. Re-revisión acotada en marcha.
- Re-revisión de la ronda final: 14/14 ADDRESSED, sin roturas. RAMA LIMPIA.
- Plan 2C completo: 2bd5123..d7f6d64, 15 commits, suite 717/717, build ok. Aparcados: I3 (marco responsive → bloque de despliegue/.apk), M1 (solapes de tramos → 2D si hace falta).
