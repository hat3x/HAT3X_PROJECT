# Ronda final — Atlas 2B Cobro

Rama `feature/atlas`. Commit único **`68e080f`** encima de `db0f4fc` (sin enmendar). Ficheros tocados, todos en `apps/atlas/`:

- `supabase/functions/avisar/index.ts`
- `src/tests/esquema/service-role-lee.test.ts` (nuevo)
- `src/tests/db/cobro.test.ts`
- `MANTENIMIENTO.md`
- `README.md`

`src/lib/db/cobro.ts`, `supabase/functions/avisar/cobro.ts`, `src/lib/cobro/pendientes.ts` y las migraciones: sin tocar.

## Estado de partida

Al empezar, el árbol ya tenía `index.ts` modificado sin commitear con los puntos 1, 2, 3 y 4 hechos (cambio a `contratos!inner`, los tres `error` desestructurados con salida 500, `hoy` en Madrid con `Intl`, URL `/dinero/cobro`). Se revisó línea a línea contra el brief y se dio por bueno; lo que faltaba era el comentario del punto 1, que apuntaba a `aviso-cobro.test.ts` (que no comprueba nada de esto) y no explicaba «quién llama decide qué puede leer». Se reescribió apuntando al test nuevo y con esa explicación.

## Por punto

### 1 — Crítico: la vista `contratos_visibles` con la service_role

- `index.ts`: la consulta de `periodos_contrato` embebe `contratos!inner(clientes!inner(nombre))`. El comentario explica que la app pasa por la vista porque va con JWT, la Edge Function va a la tabla porque va con service_role, y que lo que tiene que ser idéntico (y lo es) son filtros, exclusiones, corte del mes y orden.
- `src/tests/esquema/service-role-lee.test.ts` (nuevo): 7 casos que hacen `begin; set local role service_role; select * from <tabla> limit 1; rollback` sobre `periodos_contrato`, `contratos`, `clientes`, `facturas`, `perfiles`, `notificaciones`, `suscripciones_push` y comprueban que no lanza; un octavo comprueba que `contratos_visibles` **sí** lanza `permission denied for view contratos_visibles`, con comentario de que eso es lo que obliga a la Edge Function a leer la tabla. Rollback en `finally` de cada caso; `pg.end()` en `afterAll`.
- Verificación adicional por PostgREST con la service_role key (la misma ruta que usa la Edge Function), tabla frente a vista:

```
== contratos
200
[]

== contratos_visibles
403
{"code":"42501","details":null,"hint":null,"message":"permission denied for view contratos_visibles"}
```

### 2 — Las tres consultas ignoraban su `error`

`per`, `fac` y `perfiles` desestructuran `error`. Si `errorPer || errorFac`, la función devuelve `{ error }` con 500 antes de calcular nada; si `errorPerfiles`, lo mismo antes del bucle de envío. Comentarios: un permiso denegado leído como lista vacía se convierte en «nada pendiente», que es exactamente lo que hizo silencioso al Crítico.

### 3 — «Hoy» en Madrid

`hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date(ahora))`. Solo en `index.ts`; `cobro.ts` sigue byte a byte igual que `pendientes.ts` (`copias.test.ts` verde). Comentario con el caso de la invocación manual entre las 00:00 y las 02:00 el día 1.

### 4 — El push abre `/dinero/cobro`

`url: ${ATLAS_URL_PUBLICA}/dinero/cobro`, con comentario.

### 5 — Aserciones del test de propietario

Desviación: el brief situaba las tres aserciones «alrededor de las líneas 846, 868, 881»; el fichero tiene 246 líneas y hay **ocho** `toEqual([])` (líneas 183-244 antes del cambio). Se cubrieron todas las de propietario: se añadió `soloMio(c)`, que filtra `periodos` por `contratoId === idContrato` y `facturas` por el conjunto de ids de `facturas WHERE cliente_id = idCliente` (consultado por `pg`, porque `FacturaSinCobrar` no lleva `clienteId`), y se envuelven con él los cinco tests de propietario que asertan vacío. Los que asertan `toHaveLength(1)` y el del colaborador (que debe ver nada de nadie por RLS, no solo nada suyo) se dejan como estaban.

### 6 — Documentación

- `MANTENIMIENTO.md`: «Las cuatro tareas —… y `atlas-cobro`—», con la nota en negrita de que **pg_cron corre en UTC** y `7 9 * * *` son las 11:07/10:07 de Madrid, y que el comentario de `20260829170000_aviso_cobro.sql` («9:07 de la mañana») no se puede corregir porque está aplicada. Sección nueva «El aviso de cobro no llega» (respuesta del cron: 500 con `error` y `noComprobados`; `ultima_ok_en`; que la Edge Function lee `contratos` y no la vista, vigilado por el test nuevo; la hora). Fila nueva en «Tareas periódicas».
- `README.md`: el diagrama tiene la tercera rama `atlas_disparar_cobro() ── pg_net ──▶ Edge Function «avisar» {"cobro": true}`. La frase «Toda lectura de contratos pasa por la vista» se matiza con la excepción de la Edge Function, porque tal como estaba contradecía el código.

## Comandos y salidas

Desviación de entorno: el brief decía «Supabase local levantado», pero Docker Desktop no estaba arrancado y la primera pasada de `npx vitest run` dio 35 ficheros en rojo, todos con `connect ECONNREFUSED 127.0.0.1:54322`. Se arrancó Docker Desktop, `npx supabase start`, y `npx supabase migration list --local` confirmó las 18 migraciones aplicadas hasta `20260829170000`.

```
$ npx tsc --noEmit
TSC_EXIT=0
```

`tsc` no cubre `supabase/functions` (`tsconfig.json` lo excluye): `index.ts` no queda tipado por este comando. Su comportamiento se comprobó por PostgREST (arriba) y a ojo.

```
$ npx vitest run
 Test Files  71 passed (71)
      Tests  653 passed (653)
   Duration  110.44s
```

`copias.test.ts` incluido en esa corrida, verde. `npm run build` no se ha ejecutado, como pedía el brief.

```
$ git log --oneline -2
68e080f fix(atlas): el aviso de cobro lee contratos, no la vista, y falla cerrado
db0f4fc fix(atlas): cobro — FacturaVencida con nombre, sort de tres vias y fecha recortada en pantalla
 5 files changed, 168 insertions(+), 26 deletions(-)
```

## Lo que no se pudo hacer

Nada quedó sin hacer. Dos notas:

- Los ficheros de trabajo van en CRLF y git los normaliza al commitear (avisos «LF will be replaced by CRLF»); el diff es solo de las líneas cambiadas.
- `.superpowers/` está en `.gitignore`, así que este informe no va en el commit.
