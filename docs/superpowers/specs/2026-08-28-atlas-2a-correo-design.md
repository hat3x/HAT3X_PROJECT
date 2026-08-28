# Atlas 2A/2B — Agente de correo · Diseño

**Fecha:** 2026-08-28
**Autor:** Jose (HAT3X) + Claude
**Estado:** Diseño aprobado en brainstorming, pendiente de revisión y de plan de implementación.

## 1. Propósito

`info@hat3x.com` es la puerta de entrada de HAT3X y hoy no la vigila nada automático.
De ahí salen cuatro problemas distintos:

1. **Se escapan cosas.** Un lead o un cliente enfadado se ve tarde, o no se ve.
2. **El correo no llega a Atlas.** Lo hablado por correo con un cliente no queda
   junto a su ficha; vive solo en Gmail.
3. **Se pierde tiempo respondiendo** lo repetitivo.
4. **Nada se responde solo**, ni siquiera un acuse de recibo.

Este spec cubre **los dos primeros**. Los otros dos dependen de estos y de tener
datos reales sobre qué clasifica bien el agente, así que van en spec aparte.

## 2. Alcance

| Fase | Qué hace | ¿En este spec? |
|---|---|---|
| **2A** Ingesta y triaje | Lee la bandeja, clasifica, guarda el índice, avisa de lo urgente | **Sí** |
| **2B** Enlace con Atlas | Cruza remitente con `contactos.email`, el correo aparece en la ficha del cliente | **Sí** |
| 2C Borradores | Redacta y deja esperando el OK | No — spec propia |
| 2D Respuesta autónoma | Envía solo, dentro de un perímetro acotado | No — spec propia |

**2D condiciona 2A** aunque no se implemente: la autonomía acordada es
*acuses de recibo + lista blanca de categorías*, y eso exige que desde el primer
día se guarde **por qué** el agente clasificó cada correo como lo hizo. Sin ese
rastro, ampliar la lista blanca sería a ojo.

## 3. Decisiones (brainstorming)

| Tema | Decisión | Motivo |
|---|---|---|
| Enfoque | **A — cron cada 10 min + sincronización incremental por `historyId`** | Calca el descubridor, que ya funciona. El push en tiempo real (Gmail `watch` + Pub/Sub) obliga a renovar el `watch` cada 7 días y a reconciliar igualmente: acabas con A *más* B. |
| Acceso a Gmail | **Gmail API + OAuth de usuario**, `refresh_token` cifrado en el llavero | Permisos granulares y revocables. La contraseña de aplicación (IMAP) es un secreto estático con acceso total y Google la está restringiendo. |
| Dónde corre | **En la aplicación** (`/api/correo`), no en Edge Function | Descifra credenciales y reutiliza `usarCredencial`, que deja rastro en `credencial_usos`. En Deno habría que reimplementar el cifrado. |
| Clasificador | **Híbrido: reglas deterministas → LLM para lo que sobreviva** | Barato, y el caso común es reproducible y testeable sin red. |
| Juez por defecto | **`deepseek/deepseek-v4-flash` vía OpenRouter** | Mismo patrón que Aiden (ver `2026-08-06-aiden-llm-openrouter-design.md`). Se inyecta **por parámetro**: cambiar a Ollama o a otro proveedor es una línea. |
| Qué se guarda | **Metadatos + resumen + motivo. NUNCA el cuerpo.** | Gmail sigue siendo el archivo. Atlas no duplica la obligación RGPD ni crea un segundo sitio del que fugarse. |
| Autonomía (2D) | Acuses de recibo + lista blanca de categorías | Nunca `dinero` ni `incidencia`. |
| Retención | `correos` 365 días · `pasadas_correo` 180 días | Historia útil en la ficha del cliente, con un límite defendible frente a la minimización de datos. |

### Alternativas descartadas

- **Managed Agent de Anthropic.** Menos código propio, pero saca la decisión
  fuera de Atlas: no encaja con el llavero ni deja rastro en `credencial_usos`, y
  rompe la propiedad que sostiene todo Atlas — decisión pura, probable sin red.
- **Ollama autoalojado desde el principio.** Para este volumen sale unas 230 veces
  más caro que la API (≈30 €/mes de VPS frente a ≈0,13 $/mes). Sigue siendo la
  respuesta correcta si algún día pesa más el RGPD que el coste; por eso el juez
  se inyecta. Ver §11.
- **Solo reglas, sin LLM.** Coste cero, pero falla justo con los correos que
  importan: los redactados de forma inesperada.

## 4. Arquitectura

```
pg_cron (cada 10 min)
   └── atlas_disparar_correo()  ── pg_net ──▶  POST /api/correo   [Bearer ATLAS_CRON_KEY]
                                                    │
              1. abre el refresh_token del llavero  →  usarCredencial()  →  credencial_usos
              2. Gmail users.history.list desde el historyId guardado
              3. por cada mensaje nuevo: reglas puras → si sobrevive, el juez
              4. escribe `correos` (idempotente) y avanza historyId
              5. lo urgente entra en el avisador existente (push y correo)
                                                    │
                       cada pasada queda en `pasadas_correo`, salga bien o mal
```

### 4.1 Módulos (`src/lib/correo/`)

Separando decisión de mundo, igual que `src/lib/descubrir/`:

| Fichero | Qué hace | Toca red |
|---|---|---|
| `ajustes.ts` | Localiza credencial y buzón; dice qué falta y dónde ponerlo | no |
| `gmail.ts` | `users.history.list` / `messages.get`, refresco del token | **sí** |
| `reglas.ts` | Clasificación determinista por cabeceras y remitente | no |
| `juez.ts` | Llama a OpenRouter y valida la salida con Zod | **sí** |
| `clasificar.ts` | Orquesta reglas→juez. Recibe el juez por parámetro | no |
| `ejecutar.ts` | La pasada completa. Recibe todo por parámetro, como `descubrir()` | no |
| `aplicar.ts` | Escribe `correos`, avanza `historyId`, encola avisos | **sí** |

`ejecutar.ts` y `clasificar.ts` se prueban enteros sin tocar Google, ni
OpenRouter, ni el reloj: el instante entra por parámetro.

### 4.2 Las dos reglas de oro

Trasplantadas del descubridor, y son el motivo de que este módulo exista:

1. **Si Gmail no responde, el `historyId` NO avanza.** La pasada se anota como
   fallida y la siguiente reintenta desde el mismo punto. Avanzar el puntero ante
   un error significa perder correos para siempre y en silencio.
2. **Si el juez falla, el correo NO se descarta:** cae a `sin_clasificar` y se
   muestra. Un clasificador caído no puede convertirse en una bandeja que se traga
   cosas.

### 4.3 Avisos

No se construye nada nuevo. Un correo urgente abre una fila que el avisador
existente ya sabe agrupar y enviar; se reutilizan `agrupar()` y `clasificar()` de
`src/lib/alertas/`.

## 5. Esquema de datos

**Categoría y urgencia son ejes independientes**, igual que clientes y proyectos.
Un correo de cliente puede ser urgente o no. Fundirlos obligaría a inventar
`cliente_urgente` y el número de categorías crecería sin control.

### 5.1 `buzones`

```sql
create table buzones (
  id              uuid primary key default gen_random_uuid(),
  direccion       text not null unique,
  credencial_id   uuid not null references credenciales(id),
  history_id      text,                     -- cursor de Gmail; null = nunca sincronizado
  sincronizado_en timestamptz,
  activo          boolean not null default true
);
```

Tabla y no variable de entorno porque mañana habrá `soporte@` o `jose@`, y porque
el cursor **es un dato, no configuración**. El `refresh_token` vive cifrado en
`credenciales`, no aquí.

`uuid` y no `bigserial` porque en Atlas las tablas de dominio usan `uuid`
(`clientes`, `proyectos`, `credenciales`) y solo las de registro usan `bigserial`
(`descubrimientos`, `check_resultados`). `credenciales.id` es `uuid`: la clave
foránea no admite otra cosa.

### 5.2 `correos`

```sql
create table correos (
  id               uuid primary key default gen_random_uuid(),
  buzon_id         uuid not null references buzones(id),
  gmail_message_id text not null unique,     -- la idempotencia vive aquí
  gmail_thread_id  text not null,
  recibido_en      timestamptz not null,
  remitente        text not null,
  remitente_nombre text,
  asunto           text,

  categoria        text not null,
  urgencia         text not null,            -- urgente | normal | ignorable
  resumen          text,
  motivo           text not null,            -- POR QUE se decidio eso
  decidido_por     text not null,            -- regla | juez | fallo
  confianza        numeric(3,2),             -- null cuando decidio una regla

  cliente_id       uuid references clientes(id),    -- fase 2B
  enlace_por       text,                            -- contacto | dominio | manual

  visto_en         timestamptz,
  creado_en        timestamptz not null default now()
);
```

`gmail_message_id unique` hace la pasada **idempotente**: si el cron se solapa o
se reintenta tras un fallo, `on conflict do nothing` evita duplicados sin
coordinación.

`motivo` y `decidido_por` no son adorno: son lo único que permitirá, dentro de
meses, decidir con datos qué categorías entran en la lista blanca de 2D.

### 5.3 `pasadas_correo`

```sql
create table pasadas_correo (
  id           bigserial primary key,
  ejecutado_en timestamptz not null default now(),
  ok           boolean not null,
  leidos       int not null default 0,
  clasificados int not null default 0,
  por_juez     int not null default 0,   -- cuantos costaron dinero
  error        text
);
```

`por_juez` da el coste **medido**, no estimado. Si se dispara, las reglas dejaron
de filtrar lo que filtraban.

### 5.4 Categorías

| Categoría | Qué es | ¿Candidata a lista blanca (2D)? |
|---|---|---|
| `lead` | Alguien que pregunta por los servicios | Sí — acuse de recibo |
| `cliente` | Cliente existente (enlazado en 2B) | No, al principio |
| `proveedor` | Facturas y gestiones de proveedores | No |
| `dinero` | Cobros, impagos, bancos, Stripe | **Nunca** |
| `incidencia` | Algo roto, cliente enfadado | **Nunca** |
| `automatico` | no-reply, CI, notificaciones de plataformas | Sí — silencio |
| `boletin` | Newsletters, marketing | Sí — silencio |
| `personal` | Correo que no es de negocio | No |
| `sin_clasificar` | El juez falló o no llegó | No — siempre se muestra |

### 5.5 Permisos y retención

Las tres tablas: **solo propietario**, vía `atlas_es_propietario()`. Contienen
nombres, direcciones y asuntos de terceros; ni un usuario autenticado de Atlas
tiene por qué verlos. Como toda tabla nueva nace sin permisos, hacen falta
`grant` explícitos igual que en `20260826100000_descubridor.sql`.

Poda: `atlas_podar_correos()` (365 días) y `atlas_podar_pasadas_correo()`
(180 días).

## 6. OAuth y ciclo de vida del token

### 6.1 Alta del buzón

Un **botón en `Ajustes → Llavero`**: «Conectar buzón de Gmail» → redirige a
Google → vuelve a `/api/correo/oauth/callback` → Atlas cifra el `refresh_token` y
lo guarda como una credencial más.

Se descarta el script local de un solo uso: este token **se va a caer** (cambiar
la contraseña de Google lo revoca), y el día que pase, un script que se ejecutó
una vez hace año y medio ya no se encuentra. Un botón sigue ahí.

El `callback` valida un parámetro `state` firmado contra CSRF. El `client_secret`
de Google va en variable de entorno, nunca en la base.

### 6.2 Permisos

| Fase | Scope |
|---|---|
| 2A / 2B | `gmail.readonly` |
| 2C | `gmail.compose` |
| 2D | `gmail.send` |

Se arranca **solo con `gmail.readonly`**. Cuando llegue 2C, Google volverá a
pedir consentimiento — y eso es correcto: el día que este agente gane permiso
para escribir en nombre de HAT3X, merece preguntarse explícitamente.

**La app de Google Cloud debe publicarse como «Interna»** en el Workspace. En
modo «Testing» los `refresh_token` caducan a los 7 días y el agente moriría cada
semana.

### 6.3 Cuando el token muere

Un `refresh_token` revocado devuelve `invalid_grant`. Limitarse a registrarlo
dejaría un agente muerto en silencio: la bandeja deja de vigilarse y nada lo
dice. Eso es peor que no tener agente, porque se confía en él.

Por tanto `invalid_grant` **abre una incidencia real** en el sistema existente y
llega al móvil por el mismo camino que un servicio caído, con un texto accionable
(«reconecta el buzón en Ajustes → Llavero»), no un código de error.

### 6.4 `access_token`: no se guardan

Duran una hora y la pasada corre cada diez minutos. Guardarlos ahorraría una
llamada HTTP y añadiría **un segundo secreto en reposo** que cifrar, rotar y
purgar. No compensa: cada pasada refresca y descarta.

### 6.5 `historyId` caducado

Google purga el historial a los ~7 días. Si Atlas ha estado caído más tiempo,
`history.list` devuelve 404. Es un camino de código real, no teórico:
**resincronización por fecha** (`messages.list` desde `sincronizado_en`) y se
reanuda el historial desde el `historyId` que devuelva.

## 7. Clasificación

### 7.1 Las reglas hacen dos cosas distintas

**Reglas que cierran** — el correo no llega nunca al LLM:

| Señal | Veredicto |
|---|---|
| Cabecera `List-Unsubscribe` | `boletin` · ignorable |
| `Auto-Submitted: auto-generated` | `automatico` |
| `Precedence: bulk` | `boletin` |
| Remitente `no-reply@`, `bounce@`, `mailer-daemon` | `automatico` |
| Dominio de plataforma conocida (GitHub, Stripe, Vercel, Supabase) | `automatico` |

Son cabeceras estándar, no adivinanzas sobre el texto. En una bandeja normal se
llevan el 60-80 %.

**Reglas que enriquecen:** si el remitente cruza con `contactos.email`, eso **no**
cierra el caso — da la categoría pero no la urgencia, que es lo que interesa. El
dato entra en el prompt («este remitente es Peluquería Tal, cliente activo desde
marzo») y el juez decide mejor. La regla mejora la pregunta en vez de saltársela.

Ese cruce es también el mecanismo de la fase 2B, y tiene dos niveles:

| `enlace_por` | Cómo | Fiabilidad |
|---|---|---|
| `contacto` | `remitente` = `contactos.email` exacto | Alta — se usa para enlazar y para el prompt |
| `dominio` | El dominio del remitente coincide con el de algún `contactos.email` del cliente | Media — enlaza, pero se marca como tal |
| `manual` | Lo enlazas tú desde la ficha | Total |

El nivel `dominio` cubre el caso corriente de que te escriba alguien nuevo de un
cliente que ya tienes. Se distingue de `contacto` en el propio dato porque no es
lo mismo *saber* quién escribe que *suponerlo* — y a la hora de decidir la lista
blanca de 2D, esa diferencia importa.

### 7.2 El juez

`deepseek/deepseek-v4-flash` vía OpenRouter, con el SDK de `openai` — el mismo
patrón fijado para Aiden. Devuelve
`{ categoria, urgencia, resumen, motivo, confianza }`.

**Validación con Zod, siempre.** Categoría fuera del enum, o JSON roto, ⇒
`sin_clasificar` y se muestra. Nunca se confía en la forma de lo que devuelve un
LLM, ni aunque el proveedor prometa salida estructurada.

**El cuerpo se recorta a propósito:** los primeros ~1.500 caracteres tras quitar
la cadena citada de respuestas anteriores. Un hilo largo son decenas de miles de
tokens ya leídos, y lo que decide la clasificación está siempre arriba. Es una
decisión deliberada, no un descuido.

### 7.3 Coste

Con 60-80 % filtrado por reglas, de ~50 correos diarios llegan al juez 12-20.
A ~0,00011 $ por correo, **céntimos al mes**. `pasadas_correo.por_juez` lo mide.

## 8. Modos de fallo

| Fallo | Qué hace Atlas |
|---|---|
| Gmail no responde | `historyId` no avanza · pasada anotada `ok=false` · reintento en 10 min |
| `historyId` caducado (404) | Resincronización por fecha (§6.5) |
| `invalid_grant` (token revocado) | **Abre incidencia** y avisa al móvil (§6.3) |
| El juez falla o devuelve basura | Correo a `sin_clasificar`, se muestra igual |
| OpenRouter caído | Igual que el anterior: nada se pierde, todo se ve |
| Vercel caído | Se salta la pasada; la siguiente recupera desde el mismo `historyId` |
| Cron solapado | `gmail_message_id unique` + `on conflict do nothing` |

## 9. Pruebas

Vitest, como el resto de Atlas. Lo que importa no son los caminos felices.

| Fichero | Lo que asegura |
|---|---|
| `reglas.test.ts` | Tabla de cabeceras reales. Puro, sin mocks. |
| `clasificar.test.ts` | Reglas cortocircuitan; el contexto de cliente llega al juez; **un juez caído cae a `sin_clasificar` y no descarta nada** |
| `ejecutar.test.ts` | **El `historyId` NO avanza si Gmail falla**; idempotencia ante pasadas solapadas; el 404 dispara resincronización |
| `gmail.test.ts` | `fetch` inyectado, sin red |
| `api/correo.test.ts` | 401 sin clave · 500 sin configurar · **siempre** se escribe la pasada |
| `oauth.test.ts` | `state` contra CSRF; `invalid_grant` abre incidencia |

### 9.1 Medir si acierta

`scripts/evaluar-clasificador.ts`, hermano de `scripts/prueba-descubridor.ts`.
Se exportan ~50 correos reales, se etiquetan a mano una vez, y el script informa
de aciertos, fallos y coste por pasada.

Sin esto, la decisión de 2D («¿qué categorías son bastante fiables para responder
solas?») sería a ojo. Con esto, es un número.

## 10. Qué hay que dejar preparado

| Dónde | Qué |
|---|---|
| Google Cloud | Proyecto con Gmail API activada, pantalla de consentimiento **Interna**, credencial OAuth de tipo Web con el `redirect_uri` de Atlas |
| Entorno (Vercel) | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `OPENROUTER_API_KEY`, `CORREO_MODELO` (por defecto `deepseek/deepseek-v4-flash`) |
| Atlas → Ajustes → Llavero | Conectar el buzón con el botón nuevo |
| Base de datos | `atlas_disparar_correo()` en pg_cron cada 10 min, con `app.atlas_web_url` y `app.atlas_cron_key` ya fijados |

Si falta algo, la pasada no revienta: lo anota en `pasadas_correo` diciendo cuál
falta y dónde ponerla, igual que hace `src/lib/descubrir/ajustes.ts`.

## 11. Deuda y cuestiones abiertas

1. **`credencial_usos` no tiene poda.** Es un fallo latente de Atlas anterior a
   este módulo, pero este lo pone a prueba: a 10 min son ~52.000 filas/año. Un
   registro de auditoría donde el 99,9 % son aperturas rutinarias es un registro
   que nadie lee, y ahí se esconderían las que importan. **Va como migración
   aparte** (poda a 180 días), porque arregla Atlas, no esta funcionalidad. No se
   resuelve haciendo que el correo se salte `usarCredencial`: las excepciones en
   el código de auditoría son cómo se pudren las auditorías.

2. **Subencargado del tratamiento (RGPD).** El cuerpo de los correos de clientes
   se envía al clasificador. Eso convierte al proveedor del LLM en subencargado, y
   DeepSeek es una empresa china — transferencia fuera del EEE que hay que
   documentar. **Debe resolverse antes de 2C/2D**, y las salidas son: fijar un
   proveedor con DPA y sin transferencia (Mistral, o Llama vía Groq/Together), o
   autoalojar con Ollama. El juez se inyecta por parámetro precisamente para que
   ese cambio sea de una línea.

3. **Retención de `correos` a 365 días:** decisión de negocio, no técnica. Queda
   escrita para poder revisarla.

4. **Un solo buzón al principio.** El esquema soporta varios; la UI de 2A gestiona
   uno. Ampliarla no requiere cambiar tablas.
