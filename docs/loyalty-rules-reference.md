# salon-os — Reglas de fidelización a replicar (HAT3X-019, sub-1)

> **Propósito.** Extraer las reglas EXACTAS del sistema de fidelización probado en
> **denueveanueve** (Edge Functions `verify-visit` y `loyalty-lookup`) y mapearlas
> sobre el esquema real —en inglés— de Salón OS (`customers`, `appointments`,
> `services`, `salons`, `locations`, `visits`) y su estilo de RLS
> (`app.user_salon_ids()`, `app.has_salon_role()`), para que las subtareas
> siguientes puedan implementar el módulo **de forma nativa** (no como proxy).
>
> **Alcance.** Nota de análisis de SOLO LECTURA. No modifica ninguna migración ni
> Edge Function. No es una migración: es el contrato de reglas + el plano de datos.
>
> **Fuentes:**
> - `clients/projects/denueveanueve/supabase/functions/verify-visit/index.ts`
> - `clients/projects/denueveanueve/supabase/functions/loyalty-lookup/index.ts`
> - `src/types/database.ts` + `supabase/migrations/` de Salón OS
> - Convenciones de esquema: `docs/schema-reference.md` (§1–§13)
>
> **Contexto de negocio.** La fidelización + app de cliente/staff es un **add-on
> premium** de Salón OS inspirado en denueveanueve. Salón OS **no** tiene todavía
> clientes reales de fidelización (los datos de denueveanueve eran de test), así
> que las nuevas tablas se crean **sin backfill** (coherente con el estado
> "proyecto en desarrollo").

---

## 1. Reglas exactas extraídas (contrato de comportamiento)

Estas son las reglas **literales** del sistema de referencia. Son el "qué" que
Salón OS debe reproducir; el "cómo" (tablas nativas) va en §3–§5.

### 1.1 Cálculo de puntos por línea de servicio — `verify-visit`

Al verificar una visita se suman los puntos de cada servicio. La prioridad de
**precio** de cada línea es:

1. **Override manual del staff** (`service_prices[].final_price`) — para servicios
   de precio variable que el personal ajusta en caja.
2. `final_price` ya fijado en la línea.
3. `unit_price_snapshot × quantity`.
4. En su defecto, `0`.

La prioridad de **puntos** de cada línea es:

1. `final_points` si viene fijado.
2. `points_snapshot × quantity` si existe.
3. **Regla por defecto (la clave a replicar): `puntos = ceil(precio / 2)`**
   → `Math.ceil(price / 2)`.

> ⚠️ **UNIDADES — adaptación crítica.** En denueveanueve `price` es un número en
> **euros** (p. ej. `20` → `ceil(20/2) = 10` puntos). Salón OS guarda **céntimos
> enteros** (`price_cents`, §1.6 de `schema-reference.md`). Para preservar la
> semántica "≈1 punto por cada 2 € gastados", la regla nativa debe ser:
>
> ```text
> puntos = ceil(price_cents / 200)      -- 2000 céntimos (20 €) → 10 puntos
> ```
>
> **No** portar `ceil(price_cents / 2)` (daría 1000 puntos por 20 €). Esta es la
> corrección de unidades más importante de toda la nota.

**Total de la visita:** `pointsToAdd = Σ puntos_línea`;
`finalTotalPrice = Σ precio_línea`.

### 1.2 Walk-in (visita sin cita)

Si no hay `appointment_id`, el staff envía `service_prices[]` y por cada línea:
`pts = sp.points ?? ceil(price / 2)`. Si no llega ninguna información de precio →
error `400` (no se otorgan puntos "a ciegas").

### 1.3 Idempotencia (no duplicar puntos)

Con cita, antes de sumar se comprueba `appointments.points_awarded`:
- Si ya es `true` → `409 Conflict` ("Points already awarded for this appointment").
- Tras sumar, se marca la cita: `points_awarded = true`, `verified_at`,
  `verified_by_staff_id`, `status = 'COMPLETED'`, `final_total_points`,
  `final_total_price`.

> **Mapa a Salón OS:** ver §3.6. Salón OS **no** tiene `appointments.points_awarded`,
> pero **sí** tiene `visits` (1:1 con la cita vía `appointment_id unique`,
> auto-creada al completar). `visits` es el ancla de idempotencia natural.

### 1.4 Cuenta de fidelización (`loyalty_accounts`)

Al verificar: `visits_total += 1`, `points_balance += pointsToAdd`,
`last_visit_at = now`, `last_activity_at = now`.

### 1.5 Libro mayor de puntos (`points_movements`)

Se inserta un movimiento por cada verificación:
`type = 'EARN'`, `points = pointsToAdd`,
`reason = "Visita verificada: <lista de servicios>"`,
`ref_type ∈ {'appointment','walk_in'}`, `ref_id = appointment_id | null`.

### 1.6 Hitos de recompensa (milestones) — 3 / 5 / 8 / 10 visitas

Cuando `visits_total` **alcanza exactamente** uno de estos valores, se genera
UNA recompensa (`rewards`):

| `visits_total` | `type` (recompensa)   | Descripción (denueveanueve, peluquería) |
|----------------|-----------------------|-----------------------------------------|
| 3              | `SCALP_DIAGNOSIS`     | Diagnóstico capilar                     |
| 5              | `EXPRESS_TREATMENT`   | Tratamiento exprés                      |
| 8              | `RETAIL_VOUCHER`      | Vale de producto retail                 |
| 10             | `PACK_UPGRADE`        | Mejora de pack                          |

Detalles exactos:
- **Código:** `RW-<3 primeras letras del type>-<6 alfanuméricos MAYÚSCULAS>`
  → `` `RW-${rewardType.substring(0,3)}-${Math.random().toString(36).substring(2,8).toUpperCase()}` ``.
- **Caducidad:** `expires_at = now + 90 días` (`90 * 24 * 60 * 60 * 1000` ms).
- **Estado inicial:** `status = 'AVAILABLE'`.
- Se dispara **solo en la coincidencia exacta** (`newVisits === hito`): como mucho
  **una** recompensa por verificación; a partir de la visita 11 ya no hay hitos.

> **Recomendación de producto:** en denueveanueve los 4 tipos son específicos de
> peluquería. Para Salón OS como producto genérico, estos hitos deberían ser
> **configurables por salón** (ver §6, "catálogo de reglas"). Para una réplica
> fiel v1, mantener los 4 hitos por defecto y la caducidad de 90 días.

### 1.7 Cupón de bienvenida (`welcome_coupons`)

- Un cliente puede tener un cupón `status = 'ACTIVE'` con un **`percent_off`**
  (porcentaje de descuento; p. ej. `10` = 10 %).
- En `loyalty-lookup` se devuelven los cupones `ACTIVE` **no caducados**
  (`expires_at > now`), con `{ id, percent_off, expires_at }`, para que el TPV
  muestre el descuento aplicable **antes** de cobrar.
- **Canje** (en `verify-visit`, si `redeem_coupon === true` y hay cupón activo):
  `status → 'USED'`, `used_at = now`, y se registra auditoría `REDEEM_COUPON`.
  El canje real lo hace `verify-visit` al confirmar el cobro, no el lookup.

### 1.8 Suscripción premium / club (fuera del núcleo de puntos)

`verify-visit` también consulta `subscriptions` (`status='ACTIVE'`) y
`club_benefit_usages` para exponer beneficios de plan (`MEN_19`, `LADIES_39`).
**No forma parte del núcleo puntos/hitos/cupones** y puede quedar fuera del MVP
de fidelización de Salón OS (marcar como fase 2 si se decide portar el "club").

### 1.9 Lectura — `loyalty-lookup` (SOLO LECTURA)

Dado `qr_token`, devuelve sin escribir nada:
```jsonc
{
  "customer": { "id", "first_name", "last_name" },
  "points_balance": <int>,          // 0 si no hay cuenta
  "visits_total":   <int>,          // 0 si no hay cuenta
  "last_visit_at":  <ts|null>,
  "welcome_coupons": [ { "id", "percent_off", "expires_at" } ],  // ACTIVE y no caducados
  "rewards":         [ { "id", "type", "code", "expires_at" } ]  // AVAILABLE y no caducados
}
```

### 1.10 Autorización e identidad del cliente

- **Cliente** se identifica por `customers.qr_token` (`.single()`); debe existir y
  su `status` **no** ser `'DISABLED'` (si lo es → `403`).
- **Autenticación de ambas funciones** (cualquiera de las dos):
  - `x-api-key`: clave de servicio (`dn9_…`) validada por **SHA-256 hex** contra
    `api_keys.key_hash` con `is_active = true`. Actor de auditoría = `SYSTEM`.
  - `Authorization: Bearer <token staff>`: usuario con rol en
    `{'staff','manager','admin'}` (tabla `user_roles`). Actor = `STAFF`.
- Toda escritura relevante deja rastro en `audit_logs`
  (`VERIFY_VISIT`, `REDEEM_COUPON`) con `actor_id`, `actor_role`, `location_id`,
  `metadata`.

---

## 2. Modelo de datos de denueveanueve (tablas referenciadas)

Solo como referencia del origen (NO son las tablas de Salón OS):

| Tabla (denueveanueve) | Columnas usadas |
|---|---|
| `customers` | `id`, `first_name`, `last_name`, `status` (`DISABLED`…), `qr_token` |
| `appointments` | `id`, `customer_id`, `status`, `points_awarded` |
| `appointment_services` | `service_name_snapshot`, `unit_price_snapshot`, `price_type_snapshot`, `points_snapshot`, `final_price`, `final_points`, `quantity`, `is_completed` |
| `loyalty_accounts` | `customer_id`, `visits_total`, `points_balance`, `last_visit_at`, `last_activity_at` |
| `points_movements` | `customer_id`, `type`, `points`, `reason`, `ref_type`, `ref_id` |
| `rewards` | `customer_id`, `type`, `code`, `expires_at`, `status` |
| `welcome_coupons` | `customer_id`, `status`, `percent_off`, `used_at`, `expires_at` |
| `subscriptions` / `club_benefit_usages` | club premium (fase 2) |
| `api_keys` | `key_hash`, `is_active` (auth de servicio) |
| `user_roles` | `user_id`, `role` (auth de staff) |
| `audit_logs` | `action`, `actor_id`, `actor_role`, `entity`, `entity_id`, `location_id`, `metadata` |

---

## 3. Mapeo al esquema real de Salón OS (inglés)

### 3.1 Lo que YA existe y se reutiliza

| Concepto | Tabla/columna en Salón OS | Nota |
|---|---|---|
| Tenant raíz | `salons(id)` | toda tabla de fidelización lleva `salon_id` (§1.1 schema-ref). |
| Sede | `locations(id, salon_id)` | `location_id` de auditoría → FK compuesta a `locations`. |
| Cliente | `customers(id, salon_id)` | **`full_name`** (una columna), NO `first_name`/`last_name`. |
| Catálogo | `services(price_cents)` | precio en **céntimos** (origen del cálculo de puntos). |
| Visita realizada | `visits` | **"base de fidelización"** (comentario en la migración inicial). 1:1 con cita (`appointment_id unique`), **auto-creada** al pasar la cita a `completed` (trigger `trg_appointments_create_visit`, idempotente `on conflict(appointment_id)`). |
| Personal / roles | `salon_members (role owner|manager|staff)` | reemplaza a `user_roles`; es la fuente de verdad del RLS. |

### 3.2 Diferencias que obligan a adaptar

1. **Dinero en céntimos** → `puntos = ceil(price_cents / 200)` (§1.1). **Crítico.**
2. **`customers.full_name`** en lugar de `first_name`/`last_name`: el `lookup`
   nativo devolverá `full_name` (o se parte en la capa de presentación).
3. **`customers` no tiene `qr_token` ni `status`**: hay que **añadirlos**
   (ver §3.5). `qr_token` **único por salón**; `status` puede modelarse como
   booleano `loyalty_enabled`/`disabled` o un enum pequeño.
4. **No hay `appointment_services`**: Salón OS tiene 1 servicio por cita
   (`appointments.service_id` + `price_cents`) y, para multi-línea, el TPV
   (`pos_sale_lines` con `unit_price_cents`, `quantity`, `vat_rate`). El cálculo
   de puntos nativo debe leer de **`visits.amount_cents`** (visita simple) y/o de
   **`pos_sales`/`pos_sale_lines`** (ticket TPV) según de dónde se dispare.
5. **Idempotencia** (§1.3): en lugar de `appointments.points_awarded`, usar
   `visits` como ancla (una visita = una acreditación). Ver §3.6.
6. **Auth**: no hay `user_roles` ni (todavía) `api_keys` en Salón OS. El acceso
   nativo se hace con **RLS de `salon_members`** para staff, y las escrituras
   sensibles (acreditar puntos, generar recompensas) vía **RPC/Edge Function
   `SECURITY DEFINER` o `service_role`** que bypasa RLS de forma controlada,
   igual que `process-reminders` (§8 schema-ref).

### 3.3 Tablas nuevas a crear (plano — a implementar en subtareas posteriores)

Todas siguen las invariantes de `docs/schema-reference.md` §1: `salon_id not null
references salons(id) on delete cascade` + índice; PK `uuid default
gen_random_uuid()`; FKs a dominio **compuestas** `(fk_id, salon_id)`; dinero en
céntimos; `updated_at` + `trg_<tabla>_updated_at` en tablas mutables; helpers en
esquema `app`, `security definer`, `search_path=''`.

**`loyalty_accounts`** — 1:1 con cliente (cuenta de puntos):
```text
id             uuid pk
salon_id       uuid not null → salons(id) cascade        (idx)
customer_id    uuid not null                              -- FK compuesta (customer_id, salon_id) → customers(id, salon_id)
points_balance integer not null default 0 check (>= 0)
visits_total   integer not null default 0 check (>= 0)
last_visit_at    timestamptz
last_activity_at timestamptz
created_at / updated_at timestamptz  (+ trigger updated_at)
unique (salon_id, customer_id)        -- una cuenta por cliente y salón
```

**`points_movements`** — libro mayor (append-only, casi inmutable como `visits`):
```text
id          uuid pk
salon_id    uuid not null → salons(id) cascade            (idx)
customer_id uuid not null   -- FK compuesta a customers(id, salon_id)
type        enum loyalty_movement_type ('earn','redeem','adjust','expire')  -- 'earn' cubre §1.5
points      integer not null            -- + suma, − resta
reason      text
ref_type    text            -- 'appointment' | 'walk_in' | 'pos_sale' | 'reward' …
ref_id      uuid
created_at  timestamptz not null default now()
-- SIN updated_at (inmutable). RLS: SELECT miembro; INSERT service_role/RPC; sin UPDATE/DELETE (o DELETE owner).
idx (salon_id, customer_id, created_at desc)
```

**`rewards`** — recompensas de hito:
```text
id          uuid pk
salon_id    uuid not null → salons(id) cascade            (idx)
customer_id uuid not null   -- FK compuesta a customers(id, salon_id)
type        text|enum       -- SCALP_DIAGNOSIS | EXPRESS_TREATMENT | RETAIL_VOUCHER | PACK_UPGRADE (o catálogo, §6)
code        text not null   -- 'RW-XXX-YYYYYY'
status      enum reward_status ('available','used','expired') default 'available'
expires_at  timestamptz not null      -- generación: now() + interval '90 days'
used_at     timestamptz
created_at / updated_at
unique (salon_id, code)                -- el código no colisiona dentro del salón
idx (salon_id, customer_id, status)
```

**`welcome_coupons`** — cupón de bienvenida:
```text
id          uuid pk
salon_id    uuid not null → salons(id) cascade            (idx)
customer_id uuid not null   -- FK compuesta a customers(id, salon_id)
percent_off numeric(5,2) not null check (percent_off > 0 and percent_off <= 100)
status      enum coupon_status ('active','used','expired') default 'active'
expires_at  timestamptz not null
used_at     timestamptz
created_at / updated_at
idx parcial (salon_id, customer_id) where status = 'active'   -- ≤1 cupón activo por cliente (evaluar unique)
```

> **Enums nuevos** (esquema `public`, estilo §8/§12.1): `loyalty_movement_type`,
> `reward_status`, `coupon_status`. Los `type` de `rewards` pueden ser enum
> (`reward_type`) o texto libre + catálogo configurable (§6).

### 3.4 Generación del código de recompensa en Postgres

`Math.random().toString(36)` no existe en SQL. Equivalente nativo sugerido
(dentro de la RPC/trigger `SECURITY DEFINER`):
```sql
'RW-' || upper(substr(_reward_type, 1, 3)) || '-' ||
upper(substr(encode(gen_random_bytes(5), 'hex'), 1, 6))
```
Manejar colisión con `unique (salon_id, code)` + reintento, o derivar el código de
un `uuid`. `gen_random_bytes` viene de `pgcrypto` (ya instalada, §1 schema-ref).

### 3.5 Cambios en `customers` (identidad de fidelización)

Añadir (migración aditiva, sin backfill):
- `qr_token text` **único por salón** — `unique index … (salon_id, qr_token) where qr_token is not null`. Generado al alta de fidelización (p. ej. `encode(gen_random_bytes(16),'hex')`).
- Estado de fidelización: `loyalty_status` (enum `active|disabled`) **o**
  `loyalty_disabled boolean not null default false`. Mapea el `status='DISABLED'`
  de denueveanueve (§1.10). Decisión de diseño para el PM (§7).

> Alternativa: una tabla `loyalty_members(customer_id, salon_id, qr_token, status)`
> 1:1 con `customers` para no tocar la tabla núcleo. Trade-off en §7.

### 3.6 Dónde se disparan los puntos (hook de acreditación)

Dos caminos, según el flujo real de Salón OS:

- **Al completar la cita** → ya existe `trg_appointments_create_visit` que crea la
  `visit`. Un **trigger nuevo `AFTER INSERT ON visits`** (o extensión de la RPC de
  verificación) acredita `ceil(amount_cents/200)` puntos y evalúa hitos. La
  unicidad `visits.appointment_id` garantiza **idempotencia** (una visita = una
  acreditación); para walk-ins (visita sin cita) también hay una fila `visits`.
- **Al cerrar venta en TPV** (`pos_sales.status → 'completed'`): acreditar según
  `pos_sale_lines`. Útil si la fidelización se cobra en caja y no siempre hay cita.

> **Recomendación:** anclar la v1 en **`visits`** (ya es la "base de fidelización"
> declarada y resuelve idempotencia gratis). El escaneo de QR en el TPV
> corresponde al `lookup` (mostrar saldo/cupón antes de cobrar); la acreditación
> ocurre al materializarse la visita. Confirmar con el PM el disparador exacto (§7).

---

## 4. Estilo de RLS a replicar (obligatorio)

Copiar el patrón de `20260711100100_rls_policies.sql` y `schema-reference.md` §6:

- Helpers `app.user_salon_ids()` y
  `app.has_salon_role(_salon_id, _roles member_role[])` — `stable security
  definer`, `set search_path = ''`, referencias cualificadas con `public.`.
- **Aislamiento de tenant** en toda tabla nueva: `enable row level security` +
  política SELECT `using (salon_id in (select app.user_salon_ids()))`.
- **Nada abierto a `anon`/`public`** (el guardián de
  `20260714110000_rls_multitenant_guard.sql` aborta si se filtra; extenderlo para
  cubrir las tablas de fidelización es recomendable).
- Escrituras del cliente = personal operativo (`miembro`); config/borrados
  sensibles = `owner/manager`. La **acreditación de puntos y generación de
  recompensas** NO la hace el cliente: va por **RPC/Edge Function `SECURITY
  DEFINER` o `service_role`** (como `process-reminders`), para que el saldo no sea
  manipulable desde el navegador.

### 4.1 Matriz RLS propuesta

| Tabla | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `loyalty_accounts` | miembro | service_role/RPC | service_role/RPC (o miembro solo lectura) | owner |
| `points_movements` | miembro | service_role/RPC | — (inmutable) | owner |
| `rewards` | miembro | service_role/RPC | miembro (marcar `used`) / RPC | owner |
| `welcome_coupons` | miembro | owner/manager (alta) · RPC | miembro (canjear→`used`) / RPC | owner/manager |

> Ajustar según decisión del PM sobre qué puede tocar el staff directamente vs.
> qué queda encapsulado en la RPC de verificación.

---

## 5. Contrato funcional nativo (equivalente a las 2 Edge Functions)

Para preservar el contrato del TPV, Salón OS expondrá el equivalente nativo
(RPC en esquema `app` o Route Handler `POST /api/loyalty/*`, que ya existe como
proxy y puede reapuntarse a la implementación nativa):

- **`loyalty_lookup(qr_token)`** → lectura (§1.9): saldo, visitas, `last_visit_at`,
  cupones `active` no caducados, recompensas `available` no caducadas. Sin escritura.
- **`loyalty_verify_visit(qr_token, { visit/pos_sale ref, service_prices?, redeem_coupon? })`**
  → transacción que: valida cliente (existe, no `disabled`); calcula puntos
  (`ceil(price_cents/200)` con overrides §1.1); actualiza `loyalty_accounts`
  (§1.4); inserta `points_movements` `earn` (§1.5); evalúa hito 3/5/8/10 y genera
  `reward` con código + `expires_at = now()+90d` (§1.6); canjea cupón si procede
  (§1.7); registra auditoría. **Idempotente** por la visita (§3.6). Todo en **una
  transacción** para que saldo, movimiento y recompensa sean atómicos.

---

## 6. Configurabilidad (producto multi-salón)

denueveanueve tiene las reglas **hardcodeadas** para un único negocio. Salón OS es
multi-tenant: recomendable externalizar los parámetros a `salons.settings jsonb`
o a una tabla `loyalty_rules(salon_id, …)`:

- Ratio de puntos (por defecto `1 punto / 2 € = ceil(price_cents/200)`).
- Hitos y sus recompensas (`{ visits, reward_type, label }[]`, por defecto 3/5/8/10).
- Caducidad de recompensas (por defecto 90 días) y de cupones.
- `percent_off` por defecto del cupón de bienvenida.

Para la **v1 (réplica fiel)** basta con los valores por defecto de denueveanueve;
dejar el `jsonb`/tabla preparado evita una migración disruptiva después.

---

## 7. Decisiones abiertas para el PM (webs-apps)

1. **Alcance v1:** ¿solo núcleo (puntos + hitos + cupón) o también club premium
   (`subscriptions`/`club_benefit_usages`, §1.8)? → sugerido: núcleo primero.
2. **Identidad QR:** ¿`qr_token`/`status` **en `customers`** (más simple) o tabla
   `loyalty_members` 1:1 (aísla el núcleo)? → sugerido: columnas en `customers`.
3. **Disparador de acreditación:** ¿`AFTER INSERT ON visits` (recomendado) o al
   cerrar venta TPV, o ambos? (§3.6).
4. **Reglas configurables ya (§6) o hardcodeadas v1** con `jsonb` preparado.
5. **Ratio de puntos exacto:** confirmar "1 punto por cada 2 €" ⇒
   `ceil(price_cents/200)`. Es la conversión más sensible.
6. **Auth de la RPC/endpoint:** staff vía RLS `salon_members` + verificación vía
   `service_role`; ¿se mantiene además el patrón `api_keys` para integraciones
   externas (como en denueveanueve)?

---

## 8. Checklist para la subtarea de migración (siguiente)

- [ ] Enums `public`: `loyalty_movement_type`, `reward_status`, `coupon_status` (+ `reward_type` si enum).
- [ ] Tablas `loyalty_accounts`, `points_movements`, `rewards`, `welcome_coupons` con `salon_id` + índice, FKs **compuestas** `(fk_id, salon_id)`, dinero en céntimos, `updated_at` + trigger donde aplique.
- [ ] `customers` += `qr_token` (único por salón) + estado de fidelización (o tabla `loyalty_members`).
- [ ] RLS en las 4 tablas nuevas con `app.user_salon_ids()` / `app.has_salon_role()`; nada expuesto a `anon/public`; extender el guardián multi-tenant.
- [ ] RPC/función `SECURITY DEFINER` `search_path=''` para `verify_visit` (transacción atómica) y `lookup` (solo lectura); `grant/revoke execute` explícitos.
- [ ] Regla de puntos **`ceil(price_cents/200)`** (NO `/2`).
- [ ] Hito exacto 3/5/8/10 → recompensa con código `RW-XXX-YYYYYY` + `expires_at = now()+90d`, `status='available'`.
- [ ] Idempotencia anclada en `visits` (una visita = una acreditación).
- [ ] Actualizar `src/types/database.ts` a mano (o `supabase gen types`) tras la migración.
- [ ] Reapuntar los Route Handlers `POST /api/loyalty/*` (hoy proxy) a la implementación nativa, conservando su contrato/validaciones (`src/lib/validations/loyalty.ts`).
