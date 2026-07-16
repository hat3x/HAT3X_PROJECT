-- =============================================================================
-- salon-os — Migración: núcleo de fidelización (add-on premium)
--
-- Réplica NATIVA del sistema probado en denueveanueve (ver
-- docs/loyalty-rules-reference.md, sub-1) sobre el esquema real —en inglés— de
-- Salón OS. Aísla por tenant (salon_id) reutilizando el patrón existente:
--   · helpers app.user_salon_ids() / app.has_salon_role() (migración 2/3),
--   · FKs COMPUESTAS (fk_id, salon_id) → tabla(id, salon_id) (migración 4/4),
--   · updated_at automático vía app.set_updated_at().
--
-- Contenido:
--   1. Enums públicos: points_movement_type, coupon_status, reward_status.
--   2. customers += qr_token (identidad de fidelización, único global).
--   3. Tablas: loyalty_accounts, points_movements, welcome_coupons, rewards.
--   4. RLS multi-tenant (deny-by-default) en las 4 tablas nuevas.
--   5. Trigger AFTER INSERT en customers: crea la cuenta + el cupón de bienvenida
--      (funciona tanto si el alta la hace el salón como la app de cliente).
--   6. Guardián de aserción del aislamiento multi-tenant (aborta ante regresión).
--
-- Aditiva y sin backfill de negocio: el proyecto aún no tiene datos reales de
-- fidelización (los de denueveanueve eran de test). qr_token sí se rellena en
-- las filas existentes vía su DEFAULT (un token distinto por cliente).
--
-- Nota de estilo: los valores de enum van en MAYÚSCULAS (EARN, ACTIVE, …) para
-- conservar EXACTAMENTE el contrato de denueveanueve que consumen el lookup, el
-- verify-visit y el TPV. Es una desviación deliberada de los enums en minúscula
-- del resto del esquema, documentada aquí para futuros mantenedores.
-- =============================================================================

-- ------------------------------------------------------------------------------
-- 1. Enums
-- ------------------------------------------------------------------------------

-- Movimiento del libro mayor de puntos (append-only).
create type public.points_movement_type as enum (
  'EARN',    -- acreditación por visita/venta verificada (puntos > 0)
  'REDEEM',  -- canje de puntos por el cliente (puntos < 0)
  'ADJUST',  -- ajuste manual del staff (± puntos)
  'EXPIRE'   -- caducidad de puntos (puntos < 0)
);

-- Estado del cupón de bienvenida.
create type public.coupon_status as enum (
  'ACTIVE',   -- vigente y sin usar
  'USED',     -- canjeado en una visita/venta
  'EXPIRED'   -- caducado sin usar
);

-- Estado de una recompensa de hito.
create type public.reward_status as enum (
  'AVAILABLE', -- disponible para canjear
  'REDEEMED',  -- ya canjeada
  'EXPIRED'    -- caducada sin canjear
);

-- ------------------------------------------------------------------------------
-- 2. customers += qr_token — identidad del cliente en fidelización
--
-- Único GLOBAL (no por salón): el lookup identifica al cliente SOLO por el token
-- (sin conocer el salón), igual que loyalty-lookup en denueveanueve. Un UUID como
-- texto es criptográficamente aleatorio, así que la colisión entre salones es
-- inviable. El DEFAULT rellena también las filas existentes al añadir la columna.
-- ------------------------------------------------------------------------------
alter table public.customers
  add column qr_token text not null unique default gen_random_uuid()::text;

comment on column public.customers.qr_token is
  'Token de fidelización del cliente (QR). Único global; base del lookup por token.';

-- ------------------------------------------------------------------------------
-- 3. Tablas de fidelización
-- ------------------------------------------------------------------------------

-- loyalty_accounts — cuenta de puntos, 1:1 con el cliente por salón ------------
create table public.loyalty_accounts (
  id                uuid primary key default gen_random_uuid(),
  salon_id          uuid not null references public.salons (id) on delete cascade,
  customer_id       uuid not null,
  points_balance    integer not null default 0 check (points_balance >= 0),
  visits_total      integer not null default 0 check (visits_total >= 0),
  last_visit_at     timestamptz,
  last_activity_at  timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  -- Una única cuenta por cliente y salón (ancla de idempotencia del bootstrap).
  constraint loyalty_accounts_customer_key unique (salon_id, customer_id),
  -- FK compuesta: el cliente debe pertenecer al mismo salón.
  constraint loyalty_accounts_customer_id_fkey
    foreign key (customer_id, salon_id)
    references public.customers (id, salon_id) on delete cascade
);

comment on table public.loyalty_accounts is
  'Cuenta de fidelización (saldo de puntos y nº de visitas). 1:1 con customer por salón.';

-- points_movements — libro mayor inmutable (append-only, como visits) ----------
create table public.points_movements (
  id           uuid primary key default gen_random_uuid(),
  salon_id     uuid not null references public.salons (id) on delete cascade,
  customer_id  uuid not null,
  type         public.points_movement_type not null,
  -- Con signo: EARN suma (+), REDEEM/EXPIRE restan (−), ADJUST cualquiera.
  points       integer not null,
  reason       text,
  ref_type     text,   -- 'appointment' | 'walk_in' | 'pos_sale' | 'reward' | 'coupon' …
  ref_id       uuid,
  created_at   timestamptz not null default now(),
  constraint points_movements_customer_id_fkey
    foreign key (customer_id, salon_id)
    references public.customers (id, salon_id) on delete cascade
);

-- Listado del historial de un cliente (más reciente primero). El prefijo
-- (salon_id, customer_id) sirve también al ON DELETE CASCADE de customers.
create index idx_points_movements_ledger
  on public.points_movements (salon_id, customer_id, created_at desc);

comment on table public.points_movements is
  'Libro mayor de puntos (inmutable). Alta vía verify-visit/RPC; sin UPDATE.';

-- welcome_coupons — cupón de bienvenida (uno por cliente) ----------------------
create table public.welcome_coupons (
  id           uuid primary key default gen_random_uuid(),
  salon_id     uuid not null references public.salons (id) on delete cascade,
  customer_id  uuid not null,
  -- Porcentaje de descuento (p. ej. 10.00 = 10 %).
  percent_off  numeric(5,2) not null check (percent_off > 0 and percent_off <= 100),
  status       public.coupon_status not null default 'ACTIVE',
  expires_at   timestamptz not null,
  used_at      timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  -- Un único cupón de bienvenida por cliente (ancla de idempotencia del bootstrap).
  constraint welcome_coupons_customer_key unique (salon_id, customer_id),
  constraint welcome_coupons_customer_id_fkey
    foreign key (customer_id, salon_id)
    references public.customers (id, salon_id) on delete cascade
);

comment on table public.welcome_coupons is
  'Cupón de bienvenida (% de descuento). Uno por cliente; se emite al alta vía trigger.';

-- rewards — recompensas de hito (3/5/8/10 visitas) -----------------------------
create table public.rewards (
  id           uuid primary key default gen_random_uuid(),
  salon_id     uuid not null references public.salons (id) on delete cascade,
  customer_id  uuid not null,
  -- Tipo de recompensa (catálogo libre; en denueveanueve: SCALP_DIAGNOSIS,
  -- EXPRESS_TREATMENT, RETAIL_VOUCHER, PACK_UPGRADE). Configurable por salón (fase 2).
  type         text not null,
  code         text not null,   -- 'RW-XXX-YYYYYY'
  status       public.reward_status not null default 'AVAILABLE',
  expires_at   timestamptz not null,
  redeemed_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  -- El código no colisiona dentro del salón.
  constraint rewards_code_key unique (salon_id, code),
  constraint rewards_customer_id_fkey
    foreign key (customer_id, salon_id)
    references public.customers (id, salon_id) on delete cascade
);

-- Recompensas de un cliente por estado (p. ej. las AVAILABLE del lookup).
create index idx_rewards_customer_status
  on public.rewards (salon_id, customer_id, status);

comment on table public.rewards is
  'Recompensas de hito por visitas. Alta vía verify-visit/RPC; el staff marca REDEEMED.';

-- ------------------------------------------------------------------------------
-- updated_at automático en las tablas mutables (points_movements es inmutable)
-- ------------------------------------------------------------------------------
create trigger trg_loyalty_accounts_updated_at
  before update on public.loyalty_accounts
  for each row execute function app.set_updated_at();

create trigger trg_welcome_coupons_updated_at
  before update on public.welcome_coupons
  for each row execute function app.set_updated_at();

create trigger trg_rewards_updated_at
  before update on public.rewards
  for each row execute function app.set_updated_at();

-- ------------------------------------------------------------------------------
-- 4. RLS multi-tenant (deny-by-default) — patrón de la migración 2/3
--
-- Mismo mecanismo de aislamiento que el resto del esquema (helpers
-- app.user_salon_ids() / app.has_salon_role(), acotado por salon_id, `to
-- authenticated`), pero con el alcance de ESCRITURA endurecido porque los puntos
-- son "casi dinero": el saldo NO debe poder fabricarse desde el navegador
-- (ver docs/loyalty-rules-reference §4.1). La acreditación y la generación de
-- recompensas las hacen el trigger de bootstrap (SECURITY DEFINER) y la futura
-- RPC verify-visit (service_role/definer), que bypasan RLS de forma controlada.
--
-- Matriz:
--   loyalty_accounts : SELECT miembro ·                         DELETE owner
--                      (INSERT/UPDATE solo definer/service_role — no manipulable)
--   points_movements : SELECT miembro ·                         DELETE owner
--                      (INSERT solo definer/service_role; sin UPDATE — inmutable)
--   rewards          : SELECT miembro · UPDATE miembro (→REDEEMED) · DELETE owner
--                      (INSERT solo definer/service_role — se generan en verify-visit)
--   welcome_coupons  : SELECT miembro · INSERT owner/manager (alta manual) ·
--                      UPDATE miembro (→USED) · DELETE owner/manager
--                      (el cupón automático lo crea el trigger de bootstrap)
--
-- El guardián del final verifica que el aislamiento (SELECT acotado, nada a
-- anon/public) sigue intacto ante regresiones futuras.
-- ------------------------------------------------------------------------------
alter table public.loyalty_accounts enable row level security;
alter table public.points_movements enable row level security;
alter table public.welcome_coupons  enable row level security;
alter table public.rewards          enable row level security;

-- loyalty_accounts — saldo de solo lectura para el staff; se escribe vía definer/RPC
create policy "members_select_loyalty_accounts"
  on public.loyalty_accounts for select to authenticated
  using (salon_id in (select app.user_salon_ids()));

create policy "owners_delete_loyalty_accounts"
  on public.loyalty_accounts for delete to authenticated
  using (app.has_salon_role(salon_id, array['owner']::public.member_role[]));

-- points_movements — libro mayor: lectura para el staff; alta vía definer/RPC;
-- sin UPDATE (inmutable); borrado solo owner (correcciones excepcionales)
create policy "members_select_points_movements"
  on public.points_movements for select to authenticated
  using (salon_id in (select app.user_salon_ids()));

create policy "owners_delete_points_movements"
  on public.points_movements for delete to authenticated
  using (app.has_salon_role(salon_id, array['owner']::public.member_role[]));

-- welcome_coupons — alta manual owner/manager; el staff puede marcarlo USED
create policy "members_select_welcome_coupons"
  on public.welcome_coupons for select to authenticated
  using (salon_id in (select app.user_salon_ids()));

create policy "managers_insert_welcome_coupons"
  on public.welcome_coupons for insert to authenticated
  with check (app.has_salon_role(salon_id, array['owner','manager']::public.member_role[]));

create policy "members_update_welcome_coupons"
  on public.welcome_coupons for update to authenticated
  using (salon_id in (select app.user_salon_ids()))
  with check (salon_id in (select app.user_salon_ids()));

create policy "managers_delete_welcome_coupons"
  on public.welcome_coupons for delete to authenticated
  using (app.has_salon_role(salon_id, array['owner','manager']::public.member_role[]));

-- rewards — generadas por verify-visit (definer/RPC); el staff las marca REDEEMED
create policy "members_select_rewards"
  on public.rewards for select to authenticated
  using (salon_id in (select app.user_salon_ids()));

create policy "members_update_rewards"
  on public.rewards for update to authenticated
  using (salon_id in (select app.user_salon_ids()))
  with check (salon_id in (select app.user_salon_ids()));

create policy "owners_delete_rewards"
  on public.rewards for delete to authenticated
  using (app.has_salon_role(salon_id, array['owner']::public.member_role[]));

-- ------------------------------------------------------------------------------
-- 5. Bootstrap de fidelización al crear un cliente
--
-- AFTER INSERT en customers: crea la cuenta de puntos y el cupón de bienvenida.
-- SECURITY DEFINER + search_path='' → bypasa RLS de forma controlada, así funciona
-- SIN importar quién dé de alta al cliente (staff autenticado con rol en el salón,
-- o la app de cliente vía service_role/RPC). qr_token NO lo pone el trigger: lo
-- rellena el DEFAULT de la columna en el propio INSERT.
--
-- Idempotente ante reintentos gracias a los UNIQUE (salon_id, customer_id):
-- ON CONFLICT DO NOTHING evita duplicar cuenta o cupón.
--
-- Parámetros del cupón (10 % / 90 días) por defecto v1 (réplica denueveanueve).
-- Externalizables a salons.settings en fase 2 (ver docs/loyalty-rules-reference §6).
-- ------------------------------------------------------------------------------
create or replace function app.bootstrap_customer_loyalty()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Cuenta de puntos (saldo 0, sin visitas).
  insert into public.loyalty_accounts (salon_id, customer_id)
  values (new.salon_id, new.id)
  on conflict (salon_id, customer_id) do nothing;

  -- Cupón de bienvenida ACTIVE (10 % de descuento, 90 días de validez).
  insert into public.welcome_coupons (salon_id, customer_id, percent_off, status, expires_at)
  values (new.salon_id, new.id, 10, 'ACTIVE', now() + interval '90 days')
  on conflict (salon_id, customer_id) do nothing;

  return new;
end;
$$;

create trigger trg_customers_bootstrap_loyalty
  after insert on public.customers
  for each row execute function app.bootstrap_customer_loyalty();

-- ------------------------------------------------------------------------------
-- 6. Guardián de aserción del aislamiento multi-tenant (defensa en profundidad)
--
-- Mismo espíritu que 20260714110000_rls_multitenant_guard: si una migración
-- futura deshabilitara RLS, borrara la política de SELECT acotada o expusiera
-- estas tablas a anon/public, esta comprobación (re-ejecutada en CI/entorno
-- limpio) ABORTA de forma ruidosa en lugar de degradar el aislamiento en silencio.
-- ------------------------------------------------------------------------------
do $guard$
declare
  _tenant_tables constant text[] := array[
    'loyalty_accounts',
    'points_movements',
    'welcome_coupons',
    'rewards'
  ];
  _t   text;
  _cnt integer;
begin
  foreach _t in array _tenant_tables loop

    -- (a) RLS habilitada.
    select count(*) into _cnt
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = _t
      and c.relrowsecurity;
    if _cnt = 0 then
      raise exception
        'GUARDIÁN RLS: la tabla public.% no tiene RLS habilitada (aislamiento multi-tenant roto)', _t
        using errcode = 'raise_exception';
    end if;

    -- (b) Política de SELECT acotada por app.user_salon_ids().
    select count(*) into _cnt
    from pg_policies
    where schemaname = 'public'
      and tablename  = _t
      and cmd        in ('SELECT', 'ALL')
      and qual is not null
      and qual like '%user_salon_ids%';
    if _cnt = 0 then
      raise exception
        'GUARDIÁN RLS: public.% no tiene política SELECT acotada por app.user_salon_ids() (posible fuga cross-tenant)', _t
        using errcode = 'raise_exception';
    end if;

    -- (c) Ninguna política abierta a anon / public.
    select count(*) into _cnt
    from pg_policies
    where schemaname = 'public'
      and tablename  = _t
      and (roles && array['anon', 'public']::name[]);
    if _cnt > 0 then
      raise exception
        'GUARDIÁN RLS: public.% tiene % política(s) expuesta(s) a anon/public (acceso sin autenticar)', _t, _cnt
        using errcode = 'raise_exception';
    end if;

  end loop;

  raise notice 'GUARDIÁN RLS: aislamiento multi-tenant verificado en % tablas de fidelización.',
    array_length(_tenant_tables, 1);
end;
$guard$;
