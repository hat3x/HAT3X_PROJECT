# salon-os — Contrato de aislamiento multi-tenant + fidelización (HAT3X-021, sub-1)

> **Propósito.** Analizar y fijar por escrito, ANTES de tocar nada, las invariantes
> de aislamiento multi-tenant y la estructura ya construida del núcleo de
> fidelización, para que el resto de subtareas de HAT3X-021 (UI de loyalty por
> cliente, lookup/verify nativos, TPV local) **respeten el aislamiento sagrado**
> sin reintroducir fugas cross-tenant.
>
> **Alcance.** Nota de análisis de **SOLO LECTURA**. No modifica migraciones ni
> código. Es el "contrato de invariantes" + el plano de datos ya materializado.
>
> **Fuentes auditadas:**
> - `supabase/migrations/20260711100100_rls_policies.sql` (helpers + políticas base)
> - `supabase/migrations/20260712120000_tenant_integrity.sql` (FKs compuestas)
> - `supabase/migrations/20260714110000_rls_multitenant_guard.sql` (guardián TPV/fiscal)
> - `supabase/migrations/20260716120000_loyalty_base.sql` (núcleo de fidelización)
> - `src/types/database.ts` (contrato TS ya regenerado a mano)
> - `docs/schema-reference.md` (§1–§13) y `docs/loyalty-rules-reference.md`
> - `docs/roadmap-productizacion.md` (decisiones de arquitectura de Jota, 2026-07-16)
>
> **Estado clave:** la migración `loyalty_base` **ya está aplicada** y reflejada en
> `database.ts` (tablas `loyalty_accounts` / `points_movements` / `welcome_coupons`
> / `rewards`, enums en MAYÚSCULAS, `customers.qr_token`). Las subtareas siguientes
> **consumen** este esquema; no lo reescriben.

---

## 0. TL;DR — las 10 reglas que NO se pueden romper

1. **Todo acceso a datos va acotado por `salon_id`.** La RLS lo garantiza, pero el
   código debe seguir pasando `salon_id` en filtros y en los `insert` (no confiar
   solo en RLS: si mañana se usa `service_role`, RLS no protege).
2. **Los helpers son la única fuente de verdad del tenant:**
   `salon_id in (select app.user_salon_ids())` para leer/operar,
   `app.has_salon_role(salon_id, array[...])` para config/borrados sensibles.
3. **Nada abierto a `anon` / `public`.** Toda política es `to authenticated`. El
   guardián aborta la migración si detecta lo contrario.
4. **Los puntos son "casi dinero".** El saldo (`loyalty_accounts`), el libro mayor
   (`points_movements`) y la generación de `rewards` **NO** se escriben desde el
   navegador: van por trigger `SECURITY DEFINER` o RPC/`service_role`. `authenticated`
   solo tiene `SELECT` (+ marcar canje donde procede).
5. **`points_movements` es inmutable** (append-only, sin `updated_at`, sin política
   UPDATE). **`pos_invoices` es inmutable absoluta** (trigger bloquea a todos los roles).
6. **FKs a entidades de dominio siempre compuestas** `(fk_id, salon_id) →
   tabla(id, salon_id)`. Impide mezclar entidades de dos salones aunque se conozcan
   UUIDs ajenos.
7. **Enums de fidelización en MAYÚSCULAS** (`EARN`, `ACTIVE`, `AVAILABLE`,
   `REDEEMED`…): contrato deliberado heredado de denueveanueve que consumen lookup,
   verify-visit y el TPV. No "corregir" a minúsculas.
8. **`customers.qr_token` es ÚNICO GLOBAL** (no por salón). El lookup identifica al
   cliente solo por token; el aislamiento lo pone la RLS del `SELECT` (§4.1). Ver la
   nota crítica de implementación en §5.3.
9. **Al crear una tabla de fidelización nueva:** `salon_id` + índice, FKs compuestas,
   RLS habilitada, `SELECT` acotado por `user_salon_ids()`, nada a `anon/public`, y
   **extender el guardián** de `loyalty_base`.
10. **Identidad-por-teléfono (`unique (salon_id, phone)`) NO se toca en FASE 1.**
    Va en FASE 3 (roadmap §"Identidad-por-teléfono"). Un `unique` prematuro rompería
    la migración con los datos de prueba actuales.

---

## 1. Helpers de tenant — `app.user_salon_ids()` / `app.has_salon_role()`

Definidos en `20260711100100_rls_policies.sql`. Son el corazón del aislamiento: toda
política RLS del esquema (agenda, TPV, fiscal y fidelización) se apoya en ellos.

### 1.1 `app.user_salon_ids() → setof uuid`

```sql
create or replace function app.user_salon_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select salon_id
  from public.salon_members
  where user_id = (select auth.uid());
$$;
```

Devuelve el conjunto de salones a los que pertenece el usuario autenticado. Se usa
como `salon_id in (select app.user_salon_ids())` en las políticas de lectura y de
escritura operativa.

### 1.2 `app.has_salon_role(_salon_id uuid, _roles public.member_role[]) → boolean`

```sql
create or replace function app.has_salon_role(_salon_id uuid, _roles public.member_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.salon_members m
    where m.salon_id = _salon_id
      and m.user_id = (select auth.uid())
      and m.role = any (_roles)
  );
$$;
```

`true` si el usuario tiene en `_salon_id` alguno de los roles pedidos. Se usa para
operaciones privilegiadas, típicamente `array['owner','manager']::public.member_role[]`.

### 1.3 Por qué están así configurados (no cambiar estos atributos)

| Atributo | Motivo |
|---|---|
| **`security definer`** | Evita la **recursión RLS** sobre `salon_members`: la política de `salon_members` consulta la pertenencia del usuario, que a su vez lee `salon_members`. Como `definer`, el helper bypasa RLS por dentro y corta el bucle. |
| **`stable`** + envoltura `(select app.user_salon_ids())` | El planner lo evalúa **una vez por consulta** (patrón *initPlan*), no una vez por fila. Es la optimización RLS recomendada por Supabase. Mantener SIEMPRE el `(select …)`. |
| **`set search_path = ''`** | Endurecimiento: ninguna resolución de nombre depende del `search_path` del llamante. Por eso **toda referencia va cualificada con `public.`** (`public.salon_members`, `public.member_role`). |
| **Grants** | `revoke execute … from anon, public;` + `grant execute … to authenticated;`. Nunca conceder a `anon`. |

### 1.4 Trigger asociado — auto-registro de owner

`trg_salons_register_owner` (AFTER INSERT en `salons`) inserta al creador como
`owner` en `salon_members` **solo si hay `auth.uid()`** (con `service_role`/seeds no
se crea membresía). Es `SECURITY DEFINER`. Esto explica la política
`authenticated_insert_salon … with check (true)`: cualquiera crea un salón y el
trigger lo convierte en su owner.

---

## 2. El patrón "guardián de aserción" (defensa en profundidad)

Presente en `20260714110000_rls_multitenant_guard.sql` (TPV + fiscal) y replicado en
`20260716120000_loyalty_base.sql` (fidelización). Es una técnica de **seguridad
defensiva** que conviene entender y **replicar en toda migración futura** que añada
tablas de tenant.

### 2.1 Anatomía

1. **Reafirmación idempotente de RLS.** `alter table … enable row level security;`
   sobre cada tabla cubierta. Si ya está activa es un no-op; si una migración la
   hubiera desactivado, la vuelve a activar.
2. **Bloque `do $guard$ … $guard$;`** que consulta el **catálogo** (`pg_class`,
   `pg_policies`) y hace `raise exception … using errcode = 'raise_exception'` ante
   cualquier regresión. Como corre dentro de la transacción (`begin; … commit;` en el
   guard de TPV), **aborta la migración entera**.

### 2.2 Comprobaciones que hace

Para **cada** tabla del array `_tenant_tables`:

- **(a) RLS habilitada** — `pg_class.relrowsecurity`. Si no → aborta
  ("aislamiento multi-tenant roto").
- **(b) Existe política `SELECT` acotada por `app.user_salon_ids()`** —
  `pg_policies` con `cmd in ('SELECT','ALL')` y `qual like '%user_salon_ids%'`. Es la
  barrera que impide ver filas de otro salón. Si falta → aborta ("posible fuga
  cross-tenant").
- **(c) Ninguna política abierta a `anon`/`public`** —
  `roles && array['anon','public']::name[]`. Si hay alguna → aborta ("acceso sin
  autenticar").

Solo en el guard de TPV/fiscal, además:

- **(d) `pos_invoices` sin política UPDATE/DELETE** — protege la inmutabilidad fiscal
  Veri*factu. Si aparece una → aborta.

Tablas vigiladas hoy:
- Guard TPV/fiscal: `products`, `pos_payment_methods`, `pos_sessions`, `pos_sales`,
  `pos_sale_lines`, `pos_payments`, `pos_invoices`.
- Guard fidelización: `loyalty_accounts`, `points_movements`, `welcome_coupons`, `rewards`.

### 2.3 Regla para las subtareas siguientes

> Si una subtarea añade una tabla de fidelización (p. ej. `loyalty_rules`,
> `loyalty_members`) **debe añadirla al array `_tenant_tables` del guardián** (o crear
> un guard nuevo con el mismo patrón). Así, si una migración posterior expusiera la
> tabla, el CI/entorno limpio **falla ruidosamente** en vez de degradar el aislamiento
> en silencio.

---

## 3. Integridad de tenant vía FK compuesta (`tenant_integrity`)

La RLS valida el `salon_id` **de la fila**, pero no el de sus FKs. Sin protección
extra, una fila podría enlazar un `customer` de otro salón conociendo su UUID. La
migración `20260712120000_tenant_integrity.sql` lo cierra con **FKs compuestas**:

```sql
foreign key (customer_id, salon_id) references public.customers (id, salon_id)
```

Requisito: la tabla destino necesita un `unique (id, salon_id)` explícito de apoyo
(`customers_id_salon_key`, etc.), aunque `id` ya sea PK. Las cuatro tablas de
fidelización **ya usan este patrón** contra `customers(id, salon_id)` (ver §5).

> **Contrato para subtareas:** toda FK nueva hacia `customers`/`services`/etc. va
> compuesta `(fk_id, salon_id)`, nunca `fk_id → tabla(id)` a secas.

---

## 4. Modelo RLS de fidelización — "puntos = casi dinero"

Las políticas de las 4 tablas nuevas (en `loyalty_base.sql`) endurecen la ESCRITURA
respecto a las tablas operativas normales: el saldo no debe poder fabricarse desde el
navegador. La acreditación y la generación de recompensas las hará el trigger de
bootstrap (`SECURITY DEFINER`) y la futura RPC `verify-visit` (`service_role`/definer),
que bypasan RLS de forma controlada.

### 4.1 Matriz RLS efectiva (tal como está en la migración)

| Tabla | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `loyalty_accounts` | miembro | — *(solo definer/service_role)* | — *(solo definer/service_role)* | owner |
| `points_movements` | miembro | — *(solo definer/service_role)* | — *(inmutable, sin política)* | owner |
| `welcome_coupons` | miembro | owner/manager *(alta manual)* | miembro *(→`USED`)* | owner/manager |
| `rewards` | miembro | — *(solo verify-visit definer/RPC)* | miembro *(→`REDEEMED`)* | owner |

- "miembro" = `salon_id in (select app.user_salon_ids())`.
- "owner" / "owner/manager" = `app.has_salon_role(salon_id, array[...])`.
- "—" = **no hay política** para ese rol `authenticated` ⇒ deny-by-default ⇒ solo un
  contexto que bypase RLS (`SECURITY DEFINER` / `service_role`) puede hacerlo.

### 4.2 Lectura importante para el lookup/verify (§5.3 amplía)

El `SELECT` de las 4 tablas está acotado por `user_salon_ids()`: un miembro solo ve
la fidelización de **su** salón. Cualquier RPC de lectura que use `service_role` para
resolver por `qr_token` **debe re-filtrar por el `salon_id` del staff que consulta**,
o de lo contrario cruzaría tenants (ver §5.3).

---

## 5. Estructura de las tablas (plano ya materializado)

### 5.1 `customers` (base + fidelización)

Base (`initial_schema`) + fiscal (`fiscal_base`) + `qr_token` (`loyalty_base`):

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | `default gen_random_uuid()` |
| `salon_id` | uuid NOT NULL | → `salons(id)` cascade |
| `full_name` | varchar(200) NOT NULL | **una** columna (no `first_name`/`last_name`) |
| `email` | varchar(255) | único por salón (parcial, `lower(email)`) |
| `phone` | varchar(30) | idx parcial `(salon_id, phone)`. **Aún sin `unique`** (→ FASE 3) |
| `birth_date` | date | |
| `notes` | text | |
| `marketing_consent` | boolean NOT NULL default false | |
| `tax_id` | varchar(20) | fiscal, opcional (`fiscal_base`) |
| `address` | text | fiscal, opcional (`fiscal_base`) |
| `qr_token` | text NOT NULL **UNIQUE (global)** | `default gen_random_uuid()::text`. Identidad de fidelización |
| `created_at` / `updated_at` | timestamptz | |

- Clave de apoyo: `customers_id_salon_key unique (id, salon_id)`.
- Índices: `idx_customers_salon_id`; unique `idx_customers_salon_email
  (salon_id, lower(email)) where email is not null`; `idx_customers_salon_phone
  (salon_id, phone) where phone is not null`.
- **`qr_token` es único GLOBAL**, no `(salon_id, qr_token)`. Decisión de la migración
  (comentario propio): el lookup identifica por token sin conocer el salón; un UUID
  como texto hace la colisión entre salones inviable. ⚠️ Es una **desviación** frente a
  lo que sugería `loyalty-rules-reference §3.5` (`unique (salon_id, qr_token)`);
  gana la migración. Implicación en §5.3.
- RLS: SELECT/INSERT/UPDATE = miembro; DELETE = owner/manager (RGPD).
- Triggers: `trg_customers_updated_at`, `trg_customers_history` (auditoría RGPD),
  **`trg_customers_bootstrap_loyalty`** (AFTER INSERT → §5.6).

### 5.2 `loyalty_accounts` — cuenta de puntos (1:1 cliente·salón)

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `salon_id` | uuid NOT NULL | → `salons(id)` cascade |
| `customer_id` | uuid NOT NULL | FK compuesta `(customer_id, salon_id) → customers(id, salon_id)` cascade |
| `points_balance` | integer NOT NULL default 0 | `check (>= 0)` |
| `visits_total` | integer NOT NULL default 0 | `check (>= 0)` |
| `last_visit_at` | timestamptz | |
| `last_activity_at` | timestamptz | |
| `created_at` / `updated_at` | timestamptz | trigger `updated_at` |

- `constraint loyalty_accounts_customer_key unique (salon_id, customer_id)` — una
  cuenta por cliente y salón; es también el **ancla de idempotencia** del bootstrap y
  el índice utilizable prefijado por `salon_id` (no hay `idx_..._salon_id` aparte).
- RLS: SELECT miembro · DELETE owner. INSERT/UPDATE **solo definer/service_role**.

### 5.3 `points_movements` — libro mayor inmutable (append-only)

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `salon_id` | uuid NOT NULL | → `salons(id)` cascade |
| `customer_id` | uuid NOT NULL | FK compuesta a `customers(id, salon_id)` cascade |
| `type` | `public.points_movement_type` NOT NULL | `EARN`/`REDEEM`/`ADJUST`/`EXPIRE` |
| `points` | integer NOT NULL | **con signo**: EARN + / REDEEM·EXPIRE − / ADJUST ± |
| `reason` | text | |
| `ref_type` | text | `'appointment'`/`'walk_in'`/`'pos_sale'`/`'reward'`/`'coupon'`… |
| `ref_id` | uuid | |
| `created_at` | timestamptz | **SIN `updated_at`** (inmutable) |

- Índice `idx_points_movements_ledger (salon_id, customer_id, created_at desc)` — sirve
  al historial del cliente y al `ON DELETE CASCADE` de `customers`.
- RLS: SELECT miembro · DELETE owner. **Sin INSERT/UPDATE** (alta vía verify-visit/RPC;
  inmutable como `visits`).

> **⚠️ Nota crítica de implementación (lookup por `qr_token`).** Como `qr_token` es
> único GLOBAL, un `select … from customers where qr_token = $1` sin `salon_id`
> resuelve al cliente **de cualquier salón**. El aislamiento se preserva de UNA de
> estas dos formas, y las subtareas de lookup/verify **deben** elegir una:
> 1. **Bajo la RLS del staff** (cliente `authenticated`): la política SELECT de
>    `customers` ya filtra por `user_salon_ids()`, así que escanear el QR de un cliente
>    de otro salón **devuelve vacío** (comportamiento correcto: el staff solo resuelve
>    clientes de su salón).
> 2. **Si se usa `service_role`/`SECURITY DEFINER`** (que bypasa RLS), la RPC **debe
>    re-filtrar explícitamente por el `salon_id` del salón que consulta**. Resolver por
>    token a secas con `service_role` = **fuga cross-tenant**. No hacerlo.

### 5.4 `welcome_coupons` — cupón de bienvenida (uno por cliente)

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `salon_id` | uuid NOT NULL | → `salons(id)` cascade |
| `customer_id` | uuid NOT NULL | FK compuesta a `customers(id, salon_id)` cascade |
| `percent_off` | numeric(5,2) NOT NULL | `check (> 0 and <= 100)` (p. ej. `10.00` = 10 %) |
| `status` | `public.coupon_status` NOT NULL default `'ACTIVE'` | `ACTIVE`/`USED`/`EXPIRED` |
| `expires_at` | timestamptz NOT NULL | |
| `used_at` | timestamptz | |
| `created_at` / `updated_at` | timestamptz | trigger `updated_at` |

- `constraint welcome_coupons_customer_key unique (salon_id, customer_id)` — uno por
  cliente; ancla de idempotencia del bootstrap.
- RLS: SELECT miembro · INSERT owner/manager (alta manual) · UPDATE miembro (marcar
  `USED`) · DELETE owner/manager. El cupón automático lo crea el trigger de bootstrap.

### 5.5 `rewards` — recompensas de hito (3/5/8/10 visitas)

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `salon_id` | uuid NOT NULL | → `salons(id)` cascade |
| `customer_id` | uuid NOT NULL | FK compuesta a `customers(id, salon_id)` cascade |
| `type` | text NOT NULL | catálogo libre (denueveanueve: `SCALP_DIAGNOSIS`, `EXPRESS_TREATMENT`, `RETAIL_VOUCHER`, `PACK_UPGRADE`). Configurable por salón (fase 2) |
| `code` | text NOT NULL | `'RW-XXX-YYYYYY'` |
| `status` | `public.reward_status` NOT NULL default `'AVAILABLE'` | `AVAILABLE`/`REDEEMED`/`EXPIRED` |
| `expires_at` | timestamptz NOT NULL | generación: `now() + 90 días` |
| `redeemed_at` | timestamptz | |
| `created_at` / `updated_at` | timestamptz | trigger `updated_at` |

- `constraint rewards_code_key unique (salon_id, code)` — el código no colisiona en el salón.
- Índice `idx_rewards_customer_status (salon_id, customer_id, status)`.
- RLS: SELECT miembro · UPDATE miembro (marcar `REDEEMED`) · DELETE owner. INSERT solo
  vía verify-visit (definer/RPC).

> **Asimetría de vocabulario de canje** (no unificar): un **cupón** canjeado es
> `status='USED'` + `used_at`; una **recompensa** canjeada es `status='REDEEMED'` +
> `redeemed_at`. Ambos contratos vienen de denueveanueve y los consume el TPV.

### 5.6 Bootstrap de fidelización — `app.bootstrap_customer_loyalty()`

`trg_customers_bootstrap_loyalty` (AFTER INSERT en `customers`), `SECURITY DEFINER` +
`search_path=''`:

- Crea `loyalty_accounts` (saldo 0) y `welcome_coupons` (**10 % / 90 días**, `ACTIVE`).
- `on conflict (salon_id, customer_id) do nothing` ⇒ **idempotente** ante reintentos.
- Bypasa RLS de forma controlada ⇒ funciona tanto si el alta la hace staff
  autenticado como la app de cliente (`service_role`/RPC).
- **No** pone `qr_token`: lo rellena el `DEFAULT` de la columna en el propio INSERT.
- Parámetros 10 %/90 d son el v1 (réplica denueveanueve); externalizables a
  `salons.settings` en fase 2.

### 5.7 Enums (esquema `public`, MAYÚSCULAS — contrato deliberado)

| Enum | Valores |
|---|---|
| `points_movement_type` | `EARN`, `REDEEM`, `ADJUST`, `EXPIRE` |
| `coupon_status` | `ACTIVE`, `USED`, `EXPIRED` |
| `reward_status` | `AVAILABLE`, `REDEEMED`, `EXPIRED` |

Espejo TS en `src/types/database.ts`:
`PointsMovementType` / `CouponStatus` / `RewardStatus`, y los alias de dominio
`LoyaltyAccount`, `PointsMovement`, `WelcomeCoupon`, `Reward`. **Cualquier cambio de
esquema exige actualizar `database.ts` a mano** (o `supabase gen types`).

---

## 6. Decisiones del roadmap que TODAS las fases deben respetar

De `docs/roadmap-productizacion.md` (acordado con Jota, 2026-07-16):

1. **Un solo backend.** Gestión, loyalty, TPV, apps y recepcionista IA viven en la BD
   de Salón OS. Cualquier canal que cree citas/clientes escribe en `appointments` /
   `customers`, **nunca** en una BD paralela.
2. **Aislamiento multi-tenant = cimiento ya construido.** `salon_id` + RLS
   (`user_salon_ids`, `has_salon_role`). denueveanueve = un `salon_id`; "Jota Barber" =
   otro. Nunca se cruzan.
3. **Orden de fases:** (1) **Loyalty nativo** *(en curso — esto es HAT3X-021)*;
   (2) **TPV + loyalty local** (escanear QR HID+cámara, cupones/puntos, descuento en
   ticket, acreditar al cobrar, impresora térmica); (3) **Re-apuntar apps** cliente+staff
   a Salón OS + **identidad-por-teléfono**; (4) **Productización** (planes + white-label);
   (5) **Add-on Recepcionista IA** (Retell + Twilio).
4. **Identidad-por-teléfono → FASE 3, no antes.** Añadir `unique (salon_id, phone)`,
   normalizar a **E.164** (`+34XXXXXXXXX`) antes de comparar/guardar, y **buscar por
   teléfono primero** en toda alta para no duplicar fichas. **No** se metió en FASE 1
   a propósito: los datos de prueba tienen teléfonos nulos/duplicados y un `unique`
   prematuro rompería la migración de loyalty.
5. **Productización — planes/entitlements** en `salons.settings` (jsonb) o columnas
   dedicadas; la UI muestra/oculta módulos según el plan (sin contratar → ni aparece).
   **White-label** (logo + color por salón) en `salons.settings` o tabla
   `salon_branding`; apps = **un solo código** que carga el branding por BD, servido
   por subdominio.
6. **Add-on Recepcionista IA:** n8n reapuntado a Salón OS (cada cita cerrada → tabla
   `appointments`); identifica al cliente por el teléfono de la llamada (usa la
   identidad-por-teléfono de FASE 3).

---

## 7. Checklist de aislamiento para las subtareas de HAT3X-021

Antes de dar por buena cualquier subtarea que toque loyalty/TPV:

- [ ] ¿Toda query/mutación filtra o inserta con `salon_id` correcto (no confía solo en RLS)?
- [ ] ¿La UI de loyalty por cliente solo lee `loyalty_accounts`/`points_movements`/
      `rewards`/`welcome_coupons` del salón activo (RLS `authenticated`, sin `service_role`)?
- [ ] Si hay lookup por `qr_token`: ¿corre bajo RLS del staff **o** re-filtra por
      `salon_id` si usa `service_role`/definer? (§5.3 — no fuga cross-tenant).
- [ ] ¿Ninguna escritura de saldo/movimientos/recompensas se hace desde el cliente?
      (van por trigger `SECURITY DEFINER` / RPC / `service_role`).
- [ ] ¿Se respetan los enums en MAYÚSCULAS y la asimetría `USED`/`REDEEMED`?
- [ ] ¿Ninguna tabla nueva queda expuesta a `anon`/`public`? ¿Se extendió el guardián?
- [ ] ¿FKs a dominio compuestas `(fk_id, salon_id)`?
- [ ] ¿No se añadió `unique (salon_id, phone)` (eso es FASE 3)?
- [ ] ¿`src/types/database.ts` actualizado si cambió el esquema?
- [ ] ¿`updated_at` + trigger en tablas mutables nuevas? (`points_movements` NO lleva).

---

*Auditoría de solo lectura. No se modificó ninguna migración ni código de la app.*
