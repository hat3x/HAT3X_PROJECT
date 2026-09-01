# Informe — Tarea 8: Proveedor de tema y componentes base

## Qué implementé

Siguiendo el brief al pie de la letra, copiado verbatim:

- `apps/kaizen/src/design/proveedor.tsx` — `ProveedorTema` (contexto de React inicializado con `TEMAS.defecto`) y `useTema()`.
- `apps/kaizen/src/design/componentes/texto.tsx` — `Texto`, con variantes `heroe | titulo | cuerpo | etiqueta | tenue`. La escala `TAMANOS` es literal por diseño (excepción documentada en el brief); color, peso, familia y tracking salen todos de `useTema()`.
- `apps/kaizen/src/design/componentes/barra.tsx` — `Barra`, con dos recetas (`continua` / `segmentada`) leídas de `t.recetas.barra`. Recorta el progreso a `[0, 1]`.
- `apps/kaizen/src/design/componentes/superficie.tsx` — `Superficie`, que resuelve las tres variantes de `Fondo` (`color`, `degradado`, `recurso`).
- `apps/kaizen/src/design/componentes/boton.tsx` — `Boton`, construido sobre `Superficie` + `Texto`; el fondo sale de `t.superficie.botonPrimario`/`botonSecundario`.
- `apps/kaizen/src/design/componentes/anillo.tsx` — `Anillo`, con SVG (`react-native-svg`) y la receta `t.recetas.anillo` (`liso` / `medidor`).
- `apps/kaizen/src/design/componentes/componentes.test.tsx` — los 5 tests del brief.

Instalé `expo-blur` (`~57.0.2`) y `react-native-svg` (`15.15.4`) vía `npx expo install`. Solo tocaron `dependencies` en `package.json`/`package-lock.json`; no rozaron `jest`, `jest-expo`, `@testing-library/react-native` ni ningún devDependency clavado en `AGENTS.md`.

## Qué probé y resultado

### Evidencia de TDD

**Antes** — con el test creado pero sin ninguna implementación (`npm test -- componentes.test`):

```
FAIL src/design/componentes/componentes.test.tsx
  ● Test suite failed to run

    Cannot find module '../proveedor' from 'src/design/componentes/componentes.test.tsx'
      at Resolver._throwModNotFoundError (node_modules/jest-resolve/build/resolver.js:427:11)
      at Object.require (src/design/componentes/componentes.test.tsx:2:1)

Test Suites: 1 failed, 1 total
Tests:       0 total
```

**Después** — tras implementar los 6 ficheros (`npm test -- componentes.test`):

```
PASS src/design/componentes/componentes.test.tsx
  √ el texto toma el color del tema (60 ms)
  √ la etiqueta usa el color tenue y va en mayúsculas (6 ms)
  √ el botón dispara su acción (187 ms)
  √ la barra recorta el progreso al 100 por ciento (3 ms)
  √ la barra no acepta progresos negativos (1 ms)

Test Suites: 1 passed, 1 total
Tests:       5 passed, 5 total
```

### Suite completa

```
npm test
PASS src/dominio/tipos.test.ts
PASS src/design/temas/contrato.test.ts
PASS src/datos/autenticacion.test.ts
PASS src/datos/mutacion.test.ts
PASS src/dominio/dia.test.ts
PASS src/datos/sesion.test.tsx
PASS src/design/componentes/componentes.test.tsx

Test Suites: 7 passed, 7 total
Tests:       33 passed, 33 total
```

Antes de esta tarea la suite estaba en 28 tests / 6 suites (verificado). Ahora son **33 tests en 7 suites**, todos en verde — los 28 previos siguen intactos y se suman los 5 nuevos.

### Typecheck

```
npx tsc --noEmit
```

Sin salida — limpio, cero errores.

## Ficheros cambiados

- `apps/kaizen/package.json` (añade `expo-blur`, `react-native-svg` a `dependencies`)
- `apps/kaizen/package-lock.json` (resolución de las dos dependencias nuevas y sus transitivas)
- `apps/kaizen/src/design/proveedor.tsx` (nuevo)
- `apps/kaizen/src/design/componentes/texto.tsx` (nuevo)
- `apps/kaizen/src/design/componentes/barra.tsx` (nuevo)
- `apps/kaizen/src/design/componentes/superficie.tsx` (nuevo)
- `apps/kaizen/src/design/componentes/boton.tsx` (nuevo)
- `apps/kaizen/src/design/componentes/anillo.tsx` (nuevo)
- `apps/kaizen/src/design/componentes/componentes.test.tsx` (nuevo)

Commit: `ae8bcbc feat(kaizen): proveedor de tema y componentes base` — 9 ficheros, todos bajo `apps/kaizen/`. Confirmé con `git diff --cached --name-only` antes de comitear que ninguna ruta ajena entró al stage, y con `git status --short apps/kaizen` después del commit que el árbol de kaizen quedó limpio.

## Autorrevisión

### 1. Literales de color/radio/tamaño fuera de `TAMANOS`

Repasé cada fichero nuevo con grep dirigido a hex, `rgba(`, `borderRadius:`, `borderWidth:`, `fontWeight:`, `gap:`. Hallazgos, todos heredados literalmente del brief (no los introduje yo, pero los reporto igual porque el mandato es "de tu propio diff", y son míos aunque copiados):

- **`boton.tsx` línea 28** — `fontWeight: '700'` está escrito a pelo en el estilo que `Boton` pasa a `Texto`, en vez de leer `t.tipografia.pesoTitular`/`pesoCuerpo`. Es un literal real, no cubierto por la excepción de `TAMANOS`. Lo copié verbatim porque así lo especifica el brief, pero es una desviación de la regla "ningún componente define... una fuente por su cuenta" si se interpreta el peso como parte de la tipografía del tema.
- **`barra.tsx`** — en la rama `segmentada`: `gap: 3` (x2) y `borderRadius: 2` en cada segmento. Son literales de layout/radio no derivados del tema. También `alto = 7` como valor por defecto del grosor de la barra (parámetro, no vinculado a `t.radio` ni a ningún token).
- **`superficie.tsx` línea 16** — `borderWidth: 1` hardcodeado (el color del borde sí sale de `t.color.borde`, pero el grosor no).
- **`anillo.tsx`** — valores por defecto `tamano = 168`, `grosor = 12`, y offsets geométricos del SVG (`+ 6`, `+ 1`, `+ 5`, `strokeWidth={2}` de las marcas del medidor) son literales numéricos de geometría, no de tema. Todos los **colores** del anillo sí vienen de `useTema()` (`t.color.pista`, `t.color.acento`, `t.color.textoTenue`) — ahí no encontré ningún literal.

En resumen: no hay ningún color hardcodeado fuera del test (el test compara contra los valores literales del tema, que es lo esperado en un test). Sí hay literales de **radio/grosor/peso de fuente** en `boton.tsx`, `barra.tsx`, `superficie.tsx` y `anillo.tsx`, todos ellos ya presentes en el código que el brief pedía copiar verbatim. No los alteré porque la instrucción explícita era "cópialos verbatim" y no revisar el diseño; los señalo para que quien revise decida si son aceptables (tamaños estructurales de un widget, no "look" temático) o si deberían moverse al `Tema` en una iteración futura.

### 2. `Superficie` — las tres variantes de `Fondo`

Confirmé las tres ramas completas en `superficie.tsx`:

- `tipo === 'color'` → `View` con `backgroundColor: fondo.valor`.
- `tipo === 'recurso'` → `ImageBackground` con `source={fondo.fuente}`, `capInsets` calculado desde `fondo.recuadro` (o `undefined` si es `null`), `resizeMode="stretch"` y `imageStyle={{ borderRadius: radio }}`. Esta rama **no está a medias**: recibe la fuente de imagen, aplica el recuadro de 9-slice si existe, y respeta el radio del contenedor tanto en `base` (el `View`/`ImageBackground` exterior) como en `imageStyle` (para que la imagen recorte igual que el borde). Ningún tema actual (`defecto`, `claro`) ejercita esta rama porque ambos usan `decoracion: { ... : null }`, así que no hay test automatizado que la cubra — es la misma situación de cobertura que el anillo `medidor` (ver punto 3), pero la implementación en sí está completa según el contrato de `Fondo`.
- rama `degradado` (el `else` final) → usa `BlurView` de `expo-blur` con `intensity={t.superficie.desenfoque}` y `tint` según `t.esquema`, con un `View` interior de `backgroundColor: fondo.desde` — nota: esto pinta un color plano (`fondo.desde`), no un degradado real de dos paradas (`desde`→`hasta`); `fondo.hasta` queda sin usar en esta implementación. Esto viene del brief tal cual, así que lo reporto como hallazgo de diseño más que como bug mío: si en el futuro se quiere un degradado visual de verdad (`LinearGradient`), esta pieza necesitará revisión. Con las herramientas de test actuales (`toHaveStyle` sobre RN puro) no pude verificar visualmente el resultado, pero confirmé que la rama no lanza excepción — el color de tarjeta de ambos temas actuales (`defecto`/`claro`) es de tipo `degradado`, así que esta rama SÍ se ejercita indirectamente cada vez que se monta un `Boton` (`fondo` viene de `botonPrimario`/`botonSecundario`, que en ambos temas son `tipo: 'color'`, no `degradado` — así que en realidad ningún test actual monta `Superficie` con un fondo `degradado` tampoco). Lo dejo anotado como zona sin cobertura de test, igual que el recurso y el anillo medidor.

### 3. `Anillo` con receta `medidor`

El tema por defecto usa `liso`, así que ningún test del brief ejercita la rama `t.recetas.anillo === 'medidor'`. No me quedé con la duda: escribí un test temporal (`__temp_verificacion_medidor.test.tsx`, con `jest.mock('../proveedor', ...)` devolviendo un tema mínimo con `recetas.anillo: 'medidor'`), lo ejecuté, confirmé que `render(<Anillo progreso={0.4} />)` **no lanza excepción** (`PASS`, 1/1), y lo borré antes de comitear — no forma parte del entregable ni del commit. Con eso puedo afirmar con evidencia, no solo lectura de código, que la rama `medidor` funciona de verdad a nivel de renderizado: genera 4 elementos `<Line>` con coordenadas numéricas finitas (no hay división por cero ni `NaN` posibles dados los valores por defecto). Lo que **no** verifiqué es el resultado visual (si las marcas quedan en las posiciones angulares correctas) — eso requeriría un snapshot visual o revisión manual en dispositivo, fuera del alcance de esta tarea.

### ¿Está completo? ¿Los tests verifican comportamiento real? ¿La salida está limpia?

- Completo: los 6 ficheros de código + el test están todos presentes y coinciden con el brief.
- Los tests verifican comportamiento real (no implementación interna): color efectivo tras cascada de estilos, transformación a mayúsculas, disparo de callback al pulsar, y recorte de rango en la barra por sus dos extremos (>1 y <0).
- Salida limpia: `npm test` → 33/33 verdes, `npx tsc --noEmit` → sin salida.

## Preocupaciones

1. **`fontWeight: '700'` en `boton.tsx`** y los literales de radio/grosor en `barra.tsx`/`superficie.tsx`/`anillo.tsx` (detallados arriba) son desviaciones reales de la restricción central de la tarea ("ningún componente define... radio... por su cuenta"), heredadas verbatim del brief. No los toqué porque mi mandato era copiar exactamente, pero los marco explícitamente para que la revisión decida si ameritan una tarea de seguimiento.
2. **La rama `degradado` de `Superficie`** no interpola `fondo.desde`→`fondo.hasta`; solo pinta `fondo.desde` como color plano detrás del `BlurView`. Ningún tema actual expone esa combinación a un test, así que pasa inadvertido hoy, pero es una brecha entre lo que el tipo `Fondo` promete (`degradado`) y lo que el componente entrega.
3. Tanto la rama `recurso` de `Superficie` como la receta `medidor` de `Anillo` no tienen cobertura de test en el árbol permanente (ninguno de los dos temas actuales las activa). Verifiqué `medidor` con un test desechable; `recurso` la revisé solo por lectura de código (la lógica es simple y sin ramas condicionales internas, así que la confianza es alta, pero no tiene la misma evidencia de ejecución).

---

## Ronda de arreglos 1

El coordinador confirmó que los seis hallazgos eran defectos del plan original (brief copiado carácter por carácter), no míos, y corrigió el brief en origen. Esta sección documenta la implementación de esa corrección.

### Qué implementé

Siguiendo el brief corregido, verbatim salvo dos excepciones documentadas más abajo:

1. **`superficie.tsx`** — instala y usa `expo-linear-gradient`. La rama de fondo `degradado` ahora envuelve un `<LinearGradient colors={[fondo.desde, fondo.hasta]}>` dentro del `BlurView` (mantiene el cristal y añade el degradado real, en vez de pintar solo `fondo.desde`). El borde de 1px (`borderWidth`/`borderColor: t.color.borde`) ahora solo se aplica en las ramas `color` y `degradado`; la rama `recurso` usa `base` (sin borde) para que un marco ilustrado no lleve un borde algorítmico que el tema no pueda apagar.
2. **`barra.tsx`** — la receta `segmentada` ya no envuelve los diez segmentos en un contenedor que encoge su `width` al progreso. El contenedor (`testID="barra-segmentos"`) ocupa el ancho completo; cada segmento lleva su propio `testID` (`segmento-lleno` / `segmento-vacio`) y son ellos, no el contenedor, los que reflejan el progreso. Ambas variantes (`continua` y `segmentada`) llevan ahora `accessibilityRole="progressbar"` y `accessibilityValue={{ min: 0, max: 100, now }}`.
3. **`boton.tsx`** — el `fontWeight: '700'` literal que yo mismo señalé en la ronda anterior ahora lee `t.tipografia.pesoTitular`.
4. **`proveedor.tsx`** — `ContextoTema` se exporta (antes era un `const Contexto` privado sin exportar). Es lo que permite a los tests construir un tema a mano y ejercitar recetas que ningún tema registrado activa.
5. **`anillo.tsx`** — añade `accessibilityRole="progressbar"` y `accessibilityValue`. Tuvo que llevar además un `accessible` explícito que **no estaba en el código del brief** (ver "Desviaciones" abajo).
6. **`componentes.test.tsx`** — sustituido por la versión de 10 tests del brief (5 originales + 5 nuevos: progreso intermedio, anillo con accesibilidad, fallback de tema desconocido, barra segmentada, anillo medidor), con un refuerzo propio en el test de la barra segmentada (ver "Desviaciones").

Instalé `expo-linear-gradient` (`~57.0.1`) vía `npx expo install`; solo tocó `dependencies` en `package.json`/`package-lock.json`, sin rozar ninguna versión clavada del arnés de tests.

### Desviaciones sobre el brief (y por qué)

Dos, ambas descubiertas ejecutando el código real, no por lectura:

**1. `accessible` en `anillo.tsx`.** El código exacto del brief (`accessibilityRole="progressbar"` + `accessibilityValue`, sin `accessible`) hace que `screen.getByRole('progressbar')` falle con "Unable to find an element with role: progressbar", pese a que el `View` sí lleva esas props. Rastreé la causa hasta `@testing-library/react-native/build/helpers/accessibility.js`: `isAccessibilityElement()` exige `element.props.accessible !== undefined` (o que sea un `Text`/`TextInput`/`Switch` nativo) antes de dejar que `getByRole` lo encuentre — y esto no es una peculiaridad del test, es el mismo criterio que usan los lectores de pantalla reales en React Native: sin `accessible={true}`, un `View` compuesto de SVG + hijos no se anuncia como una sola unidad. Añadí `accessible` (equivalente a `accessible={true}`) al `View` exterior. Sin este cambio, ni el test del brief ni un lector de pantalla real habrían funcionado con el código tal cual estaba escrito.

**2. Refuerzo del test de la barra segmentada.** El coordinador pidió explícitamente verificar que ese test "puede fallar de verdad" antes de darlo por bueno. Lo hice: reintroduje temporalmente el contenedor que encoge (`<View style={{ width: `${recortado*100}%`, ... }}>` envolviendo los diez segmentos) y ejecuté el test tal cual venía en el brief (solo `getAllByTestId('segmento-lleno')`/`'segmento-vacio')` con `toHaveLength(5)`). **El test seguía pasando con el bug reintroducido** — `getAllByTestId` cuenta elementos en el árbol, no mide layout, y los diez `<View>` con sus `testID` seguían existiendo (comprimidos, pero presentes) tanto en la versión correcta como en la rota. El recuento por sí solo no discrimina el bug que se supone que protege.

Reforcé el test con una comprobación estructural adicional sobre el árbol host serializado:
```tsx
const arbol = toJSON()
if (arbol === null || Array.isArray(arbol)) throw new Error('se esperaba un único nodo raíz')
expect(arbol.children).toHaveLength(10)
```
Si el envoltorio que encoge reaparece, la raíz solo tiene 1 hijo (el envoltorio) en vez de 10 (los segmentos directos) — confirmé esto reintroduciendo el bug otra vez con el test reforzado: falló con `Expected length: 10, Received length: 1`, mostrando en el mensaje de error el `width: "50%"` del envoltorio culpable. Volví a aplicar el layout correcto y confirmé que el test reforzado pasa. Descarté un enfoque inicial con `.parent` (devolvía el propio nodo, no el padre esperado, por la doble capa composite/host de React Native) y otro con `UNSAFE_root.findByProps` (ambiguo entre la capa composite y la host) antes de asentarme en `toJSON()`, que es el árbol host puro que la propia librería usa internamente para `toHaveStyle`.

Nota técnica: tuve que evitar importar el tipo `ReactTestRendererJSON` de `'react-test-renderer'` explícitamente — ese paquete no trae `.d.ts` propio ni hay un `@types/react-test-renderer` compatible con React 19.2, así que un `import type` directo rompía `tsc --noEmit` con "Could not find a declaration file for module 'react-test-renderer'". La solución fue dejar que TypeScript infiera el tipo de `toJSON()` sin nombrarlo (con un `if (arbol === null || Array.isArray(arbol)) throw ...` como guarda de tipos), tal como ya hacía sin problemas el test preexistente `UNSAFE_root.findAllByType(Line)`. No instalé ningún paquete adicional para esto.

### Evidencia de TDD (ronda 2)

**Antes** — test actualizado a la versión de 10 tests, sin tocar la implementación (`npm test -- componentes.test`):

```
Test Suites: 1 failed, 1 total
Tests:       3 failed, 7 passed, 10 total

● el anillo se dibuja y anuncia su progreso
  Unable to find an element with role: progressbar

● recetas que ningún tema registrado activa › la barra segmentada enciende los segmentos, no encoge la barra
  TypeError: Cannot read properties of undefined (reading 'Provider')

● recetas que ningún tema registrado activa › el anillo medidor dibuja sus marcas de escala
  TypeError: Cannot read properties of undefined (reading 'Provider')
```

**Después** — tras aplicar los cinco ficheros corregidos más el `accessible` en `anillo.tsx`:

```
PASS src/design/componentes/componentes.test.tsx
  √ el texto toma el color del tema
  √ la etiqueta usa el color tenue y va en mayúsculas
  √ el botón dispara su acción
  √ la barra recorta el progreso al 100 por ciento
  √ la barra no acepta progresos negativos
  √ la barra refleja un progreso intermedio
  √ el anillo se dibuja y anuncia su progreso
  √ un tema desconocido cae al tema por defecto en vez de romper
  recetas que ningún tema registrado activa
    √ la barra segmentada enciende los segmentos, no encoge la barra
    √ el anillo medidor dibuja sus marcas de escala

Test Suites: 1 passed, 1 total
Tests:       10 passed, 10 total
```

### Suite completa y typecheck

```
npm test
Test Suites: 7 passed, 7 total
Tests:       38 passed, 38 total
```

(33 antes de esta ronda + 5 tests nuevos en `componentes.test.tsx` = 38; los 28 de las otras 6 suites y los 5 originales de `componentes.test.tsx` siguen intactos.)

```
npx tsc --noEmit
```
Sin salida — limpio.

### Ficheros cambiados en esta ronda

- `apps/kaizen/package.json` / `package-lock.json` (añade `expo-linear-gradient` a `dependencies`)
- `apps/kaizen/src/design/proveedor.tsx` (exporta `ContextoTema`)
- `apps/kaizen/src/design/componentes/barra.tsx` (layout segmentado + accesibilidad)
- `apps/kaizen/src/design/componentes/boton.tsx` (`fontWeight` del tema)
- `apps/kaizen/src/design/componentes/superficie.tsx` (`LinearGradient` real + borde solo color/degradado)
- `apps/kaizen/src/design/componentes/anillo.tsx` (accesibilidad + `accessible`)
- `apps/kaizen/src/design/componentes/componentes.test.tsx` (10 tests, con el refuerzo estructural propio)

Commit: `e978f34 fix(kaizen): ronda 1 de arreglos sobre el proveedor y componentes base` — 8 ficheros, todos bajo `apps/kaizen/`. Confirmé con `git diff --cached --name-only` antes de comitear y `git status --short apps/kaizen` después (limpio).

### Autorrevisión de la ronda 2

- Repasé el diff con grep dirigido a colores/radios/pesos literales: el `fontWeight: '700'` de `boton.tsx` ya no aparece (confirmado por ausencia en el grep); los únicos literales que quedan son los mismos ya señalados en la ronda 1 (`borderWidth: 1` en `superficie.tsx`, `borderRadius: 2` en los segmentos de `barra.tsx`), sin cambios, y ya evaluados como aceptables por la revisión.
- El degradado de `Superficie` ahora sí interpola `desde`→`hasta` de verdad vía `LinearGradient`; no lo pude verificar visualmente (sin snapshot/dispositivo), pero confirmé que renderiza sin excepción dentro del test suite existente (ningún test actual monta `Superficie` con fondo `degradado` directamente, pero `Boton` sí monta `Superficie`, y todos los tests de `Boton` pasan con la nueva importación de `expo-linear-gradient` cargada).
- El `accessible` añadido a `Anillo` no estaba en el brief; lo documenté explícitamente arriba con la traza de causa raíz (código fuente de RNTL) en vez de dejarlo como un cambio silencioso.
- Verifiqué con evidencia de ejecución (no solo lectura) que el test de la barra segmentada protege de verdad: lo hice fallar reintroduciendo el bug, confirmé el mensaje de error, y confirmé que vuelve a pasar con el fix.

### Preocupaciones (ronda 2)

1. Los literales de radio/grosor listados en la ronda 1 (`borderWidth: 1` en `superficie.tsx`, `borderRadius: 2` en `barra.tsx`, y los defaults geométricos de `anillo.tsx`) siguen sin tocar — el coordinador los declaró aceptables ("el contrato no define un token para ellos"), así que no los toqué en esta ronda tampoco.
2. La rama `recurso` de `Superficie` y el resultado visual del degradado siguen sin cobertura de test automatizada en el árbol permanente (ningún tema actual los activa con una `Superficie` real, solo indirectamente vía `Boton` con fondos de tipo `color`). Sigue siendo una zona de confianza por lectura de código más que por ejecución, igual que en la ronda 1.
3. El `accessible` que añadí a `Anillo` no se le añadió también a `Barra` (el brief corregido de `barra.tsx` no lo incluye y ningún test lo exige, ya que ahí se consulta por `testID`, no por `getByRole`). Por coherencia de accesibilidad real, valdría la pena que una revisión futura confirme si `Barra` necesita el mismo tratamiento — hoy sus `accessibilityRole`/`accessibilityValue` podrían no ser detectados por un lector de pantalla real por la misma razón que afectaba a `Anillo`, aunque ningún test actual lo exija.

---

## Ronda de arreglos 2

El coordinador confirmó que el revisor validó las dos desviaciones propias de la ronda 1 (el `accessible` en `Anillo` y el agujero en el test de la barra segmentada) como diagnósticos correctos, no apaños. Cuatro de los seis hallazgos originales quedaron cerrados; quedaban dos abiertos, ambos señalados por mí mismo como preocupación en el informe de la ronda 1:

- **Hallazgo 6** (accesibilidad de `Barra`): confirmado, `Barra` llevaba `accessibilityRole`/`accessibilityValue` pero no `accessible`, la misma causa raíz que diagnostiqué en `Anillo`.
- **Hallazgo 2** (agujero en el test de la barra segmentada): mi comprobación estructural (`toJSON().children` con longitud 10) detecta un *envoltorio* reintroducido, pero no la variante más simple: poner `width` directamente en el propio contenedor `barra-segmentos`, sin ningún envoltorio nuevo. Con esa variante, tanto el recuento de segmentos como mi comprobación estructural siguen en verde.

### Qué implementé

Siguiendo el brief regenerado, verbatim, tocando únicamente `barra.tsx` y `componentes.test.tsx` (nada en `superficie.tsx`, `boton.tsx` ni `anillo.tsx`, y sin sustituir ningún test existente, solo añadir):

1. **`barra.tsx`** — `accessible: true` en el objeto `accesibilidad`, con el comentario del brief explicando por qué no es opcional (recorrido de hijos en vez de tratar la vista como unidad; VoiceOver/TalkBack no anuncian nada sin él).
2. **`componentes.test.tsx`** — dos tests nuevos dentro del `describe('recetas que ningún tema registrado activa', ...)`, después del test de conteo de segmentos existente:
   - `'el contenedor de segmentos nunca lleva ancho propio'`: aplana el estilo de `barra-segmentos` con `StyleSheet.flatten` y exige `width === undefined`. Esta es la invariante real (el contenedor de segmentos no puede llevar ancho, nunca), no una comprobación de forma del árbol.
   - `'la barra anuncia su progreso a un lector de pantalla'`: consulta `Barra` por `getByRole('progressbar')` y comprueba `accessibilityValue.now`, que es lo que demuestra que el `accessible` del punto 1 funciona de verdad (sin él, `getByRole` no encuentra nada, como ya pasó con `Anillo` en la ronda 1).
   - Añadí también el import de `StyleSheet` desde `'react-native'`.

### Evidencia de TDD

**Antes** — tests nuevos añadidos, `barra.tsx` sin el `accessible` (`npm test -- componentes.test`):

```
Test Suites: 1 failed, 1 total
Tests:       1 failed, 11 passed, 12 total

● recetas que ningún tema registrado activa › la barra anuncia su progreso a un lector de pantalla
  Unable to find an element with role: progressbar
```

(El test de `width undefined` ya pasaba en este punto porque `barra.tsx` no tenía el bug del ancho — no era ese el que estaba en rojo antes del fix; el que sí lo estaba, y confirma el fix de accesibilidad, era el de rol.)

**Después** — con `accessible: true` añadido:

```
PASS src/design/componentes/componentes.test.tsx
  ...
  recetas que ningún tema registrado activa
    √ la barra segmentada enciende los segmentos, no encoge la barra
    √ el contenedor de segmentos nunca lleva ancho propio
    √ la barra anuncia su progreso a un lector de pantalla
    √ el anillo medidor dibuja sus marcas de escala

Test Suites: 1 passed, 1 total
Tests:       12 passed, 12 total
```

### Verificación de que el test de ancho puede fallar de verdad

Instrucción explícita del coordinador: reproducir la variante concreta del revisor (ancho directo en el contenedor, sin envoltorio) y confirmar que el test nuevo se pone rojo.

1. Apliqué temporalmente exactamente el cambio que describió el revisor:
   ```tsx
   <View testID="barra-segmentos" {...accesibilidad}
         style={{ flexDirection: 'row', gap: 3, width: `${recortado * 100}%` }}>
   ```
2. Ejecuté `npm test -- componentes.test -t "ancho propio"` → **FALLA**, como se esperaba:
   ```
   ● recetas que ningún tema registrado activa › el contenedor de segmentos nunca lleva ancho propio
     expect(received).toBeUndefined()
     Received: "50%"
   ```
3. Con el mismo bug activo, ejecuté también el test de conteo de segmentos preexistente (`-t "segmentada enciende"`) → **sigue en verde**, confirmando exactamente lo que señaló el revisor: ni el recuento por `testID` ni mi comprobación estructural de la ronda anterior (`toJSON().children` con longitud 10, que aquí sigue siendo 10 porque no hay envoltorio nuevo, solo un estilo añadido al mismo nodo) detectan esta variante. Solo el test nuevo de `width === undefined` la detecta.
4. Revertí el cambio a la versión correcta (`style={{ flexDirection: 'row', gap: 3 }}`, sin `width`).
5. Volví a ejecutar la suite completa de `componentes.test` → **12/12 verdes** de nuevo.

### Suite completa y typecheck

```
npm test
Test Suites: 7 passed, 7 total
Tests:       40 passed, 40 total
```

(38 antes de esta ronda + 2 tests nuevos = 40; ninguno de los tests preexistentes se tocó ni se eliminó.)

```
npx tsc --noEmit
```
Sin salida — limpio.

### Ficheros cambiados en esta ronda

- `apps/kaizen/src/design/componentes/barra.tsx` (`accessible: true` + comentario)
- `apps/kaizen/src/design/componentes/componentes.test.tsx` (2 tests nuevos + import de `StyleSheet`)

Commit: `6544734 fix(kaizen): ronda 2 de arreglos — accesibilidad y test real en Barra` — 2 ficheros, ambos bajo `apps/kaizen/`. Confirmé con `git diff --cached --name-only` antes de comitear y `git status --short apps/kaizen` después (limpio). No toqué `superficie.tsx`, `boton.tsx`, `anillo.tsx` ni ningún test existente, tal como se pidió explícitamente.

### Autorrevisión de la ronda 3

- El único literal nuevo en el diff es `accessible: true` — no es un color, radio ni tamaño, es un booleano de accesibilidad prescrito exactamente por el brief; no hay ninguna desviación de la restricción central de la tarea en este cambio.
- Confirmé por ejecución, no solo por lectura, que el test de ancho detecta específicamente la variante que el test de la ronda anterior no detectaba, y que el resto de la suite (incluido el conteo de segmentos y la comprobación estructural previa) sigue pasando con la implementación correcta.
- No quedan hallazgos de las dos rondas de revisión sin atender que yo tenga constancia de.

### Preocupaciones (ronda 3)

Ninguna nueva. Las preocupaciones documentadas en la ronda 1 sobre literales de radio/grosor aceptados y la falta de cobertura de test permanente para la rama `recurso` de `Superficie` y el resultado visual del degradado siguen vigentes sin cambios, ya que esta ronda no tocó esos ficheros.

## Ruta del informe

`c:\Users\josem\Desktop\HAT3X\CLAUDE\HAT3X\.superpowers\sdd\2026-08-17-kaizen-bloque-0-fundaciones\task-8-report.md`
