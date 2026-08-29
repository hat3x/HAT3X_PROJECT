# Atlas — Bloque 2: economía · Diseño

**Fecha:** 2026-08-29
**Autor:** Jose (HAT3X) + Claude
**Estado:** Diseño aprobado en brainstorming. Pendiente de revisión de Jose y de planes de implementación.
**Bloque:** 2 de 7 (ver §12 del [diseño del bloque 1](./2026-08-15-atlas-nucleo-monitorizacion-alertas-design.md))

---

## 1. Propósito

El bloque 1 respondió a «¿está todo en pie?». Este responde a la siguiente:
**¿esto da dinero, y con quién?**

Hoy no se puede contestar, porque lo económico de HAT3X está repartido en sitios
que no se hablan:

| Qué | Dónde vive hoy |
|---|---|
| Ingreso recurrente | `contratos.cuota_mensual`, en Atlas |
| Ingresos y gastos sueltos | `hat3x_transactions`, en `apps/jarvis/src/lib/finance.ts` |
| Gastos recurrentes y costes/ingresos por proyecto | `hat3x_recurring_expenses`, `hat3x_project_costs` y `hat3x_project_revenue`, en `apps/jarvis/src/lib/company-brain.ts` |
| Horas trabajadas | `apps/fichaje`, en un `fichaje.json` local |
| Presupuestos y documentos mensuales | Markdown y HTML escritos a mano en `clients/` |
| Facturas | En ningún sitio |
| Rentabilidad | En ningún sitio |

Así que este bloque es sobre todo una **consolidación**. Construye poco que no
exista en alguna forma; lo que hace es ponerlo en un modelo único y correcto, y
jubilar las implementaciones paralelas.

---

## 2. Decisiones tomadas en el brainstorming

Se recogen porque explican por qué el diseño es este y no otro.

1. **Atlas emite facturas fiscales**, no solo las registra. Se planteó la
   alternativa —que Atlas registrara lo emitido en otra herramienta— y se
   descartó.
2. **Régimen no VERI\*FACTU.** Los registros se firman y encadenan localmente y
   no se remiten a la AEAT. A cambio, Atlas carga con conservación,
   inalterabilidad, trazabilidad y registro de eventos, y es además *software de
   fabricación propia*, con los requisitos añadidos que eso conlleva.
3. **Serie nueva desde cero.** Lo emitido antes se queda donde está. La cadena de
   huellas empieza en el primer registro de Atlas.
4. **HAT3X es una sociedad limitada.** Base más 21 % de IVA, sin retención de
   IRPF. Los datos fiscales del emisor están hoy sin rellenar, y eso bloquea 2E.
5. **Los gastos entran a mano**, bien clasificados, con los recurrentes dados de
   alta una vez. Sin OCR y sin importación bancaria.
6. **Las horas se fichan desde Atlas**, no se deducen de los logs de Claude Code.
   La regla es explícita: *quien no ficha antes de empezar, no cuenta sus horas.*
7. **No se prorratean los gastos generales** entre clientes (§6.3).
8. **El coste de la hora es un número fijo que fija el propietario**, no un
   derivado de la retribución.
9. **El presupuesto mensual del cliente** lo genera Atlas, sin la sección de
   métricas de actividad, que depende de conectores del bloque 3.

---

## 3. Alcance

### 3.1 Los cinco planes

| Plan | Contenido | Depende de |
|---|---|---|
| **2A — El libro** | Facturas y líneas, gastos, gastos recurrentes, periodos de contrato. Migración de `hat3x_transactions`. Jubila `finance.ts` | — |
| **2B — Cobro** | Qué está sin facturar y qué está sin cobrar, con aviso diario | 2A |
| **2C — Horas** | Fichaje desde Atlas. Jubila `apps/fichaje` entera | — |
| **2D — Rentabilidad** | Margen de contribución por cliente y por proyecto | 2A, 2C |
| **2E — Emisión** | Cadena firmada, registro de eventos, numeración, rectificativas, documento imprimible con QR, presupuesto mensual | 2A |

El orden no es arbitrario. 2A es la base de todo. 2B es lo que antes devuelve
dinero. 2C aporta el coste, sin el cual «rentabilidad» es solo mirar ingresos. Y
2E, que es el más caro y el único con responsabilidad legal, va al final, cuando
el modelo ya está asentado y el resto del bloque ya aporta valor.

### 3.2 Facturas propias y ajenas

Hasta que 2E exista, las facturas se siguen emitiendo fuera. Si 2A no las
admitiera, 2B y 2D nacerían vacíos y no servirían durante tres planes.

Por eso `facturas.origen` distingue:

- **`externa`** — emitida fuera; Atlas solo la registra. No entra en la cadena.
  Registrar una factura ajena es contabilidad, no emisión, y no arrastra ninguna
  obligación reglamentaria.
- **`atlas`** — emitida por Atlas desde 2E. Entra en la cadena de huellas.

### 3.3 Fuera de este bloque, y deliberadamente

| Queda fuera | Por qué |
|---|---|
| Contabilidad: libro mayor, asientos, plan contable, modelos 303 y 347 | Atlas no es un programa de contabilidad; la gestoría ya hace eso |
| Conciliación bancaria e importación de extractos | Los gastos entran a mano (decisión 5) |
| Remisión de registros a la AEAT | Es el otro régimen (decisión 2) |
| Facturae y FACe | Son para administraciones públicas; los cinco clientes son privados |
| Multidivisa y multiemisor | Cinco clientes españoles al 21 % |
| Nóminas | |
| Portal de cliente | Ya era un no-objetivo del bloque 1 |
| Métricas de actividad en el documento mensual | Dependen de los conectores del bloque 3 |
| OCR de recibos | Descartado en el brainstorming |

---

## 4. Modelo de datos

Siete tablas nuevas. Todas cuelgan de `clientes` y `proyectos`, que ya existen.

### 4.1 `facturas`

```sql
create table facturas (
  id                uuid primary key default gen_random_uuid(),
  origen            text not null check (origen in ('externa','atlas')),
  serie             text not null,
  -- Nulo mientras es borrador. Se asigna al emitir, bajo bloqueo (§7.2).
  numero            int,
  cliente_id        uuid not null references clientes(id) on delete restrict,
  fecha_emision     date not null,
  fecha_vencimiento date,
  base              numeric(12,2) not null,
  iva_tipo          numeric(4,2)  not null default 21,
  iva_cuota         numeric(12,2) not null,
  total             numeric(12,2) not null,
  estado            text not null default 'borrador'
                    check (estado in ('borrador','emitida','anulada')),
  -- Nulo mientras no se cobra. Es un hecho con fecha, no un estado.
  cobrada_en        date,
  -- Solo en las de origen 'atlas': la cadena del régimen no VERI*FACTU.
  huella            text,
  huella_anterior   text,
  firma             text,
  -- Una rectificativa apunta a la que corrige. Una emitida nunca se edita.
  rectifica_a       uuid references facturas(id) on delete restrict,
  notas             text,
  creado_en         timestamptz not null default now(),
  unique (serie, numero)
);
```

**`on delete restrict` en `cliente_id`.** Hoy `contratos` cae en cascada con el
cliente. Una factura no: borrar un cliente con facturas tiene que fallar y
decirlo. Es un registro fiscal, no un dato de trabajo.

**Los importes se congelan.** `base`, `iva_cuota` y `total` se guardan
calculados, no se derivan al leer. Un tipo de IVA que cambie no puede reescribir
el pasado, y una factura emitida tiene que enseñar siempre lo mismo que se envió.

**Estado y cobro son dos dimensiones.** `estado` es el ciclo fiscal; `cobrada_en`
es una fecha, nula mientras no se cobre. Mezclarlos en un solo enumerado crea
preguntas imposibles («¿una anulada cobrada?»). Es además cómo el bloque 1 ya
modela las incidencias, con `abierta_en` y `cerrada_en`.

### 4.2 `factura_lineas`

```sql
create table factura_lineas (
  id               uuid primary key default gen_random_uuid(),
  factura_id       uuid not null references facturas(id) on delete cascade,
  orden            int not null default 0,
  concepto         text not null,
  descripcion      text,
  cantidad         numeric(10,2) not null default 1,
  precio_unitario  numeric(12,2) not null,
  importe          numeric(12,2) not null,
  -- El proyecto va AQUÍ, no en la factura. Ver abajo.
  proyecto_id      uuid references proyectos(id) on delete set null
);
```

**El proyecto va en la línea.** El presupuesto real de Biodental lo demuestra:
una factura, dos líneas —«Recepcionista IA Sara» 290 € y «App Kairos» 60 €— y
dos proyectos distintos. Si el proyecto colgara de la factura, la rentabilidad
por proyecto sería falsa desde el primer cliente.

### 4.3 `gastos`

```sql
create table gastos (
  id            uuid primary key default gen_random_uuid(),
  fecha         date not null,
  concepto      text not null,
  proveedor     text,
  base          numeric(12,2) not null,
  iva           numeric(12,2) not null default 0,
  total         numeric(12,2) not null,
  categoria     text not null,
  -- Imputación. Ambos nulos = gasto de estructura, no repartible (§6.3).
  cliente_id    uuid references clientes(id)  on delete set null,
  proyecto_id   uuid references proyectos(id) on delete set null,
  -- De qué alta recurrente salió, si salió de alguna.
  recurrente_id uuid references gastos_recurrentes(id) on delete set null,
  notas         text,
  creado_en     timestamptz not null default now()
);
```

Categorías de partida, editables: `infraestructura`, `ia`, `telefonia`,
`herramientas`, `marketing`, `gestoria`, `otro`.

### 4.4 `gastos_recurrentes`

Vercel, Supabase, Twilio, Retell y compañía: lo fijo de cada mes. Se dan de alta
una vez y un `pg_cron` mensual materializa el gasto del periodo.

Es lo que hace sostenible la decisión de meter los gastos a mano: a mano se
meten los raros, no los doce recibos de siempre.

### 4.5 `periodos_contrato`

```sql
create table periodos_contrato (
  id                uuid primary key default gen_random_uuid(),
  contrato_id       uuid not null references contratos(id) on delete cascade,
  periodo           date not null,            -- primer día del mes
  importe_esperado  numeric(12,2) not null,   -- congelado al materializar
  factura_id        uuid references facturas(id) on delete set null,
  unique (contrato_id, periodo)
);
```

Es la columna vertebral de 2B. Un `pg_cron` mensual materializa el periodo de
cada contrato activo. Entonces «¿qué llevo sin facturar?» deja de ser un cálculo
y pasa a ser *las filas con `factura_id` nulo y `periodo` ya pasado*.

Sin esta tabla habría que deducirlo al vuelo cada vez, y esa deducción es justo
la que falla en silencio: **lo que no está registrado no se puede echar de
menos.** Es la lección que dejó el descubridor de tenants de Kairos, donde una
pasada que nunca ocurría se veía igual que un sistema en calma.

### 4.6 `fichajes`

```sql
create table fichajes (
  id           uuid primary key default gen_random_uuid(),
  usuario_id   uuid not null references perfiles(id) on delete restrict,
  proyecto_id  uuid references proyectos(id) on delete set null,
  cliente_id   uuid references clientes(id)  on delete set null,
  inicio       timestamptz not null,
  fin          timestamptz,                  -- nulo = en curso
  nota         text,
  -- 'atlas' = fichado en vivo. 'anadido' = reconstruido después.
  origen       text not null default 'atlas'
               check (origen in ('atlas','anadido')),
  creado_en    timestamptz not null default now(),
  check (fin is null or fin > inicio)
);

-- Una sola en curso por persona, garantizado en la base.
create unique index fichajes_uno_en_curso
  on fichajes (usuario_id) where fin is null;
```

**Los dos ejes, otra vez.** Kairos sirve a varios salones: trabajar en Kairos
*para Biodental* y trabajar en Kairos *en general* no son lo mismo. Con un solo
campo no se distinguen.

**`origen` separa lo medido de lo reconstruido.** Se puede añadir un tramo
pasado, pero queda marcado, y la pantalla enseña qué parte del mes es medida. Esa
señal es la que dice si la regla se está cumpliendo.

**El índice único parcial** garantiza una sola entrada en curso desde la base, no
desde una comprobación del código que cualquier escritura directa se saltaría.

### 4.7 `factura_eventos`

Solo de inserción. Lo exige el régimen no VERI\*FACTU: emisión, anulación,
rectificación, exportación de registros, cambio de configuración fiscal y
anomalías detectadas.

### 4.8 Configuración

Dos valores que hoy no existen y que el bloque necesita:

- **Datos fiscales del emisor** — razón social, CIF, dirección. Hoy son
  marcadores de posición en las plantillas (`[razón social S.L.]`, `[CIF]`).
- **Coste de la hora** — el número que fija el propietario (decisión 8).

Van en una tabla `ajustes_economia` de **una sola fila**, no en variables de
entorno. El motivo es el mismo que llevó la configuración del descubridor a la
base (`lib/descubrir/ajustes.ts`): son datos del negocio, se editan desde la
interfaz, y duplicarlos en el entorno de Vercel crearía una segunda verdad que se
desincroniza el día que cambien.

El coste de la hora, además, **se congela en el cálculo del periodo** cuando se
cierra un mes. Si no, cambiarlo mañana reescribiría la rentabilidad de todos los
meses pasados, y un histórico que se mueve solo no sirve para comparar nada.

Nota de orden para la migración: `gastos.recurrente_id` apunta a
`gastos_recurrentes`, así que esa tabla se crea antes.

---

## 5. Seguridad y permisos

La regla «cualquiera ficha antes de empezar» parte los permisos en dos, y es la
primera vez en Atlas que un colaborador **escribe** algo. Hasta ahora solo leía.

| | Colaborador | Propietario |
|---|---|---|
| Fichar y ver sus propias horas | Sí | Sí |
| Ver horas de los demás | No | Sí |
| Facturas, gastos, márgenes, configuración fiscal | No | Sí |

Todo por RLS, con un test que lo comprueba **con un colaborador real** en vez de
suponerlo, como ya se hace con las incidencias del bloque 1.

El certificado de firma vive en el llavero que ya existe, cifrado con
AES-256-GCM bajo `ATLAS_MASTER_KEY` (§7.3).

---

## 6. Cobro, horas y rentabilidad

### 6.1 Cobro (2B)

Dos preguntas por la misma tubería:

- **Sin facturar** — `periodos_contrato` con `factura_id` nulo y el mes cerrado.
- **Sin cobrar** — `facturas` con `cobrada_en` nulo y vencimiento pasado.

**No se reutiliza `incidencias`.** Un servicio caído y una factura sin cobrar
comparten la palabra «pendiente» y nada más: distinto ciclo, distinta urgencia,
distinto cierre. Compartir tabla obligaría a llenarla de columnas que no aplican
a la mitad de sus filas.

Sí se reutiliza la **entrega**: `notificaciones`, el push y el correo del bloque
1. Solo cambia quién genera el aviso.

Va **una vez al día**, no cada minuto como el vigía. Un día de retraso no es una
urgencia, y un aviso diario que se puede ignorar sin consecuencias deja de leerse
en dos semanas.

La decisión —qué perseguir hoy— es una **función pura** con la fecha por
parámetro, como `agrupar()` y `transicion()` del bloque 1. Se prueba un
vencimiento a 90 días sin esperar 90 días.

### 6.2 Horas (2C)

Se ficha desde Atlas. **`apps/fichaje` se jubila entera y no se porta nada.**

Se consideró portar su motor de atribución —que reparte el tiempo por cliente
leyendo los logs de Claude Code— y se descartó por tres razones:

1. **Solo ve lo que pasa por Claude Code.** Una llamada con el cliente, una
   visita, media hora leyendo su documentación: nada de eso aparece. En un
   negocio de servicios eso es una parte enorme del coste real, y la rentabilidad
   habría salido inflada de forma sistemática.
2. **Solo funciona para quien trabaje con Claude Code en esa máquina.** La regla
   dice «cualquiera».
3. **Obligaba a que algo corriera en el portátil.** Los logs son locales y Atlas
   corre en Vercel.

Lo que se pierde es lo automático: los logs capturaban también lo que se olvida
apuntar. El trato es deliberado —menos dato creíble antes que más dato que nadie
se atreve a usar— y `origen='anadido'` mide cuánto se está perdiendo.

**La regla obliga a algo en la interfaz:** si fichar no cuesta dos segundos, se
olvidará y la regla será un castigo. Por eso va en el marco, siempre visible, y
funciona desde el móvil con la PWA que ya está instalada.

**Olvidarse de cerrar** es el fallo clásico: fichas el lunes y el martes llevas
26 horas seguidas. Se caza con un aviso a las X horas y un tope duro, por el
motor de avisos que ya existe.

### 6.3 Rentabilidad (2D)

Por cliente y mes:

```
  facturado            (facturas del periodo)
− gastos directos      (los que tienen contador suyo)
− horas × coste/hora   (fichajes cerrados del periodo)
─────────────────────
= margen de contribución
```

Debajo, **una sola línea** de coste de estructura sin repartir, y el total del
negocio.

**No se prorratean los generales**, y la razón no es de gusto: el número
respondería a la pregunta equivocada. Hay dos preguntas distintas y conviene no
mezclarlas:

- *¿Me interesa este cliente?* → margen de contribución: lo que ingresa menos lo
  que **desaparecería si lo dejaras**. Si se va Biodental, Vercel sigue costando
  igual. Imputarle una parte hace que un cliente rentable parezca marginal, y se
  puede acabar dejando a uno que sí aportaba.
- *¿Vive el negocio?* → la suma de los márgenes menos la estructura entera. Ahí
  entra Vercel, una sola vez y sin repartir.

Las dos se contestan sin prorratear. Prorratear no añade información: reparte una
cifra que ya tienes y la disfraza de precisión por cliente.

**La regla de imputación: se imputa lo que tiene contador.**

| Gasto | ¿Directo? | Por qué |
|---|---|---|
| Minutos de Retell o Twilio de un cliente | Sí | Hay un contador que dice cuántos son suyos |
| Tokens de IA de un agente concreto | Sí | Igual |
| Supabase de Kairos | No | Es multi-tenant; repartirlo entre los salones sería inventado |
| Vercel, GitHub, dominios | No | No cambian con un cliente más o menos |

Si para repartir un gasto hay que **elegir** una regla —a partes iguales, por
facturación, por horas—, esa elección es del que la elige y no del dato. Una
cifra arbitraria con dos decimales engaña más que dos cifras honestas.

> **Nota abierta:** falta decidir qué es un gasto imputado a un **proyecto**
> pero sin **cliente**. Hoy el código (`apps/atlas/src/lib/db/gastos.ts`)
> cuenta como directo cualquier gasto con `cliente_id` **o** `proyecto_id`, así
> que un gasto solo-proyecto ya cae del lado de «Sí». Pero el propio ejemplo de
> esta sección apunta a lo contrario: «Supabase de Kairos» es un coste de
> proyecto sin cliente concreto detrás, y aquí se clasifica como «No» —
> multi-tenant, repartirlo sería inventado. Las dos reglas no pueden ser
> ciertas a la vez. Esta decisión queda para el plan 2D.

---

## 7. La cadena de facturación (2E)

> La especificación técnica de la AEAT es la autoridad, y la lista exacta de
> campos del registro se valida contra ella y con la gestoría **antes de emitir
> la primera factura**. Lo que sigue es la arquitectura, que no cambia aunque
> cambie un campo.

### 7.1 Dónde se calcula y dónde se garantiza

Cada factura emitida genera un registro cuya huella incluye la de la anterior.
Tocar una factura vieja descuadra todas las posteriores.

El trabajo se parte a propósito:

- **La aplicación calcula.** El hash cubre campos concretos en un orden concreto;
  se prueba con vectores conocidos, en TypeScript, como cualquier función pura.
- **La base garantiza.** Un disparador rechaza todo `update` y `delete` sobre una
  factura emitida, y rechaza todo registro cuya `huella_anterior` no sea la punta
  actual de la cadena.

Ni el código se cree a sí mismo ni la base calcula nada. Una escritura desde
Studio o desde un script se estrella contra el disparador.

### 7.2 El fallo que solo aparece en una inspección

Dos emisiones simultáneas leen la misma punta de cadena y crean **dos ramas**.
Nada falla en el momento: las dos facturas se emiten y las dos parecen bien. El
defecto se descubre cuando alguien recorre la cadena, y ese alguien puede ser
Hacienda.

Se cierra con un bloqueo en la base al asignar número y huella, de forma que las
emisiones se serializan. Es poco código, y sin él el sistema entero deja de
valer.

### 7.3 La firma reutiliza el llavero

El régimen exige firma electrónica, y eso significa una clave privada en alguna
parte. Va al llavero del bloque 1, cifrada con AES-256-GCM bajo
`ATLAS_MASTER_KEY`.

De ahí sale gratis algo que habría que construir: `usarCredencial` deja una fila
en `credencial_usos` **cada vez que se abre el certificado**. Frente a una
inspección, eso es exactamente la trazabilidad que se va a pedir, y ya está
montada y probada.

### 7.4 Atlas vigilándose a sí mismo

El régimen pide registro de eventos y detección de anomalías, que es
precisamente lo que Atlas sabe hacer:

- **`factura_eventos`**, solo de inserción (§4.7).
- **Un verificador de cadena** que recorre las huellas periódicamente y confirma
  que cada una encaja con la anterior. Si se rompe: evento, alerta y aviso al
  móvil, por el mismo canal que las caídas de servicio.

Una cadena rota que nadie mira es igual que no tener cadena.

### 7.5 Rectificativas, documento y QR

**Rectificativas** en su propia serie, apuntando con `rectifica_a` a la que
corrigen. Una emitida nunca se edita.

**No se monta una tubería de PDF.** Atlas sirve la factura como página imprimible
y el navegador la convierte a PDF, que es lo que ya se hace hoy con los
`presupuesto-2026-08.html`. La alternativa —un Chrome sin cabeza en Vercel— es
una dependencia pesada, lenta y una fuente de fallos, a cambio de ahorrar dos
clics.

**El QR** va en SVG dentro de la propia página, sin librería externa ni petición
a terceros.

### 7.6 El presupuesto mensual

El documento que hoy se escribe a mano por cliente es derivable casi entero de
`contratos` y sus `addons`: las líneas del `presupuesto-2026-08.html` de
Biodental son exactamente `cuota_mensual` más un addon.

Se genera con todo menos la sección «Actividad del periodo» —llamadas atendidas,
citas gestionadas, minutos—, que necesita conectores del bloque 3. Lleva la misma
leyenda de siempre: *no tiene validez fiscal.*

---

## 8. Interfaz

Una entrada nueva en la barra lateral: **Dinero**, junto a Resumen, Proyectos,
Clientes y Alertas. No va dentro de Ajustes como el descubridor: aquello es un
registro de trabajo, esto es el segundo eje del negocio.

Dentro: **Resumen** del mes, **Facturas**, **Gastos** y **Rentabilidad**.

Y repartido donde ya se mira:

- **En el marco, siempre visible:** el fichaje. Qué se está haciendo y desde
  cuándo, con un botón.
- **En la ficha del cliente:** sus facturas, su margen y sus horas. Es lo que se
  quiere tener delante justo antes de llamarle.
- **En la ficha del proyecto:** lo mismo por proyecto.
- **En la pantalla de horas:** cuándo fue el último fichaje y qué parte del mes es
  `anadido` en vez de medido.

---

## 9. El dinero no se calcula con `float`

Los importes se calculan en JavaScript, y **JavaScript no sabe sumar dinero**:
`0.1 + 0.2` no da `0.3`, y el 21 % de una base cualquiera producirá céntimos de
más o de menos según por dónde caiga.

En una pantalla eso es feo. En una factura firmada y encadenada es un descuadre
que ya no se puede corregir editando.

**El cálculo va en céntimos enteros**, con el redondeo fiscal explícito y a la
vista, y solo se convierte a euros para enseñarlo. Se guarda como
`numeric(12,2)`, que es exacto en Postgres. Ningún `float` toca un importe.

---

## 10. Migración

**`hat3x_transactions` de jarvis** se vuelca a `gastos` e ingresos, y
`apps/jarvis/src/lib/finance.ts` se jubila. Si se quiere conservar la entrada por
voz, jarvis pasa a llamar a Atlas en vez de tener su propia tabla; el dato deja
de estar en dos sitios.

**`apps/fichaje`** se jubila entera, sin migrar su motor. Su histórico de
`fichaje.json` puede volcarse a `fichajes` con `origen='anadido'`, que es
exactamente lo que es: dato reconstruido. Esto supera en parte el diseño
[2026-08-05-hat3x-fichaje-por-cliente-design.md](./2026-08-05-hat3x-fichaje-por-cliente-design.md),
cuyo motor de atribución por logs deja de usarse.

**Las facturas ya emitidas no se importan** (decisión 3). Las que se quieran
seguir en Atlas entran como `origen='externa'`.

---

## 11. Verificación

Lo de siempre en este repositorio: decisiones puras probadas sin base, capa de
datos contra el Supabase local, `npm run humo` para las rutas nuevas y
`npm run build` antes de dar nada por terminado.

Y cinco pruebas propias de este bloque, que son las que lo sostienen:

| Qué prueba | Por qué |
|---|---|
| Vectores de hash conocidos | La cadena tiene que dar lo que dice la especificación, no algo consistente consigo mismo |
| Un `update` a una factura emitida falla | Contra el disparador, no contra el código. Es la garantía de verdad |
| Dos emisiones simultáneas no bifurcan | Dos conexiones a la vez → números correlativos y cadena íntegra |
| La numeración no deja huecos | Emitir, anular, emitir |
| Un colaborador ficha pero no ve el dinero | Con un usuario real, no con un `if` |

**Lo que no se puede probar aquí:** que la especificación esté bien interpretada.
Los tests confirman que Atlas hace lo que se entendió que hay que hacer, no que
lo entendido sea correcto.

---

## 12. Riesgos y cómo se afrontan

| Riesgo | Cómo se afronta |
|---|---|
| **La interpretación del reglamento es incorrecta.** Es el riesgo dominante del bloque y ningún test lo cubre | 2E va el último, cuando lo demás ya aporta valor. La gestoría valida antes de emitir la primera factura, no después |
| **Los datos fiscales del emisor no existen.** Hoy son marcadores en las plantillas | Bloquea 2E, no 2A–2D. Hay que resolverlo antes de empezar 2E |
| **La regla del fichaje no se cumple** y el coste sale bajo, haciendo que los clientes parezcan más rentables de lo que son | `origen` mide cuánto del dato es reconstruido, y la pantalla lo enseña. Un mes mayoritariamente `anadido` es una señal, no un detalle |
| **La cadena se rompe sin que nadie lo note** | El verificador periódico (§7.4) y el aviso por el canal de siempre |
| **Un céntimo de diferencia por redondeo** en una factura ya firmada | Céntimos enteros y redondeo explícito (§9), con pruebas sobre los casos que caen justo en el medio |
| **Emitir se vuelve tan incómodo que se sigue emitiendo fuera** | El presupuesto mensual (§7.6) hace que Atlas ahorre trabajo desde el primer mes en vez de añadirlo |

---

## 13. Qué queda para después

- **La emisión con remisión a la AEAT** (régimen VERI\*FACTU), si algún día se
  cambia de régimen.
- **Las métricas de actividad** en el documento mensual, cuando existan los
  conectores del bloque 3.
- **Coste por hora distinto para cada persona**, cuando haya más de una. El
  `usuario_id` ya está en `fichajes` desde el principio, así que no exigirá
  migración.
- **Importación bancaria**, si algún día los gastos a mano se quedan cortos.
