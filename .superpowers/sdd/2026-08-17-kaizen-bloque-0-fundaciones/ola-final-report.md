# Ola final de arreglos — revisión final del bloque 0 (KAIZEN)

Commit: `b635b3f` en `feature/kaizen` — `fix(kaizen): ola final de arreglos del bloque 0 (arranque, cierre de sesion, cache y mutaciones offline)`

Todos los ficheros tocados están dentro de `apps/kaizen`; verificado con `git diff --cached --name-only` antes del commit (8 ficheros, ninguno fuera de `apps/kaizen`).

## Hallazgo A (bloqueante) — la pantalla de acceso era inalcanzable sin sesión

**Archivo:** `apps/kaizen/src/app/_layout.tsx`

La rama `if (!sesion)` de `Puerta` devolvía únicamente `<Redirect href="/acceso" />`, sin ningún navegador (`Stack`/`Tabs`/`Slot`) que montara la ruta de destino.

**Cambio:** la rama ahora devuelve `<><Redirect href="/acceso" /><Slot /></>` — el `Redirect` convive con un navegador en vez de sustituirlo. Comentario en el propio código explica el porqué y referencia la reproducción.

**Evidencia de que el test nuevo puede fallar** (pedida explícitamente en el encargo): quité el `<Slot/>` (dejé `return <Redirect href="/acceso" />` a secas), corrí solo el test "sin sesión" con heap acotado (`node --max-old-space-size=768`) y timeout de test acotado (20 s) para no arriesgar un OOM real de varios GB en esta máquina. Resultado: rojo — `Unable to find an element with text: Entrar en KAIZEN`, con el árbol renderizado mostrando únicamente `<RNCSafeAreaProvider />` vacío (más varios warnings de React sobre actualizaciones de estado fuera de `act()`, coherentes con un árbol de navegación que nunca llega a resolverse). Restauré el `<Slot/>` inmediatamente después y confirmé verde de nuevo. No dejé correr el escenario hasta el OOM real de 4 GB que describió el revisor porque el objetivo (probar que el test detecta la ausencia del arreglo) ya quedaba demostrado sin ese riesgo.

## Hallazgo B — no había forma de cerrar sesión

**Archivo:** `apps/kaizen/src/features/perfil/ajustes.tsx`

Añadido botón "Cerrar sesión" con `Boton tono="secundario"` (no `peligro`, reservado para borrar cuenta), llamando a `salir()` de `datos/autenticacion.ts` — antes solo cubierta por su propio test, sin ningún punto de la UI que la invocara. Usa exclusivamente el sistema de temas existente (ningún color/radio/fuente a mano).

## Hallazgo B.1 — cerrar sesión no purgaba la caché del dispositivo

**Archivos:** `apps/kaizen/src/datos/cliente-consultas.ts`, `apps/kaizen/src/features/perfil/ajustes.tsx`, `apps/kaizen/src/features/perfil/borrar-cuenta.tsx`

Nueva función `purgarCacheLocal(clienteConsultas)` en `cliente-consultas.ts`: hace `clienteConsultas.clear()` y `await persistidor.removeClient()`. Se llama en los dos caminos:
- Ajustes → `cerrarSesion()`, tras un `salir()` exitoso.
- `borrar-cuenta.tsx` → dentro de un `finally` que envuelve el `signOut()` posterior al borrado en servidor, así que se purga tanto si `signOut()` funciona como si falla (la cuenta ya está borrada en el servidor en ambos casos).

## Hallazgo B.2 — la cola sin conexión no reproducía nada

**Archivos:** `apps/kaizen/src/datos/cliente-consultas.ts`, `apps/kaizen/src/datos/claves-mutacion.ts` (nuevo), `apps/kaizen/src/features/perfil/usar-perfil.ts`, `apps/kaizen/AGENTS.md`

Verifiqué la cadena exacta que describe el hallazgo directamente en `node_modules/@tanstack/query-core`: `hydrate()` construye la mutación rehidratada sin `mutationFn` (solo `mutationKey`, `state`, `scope`, `meta`); `defaultMutationOptions()` solo consulta `getMutationDefaults(mutationKey)` si `mutationKey` es verdadero. Sin clave, ese `if` nunca se cumple.

**Cambios:**
- `usar-perfil.ts`: la mutación de guardar ajustes ahora lleva `mutationKey: CLAVE_MUTACION_GUARDAR_PERFIL`. Su `mutationFn` inline (con `id` de sesión por closure) se mantiene para el camino en caliente.
- `cliente-consultas.ts`: `crearClienteConsultas()` registra `setMutationDefaults(CLAVE_MUTACION_GUARDAR_PERFIL, { mutationFn })` de forma síncrona al crear el cliente, antes de que `PersistQueryClientProvider` pueda rehidratar. Este `mutationFn` de respaldo no depende de ningún hook: resuelve su propia sesión vía `supabase.auth.getSession()`, porque al reanudarse tras un reinicio no hay ningún componente montado del que colgar un `id`.
- `claves-mutacion.ts` (nuevo, sin dependencias nativas): la clave vive aquí, no en `cliente-consultas.ts`, para que `usar-perfil.ts` pueda importarla sin arrastrar `AsyncStorage`/`NetInfo` a tests que no los necesitan (ver "Concesión de diseño" abajo).
- `AGENTS.md`: añadida la restricción 4 en la sección de restricciones críticas — toda mutación nueva necesita `mutationKey` + `setMutationDefaults`, con la misma explicación de la cadena.

No añadí un test de extremo a extremo (persistir → rehidratar → `resumePausedMutations()`) para este hallazgo: no estaba en la lista de tests explícitamente pedidos, y una prueba fiel habría requerido pelearse con el estado interno de pausa de `Mutation` sin garantía de que fuera menos frágil que la lectura directa del código de la librería que ya hice. Lo dejo anotado como posible hueco futuro, no como algo que decidí ignorar sin mirar.

## Concesión de diseño no pedida explícitamente

Al añadir `mutationKey` importando la constante desde `cliente-consultas.ts`, dos suites antes verdes (`usar-perfil.test.tsx`, `tema-instantaneo.test.tsx`) empezaron a fallar: el import arrastraba transitivamente `@react-native-async-storage/async-storage` y `@react-native-community/netinfo`, que revientan fuera de un dispositivo real sin mock. Lo resolví moviendo la constante a `claves-mutacion.ts` (sin efectos secundarios) en vez de añadir mocks nativos a esas dos suites — mantiene el radio de cambio más pequeño y no las acopla a una dependencia que no necesitan.

## Test nuevo obligatorio — layout raíz real

**Archivo:** `apps/kaizen/src/layout-raiz.test.tsx` (no `src/app/_layout.test.tsx`: un test con ese nombre dentro de `src/app/` se registra como ruta real de expo-router y choca literalmente con `_layout.tsx` — comprobado, ver comentario en el fichero).

Usa `renderRouter` de `expo-router/testing-library` para montar `ExpoRoot` sobre el árbol de rutas real de `src/app`. Dos tests:
- Sin sesión: llega a "Entrar en KAIZEN" (pantalla de acceso) y confirma que NO aparece "Hola" (no se cuela al armazón de pestañas).
- Con sesión: llega a "Hola" (contenido de la pestaña Hoy) y a "Nutrición" (etiqueta de la barra de pestañas), confirmando que el `Tabs` real (`(pestanas)/_layout.tsx`) se monta.

Requirió mockear `@react-native-async-storage/async-storage` y `@react-native-community/netinfo` con sus mocks oficiales (`.../jest/async-storage-mock`, `.../jest/netinfo-mock`) — ningún test anterior montaba `_layout.tsx`, así que nadie los necesitaba antes.

## Cifras finales

- Unitarios: **47 tests en 11 suites** (partía de 45/10; +1 suite nueva, +2 tests).
- Integración: **16 tests en 4 suites** (sin cambios; no toqué nada de lado servidor/RLS).
- `npx tsc --noEmit`: limpio.
- No se recreó `supabase_db_kaizen`; se usó la pila ya levantada. `supabase_db_atlas` no se tocó.

## Preocupaciones

1. **Warning "A worker process has failed to exit gracefully"** al final de `npm test`: confirmado **preexistente** — reproduje el suite completo excluyendo mi test nuevo (`--testPathIgnorePatterns ... "layout-raiz"`) sobre la línea base de 45/10 y el warning ya aparecía. No es una regresión introducida por esta ola; no lo investigué a fondo por estar fuera del alcance del encargo, pero lo dejo anotado por si se vuelve molesto en CI.
2. **`purgarCacheLocal` sin test dedicado**: la cobertura de que efectivamente se llama viene indirectamente de que `tsc`/el suite completo compilan y pasan con la nueva firma `useQueryClient()` cableada en ambas pantallas, pero no hay un test unitario que verifique explícitamente `clear()` + `removeClient()` en el flujo de cerrar sesión ni en el de borrar cuenta. No estaba en la lista de tests pedidos explícitamente; lo señalo porque es la pieza más "silenciosa" de esta ola (un fallo aquí no rompe ningún test existente, solo deja datos en el disco).
3. **Mutación de respaldo B.2 sin test directo**: expliqué arriba por qué no escribí un test de persistencia/rehidratación real. La verificación que sí hice fue leer el código fuente de `@tanstack/query-core` instalado (`hydrate.js`, `queryClient.js`, `mutationCache.js`, `mutationObserver.js`) para confirmar la cadena exacta antes de decidir el arreglo, pero no hay una prueba automatizada que la proteja de una regresión futura en este mismo repo.

---

## Re-revisión — segunda ronda (commit `a1d4671`)

La re-revisión dio por buenos los cuatro arreglos originales (47/11 verde, `tsc` limpio, app abierta, purga en los dos caminos, orden de `setMutationDefaults` antes de la rehidratación confirmado leyendo `@tanstack/query-core`) y encontró dos bloqueantes más — uno de ellos una regresión introducida por esta misma ola — y tres arreglos baratos. Los cinco están resueltos.

### Bloqueante 1 (regresión de esta ola) — el respaldo podía escribir sobre la sesión equivocada

**Archivos:** `apps/kaizen/src/datos/cliente-consultas.ts`, `apps/kaizen/src/features/perfil/usar-perfil.ts`

El `mutationFn` de respaldo (añadido en la primera ronda para el hallazgo B.2) resolvía la fila destino con `supabase.auth.getSession()` **en el momento de reanudar**, no con la sesión que encoló la escritura. Escenario: el usuario A encola un cambio de perfil sin conexión; su sesión caduca (esa salida no pasa por `purgarCacheLocal`, que solo corre en cerrar-sesión y borrar-cuenta); entra B en el mismo dispositivo; al recuperar red, `resumePausedMutations()` reanuda la mutación de A y la escribe sobre la fila de **B**, con el token de B — RLS no lo detiene porque, desde el punto de vista de B, es una escritura legítima propia. No existía antes de esta ola.

**Arreglo:**
- `usar-perfil.ts`: las variables de la mutación pasaron de ser solo `cambios` a `{ id, cambios }`, con `id` capturado del `useSesion()` activo en el momento de encolar (`guardar` ahora hace `mutacion.mutateAsync({ id: id!, cambios })`). El `mutationFn` en caliente usa ese `id` explícito en vez de un closure implícito, pero sigue siendo el mismo camino de siempre para el guardado con sesión activa.
- `cliente-consultas.ts`: el `mutationFn` de respaldo ahora compara el `id` que viaja en las variables persistidas (el dueño que encoló el cambio) contra `idActual` de `supabase.auth.getSession()` (la sesión activa al reanudar). Si no coinciden, **aborta sin escribir** y lanza un `Error` distinguible en vez de proceder.
- **"Aborta de forma visible, no silenciosa"**: `resumePausedMutations()` traga cualquier rechazo con un `.catch(noop)` interno (confirmado en `mutationCache.js` de la librería instalada) — ninguna promesa rota de una mutación reanudada llega nunca a la UI, eso es estructural en react-query, no algo que este arreglo pueda cambiar. Lo que sí cambia: el estado de la mutación queda en `"error"` con un mensaje claro para quien la inspeccione (en vez de escribir con éxito en la cuenta equivocada), y añadí un `console.error` explícito — la única señal que sobrevive a ese `catch(noop)` hoy, dado que la app no tiene todavía ningún canal de logging/telemetría (comprobado: no hay ni un `console.*` en el resto de `src/`, así que este es el primer precedente).
- El comportamiento en caliente (con sesión activa, sin pasar nunca por pausa/reanudación) no tiene este riesgo por construcción — no hace la comprobación extra de `getSession()` porque el `id` de las variables ya viene de la sesión que está montada ahora mismo.

Confirmado con la suite completa verde y con `cliente-consultas.test.ts` (más abajo), que ejercita exactamente esta cadena de rehidratación.

### Bloqueante 2 — cerrar sesión y la purga sin ninguna línea de cobertura

**Archivo nuevo:** `apps/kaizen/src/features/perfil/ajustes.test.tsx`

Ningún test renderizaba `Ajustes` — confirmado con el listado completo de ficheros de test del repo. Un test: renderiza `Ajustes` con un `QueryClient` real (no `crearClienteConsultas()`, ver nota de proceso más abajo), pulsa "Cerrar sesión", y afirma `salir()` llamado una vez, `clienteConsultas.clear()` llamado (espiado con `jest.spyOn` sobre el cliente real del test) y `persistidor.removeClient()` llamado (espiado sobre el `persistidor` real exportado de `cliente-consultas.ts`, no un mock que duplique su lógica).

**Evidencia de que puede fallar:** desconecté el `alPulsar` del botón "Cerrar sesión" (`alPulsar={() => {}}`), corrí el test — rojo: `Expected number of calls: 1, Received number of calls: 0` sobre `mockSalir`. Restaurado y confirmado verde de nuevo.

**Nota de proceso — por qué no usa `crearClienteConsultas()` directamente:** la primera versión sí lo usaba y el test pasaba (449 ms), pero el proceso de Jest nunca terminaba al correrlo suelto (`npx jest ajustes.test.tsx` colgado más de 90 s sin salir). Causa: `crearClienteConsultas()` trae `gcTime: 24h` real (no falso); al construirse una `Mutation`, la clase `Removable` programa un `setTimeout` real de esa duración para su recolección, y `QueryClient.clear()` no lo cancela (solo vacía la caché, no llama a `destroy()` en cada mutación) — así que ese temporizador real mantiene vivo el proceso de Node indefinidamente cuando el fichero corre solo (sin el pool de workers de la suite completa, que sí mata el proceso al terminar de todos modos, y por eso `npm test` nunca mostró el problema). Arreglo: el test usa un `QueryClient` de prueba (`gcTime: 0`) para el `clear()`, pero sigue importando y espiando el `persistidor` real — es lo único con relevancia de protección de datos que hacía falta verificar.

### Barato 1 — `purgarCacheLocal` sin try/catch

**Archivos:** `apps/kaizen/src/features/perfil/ajustes.tsx`, `apps/kaizen/src/features/perfil/borrar-cuenta.tsx`

Las dos llamadas envueltas en `try/catch`. En Ajustes, si la purga falla, se libera `cerrandoSesion` (ya no se queda "Cerrando sesión…" para siempre). En `borrar-cuenta.tsx`, si falla dentro del `finally`, se libera `borrando` y se muestra un mensaje solo si no había ya un error de `signOut()` mostrado (usando la forma funcional de `setError`, para no pisar el mensaje más específico).

### Barato 2 — `navegacion.test.tsx` fuera de `src/app/`

`git mv apps/kaizen/src/app/navegacion.test.tsx apps/kaizen/src/navegacion.test.tsx` (detectado por git como rename, 88% de similitud). Import relativo corregido de `./(pestanas)/coach` a `./app/(pestanas)/coach`.

### Barato 3 — test de la igualdad de la clave de mutación

**Archivo nuevo:** `apps/kaizen/src/datos/cliente-consultas.test.ts`

Construye el cliente con `crearClienteConsultas()`, llama a `hydrate()` (de `@tanstack/react-query`) con una mutación pausada que usa `CLAVE_MUTACION_GUARDAR_PERFIL`, y afirma que la mutación reconstruida en la caché tiene `mutationFn` definido. Mismo problema de `gcTime` real que en el punto anterior — resuelto con un `afterEach` que llama a `.destroy()` en cada mutación de la caché (cancela su `gcTimeout`) antes de vaciarla, así que el fichero también sale limpio corrido suelto, no solo dentro de la suite completa.

### Cifras finales (segunda ronda)

- Unitarios: **49 tests en 13 suites** (partía de 47/11 de la primera ronda; +2 suites nuevas, +2 tests).
- Integración: **16 tests en 4 suites** (sin cambios).
- `npx tsc --noEmit`: limpio.
- Commit `a1d4671` en `feature/kaizen`, acotado a `apps/kaizen` (7 ficheros; verificado con `git diff --cached --name-status` antes de comitear).

### Preocupaciones actualizadas

- La preocupación 2 de la primera ronda ("`purgarCacheLocal` sin test dedicado") queda cerrada por `ajustes.test.tsx` para el camino de cerrar sesión. El camino de `borrar-cuenta.tsx` sigue sin test dedicado — no estaba en el encargo de esta segunda ronda tampoco, y lo señalo por la misma razón que antes: es la pieza más silenciosa.
- La preocupación 3 ("mutación de respaldo B.2 sin test directo") queda parcialmente cerrada: `cliente-consultas.test.ts` prueba que la mutación reconstruida recupera su `mutationFn`, pero no prueba el camino nuevo de esta ronda (el aborto por `id` no coincidente). No añadí ese test porque no estaba pedido explícitamente y el mecanismo ya está verificado por lectura directa del código de la mutación (`if (idActual !== id) throw ...`), pero es el hueco más específico que queda hoy en este bloque.
- El warning "A worker process has failed to exit gracefully" sigue apareciendo (preexistente, ver ronda anterior) — y esta ronda añadió una causa RELACIONADA pero DISTINTA que si afecta a corridas individuales de test (el `gcTime` real de 24h), documentada arriba y ya mitigada en los dos ficheros nuevos con `afterEach`/cliente de prueba. No la mitigué en el resto de tests existentes que usan `crearClienteConsultas()` (`layout-raiz.test.tsx` no la sufre porque usa temporizadores falsos vía `renderRouter`) porque no es una regresión de esta ronda y tocar ficheros ya verdes fuera de lo pedido no me pareció el radio de cambio correcto.
