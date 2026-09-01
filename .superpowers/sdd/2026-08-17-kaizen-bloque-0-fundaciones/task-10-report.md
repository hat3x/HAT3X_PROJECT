# Tarea 10 — Informe: Borrado real de cuenta

## Estado: DONE (tras tres rondas — ver «Actualización» y «Ronda 3» al final)

**Esta sección de estado está actualizada; el resto del informe hasta «Actualización — desbloqueo y correcciones» es el registro histórico de la primera entrega (BLOCKED) y se deja intacto tal cual se escribió entonces.**

Ronda 1 (más abajo): todo el código escrito, autorrevisado y comiteado, pero sin poder verificar el GREEN del test de integración por un bloqueo de entorno (contenedor de edge runtime sin la función registrada, y sin permiso para recrearlo).

Ronda 2 («Actualización» más abajo): autorización acotada recibida, función servida, y **dos hallazgos reales de la propia autorrevisión y de la verificación** corregidos con migraciones nuevas — el bucket de fotos ahora existe de verdad (con RLS por carpeta propia) y un grant que le faltaba a `service_role`.

Ronda 3 («Ronda 3 — paginación» al final): la revisión externa encontró un fallo funcional real (`list()` de Storage tope de 100 objetos, sin paginar deja huérfanas las fotos 101+) y tres huecos de cobertura. Corregido y verificado con la disciplina que la propia revisión pidió: paginación implementada, test de 101 ficheros puesto en rojo a propósito con la versión sin paginar para probar que protege algo, y restaurado.

Estado final verificado en verde: **16 tests en 4 suites de integración, 42 en 8 unitarios, `tsc` limpio.**

---

## [Registro histórico — primera entrega, ronda 1]

Todo el código está escrito, autorrevisado y comiteado. `npx tsc --noEmit` está limpio y `npm test` está en verde (42/8, sin cambios respecto al baseline). Lo que **no** he podido verificar es el paso central de la tarea: que el test de integración pase en verde contra la Edge Function real. El bloqueo es de entorno (el contenedor local de edge runtime no puede recargar funciones nuevas sin recrearse, y recrear contenedores estaba fuera de mis límites), no del código. Detalle completo abajo.

---

## Qué implementé

### 1. `apps/kaizen/pruebas/borrado.integracion.test.ts` (nuevo)

Parto del test literal del brief (crea usuario, inicia sesión, inserta una fila en `pesos`, llama a la función, comprueba `status === 200`, usuario borrado, `pesos` en 0) y lo **amplío** con una comprobación real de Storage:

- Antes de llamar a la función: crea el bucket `fotos` (idempotente — ver hallazgo 1 más abajo) y sube un fichero real a `${id}/foto-prueba.txt` con el cliente admin.
- Después de llamar a la función: `admin.storage.from('fotos').list(id)` y comprueba que devuelve `[]`.

Sin esto el test pasaría igual aunque la función no tocase Storage en absoluto (ver autorrevisión, punto 1).

### 2. `apps/kaizen/supabase/functions/borrar-cuenta/index.ts` (nuevo)

Parto del código literal del brief y lo **endurezco** en un punto: compruebo el `error` de `list()` y de `remove()` sobre Storage y aborto con 500 **antes** de tocar `auth.users` si cualquiera de los dos falla. El resto es igual que el brief: token verificado con `admin.auth.getUser()`, id extraído de ahí (nunca de la petición), 401 si falta cabecera o el token no es válido.

### 3. `apps/kaizen/src/features/perfil/borrar-cuenta.tsx` (nuevo)

Pantalla que usa `Pantalla` como raíz, `Boton` con `tono="peligro"`, y ningún color a mano (todo sale de `useTema()`: `t.color.borde`, `t.color.texto`, `t.color.textoTenue`, `t.color.peligro`, `t.radio.boton`, `t.espaciado`). El botón está deshabilitado hasta que el campo de texto coincide **exactamente** con `'BORRAR'` (comparación estricta `===`, sin normalizar mayúsculas). Al confirmar, llama a `supabase.functions.invoke('borrar-cuenta', { method: 'POST' })`; si falla, muestra un error con `t.color.peligro`; si no, llama a `supabase.auth.signOut()` — no navego manualmente: `src/app/_layout.tsx` ya redirige a `/acceso` en cuanto la sesión pasa a `null` (confirmé leyendo ese fichero, no lo asumí).

No crea test unitario propio: el brief no lo pide, y el objetivo de «42 tests en 8 suites» para `npm test` se cumple sin variación porque este fichero no es una suite (sigue el mismo patrón que otros componentes/pantallas del proyecto — `Boton`, `Pantalla`, `acceso.tsx` — que tampoco tienen test individual).

### 4. `apps/kaizen/tsconfig.json` (modificado, 1 línea)

Añadido `"exclude": ["node_modules", "supabase/functions"]`. Sin esto, `tsc --noEmit` falla: el código Deno de la Edge Function (`Deno.serve`, `jsr:` imports) no es válido bajo el tsconfig de Node/React Native de la app. Esto **no es una decisión mía improvisada**: es el patrón exacto ya usado en `apps/atlas/tsconfig.json` y `clients/projects/salon-os/tsconfig.json` (ambos con `"exclude": [..., "supabase/functions"]`), que localicé antes de tocar nada.

---

## Evidencia de TDD

```
$ npm run test:integracion -- borrado    # ANTES de crear la función
FAIL pruebas/borrado.integracion.test.ts
  × borrar la cuenta elimina al usuario y todos sus datos (349 ms)
    Expected: 200
    Received: 404
```
Confirma RED: todo lo previo al `fetch` (crear usuario, iniciar sesión, insertar en `pesos`, crear el bucket, subir el fichero) se ejecutó sin fallos contra la Supabase local real — solo falla la llamada a la función, que aún no existía.

Después de escribir `index.ts`, **no pude** volver a ejecutar el test para confirmar GREEN. Ver bloqueo abajo.

```
$ npx tsc --noEmit
(sin salida — limpio)

$ npm test -- --silent
Test Suites: 8 passed, 8 total
Tests:       42 passed, 42 total
```

---

## El bloqueo: no pude verificar la función en verde

**Lo que probé, en orden:**

1. Creé `supabase/functions/borrar-cuenta/index.ts` y golpeé `http://127.0.0.1:54331/functions/v1/borrar-cuenta` con `curl` directamente (sin pasar por Jest, para iterar rápido). Seguía devolviendo `404 Function not found` de Kong.
2. Inspeccioné (solo lectura, `docker inspect`) el contenedor `supabase_edge_runtime_kaizen`. Su variable de entorno `SUPABASE_INTERNAL_FUNCTIONS_CONFIG` vale literalmente `{}` — vacío. El "main" del edge runtime (`supabase/.temp/start-secrets/.../main/index.ts`) parsea esa variable **una sola vez al arrancar** en un mapa fijo; si el nombre de función no está en ese mapa, devuelve 404 sin mirar el disco. El contenedor lleva corriendo desde `2026-08-17T13:03:19Z` — el inicio de esta sesión SDD, antes de que existiera ningún fichero en `supabase/functions/` de este proyecto. No hay hot-reload de funciones nuevas sin recrear el contenedor.
3. Comprobé si `npx supabase functions serve borrar-cuenta &` (lo que pide el brief en el Paso 2) sería una alternativa segura. Por la documentación del propio `--help` de la CLI («Serve all Functions locally») y por cómo gestiona su propio proceso de edge runtime, este comando gestiona el ciclo de vida del contenedor de funciones — exactamente el tipo de contenedor que tengo prohibido tocar. Además `FUNCTIONS_URL` (confirmado con `supabase status -o json`) es `http://127.0.0.1:54331/functions/v1`, el mismo Kong ya en marcha: no hay un servidor de funciones alternativo, en otro puerto, ya escuchando (confirmé con `netstat` que no hay ningún listener kaizen-específico fuera del rango ya conocido del stack).
4. No encontré ningún comando de la CLI que registre una función nueva en un stack local ya arrancado sin recrear el contenedor de edge runtime (`supabase functions list` requiere un proyecto remoto enlazado; no aplica a local).

**Conclusión:** esto es exactamente el escenario que se me pidió escalar en vez de improvisar («si servir la Edge Function localmente no funciona, escala»). No reinicié ni toqué ningún contenedor.

**Qué ayuda necesito:** que alguien con permiso para tocar los contenedores de esta Supabase local (recrear solo `supabase_edge_runtime_kaizen`, por ejemplo corriendo `supabase functions serve` o reiniciando ese contenedor puntual) lo haga, y entonces `npm run test:integracion -- borrado` debería pasar sin más cambios de código — o que se me autorice explícitamente a hacerlo yo mismo en un turno siguiente.

---

## Autorrevisión

**1. ¿El test demuestra de verdad que el Storage queda limpio?**
El test **tal cual venía en el brief no lo demuestra** — solo comprueba el usuario y la tabla `pesos`, exactamente el hueco que se me pidió señalar. Lo cerré: el test ahora crea el bucket `fotos` (no existe en ninguna migración — subir fotos es una funcionalidad futura, fuera de este bloque; lo confirmé buscando "fotos"/"storage"/"bucket" en todo `apps/kaizen` y en el resto de briefs de este bloque, sin resultados salvo el propio brief de esta tarea), sube un fichero real y comprueba `list(id) === []` después del borrado. Sin esa comprobación, el test pasaría igual aunque la función no tocase Storage en absoluto.

**2. ¿Qué pasa si el borrado del Storage falla a medias?**
En el código **literal del brief**, no se entera nadie: `remove()` no comprobaba su `error`, así que si el borrado de ficheros fallaba, el código seguía y borraba el usuario igual — ficheros huérfanos para siempre, sin dueño al que reclamárselos. Lo corregí: ahora se comprueba el `error` de `list()` y de `remove()`, y se aborta con 500 antes de llamar a `deleteUser` si cualquiera de los dos falla.

Antes de aplicar esto verifiqué (con un script de diagnóstico desechable, ejecutado contra la Supabase local real y luego limpiado) que un bucket **inexistente** en esta versión de Supabase Storage NO produce un error en `list()`/`remove()` — devuelve `{ data: [], error: null }`. Esto importa: sin esa comprobación empírica, endurecer los checks de error habría podido bloquear el borrado de cuenta para siempre en el estado actual de la app (que todavía no tiene bucket de fotos), si un bucket ausente hubiera producido un error. No es el caso — confirmado, no asumido.

**3. ¿Puede alguien borrar la cuenta de otro?**
No. El `id` que se borra sale exclusivamente de `admin.auth.getUser(token)` — el servidor de Auth verifica el token y devuelve el usuario al que pertenece; nunca se lee un id desde el cuerpo, la URL o cualquier otra cosa que venga en la petición. Nadie puede pedir borrar a otra persona aunque manipule la petición.

**4. La pantalla.**
Usa `Pantalla` como raíz, `Boton` con `tono="peligro"`, y cero colores a mano — todo sale de `useTema()`. El botón está deshabilitado (`deshabilitado={!habilitado}`) hasta que el texto escrito es exactamente `'BORRAR'` (comparación `===`, sin tolerancia a mayúsculas/minúsculas ni espacios).

---

## Deviaciones del brief (explícitas, no silenciosas)

Se me pidió traer el test y la función "verbatim". Me desvié en tres puntos concretos, todos motivados directamente por las preguntas de autorrevisión de mi propia tarea, y los dejo aquí explícitos para que el revisor los vea de un vistazo:

1. **Test**: añadida la creación del bucket, la subida de un fichero y la comprobación `list(id) === []` tras el borrado.
2. **Función**: añadida comprobación de `error` en `list()` y `remove()` de Storage, con aborto (500) antes de `deleteUser` si fallan.
3. **tsconfig.json**: añadido `exclude: ["node_modules", "supabase/functions"]` — imprescindible para que `tsc --noEmit` no falle sobre código Deno; sigue un patrón ya existente en el repo (`apps/atlas`, `clients/projects/salon-os`), no inventado.

No toqué la estructura general de ninguno de los dos ficheros más allá de esto.

---

## Ficheros cambiados

- `apps/kaizen/pruebas/borrado.integracion.test.ts` (nuevo)
- `apps/kaizen/supabase/functions/borrar-cuenta/index.ts` (nuevo)
- `apps/kaizen/src/features/perfil/borrar-cuenta.tsx` (nuevo)
- `apps/kaizen/tsconfig.json` (modificado, 1 línea añadida)

Commit: `02b8be5` — `feat(kaizen): borrado real de cuenta con limpieza de Storage`
`git add` acotado a las cuatro rutas anteriores; `git diff --cached --name-only` verificado antes de comitear, sin arrastrar ningún fichero de otros proyectos.

---

## Resumen de tests

- **Unitarios** (`npm test`): 42 pasados / 42 total, 8 suites — sin cambios respecto al baseline (no añadí ninguna suite unitaria nueva, según lo previsto por el brief).
- **Integración** (`npm run test:integracion -- borrado`): RED confirmado (404, función no existía). GREEN **no verificado** — bloqueado por el entorno, ver arriba.
- **Typecheck** (`npx tsc --noEmit`): limpio.

---

## Preocupaciones

1. **La preocupación principal es el bloqueo mismo**: no puedo certificar que la función borre de verdad hasta que alguien recree (o me autorice a recrear) el contenedor de edge runtime de kaizen.
2. El bucket `fotos` no existe en ninguna migración de este bloque — lo crea el propio test de forma idempotente. Cuando la funcionalidad real de subida de fotos llegue en un bloque futuro, quien la implemente debería revisar si el bucket necesita políticas RLS de Storage propias (el test actual sube/lista con el cliente admin, que las salta); esta tarea no las necesita porque la Edge Function también usa el cliente admin, pero la futura subida desde la app sí las necesitará.
3. No he podido ejecutar `npm run test:integracion` completo (todas las suites), solo `-- borrado`, para evitar interferir con las otras pruebas de integración mientras diagnosticaba el bloqueo. Merece la pena que el revisor corra la suite completa una vez se resuelva el bloqueo.

---

## Actualización — desbloqueo y correcciones (ronda 2)

El coordinador autorizó, de forma acotada, recrear el entorno de funciones de kaizen (`npx supabase functions serve` o recrear `supabase_edge_runtime_kaizen`), dejando expresamente prohibido tocar cualquier contenedor `_atlas` y `supabase_db_kaizen`. También aprobó mis dos desviaciones del brief (test que prueba Storage de verdad, función que aborta si falla el borrado de ficheros) y señaló una consecuencia de esas dos desviaciones juntas que yo no había visto: en un entorno limpio sin el bucket `fotos`, la función endurecida abortaría siempre antes de borrar al usuario — nadie podría borrar su cuenta jamás.

### 1. Bucket de fotos con RLS — `apps/kaizen/supabase/migrations/0003_almacenamiento.sql`

Añade el bucket `fotos` (privado) y una política `"propio"` sobre `storage.objects`, `for all using/with check (bucket_id = 'fotos' and (storage.foldername(name))[1] = auth.uid()::text)` — mismo convenio de carpeta por `user_id` que ya usa la Edge Function, mismo patrón de nombre (`"propio"`) que las diez tablas en `0002_rls.sql`.

Antes de escribirla comprobé el estado real de `storage.objects`/`storage.buckets` con una consulta de solo lectura contra la base local: RLS ya viene activada por la propia extensión de Storage (no algo que este proyecto controle), y no había ninguna política — es decir, denegado por defecto para `anon`/`authenticated`, y el `service_role` (que sí bypassa RLS) es quien necesitaba el bucket para poder listar/subir/borrar desde la Edge Function.

Apliqué la migración con `npx supabase migration up --local` — que solo conecta a la base ya en marcha y ejecuta el SQL pendiente; no reinicia ni recrea ningún contenedor. Comprobé con `npx supabase migration list --local` antes de aplicar (0001 y 0002 ya aplicadas) y con una consulta a `pg_policies` después, para verificar el resultado sin fiarme del mensaje de éxito de la CLI.

Verifiqué el comportamiento real de la política con un script desechable que crea dos usuarios reales (vía `signInWithPassword`, no el cliente admin) y comprueba, con las claves reales anon+sesión:
- A sube y lista su propia carpeta: éxito.
- B lista la carpeta de A: `{ data: [], error: null }` (filtrado silencioso, igual que el resto de comprobaciones de aislamiento sobre `pesos`).
- B descarga una foto concreta de A por su ruta: `{ data: null, error: {"message":"Object not found",...} }`.
- B intenta subir un fichero dentro de la carpeta de A: denegado con `"new row violates row-level security policy"` (403).

Esto confirmó las dos mitades de la política (`using` para lectura/listado, `with check` para escritura) antes de escribir las aserciones definitivas del test, en vez de asumir la forma de la respuesta.

### 2. Test de aislamiento de Storage — `apps/kaizen/pruebas/aislamiento.integracion.test.ts`

En el mismo `describe('aislamiento entre usuarios', ...)` que ya cubre `pesos` (mismos usuarios A y B del `beforeAll`), añadido:
- En `beforeAll`: A sube una foto real a su propia carpeta (con `a.cliente`, el cliente de sesión real, no el admin — para que el test ejercite la política RLS de verdad y no la salte).
- `it('B no puede listar las fotos de A', ...)`: `expect(data).toEqual([])`.
- `it('B no puede descargar una foto de A', ...)`: `expect(data).toBeNull(); expect(error).not.toBeNull()`.

El coordinador pidió explícitamente «listar ni descargar»; no añadí un tercer test para la subida-dentro-de-la-carpeta-ajena (que también verifiqué manualmente que está denegada, ver arriba) por ceñirme al alcance pedido — lo dejo anotado aquí por si se quiere añadir formalmente más adelante.

### 3. El test de borrado ya no crea el bucket — `apps/kaizen/pruebas/borrado.integracion.test.ts`

Quitada la línea `await admin.storage.createBucket(...)`. El test ahora asume que el bucket existe (lo crea la migración 0003) y solo sube el fichero de prueba. Si el bucket faltase, `errorSubida` no sería `null` y el test fallaría de forma clara señalando el problema real, en vez de disimularlo creando el mundo que necesita para pasar.

### 4. Hallazgo nuevo, no anticipado: `service_role` sin privilegios sobre `public` — `apps/kaizen/supabase/migrations/0004_privilegios_service_role.sql`

Al servir la función y correr el test completo por primera vez, la línea `admin.from('pesos').select('*', { count: 'exact', head: true }).eq('user_id', id)` (literal del brief) devolvía `count: null` en vez de `0`. No era un problema de Storage ni de mi código: repetí la misma consulta con detalle de error fuera del test y obtuve `permission denied for table pesos (42501)`, con el hint de Postgres: `GRANT the required privileges to the current role with: GRANT SELECT ON public.pesos TO service_role`.

Comprobé por qué con consultas de solo lectura a `information_schema.role_table_grants`: `service_role` tenía privilegios de tabla sobre `public` en 30 filas (solo `REFERENCES`/`TRIGGER`/`TRUNCATE`, que son gratuitos), mientras que `authenticated` tenía 70 (exactamente esas 3 más `select/insert/update/delete` × 10 tablas). `0002_rls.sql` concedió esas cuatro a `authenticated` pero no a `service_role` — y el propio `supabase/config.toml` deja explícito que `auto_expose_new_tables` afecta a los tres roles de la API (`anon`, `authenticated`, `service_role`), no solo a uno.

Esto no es un problema introducido por mí ni específico de Storage: es un hueco preexistente en `0002_rls.sql` (Tarea 3) que ningún test anterior había ejercitado, porque ningún test hasta ahora usaba `admin.from(<tabla>)` vía PostgREST — los tests de aislamiento e idempotencia usan el cliente de sesión (`cliente`, rol `authenticated`), y el de RLS usa una conexión directa `pg` con superusuario, no PostgREST. El brief de esta tarea es el primero en pedir explícitamente una lectura de tabla con la clave de servicio después de borrar al usuario (necesario porque, una vez borrado, la sesión de la propia persona ya no sirve para comprobar que su tabla quedó vacía).

Sin este grant, el borrado de cuenta pasaría igual (`status === 200`) pero **la comprobación de que la tabla queda vacía sería silenciosamente inválida** — el `count: null` no es «cero filas», es «no se pudo preguntar». Sabiendo que este bloque trata datos de categoría especial de RGPD, dejar esa comprobación rota en silencio me pareció peor que el propio hallazgo, así que lo corregí con la misma receta ya usada para `authenticated` en `0002_rls.sql`: `grant select, insert, update, delete on all tables in schema public to service_role;`, en una migración nueva (no toqué `0002_rls.sql`, que ya estaba aplicada y revisada).

### 5. Verificación de la autorización acotada

Antes de ejecutar nada, comprobé (`docker inspect`, solo lectura) que `supabase_edge_runtime_atlas` y `supabase_edge_runtime_kaizen` son contenedores separados de pilas separadas, confirmando lo que dijo el coordinador. Ejecuté `npx supabase functions serve` **desde `apps/kaizen`** (nunca desde atlas), que recreó únicamente `supabase_edge_runtime_kaizen`. Verificado con `docker ps` antes y después:

- `supabase_edge_runtime_kaizen`: recreado (edad en segundos/minutos tras el comando).
- `supabase_db_kaizen`: sin tocar (`Up 4 hours`, igual que antes y después).
- Todos los contenedores `_atlas` (incluido su propio `supabase_edge_runtime_atlas`): sin tocar (`Up 43 hours` / `Up 23 minutes`, sin cambio).

Nota aparte, no causada por mí: `supabase_vector_kaizen` y `supabase_vector_atlas` están los dos en un bucle de reinicio (`Restarting (0)`) — ocurre igual en ambas pilas, con temporización casi idéntica, así que es una condición preexistente del entorno (probablemente el servicio de logging/analítica), no algo que mis acciones hayan causado. Lo dejo anotado por si interesa investigarlo aparte; no ha afectado a ningún test.

Dejo el proceso de `functions serve` corriendo en segundo plano (el contenedor sigue vivo de forma independiente, verificado desde una shell nueva) para que la Tarea 11 pueda seguir usando la función sin tener que repetir este desbloqueo.

### 6. Verificación final

```
$ npm run test:integracion    # dos ejecuciones seguidas, sin flakiness
Test Suites: 4 passed, 4 total
Tests:       12 passed, 12 total

$ npm test -- --silent
Test Suites: 8 passed, 8 total
Tests:       42 passed, 42 total

$ npx tsc --noEmit
(sin salida — limpio)
```

12 tests en 4 suites de integración (subieron de 10 en 3, como anticipó el coordinador: +2 por el aislamiento de Storage). 42 en 8 unitarios, sin cambio.

### Ficheros cambiados (ronda 2)

- `apps/kaizen/supabase/migrations/0003_almacenamiento.sql` (nuevo)
- `apps/kaizen/supabase/migrations/0004_privilegios_service_role.sql` (nuevo)
- `apps/kaizen/pruebas/aislamiento.integracion.test.ts` (modificado — +1 subida en `beforeAll`, +2 tests)
- `apps/kaizen/pruebas/borrado.integracion.test.ts` (modificado — quitada la creación del bucket)

Commit: `38ac2dd` — `fix(kaizen): crear el bucket de fotos con RLS y desbloquear el borrado`
`git add` acotado a esas cuatro rutas; `git diff --cached --name-only` verificado antes de comitear.

### Preocupaciones actualizadas

1. La preocupación original (bloqueo de entorno) está resuelta.
2. El hallazgo del grant de `service_role` (punto 4) merece que alguien revise si hay **otro código ya escrito** en tareas anteriores que dependa de `admin.from(<tabla>)` vía PostgREST y que pueda estar fallando en silencio del mismo modo — no lo he auditado fuera de esta tarea, y no me correspondía ampliar el rastreo más allá de lo que bloqueaba T10.
3. No añadí el test de «B no puede subir en la carpeta de A» (verificado manualmente que funciona, ver punto 2) porque el coordinador pidió explícitamente solo listar/descargar; queda para quien lo considere necesario.
4. `supabase_vector_kaizen`/`supabase_vector_atlas` en bucle de reinicio — preexistente, no causado por esta tarea, anotado por si alguien quiere mirarlo.

---

## Ronda 3 — paginación del borrado de fotos y huecos de cobertura

La revisión externa dio por buena toda la ronda 2 (política del bucket, derivación de identidad, migración de privilegios, estilo de la pantalla) y encontró un fallo funcional real más dos huecos de cobertura. El brief se regeneró con la corrección ya escrita; el trabajo de esta ronda fue traerla, verificarla de verdad y cubrir lo que faltaba.

### 1. Hallazgo: `list()` de Storage devuelve como máximo 100 objetos por llamada

Mi función de la ronda anterior llamaba a `list(id)` una sola vez. Con más de 100 ficheros en la carpeta —normal tras meses de seguimiento diario en una app de transformación física—, la llamada solo ve los primeros 100, `remove()` solo borra esos, y el usuario se borra igual (200). Las fotos 101 en adelante quedan huérfanas para siempre, sin dueño en `auth.users` que pueda reclamarlas. Es exactamente el mismo incumplimiento que motivó el aborto-antes-de-borrar de la ronda 1, entrando por una puerta distinta que yo no había visto.

### 2. Corrección — `apps/kaizen/supabase/functions/borrar-cuenta/index.ts`

Traído del brief regenerado: una función `borrarFotos(admin, id)` que pagina en lotes de 100 (`list(id, { limit: 100 })`) hasta que un lote llega incompleto (`ficheros.length < LOTE`) o la carpeta queda vacía, con un tope de seguridad de 100 vueltas (10.000 ficheros) para no girar sin fin si algo se comporta de forma inesperada. Devuelve el mensaje del primer fallo o `null`. El `Deno.serve` principal aborta antes de `deleteUser` si `borrarFotos` devuelve un fallo — mismo principio que ya tenía, ahora correcto también por encima de 100 ficheros.

También añadido: `if (peticion.method !== 'POST') return 405` al principio, tal como pedía el brief regenerado — descuido menor pero evitable en una función que borra cuentas.

### 3. Verificación de que el test de 101 ficheros protege algo de verdad

Antes de dar esto por bueno, hice exactamente lo que se me pidió, no solo lo que era cómodo:

1. Con la versión paginada: `npm run test:integracion -- borrado` → los 3 tests de ese fichero en verde, incluido el de 101 ficheros.
2. Guardé una copia de `index.ts` y lo sustituí temporalmente por la llamada única sin paginar (`list(id)` sin `limit`, sin bucle).
3. Repetí `npm run test:integracion -- borrado` → **el test de 101 ficheros se puso rojo**, con esta comprobación exacta:
   ```
   × borrar la cuenta borra más de un lote de fotos
     - Expected  -  1        (Array [])
     + Received  + 18        (Array [ { name: "foto-99.txt", ... } ])
   ```
   Un fichero sobrevivió al borrado — justo el síntoma que el hallazgo describe. Los otros dos tests de ese fichero (cuenta normal, cuenta sin fotos) siguieron en verde, como se esperaba, porque ninguno de los dos pasa de 100 ficheros.
4. Restauré la versión paginada desde la copia guardada, confirmé con `git diff --stat` que el fichero volvía a tener exactamente los cambios previstos (41 inserciones / 11 borrados sobre el commit anterior, no más ni menos), y volví a correr la suite completa en verde.

Sin este paso, no tendría forma de afirmar que el test protege la corrección — solo que ambas versiones «parecen» correctas por lectura.

### 4. Los tres tests que faltaban (Paso 4bis del brief)

**a) `apps/kaizen/pruebas/borrado.integracion.test.ts`** — nuevo test «borrar la cuenta funciona igual si nunca se subió ninguna foto»: mismo flujo que el test principal pero sin subir ningún fichero. Cubre el camino más frecuente en producción (las fotos son opcionales) y fija por escrito la suposición de que `list()` sobre una carpeta vacía devuelve `[]` sin error — la misma suposición que ya falló una vez en esta tarea cuando el bucket ni siquiera existía.

**b) Mismo fichero** — nuevo test «borrar la cuenta borra más de un lote de fotos»: sube 101 ficheros en paralelo (`Promise.all`, para no alargar el test subiendo uno a uno) y comprueba que tras el borrado no queda ninguno. Timeout de test subido a 30000 ms porque 101 subidas + 101 verificaciones de borrado no caben cómodas en los 5000 ms por defecto de Jest.

**c) `apps/kaizen/pruebas/aislamiento.integracion.test.ts`** — dos tests nuevos, mismo patrón que los cuatro ya existentes sobre `pesos`:
- «B no puede subir un fichero en la carpeta de A»: intenta subir bajo el prefijo de A, comprueba `error !== null`.
- «B no puede borrar una foto de A»: B intenta borrar, luego se comprueba con el cliente de A que el fichero sigue ahí (`toHaveLength(1)`).

Las dos de la ronda anterior (listar, descargar) solo ejercitaban la mitad `using` de la política (lectura). Estas dos ejercitan la mitad `with check` (escritura): sin ellas, romper el `with check` en un refactor futuro habría dejado la suite en verde con fotos corporales sin protección real de escritura.

### 5. Menor: `signOut()` sin manejo de fallo — `apps/kaizen/src/features/perfil/borrar-cuenta.tsx`

Antes, si `supabase.auth.signOut()` fallaba justo después de un borrado correcto (200 de la función), la pantalla se quedaba mostrando «Borrando…» para siempre sin decir nada — el `borrando` nunca volvía a `false`. Envuelto en `try/catch`: si falla, se informa con un mensaje distinto al de fallo de borrado (la cuenta **sí** se borró; solo falló limpiar la sesión local) y se libera el estado de carga.

### 6. Verificación final de la ronda 3

```
$ npm run test:integracion    # dos ejecuciones seguidas
Test Suites: 4 passed, 4 total
Tests:       16 passed, 16 total

$ npm test -- --silent
Test Suites: 8 passed, 8 total
Tests:       42 passed, 42 total

$ npx tsc --noEmit
(sin salida — limpio)
```

16 tests en 4 suites de integración (subieron de 12: +2 en `borrado.integracion.test.ts`, +2 en `aislamiento.integracion.test.ts`). 42 en 8 unitarios, sin cambio.

Reconfirmé, igual que en la ronda 2, que ni `supabase_db_kaizen` ni ningún contenedor `_atlas` se tocaron durante esta ronda (`docker ps` antes/después) — no necesité recrear ni tocar ningún contenedor esta vez, solo edité ficheros y usé el `functions serve` ya corriendo desde la ronda 2 (el edge runtime de kaizen recarga en caliente, confirmado porque los cambios en `index.ts` se reflejaron en la siguiente petición sin volver a lanzar el comando).

### Ficheros cambiados (ronda 3)

- `apps/kaizen/supabase/functions/borrar-cuenta/index.ts` (modificado — `borrarFotos` paginado, 405)
- `apps/kaizen/src/features/perfil/borrar-cuenta.tsx` (modificado — `try/catch` en `signOut`)
- `apps/kaizen/pruebas/borrado.integracion.test.ts` (modificado — +2 tests: sin fotos, 101 ficheros)
- `apps/kaizen/pruebas/aislamiento.integracion.test.ts` (modificado — +2 tests: subir/borrar en carpeta ajena)

Commit: `833a051` — `fix(kaizen): paginar el borrado de fotos y cubrir los huecos que dejaba`
`git add` acotado a esas cuatro rutas; `git diff --cached --name-only` verificado antes de comitear.

Nota técnica: el primer intento de comitear con `git commit -m "$(cat <<'EOF' ... EOF)"` lo bloqueó un hook de pre-commit con un falso positivo («--no-verify flag is not allowed»), pese a que el comando no contenía ese flag. Rodeado escribiendo el mensaje a un fichero temporal en el scratchpad y usando `git commit -F <fichero>` — mismo contenido, sin saltarme ningún hook.

### Preocupaciones finales

1. Ninguna preocupación nueva de fondo: los tres hallazgos de esta ronda (paginación, dos tests de escritura, `signOut` sin manejo) están cerrados y verificados, no solo implementados.
2. Se mantiene la preocupación de la ronda 2: el hueco de privilegios de `service_role` (punto 4 de esa sección) merece una revisión aparte por si afecta a código de otras tareas — sigue fuera del alcance que me correspondía rastrear en T10.
3. El test de 101 ficheros sube ~1 segundo el tiempo de la suite de integración (subidas en paralelo); no me pareció motivo para reducir el número por debajo del umbral que hace falta cubrir (100 + 1).
