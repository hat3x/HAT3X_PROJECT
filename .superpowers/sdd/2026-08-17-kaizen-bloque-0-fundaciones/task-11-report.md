# Tarea 11 — Informe: Perfil y ajustes

## Estado: DONE (tras ronda 1 de arreglos — ver «Ronda 1» al final)

**Esta línea de estado está actualizada; el resto del informe hasta «Ronda 1 — arreglos» es el registro histórico de la primera entrega y se deja intacto tal cual se escribió entonces.**

Entrega inicial (más abajo): todo escrito, autorrevisado y comiteado, con las cifras de aquel momento (44/9 unitarios, 16/4 integración).

Ronda 1 («Ronda 1 — arreglos» al final): la revisión encontró tres hallazgos importantes — `guardar` fallaba en silencio (sin `guardando`/`errorAlGuardar` expuestos ni mostrados), la zona horaria no se validaba en ningún sitio (asimetría con el corte de día, que sí tiene dos capas de protección), y el criterio central de la tarea (cambio de tema instantáneo) no tenía test permanente. Los tres corregidos y verificados — incluida la verificación explícita de que el nuevo test se pone rojo si se rompe la invalidación. Estado final: **45 tests, 10 suites unitarios; 16 tests, 4 suites de integración; `tsc` limpio.**

---

## [Registro histórico — primera entrega]

## Qué implementé

### 1. `apps/kaizen/src/features/perfil/usar-perfil.ts` (nuevo)

Hook `usarPerfil()` tal como especifica el brief: una `useQuery(['perfil', id])` que lee `perfiles` por RLS (sin `.eq('id', ...)` en el `select`, porque la política `"propio"` de la Tarea 3 ya filtra por `auth.uid()`), y una `useMutation` que actualiza solo los campos que cambian y, al terminar, invalida `['perfil', id]` para que la caché se refresque. Devuelve `{ perfil: Perfil | null; guardar(cambios) }`. El tipo `Perfil` incluye el nuevo campo `tema: string`.

### 2. `apps/kaizen/src/features/perfil/usar-perfil.test.tsx` (nuevo)

Los dos tests literales del brief, con una corrección obligatoria (ver "Desviaciones" más abajo).

### 3. `apps/kaizen/supabase/migrations/0005_tema_del_perfil.sql` (nuevo)

`alter table perfiles add column tema text not null default 'defecto';` — aplicada contra la pila local `_kaizen` con `npx supabase migration up --local` (nunca toqué `_atlas` ni recreé ningún contenedor).

### 4. `apps/kaizen/src/app/_layout.tsx` (modificado)

`ProveedorTemaDelPerfil` sustituye el `<ProveedorTema nombre="defecto">` fijo. Lee `usarPerfil()` y pasa `perfil?.tema ?? 'defecto'` como nombre de tema. Va dentro de `ProveedorSesion` y de `PersistQueryClientProvider` (necesita sesión y caché de consultas), envolviendo a `Puerta`.

### 5. `apps/kaizen/src/features/perfil/ajustes.tsx` (nuevo)

Pantalla con `Pantalla` como raíz y los cinco controles pedidos, todos sobre `usarPerfil().guardar` con guardado inmediato al tocar (mismo patrón que describe el brief para el tema):

- **Unidades**: dos `Boton` (métrico/imperial), `tono="primario"` en el seleccionado.
- **Zona horaria**: `TextInput` editable, sincronizado con `perfil.zona_horaria`, que guarda al perder el foco (`onBlur`) si cambió; botón "Detectar automáticamente" que rellena y guarda con `Intl.DateTimeFormat().resolvedOptions().timeZone`.
- **Corte de día**: selector horizontal de fichas 0-12 (mismo rango que exige `0001_esquema.sql`), con el texto explicativo literal del brief.
- **Hora de silencio**: selector horizontal de fichas 0-23, con su texto explicativo literal.
- **Tema**: una fila (`Ficha`) por cada clave de `TEMAS` (`defecto`, `claro`); tocarla llama a `guardar({ tema: nombre })`.
- **Borrar cuenta**: `Boton` con `tono="peligro"` que navega a `/borrar-cuenta`.

Todos los subcomponentes locales (`Seccion`, `Ficha`, `SelectorNumerico`) usan exclusivamente `Superficie`/`Texto`/`Boton` de la Tarea 8 y valores de `useTema()`.

### 6. `apps/kaizen/src/app/ajustes.tsx` y `apps/kaizen/src/app/borrar-cuenta.tsx` (nuevos, no estaban en el brief)

Rutas finas de Expo Router (`export { X as default } from '@/features/perfil/X'`) que montan las pantallas de `features/perfil`. **No las pedía la lista de "Ficheros" del brief**, pero sin ellas ni `/ajustes` ni `/borrar-cuenta` son alcanzables — exactamente el defecto que la instrucción de alcance pide cerrar explícitamente ("la pantalla de borrar cuenta existe pero está huérfana... Enlázala desde ajustes"). Verifiqué antes de crearlas que Expo Router no exige declarar cada ruta en el `<Stack>` de `_layout.tsx`: `acceso.tsx` ya funciona así (alcanzada solo por `<Redirect href="/acceso">`, sin entrada en `<Stack.Screen>`).

### 7. `apps/kaizen/src/app/(pestanas)/index.tsx` (modificado)

Añadida una fila de cabecera con un `Pressable` ("Ajustes", variante `etiqueta`) que navega a `/ajustes`. El contenido existente (saludo + texto de contexto) se movió a un `View` con `flex: 1, justifyContent: 'center'` para conservar su centrado vertical bajo la nueva cabecera.

---

## Evidencia de TDD

```
$ npm test -- usar-perfil.test        # ANTES de crear usar-perfil.ts
FAIL src/features/perfil/usar-perfil.test.tsx
  Cannot find module './usar-perfil' from 'src/features/perfil/usar-perfil.test.tsx'
```
RED confirmado, con el mensaje exacto que anticipa el brief.

```
$ npm test -- usar-perfil.test        # DESPUES de crear usar-perfil.ts
PASS src/features/perfil/usar-perfil.test.tsx
  √ carga el perfil del usuario (66 ms)
  √ guarda solo los campos que cambian (62 ms)
Test Suites: 1 passed, 1 total
Tests:       2 passed, 2 total
```
GREEN confirmado.

---

## Desviación del brief (obligatoria, no estilística)

El test literal del brief tal como está escrito **no puede ejecutarse**: la factoría de `jest.mock('@/datos/supabase', ...)` referencia la variable `update` declarada fuera de su alcance (`const update = jest.fn()...`), y el plugin de hoisting de Jest lo rechaza en tiempo de transformación:

```
ReferenceError: ...usar-perfil.test.tsx: The module factory of `jest.mock()` is
not allowed to reference any out-of-scope variables.
Invalid variable access: update
```

No es un fallo de RED esperado (el brief anticipa "Cannot find module", no un `ReferenceError` de Babel): es un bug real en el literal del brief, no descubierto hasta ejecutarlo. Lo corregí renombrando `update` → `mockUpdate` en todo el fichero (Jest permite out-of-scope si el nombre empieza por `mock`, sin distinguir mayúsculas). El resto del test es idéntico al brief. Después de este cambio, el RED sí coincide exactamente con lo que el brief anticipaba.

---

## Autorrevisión

**1. ¿El cambio de tema se ve al instante?**

Sí, verificado con una prueba ejecutada de verdad, no solo por lectura de código. Escribí un test desechable (`src/app/_verificacion-tema-instantaneo.test.tsx`, borrado antes de comitear) que reproduce el mecanismo exacto de `ProveedorTemaDelPerfil`: monta ese proveedor (con su propia llamada a `usarPerfil()`) envolviendo a un componente hermano que también llama a `usarPerfil()` y a `useTema()`. El hermano dispara `guardar({ tema: 'claro' })`; el proveedor, que observa la misma clave de caché `['perfil', 'u1']`, se refresca por `invalidateQueries` y re-renderiza `<ProveedorTema>` con el nuevo nombre — sin desmontar nada. Resultado:

```
PASS src/app/_verificacion-tema-instantaneo.test.tsx
  √ VERIFICACION: cambiar el tema se refleja sin desmontar nada (241 ms)
```

Esto es justo el mecanismo que hace que, en la pantalla real de ajustes, tocar una fila de tema actualice `useTema()` en la propia pantalla sin reiniciar la app.

**2. ¿Qué pasa con el tema antes de iniciar sesión?**

`ProveedorTemaDelPerfil` llama a `usarPerfil()`, que llama a `useSesion()`. Mientras no hay sesión, `id` es `undefined` y la `useQuery` tiene `enabled: !!id` — nunca se ejecuta, `perfil` es `null`, y `perfil?.tema ?? 'defecto'` cae a `'defecto'`. La pantalla de acceso (`/acceso`), montada por `<Redirect>` antes de que exista sesión, se ve con el tema por defecto sin ningún caso especial. No hay ninguna ruta de código que intente leer `perfil.tema` sin comprobar antes que `perfil` existe.

Nota aparte (no bloqueante): justo después de iniciar sesión, mientras la primera consulta de `perfiles` está en vuelo, hay un instante en que `perfil` sigue siendo `null` y el tema se ve como `'defecto'` — no es un fallo, es el mismo comportamiento asíncrono de cualquier pantalla que dependa de una consulta, y el brief no pide un estado de carga especial para esto.

**3. Zona horaria y corte de día — ¿se guardan y releen bien? ¿el corte respeta el rango de la base de datos?**

Verificado contra la Supabase local real (no un mock), con un segundo test desechable (`pruebas/_verificacion-desechable-ajustes.integracion.test.ts`, también borrado antes de comitear): crea un usuario, lee el perfil por defecto (`zona_horaria: 'Europe/Madrid', corte_dia: 4, hora_silencio: 22, tema: 'defecto'`), guarda `{ zona_horaria: 'America/New_York', corte_dia: 6, hora_silencio: 23, tema: 'claro' }` con el mismo patrón exacto que usa `usarPerfil().guardar` (`update(...).eq('id', id)`), relee y confirma los cuatro valores. Después intenta `corte_dia: 13` y `hora_silencio: 24`: ambos son rechazados por la base de datos (`error !== null`), y una relectura posterior confirma que los valores válidos anteriores (`6` y `23`) siguen intactos — el intento fuera de rango no dejó nada a medias. Resultado:

```
PASS pruebas/_verificacion-desechable-ajustes.integracion.test.ts
  √ guardar zona horaria, corte de dia, hora de silencio y tema
    persiste y relee (312 ms)
```

Confirmé también por consulta directa a `information_schema.columns` y `pg_constraint` que la migración 0005 añadió `tema text not null default 'defecto'` sin tocar los `check` existentes de `corte_dia` (0-12) ni `hora_silencio` (0-23).

En la pantalla, el `SelectorNumerico` de corte de día solo ofrece 0-12 y el de hora de silencio solo 0-23 (`Array.from({ length: 13/24 }, ...)`), así que la interfaz no puede siquiera proponer un valor que la base rechazaría.

**4. Literales visuales**

Grep de colores/tamaños escritos a mano (`#[0-9A-Fa-f]{3,8}`, `rgba(`, `rgb(`) en `src/features/perfil/`: **sin resultados**. Grep de `borderRadius|borderWidth|fontSize|backgroundColor|color:` en los ficheros que toqué: el único hallazgo es el objeto `campo` del `TextInput` de zona horaria —

```ts
const campo = {
  borderWidth: 1, borderColor: t.color.borde, borderRadius: t.radio.boton,
  padding: t.espaciado[2], color: t.color.texto,
}
```

`borderWidth: 1` es el único número no derivado del tema, y es un valor estructural (grosor de línea de un `TextInput` nativo, que no tiene receta en el contrato de temas), no un color/radio/fuente/fondo. El resto (`borderColor`, `borderRadius`, `padding`, `color`) sale íntegro de `t`. Este objeto es una copia literal del mismo patrón ya usado en `acceso.tsx` y `borrar-cuenta.tsx` (ambos ya revisados y aceptados en tareas anteriores), no una invención mía. Ningún otro fichero que toqué define un color, radio, fuente o fondo por su cuenta.

---

## Ficheros cambiados

- `apps/kaizen/src/features/perfil/usar-perfil.ts` (nuevo)
- `apps/kaizen/src/features/perfil/usar-perfil.test.tsx` (nuevo)
- `apps/kaizen/src/features/perfil/ajustes.tsx` (nuevo)
- `apps/kaizen/src/app/ajustes.tsx` (nuevo, no estaba en el brief — necesario para que la ruta exista)
- `apps/kaizen/src/app/borrar-cuenta.tsx` (nuevo, no estaba en el brief — necesario para enlazar la Tarea 10)
- `apps/kaizen/src/app/_layout.tsx` (modificado — `ProveedorTemaDelPerfil`)
- `apps/kaizen/src/app/(pestanas)/index.tsx` (modificado — cabecera con acceso a ajustes)
- `apps/kaizen/supabase/migrations/0005_tema_del_perfil.sql` (nuevo, aplicada localmente)

Commit: `23b3720` — `feat(kaizen): perfil y ajustes con zona horaria, corte de dia y tema`. `git add` acotado a `apps/kaizen/src/features/perfil apps/kaizen/src/app apps/kaizen/supabase/migrations`; `git diff --cached --name-only` verificado antes de comitear (exactamente los 8 ficheros de arriba, nada de otros proyectos).

Dos ficheros de verificación desechable (`src/app/_verificacion-tema-instantaneo.test.tsx` y `pruebas/_verificacion-desechable-ajustes.integracion.test.ts`) se crearon, ejecutaron en verde y se borraron **antes** de este commit — no aparecen en el diff comiteado.

---

## Resumen de tests

- **Unitarios** (`npm test`): **44 pasados / 44 total, 9 suites** (subió de 42/8: +1 suite, +2 tests, por `usar-perfil.test.tsx`).
- **Integración** (`npm run test:integracion`): **16 pasados / 16 total, 4 suites** (sin cambio respecto al baseline de la Tarea 10 — esta tarea no añade tests de integración permanentes).
- **Typecheck** (`npx tsc --noEmit`): limpio.

---

## Preocupaciones

1. **La cifra "42 en 8 suites" de la instrucción de alcance queda desactualizada por esta misma tarea.** El brief pide explícitamente un test nuevo (`usar-perfil.test.tsx`, 2 tests), así que 44/9 es el resultado correcto y esperado, no una regresión. Lo señalo por si el revisor esperaba ver 42/8 literal.
2. **Las rutas `src/app/ajustes.tsx` y `src/app/borrar-cuenta.tsx` no estaban en la lista de "Ficheros" del brief.** Las añadí porque sin ellas la instrucción de alcance ("añadir acceso a ajustes desde la cabecera", "enlázala desde ajustes") es imposible de cumplir con Expo Router (routing por convención de fichero) — no hay forma de que `router.push('/ajustes')` funcione sin un fichero en esa ruta. Lo dejo explícito por si el revisor prefiere otra convención de nombres de ruta.
3. **El selector de "Corte de día" y "Hora de silencio" es una fila horizontal de fichas numeradas (0-12 / 0-23), no un componente "Selector" dedicado.** No existe ese átomo en el inventario de la Tarea 8 (`Pantalla`, `Superficie`, `Texto`, `Boton`, `Anillo`, `Barra`), así que lo compuse localmente reutilizando `Superficie`+`Texto`+`Pressable` con los mismos tonos que ya usa `Boton` (`t.superficie.botonPrimario/botonSecundario`). Es una decisión de composición, no una desviación de tokens.
4. **La corrección del bug de hoisting en el test (`update` → `mockUpdate`) es obligatoria, no cosmética**: sin ella el test del brief no se puede ejecutar en absoluto (falla en transformación de Babel, antes de llegar a "no encuentra el módulo"). Lo señalo explícitamente porque el brief pedía traer el test "tal cual".
5. Sin preocupaciones sobre el mecanismo de tema instantáneo ni sobre el guardado/relectura de zona horaria y corte de día: ambos quedaron verificados con pruebas ejecutadas contra el sistema real (react-query compartido y Supabase local), no solo por lectura de código.

---

## Ronda 1 — arreglos

La revisión dio por buena la cadena de invalidación del tema, las dos rutas y el blindaje del corte de día — nada de eso se tocó en esta ronda. Encontró tres hallazgos importantes, cerrados uno a uno.

### 1. `guardar` ya no falla en silencio

`apps/kaizen/src/features/perfil/usar-perfil.ts`: `usarPerfil()` devuelve ahora también `guardando: mutacion.isPending` y `errorAlGuardar` (mensaje fijo si `mutacion.isError`, `null` en caso contrario). Es literalmente el bloque que trae el brief regenerado, sin cambios.

`apps/kaizen/src/features/perfil/ajustes.tsx`:
- Un `Texto` con `color: t.color.peligro` muestra `errorAlGuardar` justo debajo del título, cuando existe.
- Los ocho puntos de guardado (dos de unidades, el de zona horaria vía `TextInput`/`editable`, el botón «Detectar automáticamente», los dos `SelectorNumerico` de corte de día y hora de silencio, y las filas de tema) quedan deshabilitados mientras `guardando` es `true`. Añadí `deshabilitado` a `Ficha` y `SelectorNumerico` (antes no lo tenían) siguiendo el mismo patrón que ya usa `Boton` (`opacity: 0.5` + `disabled`).
- Como `guardando` sale de una única instancia de `useMutation` compartida por todo el hook, un guardado en curso de un control bloquea a los demás — cierra el toque concurrente que señalaba el hallazgo sin lógica adicional.

### 2. Zona horaria validada con el mismo mecanismo que la consume

`esZonaValida()` en `ajustes.tsx`, literal del brief regenerado (`new Intl.DateTimeFormat('en-CA', { timeZone: valor })` dentro de un `try/catch`). `confirmarZonaHoraria()` la llama antes de guardar: si no es válida, fija `errorZona` (mostrado en rojo bajo el campo) y **no llama a `guardar`**. `alCambiarZonaHoraria()` limpia ese error en cuanto la persona vuelve a teclear, para que no quede un aviso obsoleto pegado a un valor ya distinto. `detectarZonaHoraria()` no valida (el valor sale de `Intl` en este mismo dispositivo, así que ya es válido por construcción) pero sí limpia `errorZona` por si había uno pendiente.

Prueba manual de que la validación corta de verdad el guardado (no solo el aviso): con `esZonaValida` devolviendo `false` para `'Europ/Madrid'`, `confirmarZonaHoraria` retorna antes de la línea `guardar(...)` — confirmado leyendo el flujo, y coherente con que ninguna de las cuatro pruebas de `usarPerfil()`/tema-instantáneo cambió de comportamiento (la validación vive enteramente en la pantalla, no en el hook, que sigue aceptando lo que se le pase — tal como especifica el brief, que solo pide validar «antes de guardar» en la interfaz).

### 3. `tema-instantaneo.test.tsx` — el criterio central ya tiene test permanente

Antes de escribirlo, extraje `ProveedorTemaDelPerfil` de `src/app/_layout.tsx` a su propio fichero, `apps/kaizen/src/features/perfil/proveedor-tema-del-perfil.tsx`. Motivo: un test que solo protege una **copia** de la función (como hice en la verificación desechable de la entrega anterior) no detecta una rotura en el **original** — que es exactamente la queja del hallazgo 3. La composición en `_layout.tsx` queda **idéntica** (`ProveedorSesion > ProveedorTemaDelPerfil > Puerta`, mismo cliente de consultas, misma posición); lo único que cambia es dónde vive la definición. Diff de `_layout.tsx`: se borran el `import type { ReactNode }`, el `import { ProveedorTema }`, el `import { usarPerfil }` y la función inline; se añade un único `import { ProveedorTemaDelPerfil } from '@/features/perfil/proveedor-tema-del-perfil'`.

`apps/kaizen/src/features/perfil/tema-instantaneo.test.tsx` (nuevo, permanente): monta el `ProveedorTemaDelPerfil` real envolviendo a una `Sonda` que expone `guardar` (capturado en una variable de módulo vía `useEffect`, para no acoplar la prueba a ningún control de la pantalla de ajustes). Mock de `@/datos/supabase` que lee y muta el mismo objeto (`mockPerfilFalso`), para que el refresco disparado por `invalidateQueries` traiga de verdad el valor nuevo. Secuencia: arranca con `temaDefecto.color.texto`, llama a `guardarDesdeLaSonda({ tema: 'claro' })`, espera `temaClaro.color.texto` **sobre el mismo nodo** (sin desmontar).

**Verificación de que puede fallar** (pedida explícitamente en el brief regenerado): sustituí temporalmente `onSuccess: () => clienteConsultas.invalidateQueries(...)` por `onSuccess: () => {}` en `usar-perfil.ts`, ejecuté el test y se puso en rojo:

```
FAIL src/features/perfil/tema-instantaneo.test.tsx
  × cambiar el tema se ve al instante, sin reiniciar (1183 ms)
    - Expected: color: #141715
    + Received: color: #F4F5F2
```

Confirmado el fallo, restauré la línea original (`git diff` posterior mostró únicamente la adición de `guardando`/`errorAlGuardar`, sin ningún resto de la modificación temporal) y volví a correr el test: verde.

### Menor cerrado de paso

Filas de tema con etiqueta legible: `ETIQUETAS_TEMA` mapea `defecto → 'Oscuro'`, `claro → 'Claro'`; una clave futura no mapeada cae a sí misma con la primera letra en mayúscula (no rompe ni desaparece si el perfil `personal` de EAS añade un tema fuera de este mapa).

### Verificación final

```
$ npx tsc --noEmit
(sin salida — limpio)

$ npm test -- --silent
Test Suites: 10 passed, 10 total
Tests:       45 passed, 45 total

$ npm run test:integracion
Test Suites: 4 passed, 4 total
Tests:       16 passed, 16 total
```

45 tests en 10 suites unitarios (subió de 44/9: +1 suite, +1 test, por `tema-instantaneo.test.tsx`). 16 en 4 de integración, sin cambio — esta ronda no tocó nada que afecte a esas suites.

### Ficheros cambiados (ronda 1)

- `apps/kaizen/src/features/perfil/usar-perfil.ts` (modificado — `guardando`, `errorAlGuardar`)
- `apps/kaizen/src/features/perfil/ajustes.tsx` (modificado — aviso de error, controles deshabilitados, validación de zona horaria, etiquetas de tema)
- `apps/kaizen/src/features/perfil/proveedor-tema-del-perfil.tsx` (nuevo — extraído de `_layout.tsx`, mismo comportamiento)
- `apps/kaizen/src/app/_layout.tsx` (modificado — importa `ProveedorTemaDelPerfil` en vez de definirlo inline; composición JSX sin cambios)
- `apps/kaizen/src/features/perfil/tema-instantaneo.test.tsx` (nuevo, permanente)

Commit: `98fb9bc` — `fix(kaizen): ronda 1 de arreglos sobre la Tarea 11`. `git add` acotado a `apps/kaizen/src/features/perfil apps/kaizen/src/app`; `git diff --cached --name-only` verificado antes de comitear (exactamente los 5 ficheros de arriba).

### Preocupaciones (ronda 1)

1. **Extraje `ProveedorTemaDelPerfil` a un fichero propio, algo que el mensaje del coordinador no pedía explícitamente.** Lo hice porque era la única forma de que `tema-instantaneo.test.tsx` protegiera la implementación real (no una copia) sin arrastrar a un test unitario todo lo que `_layout.tsx` importa además (persistidor de AsyncStorage, `NetInfo`, `Stack`/`Redirect` de Expo Router). La composición y el comportamiento no cambian en absoluto — verificado con el mismo `git diff` que muestra solo el movimiento de imports. Lo señalo por si el revisor prefiere que la función siga viviendo físicamente en `_layout.tsx` con otra estrategia de test.
2. La validación de zona horaria vive en la pantalla (`ajustes.tsx`), no en `usarPerfil()` ni en la base de datos — tal como pide el brief regenerado («la validación» + «con el mismo mecanismo que después la consume», ambos referidos a la interfaz). Si en el futuro se quiere blindar también a nivel de hook o de base de datos (segunda capa, como tiene `corte_dia`), es una decisión de alcance que no me correspondía tomar aquí.
3. Ninguna preocupación nueva sobre lo que la revisión ya dio por bueno (cadena de invalidación, rutas, rangos de corte de día/hora de silencio): no se tocó nada de eso en esta ronda.
