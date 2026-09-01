# Tarea 6 — Informe: Capa de datos con cola offline idempotente

## Qué implementé

Cuatro ficheros, siguiendo el brief paso a paso (TDD):

1. **`apps/kaizen/src/datos/mutacion.ts`** — `nuevoId()` (envuelve `Crypto.randomUUID()` de `expo-crypto`) e `insertarIdempotente(tabla, fila)` (upsert con `onConflict: 'id', ignoreDuplicates: true` contra `supabase` de la Tarea 4). Copiado verbatim del brief.
2. **`apps/kaizen/src/datos/cliente-consultas.ts`** — `crearClienteConsultas()` (QueryClient con `networkMode: 'offlineFirst'` en mutaciones) y `persistidor` (AsyncStoragePersister), más el `onlineManager` conectado a NetInfo. Copiado verbatim del brief.
3. **`apps/kaizen/src/datos/mutacion.test.ts`** — unitario de `nuevoId()`. Las aserciones son verbatim del brief; tuve que **añadir dos `jest.mock`** que el brief no incluía (ver «Desviaciones» abajo).
4. **`apps/kaizen/pruebas/idempotencia.integracion.test.ts`** — integración: reproduce la misma mutación dos veces y comprueba un solo registro. Copiado verbatim del brief, sin cambios.

Dependencias instaladas con `npx expo install`: `@tanstack/react-query@^5.101.4`, `@tanstack/react-query-persist-client@^5.101.4`, `@tanstack/query-async-storage-persister@^5.101.4`, `@react-native-community/netinfo@12.0.1`. Verificado con `git diff package.json` que **no tocó** `jest`, `jest-expo` ni `@testing-library/react-native` (siguen en `^29.7.0`, `^57.0.4`, `^13.1.1`).

## Desviaciones del brief (y por qué)

El test unitario, tal cual venía en el brief, **no pasaba por un motivo de infraestructura, no de lógica**:

- `mutacion.ts` importa `./supabase`, que importa el módulo nativo de AsyncStorage. Bajo jest-expo (sin dispositivo) esa carga revienta con `NativeModule: AsyncStorage is null`. Es exactamente el mismo problema que ya resolvieron `autenticacion.test.ts` y `sesion.test.tsx`, ambos con `jest.mock('./supabase', () => ({ supabase: {...} }))`. Apliqué el mismo patrón (mock vacío, porque este test no llama a Supabase).
- Con eso resuelto, apareció un segundo problema: `Crypto.randomUUID()` devolvía `undefined`. El mock nativo autogenerado de expo-crypto (`node_modules/expo-crypto/mocks/ExpoCrypto.ts`, generado por `expo-modules-test-core`) tiene `randomUUID(): any {}` — boilerplate vacío, sin implementar. Mockeé `expo-crypto` para que `randomUUID` delegue en el `randomUUID` real de Node, el mismo patrón que `autenticacion.test.ts` ya usa para mockear `expo-apple-authentication` con lógica real en vez de aceptar el stub vacío de Expo.

No toqué el código de producción (`mutacion.ts`, `cliente-consultas.ts`) ni el test de integración: son verbatim. La única desviación es añadir dos `jest.mock(...)` al principio del test unitario, documentados con comentarios en el propio fichero explicando el motivo y el precedente.

## Evidencia de TDD

**Antes (falla, Cannot find module):**
```
$ npm test -- mutacion.test
FAIL src/datos/mutacion.test.ts
  ● Test suite failed to run
    Cannot find module './mutacion' from 'src/datos/mutacion.test.ts'
Tests:       0 total
```

**Intermedio (tras implementar mutacion.ts, pero antes de los dos mocks — los dos bloqueos de infraestructura reales que encontré):**
```
FAIL src/datos/mutacion.test.ts
  ● Test suite failed to run
    [@RNC/AsyncStorage]: NativeModule: AsyncStorage is null.
```
```
FAIL src/datos/mutacion.test.ts
  ● genera identificadores únicos con forma de UUID
    expect(received).toMatch(expected)
    Matcher error: received value must be a string
    Received has value: undefined
```

**Después (pasa):**
```
$ npm test -- mutacion.test
PASS src/datos/mutacion.test.ts
  √ genera identificadores únicos con forma de UUID (2 ms)
Tests:       1 passed, 1 total
```

**Suite unitaria completa:**
```
$ npm test
PASS src/datos/sesion.test.tsx
PASS src/dominio/dia.test.ts
PASS src/datos/mutacion.test.ts
PASS src/dominio/tipos.test.ts
PASS src/datos/autenticacion.test.ts
Test Suites: 5 passed, 5 total
Tests:       23 passed, 23 total
```

**Integración (contra la Supabase local, puertos desplazados, sin tocar contenedores):**
```
$ npm run test:integracion
PASS pruebas/rls-todas-las-tablas.integracion.test.ts
PASS pruebas/idempotencia.integracion.test.ts
PASS pruebas/aislamiento.integracion.test.ts
Test Suites: 3 passed, 3 total
Tests:       9 passed, 9 total
```

**TypeScript estricto:**
```
$ npx tsc --noEmit
(sin salida — limpio)
```

## Autorrevisión pedida

### 1. `ignoreDuplicates: true` — ¿puede enmascarar un fallo distinto?

**Sí, y lo comprobé ejecutando, no solo razonando.** Escribí un test temporal (no comiteado, borrado antes del `git add`) que hace dos upserts con el **mismo `id`** pero **contenido distinto** (`ml: 100` y luego `ml: 999`):

```
error primera: null
error segunda: null
filas resultantes: [{"id":"...","ml":100,...}]
```

Resultado: **ambos upserts devuelven `error: null`**, y el segundo valor (`ml: 999`) desaparece silenciosamente — la fila final conserva `ml: 100`. `ON CONFLICT (id) DO NOTHING` no distingue "esto ya lo mandé y se perdió la respuesta" de "dos registros distintos comparten id por un bug". Si algún día una parte del código reutilizara un `id` por error (por ejemplo: clonar un objeto de la cola sin regenerar el `id`, un bug de serialización en la persistencia que duplique una entrada con contenido editado, o reintentar manualmente un envío con datos nuevos sin darse cuenta de que el `id` viejo viaja con él), el segundo dato se perdería **sin ningún error visible**, ni en el cliente ni en Supabase. La app pensaría que todo fue bien.

Dado que `nuevoId()` usa `Crypto.randomUUID()` (UUIDv4 criptográficamente aleatorio), la probabilidad de colisión genuina entre dos mutaciones distintas es astronómicamente baja — el diseño es sólido para su propósito real (reintentos idempotentes de la MISMA mutación). El riesgo real no es la colisión aleatoria, es el **mal uso del `id`** (reutilizarlo entre mutaciones que deberían ser distintas). Ningún test de esta tarea cubre esto, y el brief no lo pide; lo señalo como riesgo conocido y aceptado, no como algo que haya corregido — corregirlo (por ejemplo comparando contenido antes de descartar) se sale del alcance de "copiar verbatim" de esta tarea.

### 2. ¿La cola sobrevive a que la app se cierre?

**No puedo demostrarlo con un test, y tras revisar el código instalado tengo evidencia de que hoy NO sobrevive.** Esto es lo que encontré, no lo que asumí:

- Inspeccioné `node_modules/@tanstack/query-core/build/modern/hydration.js` (versión instalada `5.101.4`): `defaultShouldDehydrateMutation(mutation) { return mutation.state.isPaused }`. Es decir, `dehydrate()` sí contempla persistir mutaciones pausadas por defecto — pero solo si `dehydrate()`/`persistQueryClient()` llega a ejecutarse sobre el `QueryClient` en algún momento.
- Busqué en todo `apps/kaizen/src` cualquier uso de `PersistQueryClientProvider`, `persistQueryClient(...)`, `resumePausedMutations()` o `setMutationDefaults(...)`: **no existe ninguno**. `crearClienteConsultas()` y `persistidor` están exportados pero **nada los conecta todavía**.
- Revisé `apps/kaizen/App.tsx`: sigue siendo el boilerplate por defecto de Expo (`<Text>Open up App.tsx...</Text>`). No hay `app/` (expo-router) con `_layout.tsx` que envuelva la app en un provider de queries.

Con el estado actual del repo, aunque llegase una mutación offline y se guardase en memoria como "pausada", **al matar el proceso de la app se pierde**: nadie ha llamado a `persistQueryClient`/renderizado `PersistQueryClientProvider` para escribirla en AsyncStorage, y aunque se escribiera, al reabrir nadie llama a `resumePausedMutations()` ni registra `setMutationDefaults()` (necesario porque las funciones de mutación no son serializables — solo sus argumentos lo son). No es un fallo de esta tarea: la lista "Produce" del brief solo pide `crearClienteConsultas()` y `persistidor` como piezas — el ensamblaje en la raíz de la app y el registro de `mutationFn` por dominio son, razonablemente, trabajo de una tarea posterior (probablemente cuando existan mutaciones de dominio reales como "registrar agua"). Lo dejo explícito para que no se dé por hecho que "cola offline" ya funciona de punta a punta.

### Completitud, tests y salida

- Completo según el brief: los cuatro ficheros existen con el contenido pedido (con las dos líneas de mock añadidas y documentadas en el test unitario).
- Los tests verifican comportamiento real: el unitario prueba forma UUID + unicidad de verdad (delegando en el `randomUUID` real de Node, no un stub que devuelva siempre el mismo valor); el de integración prueba contra Postgres real (Supabase local) que dos upserts idénticos no duplican fila.
- Salida limpia: `npm test`, `npm run test:integracion` y `npx tsc --noEmit` sin warnings ni errores. El fichero de verificación temporal (`_tmp-verificacion.integracion.test.ts`) se borró antes de `git add`; `git status --short -- apps/kaizen` queda limpio tras el commit.

## Ficheros cambiados

- `apps/kaizen/src/datos/mutacion.ts` (nuevo)
- `apps/kaizen/src/datos/cliente-consultas.ts` (nuevo)
- `apps/kaizen/src/datos/mutacion.test.ts` (nuevo)
- `apps/kaizen/pruebas/idempotencia.integracion.test.ts` (nuevo)
- `apps/kaizen/package.json` (nuevas dependencias, versiones clavadas intactas)
- `apps/kaizen/package-lock.json` (lockfile actualizado)

## Preocupaciones para el revisor

1. **`ignoreDuplicates` enmascara reutilización de `id`** (detallado arriba). No corregido, por alcance de la tarea; riesgo bajo en la práctica dado UUIDv4, pero real si algún futuro bug de la cola reutiliza un `id`.
2. **La persistencia entre reinicios NO está verificada ni, hasta donde puedo comprobar, activa todavía** — falta wiring de `PersistQueryClientProvider`/`persistQueryClient`, `resumePausedMutations()` y `setMutationDefaults()` en una tarea posterior. Esta tarea entrega las piezas, no el ensamblaje.
3. Añadí dos `jest.mock` no presentes en el brief para que el test unitario cargue bajo jest-expo (ver «Desviaciones»). Ambos siguen un patrón ya establecido en el propio repo (`autenticacion.test.ts`, `sesion.test.tsx`), no es un patrón nuevo que yo inventé.

---

## Ronda de arreglos 1

El coordinador confirmó las tres preocupaciones anteriores (diagnóstico de la cola correcto y ya resuelto a nivel de plan; los dos `jest.mock` aprobados; `ignoreDuplicates` aceptado como riesgo teórico) y trasladó un hallazgo propio: **ningún test llamaba a `insertarIdempotente()`**. El test de integración reimplementaba el `upsert` a mano con su propio cliente Supabase, así que si alguien quitara `ignoreDuplicates` de la función real, el comportamiento pasaría de «descartar el segundo intento» a «sobrescribir con el segundo» sin que ningún test se pusiera rojo — el recuento de filas seguiría siendo uno y TypeScript no diría nada, porque es un valor, no una clave mal escrita.

### Qué hice

Añadí a `apps/kaizen/src/datos/mutacion.test.ts` el `describe('insertarIdempotente', ...)` del Paso 5 regenerado del brief, con sus dos tests:

- **«inserta descartando el duplicado, no sobrescribiéndolo»**: mockea `supabase.from().upsert()` y afirma la **forma exacta** de la llamada, incluidos `onConflict: 'id'` y `ignoreDuplicates: true`.
- **«convierte el error de Supabase en una excepción»**: si `upsert` devuelve `{ error: { message: ... } }`, `insertarIdempotente` debe rechazar la promesa con ese mensaje.

No toqué `mutacion.ts` ni `cliente-consultas.ts` (código de producción, aprobado, verbatim) ni el test de integración (prueba el mecanismo real de Postgres, no correspondía tocarlo).

### Desviación necesaria (y por qué)

El código del Paso 5, copiado verbatim, **no compilaba**: usaba `const upsert = jest.fn()` referenciado dentro del factory de `jest.mock('./supabase', ...)`. Babel (`babel-plugin-jest-hoist`) rechaza esto en tiempo de transformación:

```
ReferenceError: ... The module factory of `jest.mock()` is not allowed to reference any out-of-scope variables.
Invalid variable access: upsert
Note: ... variable names prefixed with `mock` (case insensitive) are permitted.
```

Renombré `upsert` → `mockUpsert` en todas sus apariciones (declaración, factory, `beforeEach`, las dos aserciones). Es un renombrado mecánico: no cambia qué comprueban los tests, solo el identificador. Documenté el motivo con un comentario en el propio fichero. También fusioné este mock de `./supabase` con el que ya existía para el test de `nuevoId()` (antes eran dos `jest.mock('./supabase', ...)` distintos en el mismo fichero, y solo el que se evalúa último sobrevive en el registro de Jest) en uno solo que expone `from().upsert()` — suficiente para ambos tests, porque `nuevoId()` no toca Supabase.

### Evidencia de que el test detecta la regresión real

Para comprobar que el test nuevo de verdad habría atrapado el defecto que describió el revisor, quité temporalmente `ignoreDuplicates: true` de `insertarIdempotente` en `mutacion.ts`, ejecuté, y lo volví a poner:

**Con `ignoreDuplicates` quitado (rojo):**
```
FAIL src/datos/mutacion.test.ts
  insertarIdempotente
    × inserta descartando el duplicado, no sobrescribiéndolo (3 ms)
    √ convierte el error de Supabase en una excepción (2 ms)

  ● insertarIdempotente › inserta descartando el duplicado, no sobrescribiéndolo
    expect(jest.fn()).toHaveBeenCalledWith(...expected)
    - Expected
    + Received
      "registros_agua",
      {"id": "abc", "ml": 250},
      Object {
    -   "ignoreDuplicates": true,
        "onConflict": "id",
      },
Tests:       1 failed, 2 passed, 3 total
```

**Con `ignoreDuplicates` restaurado (verde):**
```
PASS src/datos/mutacion.test.ts
  √ genera identificadores únicos con forma de UUID (2 ms)
  insertarIdempotente
    √ inserta descartando el duplicado, no sobrescribiéndolo (1 ms)
    √ convierte el error de Supabase en una excepción (3 ms)
Tests:       3 passed, 3 total
```

Confirmé con `git diff --stat -- apps/kaizen/src/datos/mutacion.ts apps/kaizen/src/datos/cliente-consultas.ts` que ambos ficheros quedaron sin diferencias tras revertir — el código de producción comiteado no cambió.

### Verificación final

```
$ npm test
Test Suites: 5 passed, 5 total
Tests:       25 passed, 25 total   (23 anteriores + 2 nuevos)

$ npm run test:integracion
Test Suites: 3 passed, 3 total
Tests:       9 passed, 9 total

$ npx tsc --noEmit
(sin salida — limpio)
```

Sin `any` ni `@ts-ignore` (comprobado con grep sobre el fichero modificado).

### Fichero cambiado en esta ronda

- `apps/kaizen/src/datos/mutacion.test.ts` (modificado — añadidos los dos tests de `insertarIdempotente`, renombrada la variable de mock)

### Commit

`0ed354a` — `test(kaizen): cubrir insertarIdempotente con tests que sí la llaman`. Verificado con `git diff --cached --name-only` antes de comitear: solo `apps/kaizen/src/datos/mutacion.test.ts`.

### Preocupaciones nuevas

Ninguna adicional. Las tres preocupaciones originales quedan como estaban: la del `ignoreDuplicates` (riesgo teórico, aceptado por el coordinador), la de persistencia entre reinicios (resuelta a nivel de plan, no corresponde a esta tarea) y la de los `jest.mock` originales (aprobados). El único hallazgo nuevo de esta ronda —el gap de cobertura de `insertarIdempotente`— queda cerrado con los dos tests añadidos.
