# Emisión de claves de servicio (`sk_recep_…`) — procedimiento para HAT3X

> **En una frase.** Una **clave de servicio** es la credencial con la que una
> integración externa (ERP, webhook, portal de terceros) llama a Salón OS **en
> nombre de un salón, sin un usuario humano detrás**. La emite **solo HAT3X**
> (nunca el salón), la base de datos guarda **únicamente su hash SHA-256** (jamás
> la clave en claro) y la clave completa **se muestra UNA sola vez** en el momento
> de crearla. Si se pierde, no se recupera: se **revoca** y se **emite otra**.

Este documento es el **runbook operativo** para el equipo de HAT3X. Cubre:

1. [El principio: el salón **no** se autogenera claves](#1-el-principio-el-salón-no-se-autogenera-claves)
2. [Qué se guarda y qué se te devuelve](#2-qué-se-guarda-y-qué-se-te-devuelve)
3. [Anatomía de la clave `sk_recep_…`](#3-anatomía-de-la-clave-sk_recep)
4. [Prerrequisitos para emitir](#4-prerrequisitos-para-emitir)
5. [El procedimiento de emisión, paso a paso](#5-el-procedimiento-de-emisión-paso-a-paso)
6. [Entrega segura al integrador](#6-entrega-segura-al-integrador)
7. [Ciclo de vida: rotación, revocación y listado](#7-ciclo-de-vida-rotación-revocación-y-listado)
8. [Checklist de emisión](#8-checklist-de-emisión)
9. [Referencias](#9-referencias)

Piezas de código implicadas:

| Pieza | Fichero | Rol |
|---|---|---|
| Núcleo puro (genera clave, hash, prefijo, formato) | [`src/lib/service-keys/keys.ts`](../src/lib/service-keys/keys.ts) | Sin I/O; 100 % testeable |
| **Emisión** (service_role) | [`src/lib/service-keys/issue.ts`](../src/lib/service-keys/issue.ts) | `issueServiceApiKey()` — **la única vía de alta** |
| Verificación (`x-api-key`) | [`src/lib/service-keys/verify.ts`](../src/lib/service-keys/verify.ts) | Lado lectura; autentica peticiones entrantes |
| Migración de la tabla | [`supabase/migrations/20260722100000_service_api_keys.sql`](../supabase/migrations/20260722100000_service_api_keys.sql) | `public.service_api_keys` |
| Tests | [`src/tests/unit/service-keys.test.ts`](../src/tests/unit/service-keys.test.ts) | Garantías de generación y emisión |

---

## 1. El principio: el salón **no** se autogenera claves

Emitir una clave de servicio es una **operación de plataforma**, no una función de
producto. El salón —ni su owner— puede crear, ver ni descargar claves. **Solo
HAT3X** las emite. Esto no se sostiene por una comprobación de permiso que alguien
pueda olvidar, sino **por construcción**, en tres capas que se refuerzan:

| Capa | Garantía | Dónde |
|---|---|---|
| **Base de datos** | `service_api_keys` tiene **RLS deny-by-default sin políticas** y privilegios **revocados** a `anon`/`authenticated`. Ni el owner del salón puede leer/escribir la tabla. Solo `service_role` (backend de HAT3X) opera sobre ella. | Migración `20260722100000` |
| **Código** | `issueServiceApiKey()` usa el cliente **admin** (`createAdminClient`, `service_role`). Es *server-only*: importa `node:crypto` y `SUPABASE_SERVICE_ROLE_KEY` (sin `NEXT_PUBLIC_`). Desde el navegador ni siquiera arranca. | `src/lib/service-keys/issue.ts` |
| **Superficie** | **No existe** ninguna Server Action ni Route Handler que un usuario del salón pueda invocar para emitir. Ausencia de superficie self-service = imposibilidad de autoemisión. | (por diseño) |

> ⚠️ **Regla inviolable.** No añadas un endpoint de emisión accesible al salón. Si
> en el futuro HAT3X necesita una herramienta de backoffice, protégela con un
> secreto de operador (ver §5) y sitúala **fuera** de cualquier ruta del salón
> (nunca bajo `/api/reception` ni en el panel del salón).

---

## 2. Qué se guarda y qué se te devuelve

Una clave de API es una **credencial**: se trata como una contraseña. La base de
datos **nunca ve el secreto**.

| Dato | ¿Se persiste en `service_api_keys`? | ¿Se te devuelve al emitir? | Notas |
|---|---|---|---|
| **Clave en claro** (`sk_recep_…`) | **NO, jamás** | **Sí, UNA sola vez** (`result.key`) | Irrecuperable después. Entrégala y olvídala. |
| `key_hash` (SHA-256 hex, 64) | Sí | No hace falta | Punto de verificación. Un `CHECK ^[a-f0-9]{64}$` impide guardar aquí otra cosa. |
| `key_prefix` (`sk_recep_` + 6 chars) | Sí | Sí (`result.keyPrefix`) | **No secreto**; solo identifica la clave en un panel. |
| `salon_id`, `name`, `scopes` | Sí | Sí | Metadatos administrables. |
| `is_active`, `created_at`, `last_used_at` | Sí (los gestiona el backend) | `id`, `createdAt` | `is_active=false` = revocada. |

**Consecuencia operativa:** si un integrador pierde la clave, HAT3X **no puede
reenviársela** (no la tiene). El procedimiento correcto es **revocar** la clave
perdida (§7) y **emitir una nueva**.

---

## 3. Anatomía de la clave `sk_recep_…`

```
sk_recep_ 4Rn8Q…(43 caracteres base62)…kPz2
└───────┘ └──────────────────────────────┘
 esquema           token aleatorio
 (identifica       (256 bits de entropía criptográfica,
  el tipo)          base62 [0-9A-Za-z], longitud fija)
```

- **`sk_recep_`** marca el esquema (clave de **recep**ción), al estilo de los
  `sk_live_…` de Stripe: se reconoce de un vistazo y permite **rechazar basura**
  antes de tocar la BD (`isValidServiceKeyFormat`).
- **43 caracteres base62** derivados de **32 bytes (256 bits)** de
  `node:crypto`. 256 bits ⇒ inadivinable por fuerza bruta. Base62 (sin `-`, `_`,
  `+`, `/`) ⇒ se selecciona de un doble clic y se copia limpia; nada que escapar
  en URLs, JSON o cabeceras.
- **Longitud total constante:** `sk_recep_` (9) + 43 = **52 caracteres**.

El `key_prefix` almacenado son los **primeros 15 caracteres** (`sk_recep_` + 6 del
token). Revelar 6 caracteres de un secreto de 256 bits es inocuo: identifica la
clave sin permitir reconstruirla.

---

## 4. Prerrequisitos para emitir

1. **Contexto de servidor de HAT3X** con acceso al proyecto Supabase correcto
   (dev / staging / producción — **no los mezcles**).
2. **Variables de entorno del servidor** cargadas (las mismas que usa el cliente
   admin; ver [`src/lib/supabase/admin.ts`](../src/lib/supabase/admin.ts)):

   | Variable | Para qué |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | URL del proyecto Supabase |
   | `SUPABASE_SERVICE_ROLE_KEY` | Clave `service_role` (**secreto**; sin `NEXT_PUBLIC_`, solo en servidor) |

   > 🔒 La `service_role` **omite RLS por completo**. Trátala como la llave maestra
   > del tenant: nunca en el repo, nunca en el navegador, nunca en logs. Si se
   > filtra, **rótala en Supabase** de inmediato.

3. **El `salon_id` destino**, verificado. La emisión comprueba que el salón existe
   (devuelve `salon_not_found` / 404 si no), pero **tú** debes confirmar que es el
   salón correcto: una clave emitida para el salón equivocado actúa en su nombre.

---

## 5. El procedimiento de emisión, paso a paso

La utilidad es una función de servidor:

```ts
import { issueServiceApiKey } from "@/lib/service-keys/issue";

const issued = await issueServiceApiKey({
  salonId: "<uuid-del-salón>",
  name: "ERP contable",              // etiqueta legible, 1..120 chars
  scopes: ["loyalty:write"],         // opcional; [] = sin permisos aún
});

// issued.key  → clave en claro `sk_recep_…`  ← ÚNICA vez que existe. NO la registres.
// issued.id, issued.keyPrefix, issued.scopes, issued.createdAt → metadatos administrables.
```

Qué hace por dentro (resumen; detalle en `issue.ts`):

1. **Valida** la entrada (`salon_id` obligatorio; `name` 1..120; `scopes` sin
   vacíos ni duplicados) → `invalid_request` (400) si falla.
2. **Comprueba** que el salón existe → `salon_not_found` (404) si no.
3. **Genera** la clave (`sk_recep_…`), calcula `key_hash` + `key_prefix` e
   **INSERTA solo** `(salon_id, name, key_hash, key_prefix, scopes)` — nunca la
   clave en claro. Reintenta ante la colisión (astronómicamente improbable) del
   `key_hash` UNIQUE.
4. **Devuelve** `{ id, key, keyPrefix, scopes, createdAt, … }`.

### Cómo se dispara (mecanismos admitidos)

La función corre en **cualquier contexto de servidor de HAT3X**. Elige **uno** de
estos dos, según la frecuencia:

#### Opción A — script/consola de operaciones (one-off, sin superficie permanente) — *recomendado*

Ideal para emisiones puntuales. Ejecuta la utilidad desde un contexto de servidor
de HAT3X con las variables de §4 cargadas, imprime la clave, y **no deja ninguna
superficie HTTP en pie**. Esqueleto:

```ts
// Ejecutar SOLO desde el entorno operativo de HAT3X (nunca en la máquina del cliente).
// Cargar antes NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY del proyecto correcto.
import { issueServiceApiKey } from "@/lib/service-keys/issue";

const issued = await issueServiceApiKey({
  salonId: process.argv[2],
  name: process.argv[3],
});

// La clave en claro va a stdout UNA vez, para copiarla al canal seguro (§6).
// No la escribas a fichero ni a un logger persistente.
console.log(`clave (guárdala YA, no se recupera): ${issued.key}`);
console.log(`id=${issued.id} prefix=${issued.keyPrefix} creada=${issued.createdAt}`);
```

> El proyecto no fija hoy un *runner* de TypeScript en `package.json`. Ejecútalo con
> el que use el entorno operativo de HAT3X (p. ej. `tsx`/`ts-node`) resolviendo el
> alias `@/` como en el resto de la app. Lo esencial no es el runner: es que la
> clave **se genere con `node:crypto` de la app** (para que solo se guarde el hash)
> y que **stdout no se persista**.

#### Opción B — endpoint de backoffice protegido (para emisión repetible)

Si HAT3X necesita emitir con frecuencia, envuelve la utilidad en un Route Handler
de **backoffice**, con estas condiciones **no negociables**:

- **Fuera** de toda ruta del salón (p. ej. `/api/backoffice/service-keys`, **nunca**
  `/api/reception` ni el panel del salón).
- **Inerte por defecto:** si no hay configurado un secreto de operador
  (`HAT3X_BACKOFFICE_TOKEN` u equivalente), responde `404`. Así el endpoint no
  existe salvo que HAT3X lo active a conciencia.
- **Autenticado** con ese secreto por cabecera, comparado en **tiempo constante**
  (`crypto.timingSafeEqual`).
- **Nunca** registra `result.key` (ni en logs de acceso, ni de error, ni de APM).
- Responde la clave en claro **una vez** y confía en que el operador la traslade al
  canal seguro (§6).

### Reglas inviolables durante la emisión

- ❌ **Nunca** escribas `result.key` en logs, ficheros, tickets, chats persistentes,
  historiales de shell ni capturas.
- ❌ **Nunca** guardes la clave en claro en ningún sistema de HAT3X "por si acaso".
  El diseño es que HAT3X **no** conserve el secreto.
- ✅ **Sí** apunta lo NO secreto para administración: `id`, `keyPrefix`, `name`,
  `salon_id`, `scopes`, `createdAt`.
- ✅ Emite en el **proyecto Supabase correcto**. Una clave de staging no vale en
  producción (hashes en tablas distintas).

---

## 6. Entrega segura al integrador

La clave viaja **una vez** de HAT3X al integrador. Que ese único trayecto sea seguro:

- **Canal cifrado y efímero:** gestor de secretos con enlace de un solo uso/caducidad
  (1Password / Bitwarden Send), o el canal seguro pactado con el cliente. **No** por
  email en claro, WhatsApp, Slack ni SMS.
- **Mínimo contexto junto al secreto:** entrega la clave; el `salon_id`, `name` y
  `scopes` pueden ir por separado.
- **Instruye al integrador:** la clave va en la cabecera `x-api-key`; debe
  guardarla en **su** gestor de secretos / variables de entorno de servidor, **no**
  en el frontend ni en el repositorio.
- **Confirma la recepción** y que el enlace de entrega **caduque/se invalide** tras
  el primer uso.

---

## 7. Ciclo de vida: rotación, revocación y listado

Todo esto se hace con `service_role` (backend de HAT3X); el salón nunca toca la tabla.

### Revocar (interruptor, sin borrar la fila)

Revocar es poner `is_active = false`: la verificación exige `and is_active = true`,
así que la clave deja de autenticar de inmediato, pero la fila **permanece** como
rastro (quién, cuándo, `last_used_at`). Preferible a `DELETE`.

```sql
-- Con service_role. Identifica la clave por su prefijo NO secreto o su id.
update public.service_api_keys
   set is_active = false
 where salon_id = '<uuid-del-salón>'
   and key_prefix = 'sk_recep_XXXXXX';
```

### Rotar

Rotar = **emitir una nueva** (§5) + entregarla (§6) + **revocar la anterior** una
vez el integrador confirme el cambio. No hay "editar la clave": el secreto no se
puede regenerar sobre la misma fila (solo existe su hash).

### Listar (para "¿cuál revoco?") — **sin exponer el hash**

El listado administrable va por una **RPC/endpoint de servidor** con `service_role`
que devuelva **solo columnas seguras**. Nunca hagas un `SELECT` que saque `key_hash`
a un panel.

```sql
-- Columnas seguras para administración. OJO: NUNCA incluyas key_hash.
select id, name, key_prefix, scopes, is_active, created_at, last_used_at
  from public.service_api_keys
 where salon_id = '<uuid-del-salón>'
 order by created_at desc;
```

---

## 8. Checklist de emisión

Antes de dar por emitida una clave:

- [ ] Confirmado el **proyecto Supabase** correcto (dev/staging/prod).
- [ ] `SUPABASE_SERVICE_ROLE_KEY` y `NEXT_PUBLIC_SUPABASE_URL` cargadas y **no** en el repo.
- [ ] `salon_id` **verificado** (el salón correcto).
- [ ] `name` descriptivo (identificará la clave en un panel) y `scopes` acordados.
- [ ] Emitida con `issueServiceApiKey()` (nunca insertando a mano en la tabla).
- [ ] `result.key` **no** ha tocado logs, ficheros ni historial de shell.
- [ ] Clave entregada por **canal seguro efímero** (§6); recepción confirmada.
- [ ] Apuntados los datos **no secretos** para administración (`id`, `keyPrefix`, `name`, `scopes`).
- [ ] Enlace de entrega **caducado/invalidado**.
- [ ] (Si es rotación) clave anterior **revocada** tras confirmar el cambio.

---

## 9. Referencias

- Núcleo, emisión y verificación: [`src/lib/service-keys/`](../src/lib/service-keys/)
- Migración y contrato de la tabla: [`supabase/migrations/20260722100000_service_api_keys.sql`](../supabase/migrations/20260722100000_service_api_keys.sql)
- Cliente `service_role`: [`src/lib/supabase/admin.ts`](../src/lib/supabase/admin.ts)
- Patrón `x-api-key` (origen del diseño): [`docs/loyalty-rules-reference.md` §1.10](./loyalty-rules-reference.md)
- Contrato de errores de `/api/reception` (401 en verificación): [`src/lib/reception/CONTRACT.md`](../src/lib/reception/CONTRACT.md)
