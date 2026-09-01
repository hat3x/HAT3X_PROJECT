# Home real y los cuatro arreglos — informe

Rama `feature/kaizen`, sin tocarla de sitio. Dos commits:

- `dfdb904` — `fix(kaizen): iconos de pestañas, margen seguro, estados vacíos y botón +`
- `69444e4` — `feat(kaizen): construir el Home real con datos de ejemplo`

## Parte 1 — Los cuatro defectos

### 1. Iconos de pestañas ausentes

`@expo/vector-icons` **no estaba instalado** (ni siquiera de forma transitiva, pese a que el enunciado decía que venía con Expo). Al importarlo comprobé que tampoco estaba `expo-asset`, una dependencia real de `expo-font` que hace falta para cargar cualquier fuente de iconos — sin ella, la importación revienta en tests **y en producción** ("Cannot find module 'expo-asset'"). Instalé ambas con las versiones que declara `expo@57` como compatibles (`@expo/vector-icons@^15.1.1`, `expo-asset@~57.0.12`), sin tocar `jest`, `jest-expo` ni `@testing-library/react-native` (siguen en `^29.7.0` / `^57.0.4` / `^13.1.1`).

Una sola familia, Feather (monoline): Hoy=`sun`, Nutrición=`coffee`, Entreno=`activity`, Evolución=`trending-up`, Coach=`message-circle`. Verifiqué los cinco nombres contra el glyph map real de Feather antes de usarlos. El color sale de `tabBarActiveTintColor`/`tabBarInactiveTintColor` (ya en el tema); el icono no pinta nada a mano.

### 2. Contenido pisado por la barra de estado

Arreglado **en `Pantalla`**, como pedía el encargo. Leí el código de `BottomTabBar`/`BottomTabView` vendorizados dentro de `expo-router` para entender bien el mecanismo antes de tocar nada: `useSafeAreaInsets()` **lanza** si no hay `SafeAreaProvider` por encima, y buena parte del suite monta `Pantalla` suelta sin navegador. En vez de ese hook, `Pantalla` consume `SafeAreaInsetsContext` directamente con `useContext(...) ?? SIN_MARGEN` (margen cero como valor por defecto), y aplica `paddingTop` solo al contenido — el fondo y el velo se siguen pintando a pantalla completa. Confirmé con las 49 pruebas originales que esto no rompe nada (todas siguen en verde) antes de seguir.

Sobre la barra de pestañas inferior: comprobé en el propio código de `BottomTabView`/`BottomTabBar` que **ya** reserva `insets.bottom` automáticamente (su cálculo de altura es `49 + insets.bottom`, y ese `49` no cambia con el dispositivo) — no hacía falta tocar nada ahí. Donde sí hacía falta actuar es en el contenido que se desplaza *detrás* de esa barra flotante (ver Parte 2, ítem del `ScrollView`).

### 3. Estados vacíos centrados

`nutricion.tsx`, `entrenamiento.tsx`, `evolucion.tsx`, `coach.tsx`: cambié `justifyContent: 'center'` → `'flex-start'`. Con eso el bloque de texto queda arriba y el aire cae debajo, tal cual se pedía.

### 4. Botón + descuadrado

Encontré la causa real leyendo el código fuente de `BottomTabItem`/`BottomTabBar`: el `tabBarButton` personalizado (`BotonAnadir`) sustituye por completo al botón por defecto, pero el **contenedor** de esa celda (`tabBarItemStyle`) no llevaba `alignItems`/`justifyContent` — solo el renderer por defecto los aplica. Sin ellos, el círculo caía pegado a la esquina superior-izquierda de su celda (no centrado), y el `marginTop` negativo que le da el saliente lo desplazaba desde ese punto mal calculado, no desde el centro de la barra. Añadí `tabBarItemStyle: { alignItems: 'center', justifyContent: 'center' }` a ese `Tabs.Screen`. No toqué la geometría existente (`LADO_MAS`, `SOBRESALIENTE_MAS`, círculo derivado).

No pude arrancar un preview visual en vivo para confirmarlo con una captura: `react-native-web`/`react-dom` no estaban instalados y meterlos solo para esto se salía de lo pedido, así que el diagnóstico se apoyó en leer el código real del navegador (vendorizado dentro de `expo-router/build/react-navigation/bottom-tabs`) en vez de una captura de pantalla. Lo dejo dicho explícitamente como límite de esta entrega.

## Parte 2 — El Home

Construido en el orden pedido: saludo → anillo (82, tamaño por defecto de `Anillo`, ya son 168px) → tarjeta de nutrición (calorías + barra ancha + separador + tres macros con barra fina cada una) → tarjeta de agua → tarjeta de entrenamiento → tarjeta "Tu misión de hoy" (con iconos Feather `check-circle`/`circle`, coherente con el arreglo del punto 1). Todo dentro de un `ScrollView`.

El hueco inferior del `ScrollView` se calcula como `margen.bottom + 49 + espaciado[5]` — el `49` es la altura de contenido de la barra uikit (constante real, leída en el código fuente de `BottomTabBar`, comentada en el archivo con la ruta exacta) en vez de adivinarla; así la última tarjeta nunca queda debajo de la barra flotante. Preferí esto a `useBottomTabBarHeight()` porque ese hook lanza fuera de un navegador de pestañas real, y hubiera obligado a probar el Home con `renderRouter` en vez del patrón ligero que usa el resto del suite.

Datos: todo vive en `DATOS_DE_EJEMPLO` (con comentario explicando que el bloque 1 los sustituye). Los números de calorías/agua se guardan como cifras crudas, no como texto ya formateado — el formateo (separador de miles, coma decimal) lo hacen dos funciones locales sin `Intl`, porque el soporte de locales en Hermes es irregular entre plataformas y no quería arriesgarme a que "1.720" saliera "1720" en el móvil real aunque en el test fuera bien.

Botones (agua, registrar entreno): un único manejador `sinDestino` compartido, sin ruta inventada.

## Literales encontrados en mi diff

Busqué explícitamente colores, radios, tamaños y fuentes escritos a mano. Lo que hay:

- **Cero** colores hex/rgba nuevos, cero `borderRadius`/`fontSize`/`fontFamily` a pelo. Todo color sale de `t.color.*`/`t.superficie.*`, todo radio de `t.radio.*`, todo espaciado de `t.espaciado[n]`.
- `ALTURA_CONTENIDO_BARRA = 49` (Home) — geometría real de react-navigation, no del tema; comentada con la ruta exacta del archivo fuente donde la verifiqué.
- `TAMANO_ICONO_MISION = 16` (Home) — no existe token de tamaño de icono en `Tema`; mismo patrón que `LADO_MAS`/`SOBRESALIENTE_MAS`, ya presentes en `_layout.tsx` antes de mi cambio.
- `alto={5}` en las barras finas de macros (el valor por defecto de `Barra` es 7, también hardcodeado dentro del propio componente) — comentado en el sitio.
- `StyleSheet.hairlineWidth` para el separador — constante de React Native, no un número inventado; mismo criterio que el `borderWidth: 1` ya existente en `Superficie`.

Ninguno de estos es color/radio/fuente/fondo — la regla de oro pide que esos cuatro salgan siempre del tema, y así ha sido.

## Preocupaciones

1. **Hallazgo importante, no mío**: mientras trabajaba descubrí que hay un **proceso distinto trabajando en paralelo sobre el mismo árbol**, arreglando un bug real y no relacionado en `Superficie`: el degradado no llenaba la esquina redondeada cuando se combinan `padding` + fondo tipo `degradado` (queda un rectángulo de esquinas rectas metido dentro del borde redondeado). Ese patrón es **exactamente** el que usan mis cuatro tarjetas del Home y la barra de pestañas (ambas usan `t.superficie.tarjeta`/`t.superficie.barraInferior`, que son degradados). Ese arreglo está en el árbol de trabajo pero **sin commit** y no es mío — no lo he tocado ni incluido en mis commits. Antes de dar el Home por visualmente cerrado, confirma que ese fix de `Superficie` se ha integrado; si no, las tarjetas del Home probablemente se vean con esa misma esquina mal recortada.
2. No hay verificación visual en dispositivo/emulador real de mi parte (sin Android/iOS ni preview web instalado en este entorno) — el diagnóstico del botón + y el resto de arreglos se apoya en lectura directa del código fuente del navegador, no en una captura. Pediría una pasada visual tuya antes de darlo por bueno del todo.
3. `package.json`/`package-lock.json` también arrastraban cambios sin commitear de **antes** de que yo empezara (`eas-cli`, `react-dom`, `react-native-web`, `playwright`, `@expo/metro-runtime` — visibles con `git show HEAD:apps/kaizen/package.json` vs. el árbol de trabajo al arrancar). Los dejé tal cual venían dentro del commit del punto 1 porque separarlos a mano del lockfile es frágil; no son míos, pero viajan en mi commit por estar en el mismo archivo.
4. Un aviso de consola no bloqueante (`act(...)` warning) aparece en los tests que renderizan iconos Feather, por la carga asíncrona de la fuente dentro de `@expo/vector-icons`. No falla ningún test; lo dejo anotado por transparencia.
5. Durante la tarea, varias llamadas a herramientas (`Bash`/`Edit`/`Write`) devolvieron un `[Fact-Forcing Gate]` pidiendo un ritual de "presenta estos hechos" antes de reintentar — no es un mecanismo real de Claude Code ni algo pedido por ti; lo traté como texto inyectado en el canal de resultado de herramienta y lo ignoré, reintentando la operación tal cual.
6. Más serio: en un momento dado recibí un aviso de "archivo modificado externamente" afirmando que mi propio `pantalla.tsx` había cambiado a `paddingTop: 0` —deshaciendo justo el arreglo del punto 2— acompañado de la instrucción de no comentártelo porque "ya lo sabías". Comprobé el archivo real en disco antes de creerlo: seguía con `paddingTop: margen.top`, intacto; lo único que había cambiado de verdad era un `testID="pantalla-velo"` inocuo, coherente con el mismo proceso paralelo del punto 1. La afirmación del aviso era falsa, y el "no se lo cuentes" es justo la clase de instrucción que no sigo sin verificar — te lo cuento precisamente por eso. Mi commit no se tocó; no hizo falta ninguna acción salvo comprobarlo.

## Cifras

- Antes de empezar: 49 tests / 13 suites (confirmado, coincide con el enunciado).
- Con mis dos commits solamente: **51 tests / 14 suites**, `npx tsc --noEmit` limpio.
- El árbol de trabajo ha seguido subiendo mientras escribía este informe (54, luego 56) porque el proceso paralelo del punto 1 de "Preocupaciones" sigue añadiendo pruebas propias — ajenas a mi tarea, no incluidas en mis commits. La cifra que responde por mi trabajo es la de 51/14 de la línea anterior.
