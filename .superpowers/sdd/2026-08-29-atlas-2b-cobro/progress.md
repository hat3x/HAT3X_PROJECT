# SDD ledger — plan: docs/superpowers/plans/2026-08-29-atlas-2b-cobro.md

## Setup
- Rama feature/atlas (NO es main). BASE inicial: 29a616a.
- Supabase local levantado. Servidor de desarrollo en el 3010.
- Spec alcanzable: docs/superpowers/specs/2026-08-29-atlas-bloque-2-economia-design.md §6.1

## Barrido previo de conflictos

### Pares que comparten fichero o interfaz
| A → B | Comparten | Produce → Consume | Hallazgo |
|---|---|---|---|
| 1 → 2 | tipos de pendientes.ts | PeriodoSinFacturar / FacturaSinCobrar | limpio |
| 1 → 4 | pendientes.ts | se COPIA byte a byte a avisar/cobro.ts | limpio |
| 1 → 5 | pendientesDeCobro() | firma estable | limpio |
| 2 → 5 | leerCobro(sb, hoy) | firma estable | limpio |
| 3 → 4 | notificaciones.tipo | columna → la escribe la Edge Function | VER RULING 2 |
| 3 → 4 | cron → /avisar {"cobro":true} | cuerpo → la rama lo lee | limpio (comprobado: index.ts NO lee ya el cuerpo, así que no hay doble .json()) |
| 4 → — | repartir() | el plan supone una firma que NO existe | VER RULING 1 |
| 5 → 2A-2 | app/dinero/page.tsx | añade un segundo enlace junto al de gastos | limpio |
| 4 → 1B | copias.test.ts | añade un par vigilado | limpio |

### Coherencia interna de cada tarea
| Tarea | ¿Concuerda consigo misma? |
|---|---|
| 1 | Sí. Comprobado que el título que espera el test («Cobro: 1 sin facturar y 1 factura vencida») es el que arma la implementación. |
| 2 | Sí. `contratos!inner(clientes!inner(nombre))` es válido: contratos tiene FK a clientes. |
| 3 | NO — ver RULING 3. |
| 4 | NO — ver RULING 1. |
| 5 | Sí. |

## Rulings previos a la ejecución

Ruling 1: la tarea 4 NO puede llamar a `repartir` como dice mi plan. Comprobado
en el código: su firma real es `repartir(sb, aviso: Aviso, slugProyecto,
ahora)` — recibe un `Aviso` de incidencia y construye un enlace de silenciar
FIRMADO atado a una incidencia y a un proyecto. Nada de eso existe en un aviso
de cobro. La reutilización que suponía mi plan no es tan limpia como escribí.
Lo que sí se reutiliza son las piezas de abajo: `enviarPush` de push.ts y
`enviarCorreo` de correo.ts, que es donde de verdad está el trabajo. La rama de
cobro resuelve destinatarios, llama a esas dos, y registra. Coste si me
equivoco: unas líneas más en la Edge Function de las que preveía el plan;
ninguna duplicación de la lógica de envío, que era el motivo de reutilizar.

Ruling 2: `registrar(sb, usuarioId, incidenciaId: string, canal, ok, error)`
exige un `incidenciaId` que un aviso de cobro no tiene. Se AMPLÍA a
`string | null` y gana un parámetro `tipo` con valor por defecto
`'incidencia'`. Es aditivo: las llamadas existentes del bloque 1 no cambian ni
de forma ni de comportamiento. Descartado escribir una función de registro
aparte: dos sitios escribiendo en `notificaciones` divergen igual que dos
copias del envío. Coste si me equivoco: un parámetro opcional de más en una
función del bloque 1.

Ruling 3: el test de la tarea 3 que comprueba el check de `tipo` inserta en
`notificaciones` con un `usuario_id` inventado, y esa columna tiene clave
foránea NOT NULL contra `perfiles`. Postgres no garantiza qué restricción se
evalúa primero, así que el fallo podría ser de clave foránea y el aserto busca
/tipo/ — el test pasaría o fallaría por la razón equivocada según el día. Se
corrige creando un perfil real en el `beforeAll` y usando su id. Coste si me
equivoco: unas líneas de preparación en un fichero de test.

## Tarea 1
- Implementada por a0a38ce85aab5f151. Commit bc1156a. 10/10, suite 627.
- Revisión: spec OK. 3 Importantes + 1 Menor. Los tres Importantes son
  defectos de MI texto del plan, copiado al pie de la letra.
- Tarea 1: minor (deferred): el comparador de la ordenación nunca devuelve 0,
  así que dos facturas con la misma fecha de vencimiento no tienen orden
  estable entre sí. Efecto acotado a ese empate; no desordena fechas distintas.

Ruling 4: los dos fallos de plural SE ARREGLAN. `trozoVen` pierde el sustantivo
en plural («2 vencidas» en vez de «2 facturas vencidas») y el título combinado
usa `${nSin}` a pelo en vez de `trozoSin`, así que dice «2 sin facturar» sin
decir de qué. Los dos los escribí yo en el plan, y el único test que los
tocaba usaba 1 en ambos contadores — que es justo donde el defecto no se ve.
Es exactamente el fallo que el propio plan decía querer evitar: «un aviso que
dice 1 meses se lee como un fallo del sistema». Coste si me equivoco: ninguno,
es texto.

Ruling 5: la comparación de fechas SE NORMALIZA dentro de la función, aunque
hoy ningún llamador la rompa. Motivo: se comparan cadenas ISO, y si algún
llamador pasara `hoy` con hora —un `toISOString()` entero— la factura que vence
HOY pasaría el filtro como vencida, porque la fecha sola es prefijo estricto y
por tanto menor. Eso rompe justo el invariante que el test aísla. Los dos
llamadores previstos pasan fecha sola, así que hoy no falla; pero un contrato
documentado en un comentario y no aplicado en el código es un contrato que
alguien romperá. Coste si me equivoco: dos `slice(0, 10)` de más.
- Tarea 1: fix round 1/5 (3 addressed, 0 open — plurales x2, normalizar fecha; commits bc1156a..7650fce)
- Tarea 1: complete (commits 29a616a..7650fce, review clean). 13/13, suite 630.

## Tarea 2
- BASE: 7650fce
- Implementada por a83377825ea633ff5. Commit 468aa6c. 8/8, dos corridas.

Ruling 6: se ACEPTA la desviación del implementador. Mi plan hacía la consulta
contra la tabla `contratos`, y eso da «permission denied»: la migración de RLS
del bloque 1 revoca su lectura a `authenticated`, incluso al propietario, y
toda la aplicación lee la vista `contratos_visibles`. Es una regla que el
repositorio ya tiene documentada con comentarios en clientes.ts, proyectos.ts y
resumen.ts —«Siempre de la vista, nunca de la tabla contratos»— y que yo no
comprobé al escribir el plan. Cambió a `contratos_visibles!inner(...)`, que es
el patrón establecido. Coste si me equivoco: ninguno; la vista existe
precisamente para esto.
- Tarea 2: revisión — cumplimiento ✅, calidad aprobada con 2 hallazgos
  (Importante: faltan guardas de identificador vacío en el afterAll;
  Menor: pg.end() suelto en vez de en un finally). Ronda de arreglo 1/5.
- Tarea 2: fix round 1/5 (2 addressed, 0 open — guardas de id vacío, finally
  del pg.end(); commit a93de63). Re-revisión limpia, sin roturas nuevas.
- Tarea 2: complete (commits 468aa6c..a93de63, revisión limpia). 8/8, dos corridas.

## Tarea 3
- BASE: a93de63
- Implementada por afde3080e74f873ed. Commit 0d7cd00. Suite 642/642.
- Tarea 3: revisión — cumplimiento ✅, calidad aprobada. Dos Menores, ambos archivados.

Ruling 7: el Menor 1 —falta el comentario que documenta que `cron.schedule`
reemplaza el trabajo si el nombre ya existe, como sí lo documentan las tres
migraciones anteriores— NO se arregla. Añadirlo obligaría a editar una
migración ya aplicada, que es una restricción global absoluta de este
proyecto, y lo único que se gana es coherencia de estilo: el comportamiento
ya es correcto e idempotente. Coste si me equivoco: alguien lee esa migración
y duda de si reaplicarla duplica el cron; lo resuelve mirando la de al lado.

Ruling 8: el Menor 2 —el índice parcial `notificaciones_cobro_del_dia` no
tiene test que ejerza la consulta que dice servir— se archiva hasta la
tarea 4, que es la que hace esa consulta. Cubrirlo aquí exigiría escribir
en el test la consulta que aún no existe, y dos copias de una consulta
divergen. Puntero para la tarea 4.
- Tarea 3: complete (commit 0d7cd00, revisión limpia). Suite 642/642.

## Tarea 4
- BASE: 0d7cd00

Ruling 9: la consulta de la Edge Function debe escribirse IGUAL que la de
`src/lib/db/cobro.ts` de la tarea 2 —contra `contratos_visibles`, no contra
`contratos`—. El brief la escribió contra la tabla, y aunque el rol de
servicio quizá sí pueda leerla, dos consultas que tienen que devolver lo
mismo escritas de dos maneras acaban devolviendo cosas distintas: el aviso
diario y la pantalla dirían números que no cuadran y nadie sabría cuál
creer. Coste si me equivoco: ninguno; la vista no filtra nada para quien
llega hasta ahí.
- Implementada por a01f9d3a7b6156e22. Commit 7e6899d. Suite 645/645.
- Tarea 4: revisión — cumplimiento ✅, calidad con 1 Importante + 3 Menores.
  Ronda de arreglo 1/5: se arreglan el Importante (`ultima_ok_en` sin tocar
  tras un push correcto) y el Menor del error ignorado en el candado del día.

Ruling 10: el candado del día que ignora el error de su propia consulta se
arregla FALLANDO CERRADO y contándolo: si la consulta falla no se envía a ese
propietario, y el fallo sale en la respuesta. Enviar igual convertiría el
candado en decorativo justo el día que hace falta; callar el fallo haría que
un candado roto se pareciera a un día sin nada pendiente. Coste si me
equivoco: un aviso perdido en un día con la base tocada, visible en la
respuesta del cron.

Ruling 11: el Menor «no hay test que ejercite la rama de la Edge Function» se
archiva. `supabase/functions` está fuera de vitest y de tsconfig por diseño de
la copia-no-importa, y la rama de incidencias tampoco lo tiene. Cubrirlo es un
cambio de infraestructura de pruebas, no una tarea de este bloque. Coste si me
equivoco: un fallo de integración en Deno que solo se ve en producción.

Ruling 12: el Menor «el informe da a entender que `tsc` cubre la Edge
Function» se corrige en el informe, no en el código. `tsconfig.json` excluye
`supabase/functions` desde antes de este bloque.

Ruling 13 (para la tarea 5): la pantalla del brief usa `f.fechaVencimiento!`
dos veces, y ese campo es `string | null`. La aserción compila pero miente: si
alguna vencida llegara con la fecha nula, `diasDeRetraso` devolvería NaN y la
pantalla enseñaría «NaN días». Hoy no pasa porque el propio filtro de
`pendientesDeCobro` excluye las nulas — así que la forma honesta es que el
TIPO diga lo que la función ya garantiza: `vencidas` pasa a ser
`(FacturaSinCobrar & { fechaVencimiento: string })[]`, y las dos aserciones
desaparecen. Cambia `src/lib/cobro/pendientes.ts`, y por tanto también su
copia byte a byte en la Edge Function; el vigilante de copias lo mantiene
honesto. Coste si me equivoco: un fichero más en el diff de la tarea 5.
- Tarea 4: fix round 1/5 (2 addressed, 0 open — ultima_ok_en con la misma
  condición de éxito que `repartir`; candado que falla cerrado y devuelve
  `noComprobados`; commit 8b1e7ce). Re-revisión limpia, sin roturas nuevas.
- Tarea 4: complete (commits 7e6899d..8b1e7ce, revisión limpia). Suite 645/645.

## Tarea 5
- BASE: 8b1e7ce
- Implementada por abb9cff2b6bdbe008. Commit 4312c6c. Suite 645/645, build ok.
  Nota: el despacho anterior (rechazado por el usuario al cambiar de modelo)
  había dejado los cuatro ficheros modificados sin confirmar; el implementador
  los revisó contra el brief y las restricciones antes de confirmarlos.
- Tarea 5: revisión — cumplimiento ✅, calidad aprobada con 3 Menores. Ronda de
  arreglo 1/5 con los tres: `hoy.slice(0,10)` en `diasDeRetraso` (la misma
  defensa que ya tiene `pendientesDeCobro`; una asimetría entre dos sitios que
  reciben lo mismo es la que acaba mordiendo), alias `FacturaVencida` para el
  tipo estrechado que se escribía dos veces a mano, y comparador de tres vías
  en el `.sort` (preexistente, pero se tocó la línea). Coste si me equivoco:
  un commit pequeño de más.
- Tarea 5: fix round 1/5 (3 addressed, 0 open — slice en diasDeRetraso, alias
  FacturaVencida, sort de tres vías; commit db0f4fc). Re-revisión limpia.
- Tarea 5: complete (commits 4312c6c..db0f4fc, revisión limpia). Suite 645/645.

## Revisión final de la rama
- Rango: 29a616a..db0f4fc
- Revisión final: §6.1 cubierto en el papel con un hueco real. 1 Crítico,
  3 Importantes, 4 Menores. Verificado contra la base local antes de decidir:
  `set local role service_role; select from contratos_visibles` →
  «permission denied for view». Las tablas base (`contratos`,
  `periodos_contrato`, `facturas`, `clientes`, `perfiles`) sí se leen.

Ruling 14 — REVOCA el Ruling 9. La vista `contratos_visibles` filtra por
`auth.uid()` y solo tiene grant para `authenticated`; la Edge Function
llama con la service_role, que no tiene ni lo uno ni lo otro. La consulta de
la Edge Function vuelve a `contratos!inner`, como decía el plan original. La
uniformidad que buscaba el Ruling 9 se conserva en lo que importa —mismos
filtros, mismas exclusiones, mismo corte del mes, mismo orden— y no en el
nombre de la relación, que depende de quién llama. Y se añade un test de
esquema que pruebe con `set local role service_role` que las tablas que la
Edge Function necesita se leen: es lo que habría cazado esto. Coste si me
equivoco: ninguno visible; el test lo diría.

Ruling 15 — amplía el Ruling 10: «fallar cerrado y contarlo» se aplica también
a las tres consultas que alimentan la decisión (`per`, `fac`, `perfiles`). Un
error ahí convertido en lista vacía es exactamente lo que hizo silencioso al
Crítico: la respuesta decía «nada pendiente» cuando lo que había era un
permiso denegado.

Ruling 16 — la fecha «hoy» de la Edge Function pasa a calcularse en Madrid con
`Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" })` (Deno lo
soporta; `pendientes.ts` sigue sin Intl porque el cálculo vive en index.ts).
Hoy no muerde porque el cron corre a las 9:07 UTC y ese instante es el mismo
día civil en Madrid, pero una invocación manual entre las 00:00 y las 02:00
de Madrid haría desaparecer el mes recién cerrado el día 1. Eliminar la
asimetría cuesta tres líneas; documentarla costaría explicarla para siempre.

Ruling 17 — la hora del cron NO cambia. pg_cron corre en UTC, así que las
9:07 son las 10:07/11:07 de Madrid: sigue siendo la mañana, que es lo que
pedía el plan. Cambiarla exigiría otra migración por un motivo estético. Lo
que sí se corrige es la mentira: el comentario de la migración no se puede
editar (aplicada), así que la verdad va a MANTENIMIENTO.md junto con el cron
y la ruta nueva de `avisar`, que ningún documento conocía (Importante 3).

Ruling 18 — Menor 7 descartado: `/dinero` ya usa `estado = 'emitida'`
(resumen-dinero.ts:45), así que las dos pantallas cuentan lo mismo. Menor 5
confirma que el orden de crons del día 1 es correcto; sin cambio. Menores 6
(el push abre la raíz en vez de /dinero/cobro) y 8 (aserciones del test de
propietario sin filtrar por id, vulnerables a restos de otra corrida) se
arreglan en la misma ronda: baratos y en la zona que ya se toca.
- Ronda final de arreglos: commit 68e080f (a24cf16cd1f93dc0a). Suite 653/653.
  Verificado por PostgREST con service_role: contratos → 200, la vista → 403.
  Pendiente: re-revisión acotada.
- Re-revisión de la ronda final: 6/6 ADDRESSED, sin roturas. RAMA LIMPIA.
- Plan 2B completo: 29a616a..68e080f, 10 commits, suite 653/653.
  (Taller conservado: un hook del proyecto bloquea el borrado; es git-ignored.)
