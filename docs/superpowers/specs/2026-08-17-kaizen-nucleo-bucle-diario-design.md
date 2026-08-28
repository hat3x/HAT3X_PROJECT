# KAIZEN — Núcleo: fundaciones y bucle diario

**Fecha:** 2026-08-17
**Estado:** diseño aprobado, pendiente de plan de implementación
**Bloques cubiertos:** 0 (fundaciones) y 1 (bucle diario)

---

## 1. Qué es KAIZEN

Una aplicación móvil de seguimiento de transformación física: nutrición, entrenamiento, hábitos y progreso. No es una app de contar calorías; el objetivo no es acumular datos sino **conseguir que el usuario cumpla su plan**.

El nombre viene del japonés *kaizen*, mejora continua: el resultado grande como acumulación de actos pequeños sostenidos. Es la tesis del producto y por eso da nombre al índice de adherencia, el **KAIZEN Score**.

La app debe responder en todo momento a tres preguntas: cómo voy hoy, qué debería hacer ahora, y si estoy progresando.

### Colisión de nombre, resuelta

Existe ya `apps/atlas`, la app de monitorización de producción de HAT3X. Este proyecto vive en **`apps/kaizen`** y no comparte nada con aquella. El nombre provisional del brief original era ATLAS; queda descartado.

---

## 2. Descomposición del producto

El brief original describe un producto de al menos seis subsistemas independientes. No cabe en un spec. Queda descompuesto así, y **este documento cubre solo los bloques 0 y 1**:

| Bloque | Contenido | Depende de |
|---|---|---|
| **0 — Fundaciones** | Auth multiusuario y RLS, perfil, esquema base, sistema de diseño con temas, navegación, capa de datos con cola offline | — |
| **1 — Bucle diario** | Onboarding y objetivos, registro de comida (búsqueda, código de barras, entrada rápida), agua, entrenamiento básico, hábitos con recordatorios, Home, timeline del día, peso con tendencia | 0 |
| **2 — Fricción cero** | Registro por voz, AI Food Vision, recetas, aprendizaje de comidas habituales | 1 |
| **3 — El copiloto** | Coach contextual, motor de notificaciones proactivas con control de fatiga, Rescue Mode, modos (focus / maintenance / travel / recovery) | 1, y semanas de datos reales |
| **4 — Progreso y narrativa** | Evolution (fotos, medidas), Timeline de transformación, Weekly Review, patrones y correlaciones, recalibración del gasto real | 1, y ≥4 semanas de histórico |
| **5 — Entrenamiento profundo** | Ejercicios, series, repeticiones, PR, volumen, historial | 1 |

Cada bloque tendrá su propio ciclo spec → plan → implementación.

---

## 3. Decisiones tomadas

| Decisión | Elección | Motivo |
|---|---|---|
| Plataforma | **Expo / React Native** (iOS + Android) | Push locales y remotas fiables, que sostienen el coaching del bloque 3; SF Symbols; vía abierta a HealthKit / Health Connect |
| Backend | **Supabase** | Auth, Postgres con RLS, Storage y Edge Functions; experiencia previa del equipo |
| Destino | **Personal ahora, comercial después** | Multi-tenant limpio desde el día 1, distribución por TestFlight, sin pasarela de pago todavía y sin atajos que haya que deshacer |
| Datos de alimentos | **Open Food Facts en vivo**, sin catálogo importado | Coste cero y sin trabajo de ingesta. Mitigado con copia de nutrientes al registrar y con la entrada rápida (§10.3) |
| Sin conexión | **Cola de escrituras en el dispositivo** | El grueso del valor de local-first por una fracción del trabajo |
| Tests | **jest-expo + React Native Testing Library** | Es lo que Expo soporta. Se acepta la desviación respecto a Vitest, usado en el resto del repositorio |
| Layout de Home | **D1** — Score en anillo arriba, calorías destacadas sobre los macros | Validado sobre maquetas |
| Temas | **Dos binarios, no un interruptor** | El skin personal no puede viajar en el paquete público (§7.3) |

---

## 4. Arquitectura

Proyecto autocontenido en `apps/kaizen`, como el resto de apps del repositorio.

| Capa | Contenido |
|---|---|
| `src/app/` | Rutas con Expo Router: las 5 pestañas y los sheets modales |
| `src/design/` | Tokens, contrato de temas y componentes base |
| `src/features/` | Un directorio por dominio: `nutricion`, `agua`, `entrenamiento`, `habitos`, `peso`, `onboarding`, `perfil` |
| `src/dominio/` | Lógica pura: objetivos, KAIZEN Score, día local, agregados |
| `src/datos/` | Cliente Supabase, hooks de TanStack Query, cola offline |

**Regla dura:** `src/dominio/` no importa React ni Supabase. Toda la lógica que puede estar mal en silencio —calorías, macros, score, fechas— se prueba sin montar una pantalla ni levantar una base de datos.

Navegación: cinco pestañas (Today · Nutrition · Training · Evolution · Coach) más el botón **+** central. Perfil y ajustes se alcanzan desde el avatar de la cabecera, no ocupan pestaña.

En los bloques 0 y 1, las pestañas Evolution y Coach existen en la navegación pero con contenido mínimo: Evolution muestra peso y tendencia; Coach muestra un estado vacío explicando que llegará cuando haya datos suficientes.

---

## 5. Modelo de datos

Postgres en Supabase. **Todas** las tablas llevan `user_id` y política RLS `user_id = auth.uid()` para select, insert, update y delete.

| Tabla | Campos principales |
|---|---|
| `perfiles` | `id` (→ auth.users), `nombre`, `fecha_nacimiento`, `sexo`, `altura_cm`, `unidades`, `zona_horaria`, `corte_dia`, `hora_silencio` |
| `objetivos` | `user_id`, `vigente_desde`, `kcal`, `proteina_g`, `carbos_g`, `grasas_g`, `agua_ml`, `objetivo`, `origen` (`auto`\|`manual`) |
| `alimentos` | `user_id`, `nombre`, `kcal_100`, `proteina_100`, `carbos_100`, `grasas_100`, `codigo_barras`, `origen` (`off`\|`propio`), `ultima_cantidad_g` |
| `comidas` | `user_id`, `fecha_local`, `momento`, `registrado_en` |
| `comida_items` | `comida_id`, `nombre`, `cantidad_g`, `kcal`, `proteina_g`, `carbos_g`, `grasas_g`, `alimento_id`, `fuente` |
| `registros_agua` | `user_id`, `fecha_local`, `ml`, `registrado_en` |
| `entrenamientos` | `user_id`, `fecha_local`, `tipo`, `duracion_min`, `intensidad`, `notas`, `registrado_en` |
| `habitos` | `user_id`, `nombre`, `icono`, `activo`, `orden`, `hora_aviso`, `hora_cierre`, `avisos_activos` |
| `habitos_registro` | `habito_id`, `fecha_local`, `hecho`, `registrado_en` |
| `pesos` | `user_id`, `fecha_local`, `kg` |

### 5.1 Tres decisiones no obvias

**Los objetivos se historizan, no se sobreescriben.** `objetivos` lleva `vigente_desde`. Cuando el usuario pase de definición a mantenimiento, su adherencia de los meses anteriores se sigue midiendo contra los objetivos que tenía entonces. Si se sobreescribiera, todo el histórico se reescribiría solo y el Timeline de transformación del bloque 4 mentiría.

**Cada registro guarda el instante y el día al que cuenta.** `registrado_en` (timestamptz, momento real) y `fecha_local` (date, día al que suma). `fecha_local` se calcula en el cliente con la zona horaria del perfil y el **corte de día configurable** (por defecto 04:00). Resuelve dos problemas: viajar entre zonas horarias sin partir el histórico, y que una cena a la 01:30 cuente como el día anterior. Todos los agregados van por `fecha_local`.

**Los nutrientes se copian al registrar, no se referencian.** `comida_items` guarda los valores calculados, no un puntero a un producto remoto. Si mañana alguien edita ese yogur en Open Food Facts, el historial de hace tres meses no cambia solo.

### 5.2 Agregados

El resumen diario y el KAIZEN Score se calculan al vuelo mediante vista SQL, no se materializan. Como los objetivos están historizados, recalcular un día pasado da siempre el mismo resultado. La materialización se valorará en el bloque 4, cuando el volumen lo justifique.

---

## 6. Capa de datos y funcionamiento sin conexión

TanStack Query con caché persistida en el dispositivo. Detección de red con NetInfo. Las mutaciones se serializan, se pausan sin conexión y se reproducen al recuperarla.

**Idempotencia por UUID de cliente.** Cada mutación genera su `id` en el móvil y se inserta con él. Si la app reintenta un envío que sí había llegado, el insert choca contra el mismo identificador y no se duplica. Sin esto, la cola offline crea registros duplicados y el fallo no se detecta hasta que los números dejan de cuadrar.

Qué funciona sin conexión:

| Acción | Sin red |
|---|---|
| Registrar agua, entrenamiento, hábito, peso | Sí |
| Entrada rápida de alimento | Sí |
| Repetir un alimento reciente | Sí (recientes cacheados) |
| Buscar en Open Food Facts | No |
| Escanear un código nuevo | La cámara sí; la consulta no. Se ofrece entrada rápida con el código adjunto |

---

## 7. Sistema de diseño y arquitectura de temas

### 7.1 Principio

Ninguna pantalla define un color, un radio, una fuente ni un fondo por su cuenta. Todo sale del tema. Si esa regla se respeta, cambiar de piel es cambiar un fichero; si se rompe una sola vez, el sistema de temas se convierte en un conjunto de parches.

### 7.2 El tema tiene tres capas

| Capa | Contenido | Ejemplos |
|---|---|---|
| **Valores** | Color, radio, espaciado, pesos tipográficos, sombras, ajuste de interlineado | `acento`, `radio.tarjeta` |
| **Recursos** | Imágenes de fondo, texturas, arte de botón, iconografía, tipografías | `fondo.pantalla`, `boton.primario.arte` |
| **Recetas** | Cómo se compone cada pieza | Barra continua o segmentada; anillo liso o medidor con escala |

Consecuencia: **ningún componente asume que su fondo es un color**. Recibe «el fondo primario del tema», que puede resolverse como color, degradado o imagen escalable. El arte de botón que no debe deformarse en las esquinas usa `capInsets` en iOS y nine-patch en Android, así que el componente de superficie lo soporta desde el diseño.

El tema declara además **espacios de decoración** (`decoracion.cabecera`, `decoracion.tarjetaEntrenamiento`, …) que el tema por defecto deja vacíos. Sin ellos, los adornos de un skin cargado acaban incrustados a mano dentro de las pantallas.

### 7.3 Contrato tipado y separación de binarios

El catálogo del tema es una **interfaz de TypeScript que todos los temas implementan por completo**. Si un tema declara una clave que otro no tiene, falla en compilación. Un test recorre las claves para cubrir el caso de que alguien silencie al compilador.

El skin personal **no es un interruptor dentro de la app pública**. Si sus recursos están en el paquete, están distribuidos aunque el tema esté apagado, y un flag es algo que se puede acabar activando. Son **dos perfiles de EAS Build sobre el mismo código**:

- `tienda` — compila solo el tema por defecto
- `personal` — incluye además el directorio del skin, que está fuera del control de versiones

Efecto colateral favorable: las texturas y tipografías del skin no engordan la app pública.

### 7.4 Requisitos que todo tema debe cumplir

- **Mismo listón de contraste que el tema por defecto**, sin excepciones. Un tema que obliga a forzar la vista deja de usarse.
- Cuando haya que ceder espacio, **ceden los adornos, nunca el dato**.
- Las tipografías propias alteran la métrica: el ajuste de interlineado es un token por tema.
- Todo fondo de pantalla completo lleva su **velo de oscurecimiento tokenizado** entre la imagen y el contenido.

### 7.5 Material

Liquid Glass es una API nativa de iOS 26. En Expo entra por `expo-glass-effect`; en Android y en iOS anteriores se recurre a un desenfoque equivalente. El sistema expone un componente `Superficie` que resuelve uno u otro, para que ninguna pantalla decida esto por su cuenta.

El cristal necesita algo detrás que refractar: sobre un fondo plano no se ve. El tema por defecto aporta un campo de color tenue bajo el contenido.

---

## 8. Onboarding y cálculo de objetivos

### 8.1 Los pasos

Nueve pantallas, una cosa por pantalla, todas saltables salvo el mínimo:

1. Nombre
2. Edad, sexo y altura
3. Peso
4. Objetivo (perder grasa · ganar músculo · recomposición · mantener · hábitos · rendimiento)
5. Actividad, descrita con ejemplos reales, no con jerga
6. Entrenamiento: frecuencia semanal, tipo, experiencia
7. **La propuesta**
8. Restricciones y alergias
9. Unidades y zona horaria (detectada, solo se confirma)

La pantalla 7 no escupe un número: **enseña de dónde sale** y permite aceptarlo o ajustarlo ahí mismo.

### 8.2 El cálculo

Metabolismo basal con **Mifflin-St Jeor**, multiplicado por el factor de actividad (1,2 · 1,375 · 1,55 · 1,725 · 1,9) y ajustado por objetivo: −20% para perder grasa, +10% para ganar músculo, mantenimiento para recomposición y hábitos, +5% para rendimiento.

Macros: proteína 2,0 g/kg en déficit y 1,8 g/kg en el resto; grasas 0,9 g/kg con mínimo del 20% de las calorías; carbohidratos, el resto.

**Suelos de seguridad, no negociables:** nunca por debajo del metabolismo basal, nunca por debajo de 1.500 kcal en hombres o 1.200 en mujeres, y nunca un déficit superior al 25%. Si el cálculo cae por debajo, se sube al suelo y se explica por qué.

### 8.3 Datos que faltan

- **Sin peso no hay cálculo automático.** El peso se pide como opcional; si no se da, el onboarding lleva a la vía manual en lugar de inventarse un número.
- **Sin sexo, estimación menos precisa.** Mifflin lo necesita. Se ofrece con opción de no responder; si no se responde se usa el punto medio de ambas fórmulas y se advierte de la pérdida de precisión.

En modo manual el usuario introduce sus cifras y la app solo comprueba que los macros cuadren con las calorías (±5%). **Avisa, no bloquea.**

La pantalla dice explícitamente que **esto es un punto de partida, no una medida médica**. Los factores de actividad sobreestiman con frecuencia; la recalibración con datos reales llega en el bloque 4.

---

## 9. KAIZEN Score

### 9.1 Naturaleza

**Durante el día en curso el score no es una nota, es progreso acumulado.** Arranca en 0 cada mañana y sube conforme se completan cosas: se lee como un anillo que se llena, igual que un contador de pasos. Al cerrar el día se congela y pasa a ser la nota que alimenta el histórico.

Sin esta distinción, un índice de adherencia calculado ingenuamente marca 13/100 a las nueve de la mañana, lo cual es demoledor y además falso.

### 9.2 Componentes

| Componente | Peso | Cómo puntúa |
|---|---|---|
| Calorías | 30 | **Dentro de banda** (±8% del objetivo). Decae por encima *y por debajo* |
| Proteína | 25 | Proporcional hasta el objetivo. Pasarse no penaliza |
| Hidratación | 15 | Proporcional al objetivo |
| Entrenamiento | 20 | Solo si hoy tocaba |
| Hábitos | 10 | Proporción de los marcados |

Los componentes activos se **normalizan siempre a 100**: si hoy no tocaba entrenar, sus 20 puntos se reparten entre el resto.

### 9.3 Dos decisiones deliberadas

**Comer 900 kcal no es un día perfecto.** El componente de calorías premia estar en rango, no comer poco. Una app que puntúa mejor cuanto menos comes empuja al comportamiento que el producto quiere evitar.

**La constancia queda fuera del score diario.** El brief la incluía entre los componentes, pero si la racha entra en la nota de hoy, el día de hoy depende de lo que se hizo ayer y deja de ser posible hacer un buen día después de uno malo. Eso castiga justo cuando hace falta lo contrario. La constancia se muestra aparte, como racha.

---

## 10. Home y registro

### 10.1 Home (layout D1)

De arriba abajo: saludo y contexto del día · **anillo del KAIZEN Score** con su frase · bloque de nutrición (calorías destacadas con barra ancha, separador, tres macros en columnas) · agua con botones +250 y +500 · entrenamiento con su acción · **Tu misión de hoy** · barra inferior flotante con el **+** central.

«Tu misión de hoy» es una lista corta que se completa sola conforme avanza el día. Sin medallas, sin confeti, sin estética de videojuego.

### 10.2 La hoja del +

Seis entradas en el bloque 1: buscar alimento · escanear código · entrada rápida · agua (+250 / +500 directos) · entrenamiento · peso.

**No aparecen las opciones que aún no existen.** Nada de «Voz — próximamente» en gris: una hoja con la mitad de entradas muertas anuncia lo que le falta a la app cada vez que se abre. Crece en el bloque 2.

### 10.3 El camino crítico

Al abrir la búsqueda, **sin escribir nada ya se ven los recientes**, y cada reciente recuerda **la última cantidad usada**. Repetir los 80 g de avena de cada mañana es: tocar +, tocar la fila. **Un toque sobre la lista y queda registrado**, sin pasar por la pantalla de cantidad; tocar el nombre en vez del botón permite ajustarla.

La **entrada rápida** (nombre, calorías y opcionalmente macros) guarda el alimento como propio, así que a partir de ahí aparece en recientes y en las búsquedas. Es la mitigación de haber descartado el catálogo importado: **el catálogo se construye solo con lo que el usuario realmente come**. Veinte segundos la primera vez, un toque las siguientes doscientas.

### 10.4 Búsqueda y escáner

Búsqueda contra Open Food Facts con el país fijado en España, retardo entre pulsaciones, `User-Agent` identificable como exige su API, y **descarte de los productos sin calorías por 100 g**, que son muchos y solo generan frustración.

El escáner usa la cámara: detecta el código y salta directo a la pantalla de cantidad. Si el código no existe en Open Food Facts, en lugar de un callejón sin salida ofrece crearlo con la entrada rápida **y asocia el código al alimento propio**. Cada fallo de cobertura se convierte en una mejora permanente del catálogo del usuario.

### 10.5 Momentos y edición

Momentos: desayuno, almuerzo, comida, merienda, cena y otro. Se **preseleccionan** por la hora según las ventanas configuradas. En el bloque 1 las ventanas sirven solo para eso; que la app aprenda los horarios reales y actúe es del bloque 3.

En el timeline cada entrada se toca para editar y se desliza para borrar. **Sin diálogo de confirmación**: se borra y aparece un «deshacer» durante unos segundos. Confirmar cada borrado en algo que se toca veinte veces al día es fricción pura.

---

## 11. Agua, entrenamiento, hábitos y peso

**Agua** — un toque desde Home (+250 / +500). Nada más.

**Entrenamiento** — registro básico: tipo (fuerza, cardio, correr, caminar, bicicleta, HIIT, deporte, otro), duración, intensidad percibida y notas. Y una acción de dos segundos: «entrenamiento completado». Series, repeticiones y PR son del bloque 5.

**Hábitos** — lista configurable con check rápido. Sin interfaz grande.

**Peso** — opcional. Se muestra **la tendencia** (media móvil de 7 días), nunca el dato crudo del día. El lenguaje evita el juicio: «tu media ha cambiado +0,3 kg esta semana», nunca «has engordado».

---

## 12. Recordatorios de hábitos

El motor proactivo completo es del bloque 3. El bloque 1 incluye solo recordatorios locales con horas fijadas por el usuario, que no necesitan servidor, certificados de Apple ni Firebase.

**Cualquier hábito puede llevar un recordatorio diario opcional**, con su interruptor. Dos avisos como máximo por hábito y día:

| | |
|---|---|
| A la hora elegida | **Creatina** · «Pendiente de hoy.» |
| Aviso de cierre | **Creatina** · «Hoy todavía no la has registrado. Aún estás a tiempo.» |

Reglas:

- **Al marcar el hábito se cancela el aviso pendiente.** Recordar algo ya hecho es la vía rápida a que el usuario desactive las notificaciones para siempre.
- **`hora_cierre` es por hábito; `hora_silencio` es global y manda.** La hora de cierre de cada hábito decide *cuándo* se lanzaría el segundo aviso; la hora de silencio del perfil (por defecto 22:00) decide *hasta cuándo* se puede lanzar. Si la hora de cierre de un hábito cae después de la hora de silencio, **ese aviso no se programa**: no se adelanta ni se pospone, simplemente no existe ese día.
- **El segundo aviso nunca repite el texto del primero**: reconoce que el día se acaba. Esa regla queda escrita porque es la clase de detalle que se pierde al implementar y es lo que separa un copiloto de una app pesada.
- **Dos y se acabó.** Tope duro, no preferencia.
- El texto dice **«no has registrado»**, no «no te has tomado». La app conoce el diario, no la cocina.

**El permiso de notificaciones se pide al activar el primer recordatorio, nunca en el onboarding.** iOS solo permite preguntar una vez de forma útil, y pedirlo al arrancar quema ese único intento.

Queda fuera a propósito: marcar el hábito desde la propia notificación. Escribir en base de datos con la app cerrada tiene demasiada letra pequeña en iOS para lo que ahorra.

---

## 13. Privacidad

Los datos que guarda la app —peso, medidas, fotografías corporales, alimentación— son **categoría especial** del RGPD (artículo 9). Desde el primer día, y no como parche cuando el producto se comercialice:

- RLS en todas las tablas, sin excepción
- Aislamiento entre usuarios verificado con test, no solo con política escrita
- **Borrado real de cuenta**, que elimina también los objetos de Storage
- Minimización: no se recoge nada que no use una función concreta

---

## 14. Testing y verificación

### 14.1 Lógica pura

Todo `src/dominio/` con jest-expo, sin pantallas ni base de datos: cálculo de objetivos **incluidos los suelos de seguridad**; KAIZEN Score con la normalización cuando no toca entrenar y la banda de calorías comprobada **por arriba y por abajo**; día local con su corte configurable y un cambio de zona horaria de por medio; agregados.

### 14.2 Lo que falla en silencio

- **Aislamiento entre usuarios** — test de integración contra Supabase local: el usuario B no puede leer, modificar ni borrar datos de A.
- **Idempotencia de la cola offline** — reproducir dos veces la misma mutación produce un solo registro.
- **Cancelación de recordatorios** — marcar el hábito elimina el aviso pendiente; el tope de dos se respeta.
- **Contrato de temas** — un test recorre las claves y comprueba que todos los temas las implementan.

### 14.3 Dos puertas obligatorias antes de dar nada por terminado

Los tests prueban lo que el código dice hacer, no lo que la app hace. En Atlas, 435 tests en verde convivieron con cinco fallos reales.

1. **Recorrido manual del camino crítico en el dispositivo**: abrir, registrar una comida buscando, otra desde recientes, escanear un código, apuntar agua, marcar un hábito, ver el score moverse.
2. **Build real de EAS.** `tsc` limpio y tests verdes no demuestran que la app compile para iOS.

---

## 15. Fuera de alcance

No entra en este spec, y está asignado a su bloque en §2: AI Food Vision, registro por voz, recetas, aprendizaje de comidas habituales, coach conversacional, motor de notificaciones proactivas, Rescue Mode, modos de viaje y mantenimiento, fotos de progreso, medidas corporales, Timeline de transformación, Weekly Review, correlaciones, series/repeticiones/PR, integración con HealthKit o Health Connect, y suscripciones o compras in-app.

Al terminar los bloques 0 y 1 habrá una app que se usa cada día y que **todavía no dice nada por su cuenta**, más allá de los recordatorios de hábitos que el usuario configure. El copiloto necesita semanas de datos reales para calibrarse; construirlo antes sería inventarse los umbrales.

---

## 16. Riesgos conocidos

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Cobertura de Open Food Facts en fresco y cocinado | Alto — es el uso más frecuente | Entrada rápida que construye catálogo propio (§10.3); asociación de códigos no encontrados |
| Expo es stack nuevo en el repositorio | Medio | Backend y patrones de datos se mantienen; la curva está en build y distribución |
| Cuenta de Apple Developer necesaria | Bajo, pero bloqueante para TestFlight | Tramitarla antes de la fase de distribución |
| Legibilidad del skin personal | Medio — deja de usarse si cansa | Requisito de contraste igual al tema por defecto (§7.4) |
| El render del skin no son los recursos | Medio | Hay que producir nine-patch, iconos, fondo limpio y tipografía a partir del concepto |
| Factores de actividad sobreestiman | Medio | Se comunica como punto de partida; recalibración real en el bloque 4 |
