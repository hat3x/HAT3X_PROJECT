# API de recepción (`/api/reception`) — contrato para la integración

> **En una frase.** `/api/reception` es la cara HTTP del **recepcionista IA**: cinco
> endpoints máquina-a-máquina (identificar al cliente, consultar disponibilidad, crear,
> cancelar y mover citas) que **n8n** invoca en nombre de UN salón, autenticándose con una
> **clave de servicio** (`x-api-key`) y sujetos al add-on **`ai_receptionist`**. Reutilizan
> el MISMO motor de reservas que la web pública, así que operan sobre la MISMA agenda.

Este documento es la **referencia de contrato** para quien configure la integración (los
workflows de n8n de **PARTE 2**). Cubre:

1. [El límite: qué aporta este repo (PARTE 1) y qué es configuración externa (PARTE 2)](#1-el-límite-parte-1-vs-parte-2)
2. [Autenticación: la clave de servicio `x-api-key`](#2-autenticación-la-clave-de-servicio-x-api-key)
3. [Gating por el add-on `ai_receptionist`](#3-gating-por-el-add-on-ai_receptionist)
4. [Contrato común (errores, cabeceras, aislamiento)](#4-contrato-común-errores-cabeceras-aislamiento)
5. [Los cinco endpoints](#5-los-cinco-endpoints)
6. [Montar el recepcionista IA (PARTE 2 + pasos humanos)](#6-montar-el-recepcionista-ia-parte-2--pasos-humanos)
7. [Referencias](#7-referencias)

---

## 1. El límite: PARTE 1 vs PARTE 2

El recepcionista IA tiene **dos mitades**. Este repositorio (**Salón OS**) construye solo
una; la otra es **configuración externa y pasos humanos** que viven fuera del código.

| | Qué es | Dónde vive | Estado |
|---|---|---|---|
| **PARTE 1 — este repo** | La **API `/api/reception`** (5 endpoints), el **contrato de errores**, el mecanismo de **claves de servicio** (`service_api_keys`) y el **gating** por `ai_receptionist`. | `src/app/api/reception/**`, `src/lib/reception/**`, `src/lib/service-keys/**` | ✅ Construido |
| **PARTE 2 — configuración externa** | El **agente de Retell** (voz + prompt), el **número de Twilio**, y los **workflows de n8n** reapuntados a estos endpoints. | Paneles de Retell / Twilio / n8n (NO en este repo) | ⚙️ Configuración + pasos humanos |

> 🧭 **Regla mental.** Si algo se toca **escribiendo código en este repo**, es PARTE 1. Si
> se toca **en el panel de Retell, Twilio o n8n**, es PARTE 2. Este documento describe el
> **contrato** que une ambas: lo que PARTE 2 debe llamar y qué recibe a cambio.

Lo que este repo **NO** hace (y por diseño no debe hacer): no habla con Retell ni con Twilio,
no despliega n8n, no guarda el prompt del agente ni el número de teléfono. Todo eso se
**configura fuera** y se conecta a Salón OS **solo** a través de estos endpoints y de la clave.

---

## 2. Autenticación: la clave de servicio `x-api-key`

Cada petición a `/api/reception` es **no-humana** (la hace n8n, no un usuario con sesión), así
que **no** se autentica por cookie/sesión sino por una **clave de servicio** en la cabecera:

```
x-api-key: sk_recep_<43 caracteres base62>
```

- La clave **identifica al SALÓN** en cuyo nombre actúa la integración. Todo lo que el
  endpoint lee o escribe se **acota a ese salón** (ver §4, aislamiento multi-tenant).
- La emite **solo HAT3X** (nunca el salón), con `service_role`. La base de datos guarda
  **únicamente el hash SHA-256** de la clave (`key_hash`), jamás el secreto en claro; la clave
  completa se muestra **una sola vez** al crearla. Si se pierde, se **revoca** y se **emite otra**.
- El procedimiento completo de emisión, entrega segura, rotación y revocación está en
  **[`docs/service-keys-emision.md`](./service-keys-emision.md)**.

### Cómo se resuelve una petición (el guard)

Antes de ejecutar cualquier lógica de negocio, **todos** los endpoints pasan por el guard común
(`withReceptionGuard`, en `src/lib/reception/guard.ts`), que hace **dos** comprobaciones, en
este orden:

1. **Autenticación** — resolver `x-api-key → salón`. Si la clave **falta**, tiene un **formato
   ajeno**, es **desconocida** o está **revocada** (`is_active = false`) ⇒ **`401 UNAUTHORIZED`**.
2. **Entitlement** — el salón resuelto debe tener el add-on `ai_receptionist` **activo** (§3).
   Si no ⇒ **`403 FEATURE_NOT_ENABLED`**.

El orden importa (defensa en profundidad): quien no presenta una clave válida recibe su `401`
**antes** de que se consulte el estado de ningún add-on.

> 🔒 La verificación es **fail-closed**: ante un error de lectura de la clave, se **niega** el
> acceso (nunca se concede por un fallo transitorio). Un sello `last_used_at` best-effort marca
> el último uso correcto de la clave (telemetría; su fallo no invalida la clave).

---

## 3. Gating por el add-on `ai_receptionist`

`/api/reception` es un **módulo contratable**. Un salón solo puede usarlo si tiene el add-on
`ai_receptionist` **contratado y activo**. Es el mismo modelo de **entitlements** que el resto
de la productización (ver README → *Productización: planes (add-ons)*):

- El add-on está activo **solo** si existe la fila `public.salon_features (salon_id,
  feature='ai_receptionist')` **y** `enabled = true`. **Ausencia de fila = no contratado.**
- El guard espeja la semántica del gate SQL `app.salon_has_feature(salon_id, 'ai_receptionist')`
  leyendo `public.salon_features` con el cliente `service_role` (la petición es
  máquina-a-máquina: no hay `auth.uid()`, así que la lectura autoritativa se acota a mano por
  `salon_id`).
- Si el salón **no** lo tiene ⇒ todos los endpoints responden **`403 FEATURE_NOT_ENABLED`**.

### Dar de alta el add-on a un salón (HAT3X, `service_role`)

Como con cualquier entitlement, lo activa **HAT3X** al vender el plan (SQL Editor de Supabase o
`psql` con la service key). Upsert idempotente:

```sql
insert into public.salon_features (salon_id, feature, enabled, notes)
values ('<SALON_UUID>', 'ai_receptionist', true, 'plan Recepcionista IA')
on conflict (salon_id, feature) do update
  set enabled = excluded.enabled,
      notes   = excluded.notes;
```

> ⚠️ Ejecutar con la **`service_role`**, nunca con la anon/authenticated key: la RLS no concede
> a los usuarios la escritura de entitlements. Para **suspender sin perder histórico** (p. ej.
> impago), poner `enabled = false`; para **dar de baja**, borrar la fila. Ambos dejan el gate en
> `false` y los endpoints en `403`.

**Orden de puesta en marcha:** primero se **da de alta el add-on** (esta sección), luego se
**emite la clave** (§2) para ese salón. Una clave válida sin el add-on activo autentica pero
recibe `403`; el add-on activo sin clave recibe `401`.

---

## 4. Contrato común (errores, cabeceras, aislamiento)

Todo lo que comparten los cinco endpoints. El contrato de errores completo (fuente única) está
en [`src/lib/reception/CONTRACT.md`](../src/lib/reception/CONTRACT.md).

### Forma del error

Cualquier fallo responde **exactamente** con esta forma:

```json
{
  "error": {
    "code": "SLOT_TAKEN",
    "message": "Ese horario acaba de ocuparse. Elige otro.",
    "details": [{ "field": "customer.phone", "message": "Teléfono no válido.", "code": "too_small" }]
  }
}
```

- `code` — clave **estable** en `MAYÚSCULAS_SNAKE`. Es contrato: **ramifica por él**, no por el
  texto. No se renombra a la ligera.
- `message` — legible en español, seguro de mostrar/leer tal cual. Nunca filtra detalle interno.
- `details` — opcional; solo en `VALIDATION_ERROR`, un ítem por campo inválido.

### Catálogo de códigos

| Código | HTTP | Cuándo |
|---|:--:|---|
| `UNAUTHORIZED` | 401 | Clave ausente, con formato ajeno, desconocida o revocada (§2). |
| `FEATURE_NOT_ENABLED` | 403 | El salón no tiene `ai_receptionist` activo (§3). |
| `NOT_YOUR_APPOINTMENT` | 403 | La cita existe pero no es del cliente de ese teléfono. |
| `APPOINTMENT_NOT_FOUND` | 404 | No hay cita con ese id en el salón. |
| `NO_AVAILABILITY` | 409 | No quedan huecos para lo pedido / el servicio ya no es reservable. |
| `SLOT_TAKEN` | 409 | El hueco concreto acaba de ocuparse (recomputo o carrera anti-solape). |
| `VALIDATION_ERROR` | 400 | El cuerpo/query no pasa el esquema (Zod) o el JSON está roto. Adjunta `details`. |
| `INTERNAL_ERROR` | 500 | Fallo inesperado. Mensaje genérico; **nunca** expone la causa. |

`401`, `403 FEATURE_NOT_ENABLED`, `400 VALIDATION_ERROR` y `500 INTERNAL_ERROR` son **comunes a
los cinco** endpoints (los pone el guard o la validación del borde). Los demás son específicos y
se detallan por endpoint en §5.

### Cabeceras

- Toda respuesta (éxito **y** error) lleva **`Cache-Control: no-store`**: son datos autenticados y
  vivos, nunca cacheables por un proxy o CDN.
- Las respuestas de éxito serializan el **payload directo** (sin envoltorio `{ data }`), como el
  resto de la app.

### Aislamiento multi-tenant

El `salon_id` que resuelve la clave es **la única** cota de tenant en estas rutas (no hay RLS de
sesión: la petición es máquina-a-máquina). Por eso:

- El salón **nunca** se toma del cuerpo ni del query: **siempre** el de la clave. Los cuerpos de
  creación/reprogramación son `.strict()` (rechazan un `salonId` inyectado u otras claves ajenas).
- Cada lectura/escritura se acota a mano por ese `salon_id`. **Es imposible** que un endpoint
  devuelva o toque datos de otro salón.

---

## 5. Los cinco endpoints

Base URL: `{NEXT_PUBLIC_SITE_URL}/api/reception`. En todos, la cabecera `x-api-key` es
**obligatoria** y aplica el contrato común de §4 (se omiten abajo los errores comunes salvo
matiz propio).

### 5.1 `POST /api/reception/identify` — reconocer a quien llama

Primer paso de la llamada: con el teléfono, resuelve la **ficha** del cliente en el salón y sus
**próximas citas** (agenda viva: `pending`/`confirmed`, de ahora en adelante, ordenadas por
inicio).

**Petición**

```json
{ "phone": "+34 600 123 456" }
```

- `phone` (string, requerido) — en cualquier formato. Se canonicaliza a **E.164** en servidor
  (misma normalización que la columna `customers.phone_e164`). Un teléfono sin número real ⇒
  `{ "found": false }` (no es error).

**Respuesta `200`** — dos formas según haya coincidencia:

```json
{ "found": false }
```

```json
{
  "found": true,
  "customer": { "id": "uuid", "full_name": "Ana García" },
  "upcoming": [
    {
      "id": "uuid",
      "starts_at": "2026-07-24T10:00:00.000Z",
      "service_name": "Corte y peinado",
      "professional_name": "Lucía",
      "status": "confirmed"
    }
  ]
}
```

> De la ficha solo salen `id` y `full_name` (nunca teléfono, email o notas): al otro lado hay una
> integración, no la dueña de los datos. `service_name`/`professional_name` pueden ser `null` por
> robustez (ramifica por presencia).

**Errores propios:** ninguno más allá de los comunes (`400/401/403/500`).

---

### 5.2 `GET /api/reception/availability` — huecos reservables

Consulta los huecos de un servicio/fecha. Reutiliza el **mismo motor** que la reserva pública
(`getAvailabilityForSalon`, modelo de 3 fases): devuelve **los mismos** huecos.

**Query params**

| Param | Tipo | Notas |
|---|---|---|
| `serviceId` | uuid | Requerido. |
| `date` | `YYYY-MM-DD` | Requerido. |
| `professionalId` | uuid \| `"any"` \| vacío | Opcional. Vacío/`"any"` = cualquier profesional. |

```
GET /api/reception/availability?serviceId=<uuid>&date=2026-07-24&professionalId=any
```

**Respuesta `200`** (idéntica a `/api/public/booking/[slug]/availability`):

```json
{
  "slots": [
    { "startsAt": "2026-07-24T10:00:00.000Z", "endsAt": "2026-07-24T10:45:00.000Z", "professionalId": "uuid" }
  ]
}
```

**Errores propios:** `409 NO_AVAILABILITY` cuando el servicio/salón no resuelve a algo
reservable (para el recepcionista, «no hay huecos para lo que pides»; su copy invita a probar
otra fecha/profesional/servicio y no filtra qué recursos existen en el salón).

---

### 5.3 `POST /api/reception/appointments` — crear cita

Crea una cita en el salón de la clave. Reutiliza el **motor de reservas** (`createBookingForSalon`):
recalcula disponibilidad en servidor, **resuelve/crea la ficha por teléfono normalizado**
(dedup: un cliente = una ficha) y crea la cita en estado `pending`.

**Petición** (cuerpo `.strict()`)

```json
{
  "serviceId": "uuid",
  "professionalId": "any",
  "startsAt": "2026-07-24T10:00:00+02:00",
  "customer": {
    "full_name": "Ana García",
    "phone": "+34 600 123 456",
    "email": "ana@example.com"
  }
}
```

| Campo | Tipo | Notas |
|---|---|---|
| `serviceId` | uuid | Requerido. |
| `professionalId` | uuid \| `"any"` | Requerido. `"any"` = el motor asigna uno disponible. |
| `startsAt` | ISO-8601 con offset | Requerido. El hueco elegido. |
| `customer.full_name` | string (2..200) | Requerido. |
| `customer.phone` | string (6..30) | Requerido. Clave de identidad; canonicalizado a E.164 en servidor. |
| `customer.email` | email \| `""` | Opcional. `""` se trata como ausente. |

> El `customer` va en **`snake_case`** (mismo vocabulario que `identify`). El recepcionista no
> recoge `notes` ni consentimiento de marketing: se crea `marketingConsent: false` por defecto.

**Respuesta `201`** (con cabecera `Location: /api/reception/appointments/{id}`):

```json
{
  "id": "uuid",
  "starts_at": "2026-07-24T08:00:00.000Z",
  "ends_at": "2026-07-24T08:45:00.000Z",
  "service_name": "Corte y peinado",
  "professional_name": "Lucía",
  "salon_name": "Salón denueveanueve"
}
```

**Errores propios:**

| Código | HTTP | Cuándo |
|---|:--:|---|
| `VALIDATION_ERROR` | 400 | Además del cuerpo, si el teléfono no tiene número real (detalle en `customer.phone`). |
| `NO_AVAILABILITY` | 409 | El servicio no resuelve a algo reservable en el salón. |
| `SLOT_TAKEN` | 409 | El hueco pedido ya no está (recomputo o carrera anti-solape). |

---

### 5.4 `POST /api/reception/appointments/cancel` — cancelar cita

Cancela una cita **solo si pertenece** al cliente identificado por ese teléfono. Deja traza del
canal en `cancelled_reason`.

**Petición**

```json
{ "appointmentId": "uuid", "phone": "+34 600 123 456" }
```

| Campo | Tipo | Notas |
|---|---|---|
| `appointmentId` | uuid | Requerido. |
| `phone` | string | Requerido. Debe identificar al **dueño** de la cita. |

**Respuesta `200`**

```json
{
  "id": "uuid",
  "status": "cancelled",
  "starts_at": "2026-07-24T08:00:00.000Z",
  "service_name": "Corte y peinado",
  "professional_name": "Lucía",
  "cancelled_reason": "Cancelada por el cliente a través del recepcionista IA."
}
```

**Errores propios** (el control de pertenencia se evalúa `404` **antes** que `403`):

| Código | HTTP | Cuándo |
|---|:--:|---|
| `APPOINTMENT_NOT_FOUND` | 404 | No hay cita con ese id en el salón. |
| `NOT_YOUR_APPOINTMENT` | 403 | La cita existe pero no es del cliente de ese teléfono. |

---

### 5.5 `POST /api/reception/appointments/reschedule` — mover cita

Mueve una cita a otra hora (y, si se quiere, otro profesional), **solo si pertenece** al cliente
de ese teléfono. Reutiliza el motor de reservas para revalidar el nuevo hueco.

**Petición** (cuerpo `.strict()`)

```json
{
  "appointmentId": "uuid",
  "phone": "+34 600 123 456",
  "newStartsAt": "2026-07-25T12:00:00+02:00",
  "newProfessionalId": "any"
}
```

| Campo | Tipo | Notas |
|---|---|---|
| `appointmentId` | uuid | Requerido. |
| `phone` | string | Requerido. Debe identificar al dueño de la cita. |
| `newStartsAt` | ISO-8601 con offset | Requerido. El nuevo inicio. |
| `newProfessionalId` | uuid \| `"any"` | **Opcional, de tres estados:** ausente = mantener el profesional actual; `"any"` = reasignar; uuid = profesional concreto. |

**Respuesta `200`** (misma forma que la creación):

```json
{
  "id": "uuid",
  "starts_at": "2026-07-25T10:00:00.000Z",
  "ends_at": "2026-07-25T10:45:00.000Z",
  "service_name": "Corte y peinado",
  "professional_name": "Lucía",
  "salon_name": "Salón denueveanueve"
}
```

**Errores propios:**

| Código | HTTP | Cuándo |
|---|:--:|---|
| `APPOINTMENT_NOT_FOUND` | 404 | No hay cita con ese id en el salón. |
| `NOT_YOUR_APPOINTMENT` | 403 | La cita no es del cliente de ese teléfono. |
| `SLOT_TAKEN` | 409 | El nuevo hueco no está libre (recomputo o carrera anti-solape). |
| `NO_AVAILABILITY` | 409 | El servicio de la cita ya no es reservable. |

---

### Flujo típico de una llamada (para orientar el workflow de n8n)

```
identify (¿te conozco?)
  └─ found:true  → saludar por nombre; ofrecer mover/cancelar sus upcoming
  └─ found:false → recoger nombre + teléfono para crear
availability (¿qué huecos hay?) → elegir startsAt + professionalId
appointments (crear)            → confirmar id/hora de viva voz
  · más tarde, si el cliente vuelve a llamar:
      reschedule (mover)  |  cancel (anular)   ← ambos por appointmentId + phone
```

Todos los pasos van con la MISMA `x-api-key` (el mismo salón). El `appointmentId` que devuelven
`identify.upcoming[]` y `appointments` es el que consumen `cancel` y `reschedule`.

---

## 6. Montar el recepcionista IA (PARTE 2 + pasos humanos)

Con PARTE 1 lista (esta API), el recepcionista se completa **fuera del repo**. Estos pasos son
**configuración externa y humana**; Salón OS no los ejecuta ni los guarda.

**Prerrequisitos en Salón OS (PARTE 1 — HAT3X, `service_role`):**

- [ ] **Add-on `ai_receptionist` activo** para el salón (§3).
- [ ] **Clave de servicio emitida** para ese salón y entregada por canal seguro
      ([`docs/service-keys-emision.md`](./service-keys-emision.md)).

**Configuración externa (PARTE 2):**

- [ ] **Número de Twilio** — provisionar/portar el número por el que entran las llamadas
      (panel de Twilio). *No hay variable `TWILIO_*` en este repo para esto: es la telefonía que
      alimenta a Retell, no los recordatorios de WhatsApp que envía la app.*
- [ ] **Agente de Retell** — crear el agente de voz y su prompt conversacional (panel de Retell),
      conectado al número de Twilio.
- [ ] **Workflows de n8n** — desplegar/reapuntar los flujos para que, en cada intención de la
      llamada, invoquen los endpoints de §5 con la cabecera `x-api-key`. Guardar la clave en el
      **gestor de secretos / credenciales de n8n**, nunca en el propio workflow ni en el front.
- [ ] **Base URL** — apuntar n8n a `{dominio-de-Salón-OS}/api/reception`.
- [ ] **Prueba de humo** — llamar a `identify` con un teléfono conocido del salón y verificar
      `found:true`; comprobar que una clave sin add-on da `403` y una clave inválida `401`.

> 🔌 **El único acoplamiento entre PARTE 1 y PARTE 2 son estos endpoints y la clave.** Si mañana
> cambia el proveedor de voz o el orquestador (otro que no sea Retell/Twilio/n8n), la API no se
> entera: cualquier cliente HTTP que presente una `x-api-key` válida y hable este contrato sirve.

---

## 7. Referencias

- **Endpoints:** [`src/app/api/reception/`](../src/app/api/reception/)
- **Guard (authn + entitlement):** [`src/lib/reception/guard.ts`](../src/lib/reception/guard.ts)
- **Contrato de errores:** [`src/lib/reception/CONTRACT.md`](../src/lib/reception/CONTRACT.md) ·
  [`errors.ts`](../src/lib/reception/errors.ts)
- **Claves de servicio (emisión/verificación):** [`docs/service-keys-emision.md`](./service-keys-emision.md) ·
  [`src/lib/service-keys/`](../src/lib/service-keys/)
- **Migración de la tabla de claves:** [`supabase/migrations/20260722100000_service_api_keys.sql`](../supabase/migrations/20260722100000_service_api_keys.sql)
- **Entitlements / add-ons:** README → *Productización: planes (add-ons) y white-label* ·
  [`supabase/migrations/20260718100000_salon_features.sql`](../supabase/migrations/20260718100000_salon_features.sql)
- **Motor de reservas reutilizado:** [`src/lib/booking/server.ts`](../src/lib/booking/server.ts)
- **Contexto del add-on:** [`docs/roadmap-productizacion.md`](./roadmap-productizacion.md) → *Add-on Recepcionista IA*
