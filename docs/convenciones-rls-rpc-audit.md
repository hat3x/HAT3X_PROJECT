# salon-os — Convenciones: guardianes RLS (evolución), helpers `app.*`, `salons` y RPC (HAT3X-024, sub-1)

> **Propósito.** Fijar por escrito, **antes de tocar nada**, las convenciones de la
> capa de seguridad/autoservicio que se AÑADIERON después de HAT3X-021, para que las
> próximas subtareas no rompan invariantes.
>
> **Es un DELTA, no un duplicado.** La base (helpers `user_salon_ids`/`has_salon_role`,
> patrón guardián básico, FKs compuestas, tablas de fidelización, roadmap) ya está en
> **`docs/multitenant-loyalty-contract.md`** y **`docs/schema-reference.md`** (hasta
> `pos_base`). Este doc cubre lo que aquellos NO cubren: la **evolución del guardián**
> (parte D), los **helpers nuevos** (`user_customer_ids`, `normalize_phone`, candado de
> columnas), el **estado consolidado de `salons`** y el **contrato de las dos RPC**.
>
> **Auditoría de solo lectura.** No se modificó ninguna migración ni código.
>
> **Fuentes nuevas auditadas:** `20260713170000_fiscal_base`,
> `20260717100000_customers_user_id`, `20260717110000_customers_phone_e164`,
> `20260717120000_rls_self_customer`, `20260717130000_rls_self_guard`,
> `20260717140000_rpc_register_customer`, `20260717150000_rpc_staff_award_visit`,
> `src/types/database.ts`, `src/lib/customers/account.ts`, `src/lib/loyalty/server.ts`.
>
> **Estado:** proyecto en desarrollo, **sin datos de producción** (`customers` a 0
> filas; columnas nuevas sin backfill de negocio).

---

## 0. Hallazgos que condicionan las próximas subtareas

1. **⚠️ GAP DE TIPOS.** `src/types/database.ts` tiene **`Functions: Record<never,
   never>`** (línea ~1584). Las dos RPC **no están en el contrato TS**: una llamada
   `supabase.rpc("register_my_customer_account" | "staff_award_visit", …)` **no está
   tipada** (ni args ni return). Las tablas/enums de fidelización SÍ están al día
   (loyalty_* , `qr_token`, `user_id`, `phone_e164`, enums MAYÚSCULAS). Si una
   subtarea siguiente llama estas RPC desde TS, deberá tipar el bloque `Functions` o
   documentar por qué no.

2. **El guardián RLS evolucionó** más allá del patrón "básico" de
   `multitenant-loyalty-contract §2`: la **parte D** (`rls_self_guard`) añade
   comprobación de **integridad de helpers** (`pg_proc.prosecdef`), un **barrido
   genérico de anclas** sobre TODA política, y verificación del **candado de columnas**
   (`pg_trigger`). Ver §1.

3. **`salons` = tenant raíz con 2 triggers `AFTER INSERT`** y `settings jsonb` como
   sede prevista de planes/entitlements + white-label. Datos fiscales ya presentes. §2.

4. **Identidad-por-teléfono se implementó MÁS FUERTE que el roadmap:** el roadmap pedía
   `unique (salon_id, phone)`; la realidad es una **columna GENERADA** `phone_e164` +
   `unique (salon_id, phone_e164)` parcial. Usar SIEMPRE `phone_e164` para dedup. §3.

---

## 1. Guardián de aserción RLS — la FORMA EVOLUdA (parte D)

> El patrón básico (reafirmar RLS + `do $guard$` sobre `pg_class`/`pg_policies` +
> `raise exception … using errcode='raise_exception'`) está en
> `multitenant-loyalty-contract §2`. **Aquí solo el delta** que introdujo
> `20260717130000_rls_self_guard` y que toda tabla de la superficie de cliente hereda.

Cuatro guardianes conviven hoy (defensa en profundidad, solape intencionado):

| Guardián | Migración | Ámbito | Novedad |
|---|---|---|---|
| TPV/fiscal | `rls_multitenant_guard` | products + 6 `pos_*` | veto UPDATE/DELETE en `pos_invoices` |
| Fidelización (inline) | `loyalty_base` §6 | 4 tablas loyalty | — (patrón básico) |
| Autoservicio (inline) | `rls_self_customer` §4 | customers + 4 loyalty | checks SELF + candado |
| **Autoservicio (standalone)** | **`rls_self_guard`** | customers + 4 loyalty + **helpers** | **§1.1–1.3 ↓** |

### 1.1 Integridad de helpers (novedad de la parte D)

Antes de mirar políticas, verifica que los helpers en que se apoya TODO siguen sanos:

```sql
-- Para app.user_salon_ids() y app.user_customer_ids():
select p.prosecdef into _sd from pg_proc p where p.oid = to_regprocedure(_h);
if _sd is null      then raise exception 'falta el helper %', _h; end if;   -- existe
if not _sd          then raise exception 'helper % ya no es DEFINER', _h; end if;
if exists (select 1 from pg_roles where rolname='anon')
   and has_function_privilege('anon', _h, 'execute')
then raise exception 'anon puede ejecutar %', _h; end if;                    -- no expuesto
```

> Localiza los helpers por **firma textual exacta** (`'app.user_salon_ids()'`). Si un
> helper cambia de firma (gana un parámetro), hay que actualizar esas cadenas o el
> guardián lo dará por ausente y abortará (intencional: fuerza revisar el aislamiento).

### 1.2 Barrido genérico de anclas (novedad de la parte D)

Recorre **todas** las políticas de las 5 tablas de cliente y exige dos cosas:

- **(i)** todo `qual` y todo `with_check` presentes deben citar **al menos un ancla**
  reconocida — si no, es un `using (true)`/`with check (true)` que abre la tabla:

  **Anclas reconocidas hoy:** `user_salon_ids` · `has_salon_role` ·
  `user_customer_ids` · `auth.uid`.

- **(ii)** las políticas con **prefijo `self`** deben acotarse **específicamente al
  cliente** (`auth.uid` / `user_customer_ids`), nunca solo al salón.

```sql
for _pol in select tablename, policyname, qual, with_check from pg_policies
            where schemaname='public' and tablename::text = any(_all_tables) loop
  if _pol.qual is not null
     and _pol.qual not like '%user_salon_ids%' and _pol.qual not like '%has_salon_role%'
     and _pol.qual not like '%user_customer_ids%' and _pol.qual not like '%auth.uid%'
  then raise exception 'política %.% con USING sin ancla', _pol.tablename, _pol.policyname; end if;
  -- (idéntico para with_check; y si policyname like 'self%' exige auth.uid/user_customer_ids)
end loop;
```

### 1.3 Invariantes que quedan garantizados (contrato a respetar)

- **customers:** RLS on · SELECT staff (`user_salon_ids`) · SELECT SELF (`auth.uid`) ·
  UPDATE SELF (`auth.uid` en `qual` **y** `with_check`) · trigger
  `trg_customers_enforce_self_update_columns` presente · nada a anon/public.
- **loyalty (×4):** RLS on · SELECT staff · SELECT SELF (`user_customer_ids`) · **sin
  escritura SELF** (ninguna política ≠ SELECT que cite `user_customer_ids`) · nada a
  anon/public.
- **`points_movements` sin política UPDATE** (append-only, análogo a `pos_invoices`).

> **Reglas al escribir aquí:** (1) política de cliente → **prefijo `self`** + acotada a
> `auth.uid()`/`user_customer_ids()`. (2) si algún día el cliente gana una escritura
> legítima de fidelización, la nueva política SELF debe seguir citando
> `user_customer_ids` en `qual` **y** `with_check`, o el guardián aborta (correcto).
> (3) un ancla nueva (p. ej. subconsulta directa a `salon_members` sin helper) hay que
> añadirla al barrido §1.2 o el guardián la rechaza.

---

## 2. Estado real de `salons` (tenant raíz) — consolidado

Base (migración 1) + `fiscal_base` (`20260713170000`):

```
public.salons
  id             uuid PK default gen_random_uuid()
  name           varchar(200) not null                 -- nombre comercial
  slug           varchar(100) not null unique  check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
  timezone       text not null default 'Europe/Madrid'
  phone          varchar(30)     email varchar(255)     address text
  tax_id         varchar(20)                            -- NIF/CIF        (fiscal_base)
  legal_name     varchar(200)                           -- razón social   (fiscal_base)
  fiscal_address text                                   -- domicilio fisc.(fiscal_base)
  settings       jsonb not null default '{}'::jsonb
  active         boolean not null default true          -- soft-delete
  created_at / updated_at  timestamptz not null default now()
```

- **NO tiene clave `(id, salon_id)`** (es la raíz); las demás tablas la referencian con
  FK **simple** `salon_id → salons(id) on delete cascade`.
- **RLS:** SELECT = miembro (`id in (select app.user_salon_ids())`); INSERT = cualquier
  autenticado (`with check true`) → trigger lo hace owner; UPDATE/DELETE = **owner**
  (`app.has_salon_role(id, array['owner'])`).
- **Dos triggers `AFTER INSERT`** independientes, mismo evento:
  `trg_salons_register_owner` (creador→owner) y
  `trg_salons_register_payment_methods` (3 métodos por defecto). Un trigger nuevo en
  `salons` debe convivir con ambos.
- **`settings jsonb`** = sede prevista por el roadmap para **planes/entitlements** y
  **white-label** (alternativa: tabla `salon_branding`). Hoy `{}`.
- **Borrado:** FKs `restrict` de `appointments`/`visits` + trigger de inmutabilidad de
  `pos_invoices` bloquean el hard-delete de un salón con actividad → **soft-delete**
  `update salons set active = false`.
- TS al día (`database.ts:74-124`, incl. fiscal + settings; `Relationships: []`).

---

## 3. Helpers `app.*` — catálogo consolidado (con foco en los NUEVOS)

> Los dos de tenant (`user_salon_ids`, `has_salon_role`) están detallados en
> `multitenant-loyalty-contract §1`. Tabla completa para no dispersar:

| Función | Lang | Seguridad | Vol. | `grant` | Rol / novedad |
|---|---|---|---|---|---|
| `app.user_salon_ids()` | sql | definer | stable | revoke anon/public · grant authenticated | ancla tenant/staff (ver base) |
| `app.has_salon_role(uuid, member_role[])` | sql | definer | stable | idem | ancla privilegio (ver base) |
| **`app.user_customer_ids() → setof uuid`** | sql | **definer** | stable | revoke anon/public · grant authenticated | **NUEVO (parte C).** ancla SELF: `select id from public.customers where user_id=(select auth.uid())`. Base de las políticas SELF de fidelización. |
| **`app.normalize_phone(text) → text`** | plpgsql | **invoker** | **immutable** | PUBLIC (texto puro) | **NUEVO (parte B).** teléfono→E.164 (país def. ES/+34). Apta para columna generada e índices. NULL si no hay número real (6–15 dígitos). **Espejo TS** en `src/lib/customers/normalize-phone.ts`. |
| **`app.enforce_customer_self_update_columns()`** | plpgsql | invoker | — | (trigger) | **NUEVO (parte C).** candado de columnas del autoservicio (§3.2). |
| `app.set_updated_at()` | plpgsql | invoker | — | (trigger) | `new.updated_at=now()`. |
| `app.register_salon_owner()` | plpgsql | definer | — | (trigger salons) | creador→owner. |
| `app.register_salon_payment_methods()` | plpgsql | definer | — | (trigger salons) | 3 métodos por defecto. |
| `app.bootstrap_customer_loyalty()` | plpgsql | definer | — | (trigger customers) | cuenta puntos + cupón (10 %/90 d), idempotente. |

**Patrón de helper de aislamiento nuevo (copiar exacto):** `app` · `security definer`
(evita recursión RLS) · `stable` · `set search_path=''` (refs internas `public.`) ·
`revoke execute … from anon, public` + `grant execute … to authenticated`. Usar
`(select auth.uid())` (subconsulta → initPlan).

### 3.1 `customers` en FASE 3 — nuevas columnas y por qué

| Columna | Migración | Notas |
|---|---|---|
| `user_id uuid` | A `…100000` | FK **simple** `auth.users(id) on delete set null`. **Nullable a propósito**. Único parcial `(salon_id, user_id)`. Índice de apoyo `idx_customers_user_id (user_id) where user_id is not null` para el camino SELF. |
| `phone_e164 text` | B `…110000` | **`generated always as (app.normalize_phone(phone)) stored`** — no escribible. Único parcial `(salon_id, phone_e164)`. **Clave de dedup** (no `phone` crudo). |

Los tres únicos de `customers` (`email`, `user_id`, `phone_e164`) son **por salón**
(`(salon_id, columna)`), nunca globales → misma persona = cliente de varios salones,
una ficha por salón. `salon_id` líder.

### 3.2 Candado de columnas del autoservicio (por qué trigger y no RLS)

RLS es a nivel de **fila**, no columna, y `with_check` no ve la fila OLD; los GRANT por
columna tampoco sirven (`authenticated` es rol compartido staff+cliente). Solución:
**`BEFORE UPDATE` trigger** que, SOLO en la ruta de cliente puro
(`auth.uid() = old.user_id` **y** el que actualiza NO es staff del salón), congela
`salon_id, qr_token, notes, user_id, id, created_at` y deja mutar solo `full_name,
email, phone, birth_date, marketing_consent`. No afecta a staff ni a service_role/
definer (uid null). Caso doble-rol (staff+cliente del mismo salón): el candado NO
aplica (staff ya puede editar cualquier ficha de su salón).

---

## 4. Contrato de las RPC (FASE 3B/3C — apps Vite → Supabase directo)

Ambas: `public.<fn>(...) returns jsonb`, `language plpgsql`, `security definer`,
`set search_path=''`, `revoke all … from public` + `grant execute … to authenticated`.
**No existen aún en `database.ts`** (§0.1).

### 4.1 `register_my_customer_account` — autoservicio del cliente

```
register_my_customer_account(p_salon_id uuid, p_phone text, p_full_name text,
                             p_email text default null) returns jsonb
```

- **Espejo SQL de** `linkOrCreateCustomerAccount` (`src/lib/customers/account.ts`).
- **Seguridad:** `auth.uid()` (JWT) es SIEMPRE el `user_id`, **nunca** un parámetro →
  solo enlazas/creas TU propia ficha. Acotado por `p_salon_id`. Bypasa RLS de forma
  controlada (la ficha nace con `user_id` null).
- **Gate OTP (propiedad del teléfono) — YA ENFORCED** (migración `20260719120000`, paso
  3.2): cuando el salón lo exige (válvula `require_phone_verification`, fail-closed), el
  `p_phone` debe coincidir con el teléfono **confirmado** de la cuenta
  (`auth.users.phone` + `phone_confirmed_at`), o → `PHONE_NOT_VERIFIED`. Cierra la ⚠️
  histórica "asume teléfono verificado aguas arriba". Detalle:
  [`verificacion-telefono-otp.md`](./verificacion-telefono-otp.md).
- **Return:** `{ customer_id, qr_token, outcome }`.
- **`outcome` ∈** `already_linked` | `linked` | `created` (== `LinkOrCreateOutcome`).
- **Errores (SQLSTATE):** `UNAUTHORIZED` `28000` · `INVALID_NAME` `22023` ·
  `INVALID_PHONE` `22023` · `SALON_NOT_FOUND` `P0002` · `FEATURE_NOT_ENABLED` `P0001`
  (add-ons `client_app`+`loyalty`) · `PHONE_NOT_VERIFIED` `P0001` (OTP) ·
  `PHONE_CONFLICT` `P0001`. Orden: `UNAUTHORIZED → INVALID_NAME → INVALID_PHONE →
  SALON_NOT_FOUND → FEATURE_NOT_ENABLED → PHONE_NOT_VERIFIED → (identidad)`.
- Inserta el **`phone` crudo** (la columna generada calcula `phone_e164`); `full_name`
  a 120; `email` → `lower(trim())` o null. Enlace condicional a `user_id is null`
  (guarda de carreras).

### 4.2 `staff_award_visit` — acreditación de visita (staff)

```
staff_award_visit(p_salon_id uuid, p_customer_id uuid default null,
  p_qr_token text default null, p_line_items jsonb default '[]'::jsonb,
  p_redeem_coupon boolean default false, p_ref_type text default null,
  p_ref_id text default null) returns jsonb
```

- **Espejo SQL de** `awardVisit` (`src/lib/loyalty/server.ts`), que ya anticipaba
  (líneas 25-26) moverlo a una RPC `SECURITY DEFINER` atómica.
- **Gate:** `auth.uid()` DEBE ser miembro de `p_salon_id` (`salon_members`), o
  `FORBIDDEN`. Cliente resuelto por `p_customer_id` **o** `p_qr_token`, SIEMPRE dentro
  del salón (evita la fuga cross-tenant del `qr_token` global — ver
  `multitenant-loyalty-contract §5.3`).
- **Puntos/línea** = `coalesce(points, ceil(price_cents / 200.0))` (1 pto ≈ 2 €).
- **Hitos** `visits_total` → recompensa `AVAILABLE` (`RW-<3>-<6>`, +90 d):
  `3→SCALP_DIAGNOSIS`, `5→EXPRESS_TREATMENT`, `8→RETAIL_VOUCHER`, `10→PACK_UPGRADE`.
- **Cupón** (`p_redeem_coupon`): `ACTIVE` no caducado más antiguo → `USED`; descuento
  `= least(round(total * percent_off/100), total)`.
- **Idempotencia** por `(ref_type, ref_id)`: EARN previo → no-op `already_awarded:true`.
- **Return:** `{ points_earned, points_balance, visits_total, redeemed_coupon,
  discount_cents, reward, already_awarded }` — **idéntico** al `AwardVisitResult` de
  `server.ts`.
- **Errores (SQLSTATE):** `UNAUTHORIZED` `28000` · `FORBIDDEN` `42501` ·
  `INVALID_REQUEST` `22023` · `CUSTOMER_NOT_FOUND` `P0002` · `NO_LINES` `22023` ·
  `INVALID_LINE` `22023`.

---

## 5. Checklist para la próxima migración/RPC de esta superficie

- [ ] ¿Tabla/política nueva? Debe citar un **ancla** (`user_salon_ids` /
      `has_salon_role` / `user_customer_ids` / `auth.uid`) en `qual` **y** `with_check`,
      o el guardián D aborta. Política de cliente → **prefijo `self`** + `auth.uid()`.
- [ ] ¿Helper de aislamiento nuevo/modificado? `app` · `security definer` · `stable` ·
      `search_path=''` · `revoke anon/public` + `grant authenticated`. Si cambia su
      firma, actualizar la lista de helpers del check (0) del guardián D (§1.1).
- [ ] ¿RPC nueva? `public` · `security definer` · `search_path=''` · gate por
      `auth.uid()`/pertenencia · acotada por `salon_id` · `revoke all from public` +
      `grant execute to authenticated` · errores con SQLSTATE. **Y** reflejarla en el
      bloque **`Functions`** de `database.ts` (hoy vacío) o documentar por qué no.
- [ ] ¿Dedup por teléfono? Usar **`phone_e164`** (columna generada), nunca `phone`.
      Mantener el espejo TS↔SQL de `normalize_phone`.
- [ ] ¿`points_movements`/append-only? Sin UPDATE, sin `updated_at`.
- [ ] Enums de fidelización en MAYÚSCULAS; preservar nombres de constraint al recrear.

---

*Auditoría de solo lectura. No se modificó ninguna migración ni código de la app.
Base de invariantes: `docs/multitenant-loyalty-contract.md` + `docs/schema-reference.md`.*
