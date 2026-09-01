# Informe — Tarea 9: Navegación, hoja del + y pantalla de acceso

## Qué se implementó

Se ensambló el punto de entrada de la app siguiendo el brief paso a paso (TDD):

- `src/app/_layout.tsx` — layout raíz: `PersistQueryClientProvider` (con `onSuccess={() => cliente.resumePausedMutations()}`, copiado tal cual, sin simplificar), envuelto en `ProveedorSesion` y `ProveedorTema`, con la puerta `Puerta()` que redirige a `/acceso` si no hay sesión y muestra el `Stack` (`(pestanas)` + `anadir` modal) si la hay.
- `src/app/(pestanas)/_layout.tsx` — `Tabs` de cinco pestañas + el hueco central `anadir-hueco` cuyo `tabBarButton` se sustituye por `BotonAnadir`, que hace `router.push('/anadir')` en vez de navegar a una pestaña.
- `src/app/(pestanas)/anadir-hueco.tsx` — componente vacío (`return null`) que solo reserva el slot central.
- `src/app/(pestanas)/coach.tsx` — pestaña Coach con el estado vacío que exige el test.
- `src/app/(pestanas)/nutricion.tsx`, `entrenamiento.tsx`, `evolucion.tsx` — misma estructura que `coach.tsx`, título y texto según el brief (Paso 6).
- `src/app/(pestanas)/index.tsx` — pestaña Hoy: saludo + contexto del día con `Texto`. **No hay código literal en el brief para este fichero** (el brief solo describe su contenido); lo escribí yo mismo reutilizando exactamente la estructura de `coach.tsx`.
- `src/app/anadir.tsx` — hoja del +, con las seis opciones visibles y funcionales. **Desviación deliberada del código literal del brief**, exigida por el propio brief y por el encargo: las seis `ruta` se dejaron en `'/'` (en vez de `/nutricion/buscar`, `/agua`, etc., que no existen todavía) con un comentario anotando que esas seis rutas llegan en el bloque 1. No hay opciones deshabilitadas ni «próximamente»: las seis navegan de verdad, a Hoy.
- `src/app/acceso.tsx` — pantalla de acceso con correo/contraseña, Apple solo en iOS, mensajes de error ya traducidos desde `autenticacion.ts` (Tarea 5), sin capa de traducción propia.
- `src/app/navegacion.test.tsx` — el test del brief, copiado verbatim.

Todo el resto de ficheros se copió **verbatim** del brief, tal como pedía el encargo.

## TDD — evidencia

**Antes (falla):**

```
$ npm test -- navegacion.test
FAIL src/app/navegacion.test.tsx
  ● Test suite failed to run

    Cannot find module './(pestanas)/coach' from 'src/app/navegacion.test.tsx'

Test Suites: 1 failed, 1 total
Tests:       0 total
```

Coincide exactamente con lo que predecía el brief.

**Después de crear `coach.tsx` (pasa):**

```
$ npm test -- navegacion.test
PASS src/app/navegacion.test.tsx
  √ Coach muestra su estado vacío explicando por qué (151 ms)

Test Suites: 1 passed, 1 total
Tests:       1 passed, 1 total
```

**Suite completa al terminar todos los pasos:**

```
$ npm test
PASS src/datos/mutacion.test.ts
PASS src/dominio/tipos.test.ts
PASS src/datos/autenticacion.test.ts
PASS src/design/temas/contrato.test.ts
PASS src/dominio/dia.test.ts
PASS src/app/navegacion.test.tsx
PASS src/datos/sesion.test.tsx
PASS src/design/componentes/componentes.test.tsx

Test Suites: 8 passed, 8 total
Tests:       41 passed, 41 total
```

Partíamos de 40 tests en 7 suites (confirmado con `npx jest --listTests` antes de tocar nada: 7 ficheros). Ahora son **41 tests en 8 suites** — el único test nuevo es el de esta tarea.

```
$ npx tsc --noEmit
(sin salida — limpio)
```

## Ficheros cambiados

Todos nuevos, bajo `apps/kaizen/src/app/`:

- `apps/kaizen/src/app/_layout.tsx`
- `apps/kaizen/src/app/(pestanas)/_layout.tsx`
- `apps/kaizen/src/app/(pestanas)/anadir-hueco.tsx`
- `apps/kaizen/src/app/(pestanas)/coach.tsx`
- `apps/kaizen/src/app/(pestanas)/nutricion.tsx`
- `apps/kaizen/src/app/(pestanas)/entrenamiento.tsx`
- `apps/kaizen/src/app/(pestanas)/evolucion.tsx`
- `apps/kaizen/src/app/(pestanas)/index.tsx`
- `apps/kaizen/src/app/anadir.tsx`
- `apps/kaizen/src/app/acceso.tsx`
- `apps/kaizen/src/app/navegacion.test.tsx`

Commit acotado, verificado con `git diff --cached --name-only` antes de comitear (solo las 11 rutas de arriba, todas bajo `apps/kaizen/`). Commit: `62e5667` — "feat(kaizen): navegacion de cinco pestanas, hoja de anadir y acceso".

## Autorrevisión

### 1. Literales visuales en pantallas

Encontré **dos**, ambos heredados verbatim del propio código del brief (no los introduje yo):

- **`src/app/(pestanas)/_layout.tsx`**, `BotonAnadir`: `width: 52, height: 52, borderRadius: 26, marginTop: -18` son píxeles a mano, no salen de `t.espaciado` ni de `t.radio`. El color de fondo sí sale del tema (`t.color.acento`), pero la geometría del botón no.
- **`src/app/acceso.tsx`**, línea del mensaje de error: `style={{ color: '#E2574C' }}`. Es un hex a mano. Revisé el contrato de tema (`src/design/tema.ts`, Tarea 7): `color` no tiene ningún campo de error/peligro (`proteina`, `carbos`, `grasas` son los únicos semánticos además de `acento`/`texto`/`textoTenue`/`borde`/`pista`). No hay token al que enganchar este color sin ampliar el contrato de tema — algo fuera del alcance de esta tarea. Lo dejo tal cual porque el encargo fue explícito en pedir este fichero verbatim, pero lo señalo como hueco real del sistema de temas que alguna tarea futura debería cerrar (añadir `color.peligro` o similar al contrato).

No encontré ningún otro color, radio o tamaño de fuente a mano en el resto de pantallas (`coach`, `nutricion`, `entrenamiento`, `evolucion`, `index`, `anadir`, `_layout` raíz) — todas usan exclusivamente `t.espaciado[n]`, variantes de `Texto` y, en `anadir.tsx`, ningún estilo de color propio.

También detecté un import muerto heredado verbatim: `View` en `(pestanas)/_layout.tsx` se importa pero no se usa (el layout usa `Pressable`, no `View`). No rompe `tsc` porque `noUnusedLocals` no está activado en `tsconfig.json`. Lo dejo porque el fichero se copió tal cual del brief.

### 2. La puerta de sesión

`Puerta()` en `_layout.tsx`:
```
if (cargando) return null
if (!sesion) return <Redirect href="/acceso" />
```
`useSesion()` arranca con `cargando: true` (confirmado en `src/datos/sesion.tsx`) y solo pasa a `false` cuando `supabase.auth.getSession()` resuelve. Mientras tanto, `Puerta` devuelve `null`: pantalla en blanco, no la de acceso. Cuando `cargando` pasa a `false`, si hay sesión guardada se entra directo al `Stack` de pestañas; si no la hay, ahí sí se redirige a `/acceso`. **No hay parpadeo de la pantalla de acceso** para un usuario con sesión guardada, porque `acceso.tsx` nunca se monta antes de que se resuelva `cargando` — el defecto clásico de este patrón (mostrar login y luego "saltar" a home) no se da aquí.

### 3. El botón central del +

`anadir-hueco.tsx` reserva la ruta pero `_layout.tsx` de pestañas nunca deja que React Navigation la seleccione: `tabBarButton: () => <BotonAnadir />` sustituye por completo el botón por defecto de esa pestaña por un `Pressable` propio que hace `router.push('/anadir')` (abre el modal) y **no reenvía** el `onPress` que React Navigation inyectaría para navegar al tab. Con `Tabs` (bottom-tabs de React Navigation) no hay gesto de deslizar entre pantallas por defecto —eso es de un `PagerView`, no de esta navegación—, así que no se llega deslizando. Con teclado/lector de pantalla, el elemento enfocable en esa posición es el `Pressable` de `BotonAnadir` (`accessibilityRole="button"`, `accessibilityLabel="Añadir registro"`), que se anuncia como botón "Añadir registro" y no como pestaña; activarlo (Enter/Espacio, o doble toque con lector de pantalla) dispara el mismo `router.push('/anadir')`, nunca una navegación a la pestaña vacía. Solo quedaría accesible mediante una llamada programática directa a `router.push('/anadir-hueco')`, algo que ningún camino de UI, gesto, teclado o lector de pantalla dispara.

### 4. La pantalla de acceso mientras espera

Sí se ve un estado de trabajo: el botón "Entrar" cambia su título a "Un momento…" mientras `ocupado` es `true`.

**Pero sí se puede pulsar "Entrar" dos veces.** Revisé `Boton` (`src/design/componentes/boton.tsx`, Tarea 8): no acepta ninguna prop `disabled`/`deshabilitado`, solo `titulo`, `alPulsar`, `tono`. Y `ejecutar()` en `acceso.tsx` no hace guarda de reentrada (no comprueba `if (ocupado) return` antes de lanzar la acción). Así que nada impide que, con la petición en curso, una segunda pulsación en "Entrar" (o incluso en "Crear cuenta"/"Continuar con Apple", que comparten el mismo estado `ocupado`) dispare una segunda llamada a Supabase Auth en paralelo. Esto viene del código literal del brief, que copié sin modificar porque el encargo pedía explícitamente `acceso.tsx` verbatim; lo marco como preocupación real para que se decida si se corrige aquí o en una tarea posterior (añadir `deshabilitado` a `Boton` y/o una guarda `if (ocupado) return` en `ejecutar`).

### ¿Está completo? ¿Los tests verifican comportamiento real? ¿Salida limpia?

- Completo: los 8 pasos del brief están implementados; los 6 componentes de pestañas, el layout raíz, el layout de pestañas, el hueco, la hoja del + y la pantalla de acceso existen y compilan.
- El test que se pidió (`navegacion.test.tsx`) verifica comportamiento real: renderiza `Coach` dentro de `ProveedorTema` y comprueba que el texto del estado vacío está en pantalla — no es un mock ni un snapshot ciego.
- Salida limpia: `npm test` → 8/8 suites, 41/41 tests; `npx tsc --noEmit` → sin salida.

## Preocupaciones

1. **Doble pulsación en "Entrar"** (autorrevisión punto 4): el `Boton` no soporta deshabilitar, y `ejecutar()` no se protege contra reentrada. Puede disparar llamadas duplicadas a Supabase Auth.
2. **Color de error sin token de tema** (`#E2574C` en `acceso.tsx`): el contrato de tema no define ningún color semántico de error/peligro; este literal es la única forma de pintar el mensaje de error con el código dado. Candidato a que una tarea futura añada `color.peligro` (o similar) al contrato de `Tema`.
3. **Geometría a mano del botón +** (`52`, `26`, `-18` en `(pestanas)/_layout.tsx`): no sale de `t.espaciado` ni `t.radio`. Menor que el punto 2 porque es geometría de layout, no color de marca, pero rompe igualmente la regla de "todo sale del tema".
4. Import muerto (`View`) en `(pestanas)/_layout.tsx` — inofensivo, no falla `tsc`, pero es ruido.

Ninguna de estas cuatro es mía por inventiva: las tres primeras están en el código literal que el encargo pidió copiar verbatim; la cuarta es un import sobrante del mismo bloque. Las señalo tal como pedía la autorrevisión, sin corregirlas por mi cuenta, porque el encargo fue explícito en pedir estos ficheros tal cual.

---

## Ronda de arreglos 1 (sobre los cuatro hallazgos de la autorrevisión + el hallazgo del revisor)

El coordinador confirmó que los cuatro hallazgos de mi autorrevisión eran ciertos y defectos del **plan** (no míos), y añadió un quinto hallazgo que ninguno de los dos vio: ninguna pantalla pintaba `fondo.pantalla` del tema, así que el interruptor claro/oscuro no cambiaba nada visible y la app se veía sobre el blanco por defecto de React Native. Se regeneraron los briefs de las Tareas 7, 8 y 9 para cerrar los cinco a la vez. Apliqué los tres, en ese orden.

### Qué se implementó

**Tarea 7 — contrato de temas** (`src/design/tema.ts`, `src/design/temas/defecto.ts`, `src/design/temas/claro.ts`):
- `color.peligro` y `color.sobrePeligro` añadidos al contrato y a los dos temas (`#E2574C`/`#2A0A07` en el oscuro, `#C0392B`/`#FFFFFF` en el claro).
- `superficie.botonPeligro` añadido al contrato y a los dos temas (mismo color que `color.peligro` en ambos, como `Fondo` de tipo `color`).
- No toqué `contrato.test.ts`: es genérico (compara claves entre temas), no necesitaba cambios y ya protegía que los dos temas declarasen las mismas rutas.

**Tarea 8 — `Boton` y `Pantalla`** (`src/design/componentes/boton.tsx`, `src/design/componentes/pantalla.tsx` nuevo, `src/design/componentes/componentes.test.tsx`):
- `Boton` gana `deshabilitado?: boolean` (baja opacidad a 0.5, `disabled` en el `Pressable`, `accessibilityState={{ disabled }}`) y un tercer tono `'peligro'` que usa `superficie.botonPeligro`/`color.sobrePeligro`.
- Componente nuevo `Pantalla`: envuelve `Superficie` con `fondo={t.fondo.pantalla}` y una `View` interior con `backgroundColor: t.fondo.velo`, para que ninguna pantalla tenga que saber su propio color de fondo.
- Test nuevo en `componentes.test.tsx`: renderiza `<Pantalla>` y comprueba que el árbol serializado contiene el valor de `temaDefecto.fondo.pantalla` (`#060807`).

**Tarea 9 — cablear `Pantalla` en la app y cerrar los otros tres hallazgos** (`src/app/_layout.tsx`, `src/app/(pestanas)/_layout.tsx`, `src/app/(pestanas)/{coach,nutricion,entrenamiento,evolucion,index}.tsx`, `src/app/anadir.tsx`, `src/app/acceso.tsx`):
- `Puerta()` en `_layout.tsx`: el estado `cargando` ya no devuelve `null`, devuelve `<Pantalla />` (con el comentario del brief sobre el fogonazo blanco).
- Las cinco pestañas, `anadir.tsx` y `acceso.tsx` pasan de `<View style={{flex:1,...}}>` a `<Pantalla style={{...}}>` como raíz (sin el `flex: 1` explícito, porque `Pantalla` ya lo aplica internamente). Cuento ocho usos de `Pantalla` en total: el estado de carga de la puerta, las cinco pestañas, `anadir.tsx` y `acceso.tsx` — coincide con lo que pedía el coordinador ("las ocho pantallas y la de acceso"). **Dejé `anadir-hueco.tsx` con `return null`**, tal como sigue diciendo el brief regenerado de la Tarea 9 sin cambios en ese punto: no es una pantalla alcanzable (confirmado en la ronda anterior) y envolverla habría sido inventar sobre un fichero que el brief no tocó.
- `(pestanas)/_layout.tsx`: quité el import muerto de `View` y sustituí los números sueltos del botón + por `LADO_MAS = 52` y `SOBRESALIENTE_MAS = 18`, con el radio derivado (`LADO_MAS / 2`) en vez de `26` inventado.
- `acceso.tsx`: añadí la guarda `if (ocupado) return` al principio de `ejecutar()`, `deshabilitado={ocupado}` en los tres `Boton`, y cambié `style={{ color: '#E2574C' }}` por `style={{ color: t.color.peligro }}`.
- **Corrección sobre el propio brief regenerado**: el bloque de código de `acceso.tsx` en el brief usa `<Pantalla>` pero no la importa (ni tampoco deja de importar `View`, que queda sin uso). Añadí `import { Pantalla } from '@/design/componentes/pantalla'` y quité `View` del import de `react-native` — sin eso no compilaba (`Cannot find name 'Pantalla'`).

### Verificación pedida: que el test del fondo pueda fallar

Rompí temporalmente `Pantalla` (cambié `fondo={t.fondo.pantalla}` por un color fijo `{ tipo: 'color', valor: '#000000' }` que no es el color del tema por defecto) y corrí solo ese fichero de test:

```
$ npm test -- componentes.test
FAIL src/design/componentes/componentes.test.tsx
  × la pantalla pinta el fondo del tema y no el del sistema (1 ms)
  ● la pantalla pinta el fondo del tema y no el del sistema

    expect(received).toContain(expected)
    Expected substring: "#060807"
    Received string:    "...\"backgroundColor\":\"#000000\"...}"

Test Suites: 1 failed, 1 total
Tests:       1 failed, 12 passed, 13 total
```

Se puso rojo, y por el motivo correcto: no detecta solo "hay algún color de fondo", detecta que **no es el color del tema activo**. Devolví el cambio (`fondo={t.fondo.pantalla}`) y confirmé que vuelve a pasar.

### Resultado final

```
$ npm test
PASS src/datos/autenticacion.test.ts
PASS src/datos/mutacion.test.ts
PASS src/dominio/tipos.test.ts
PASS src/design/temas/contrato.test.ts
PASS src/dominio/dia.test.ts
PASS src/datos/sesion.test.tsx
PASS src/app/navegacion.test.tsx
PASS src/design/componentes/componentes.test.tsx

Test Suites: 8 passed, 8 total
Tests:       42 passed, 42 total
```

**Suite completa: 42 tests en 8 suites** (subió de 41 a 42: el único test nuevo es el de `Pantalla`; ningún suite nuevo, ninguno perdido).

```
$ npx tsc --noEmit
(sin salida — limpio)
```

Sin `any`, sin `@ts-ignore`. `package.json`/`package-lock.json` de `apps/kaizen` sin diff (no corrí `npm install`; las versiones clavadas del arnés de tests no se tocaron).

### Ficheros cambiados en esta ronda

Modificados:
- `apps/kaizen/src/design/tema.ts`
- `apps/kaizen/src/design/temas/defecto.ts`
- `apps/kaizen/src/design/temas/claro.ts`
- `apps/kaizen/src/design/componentes/boton.tsx`
- `apps/kaizen/src/design/componentes/componentes.test.tsx`
- `apps/kaizen/src/app/_layout.tsx`
- `apps/kaizen/src/app/(pestanas)/_layout.tsx`
- `apps/kaizen/src/app/(pestanas)/coach.tsx`
- `apps/kaizen/src/app/(pestanas)/nutricion.tsx`
- `apps/kaizen/src/app/(pestanas)/entrenamiento.tsx`
- `apps/kaizen/src/app/(pestanas)/evolucion.tsx`
- `apps/kaizen/src/app/(pestanas)/index.tsx`
- `apps/kaizen/src/app/anadir.tsx`
- `apps/kaizen/src/app/acceso.tsx`

Nuevo:
- `apps/kaizen/src/design/componentes/pantalla.tsx`

Commit acotado, verificado con `git diff --cached --name-only` antes de comitear (exactamente estas 15 rutas, todas bajo `apps/kaizen/`). Commit: `7e27ed5` — "fix(kaizen): ronda 1 de arreglos sobre la Tarea 9 (fondo, color de peligro, doble pulsacion)".

### Estado de los cuatro hallazgos originales tras esta ronda

1. Doble pulsación en "Entrar" — **cerrado**: guarda de reentrada + `deshabilitado={ocupado}` en los tres botones.
2. Color de error sin token de tema — **cerrado**: `t.color.peligro` sustituye al hex a mano.
3. Geometría a mano del botón + — **cerrado**: `LADO_MAS`/`SOBRESALIENTE_MAS` con nombre y comentario, radio derivado.
4. Import muerto de `View` — **cerrado** en `(pestanas)/_layout.tsx`. También encontré y cerré el mismo patrón en `acceso.tsx` (era `View` sin uso una vez cambiado a `Pantalla`).

Y el hallazgo nuevo del revisor (fondo de pantalla) — **cerrado**: `Pantalla` como raíz de las ocho pantallas, con test que de verdad puede fallar (verificado arriba).

### Preocupaciones que quedan

Ninguna nueva. Las cuatro preocupaciones originales quedan resueltas por esta ronda; no he encontrado literales visuales nuevos al revisar los ficheros tocados (los estilos de `Pantalla` usan exclusivamente `t.fondo.pantalla`/`t.fondo.velo`, y los de `Boton` usan `t.superficie.*`/`t.color.*`).
