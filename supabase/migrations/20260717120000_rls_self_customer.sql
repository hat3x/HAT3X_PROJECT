-- =============================================================================
-- salon-os — Migración: RLS SELF (autoservicio del cliente) — parte C
--
-- DEFENSA EN PROFUNDIDAD, PURAMENTE ADITIVA. Prepara FASE 3 del roadmap (la app
-- de cliente re-apuntada a la BD de Salón OS; ver docs/roadmap-productizacion.md y
-- las partes A/B: 20260717100000_customers_user_id.sql, 20260717110000_customers_
-- phone_e164.sql). Cuando una persona se registra en la app de cliente, su ficha
-- queda ENLAZADA a una cuenta de auth (customers.user_id = auth.users.id). Esta
-- migración le da a ESA cuenta, y solo a ella, acceso a SU propia información.
--
-- ── Principio rector: SOLO SE AÑADE, NADA SE TOCA NI SE DEBILITA ──
--   NO se altera ni se elimina ninguna política de MIEMBROS del staff (las de
--   20260711100100_rls_policies.sql y 20260716120000_loyalty_base.sql siguen
--   intactas). Se AÑADEN políticas nuevas `to authenticated`. RLS combina las
--   políticas permisivas con OR: una fila es visible/editable si la satisface la
--   política de staff O la nueva política SELF. El guardián del final verifica que
--   ese OR NO expone datos de otros clientes ni de otros salones.
--
-- ── Alcance concedido al cliente autenticado (su cuenta enlazada) ──
--   customers        : SELECT y UPDATE de SU PROPIA ficha (user_id = auth.uid()).
--                      UPDATE limitado a full_name, email, phone, birth_date,
--                      marketing_consent (ver candado de columnas más abajo).
--   loyalty_accounts : SELECT de las filas de SU customer.  (sin INSERT/UPDATE/DELETE)
--   points_movements : SELECT de las filas de SU customer.  (sin INSERT/UPDATE/DELETE)
--   welcome_coupons  : SELECT de las filas de SU customer.  (sin INSERT/UPDATE/DELETE)
--   rewards          : SELECT de las filas de SU customer.  (sin INSERT/UPDATE/DELETE)
--
--   El cliente NUNCA escribe puntos/cupones/recompensas: el saldo es "casi dinero"
--   y solo lo mueven el trigger de bootstrap y la RPC verify-visit (SECURITY
--   DEFINER / service_role). Esto es coherente con el endurecimiento de escritura
--   ya documentado en loyalty_base §4.
--
-- ── Por qué el candado de columnas del UPDATE va en un TRIGGER y no en la política ──
--   RLS es a nivel de FILA, no de COLUMNA: una política no puede decir "puedes
--   editar esta fila pero no cambiar salon_id". El WITH CHECK solo ve la fila NUEVA;
--   NO puede compararla con la ANTIGUA (no existe OLD en una política), así que no
--   puede exigir "salon_id no cambia". Los GRANT a nivel de columna tampoco sirven:
--   el rol `authenticated` es COMPARTIDO por staff y clientes, y restringir columnas
--   ahí recortaría también al staff (que sí edita notes) — eso sería "debilitar" lo
--   existente. La forma correcta y aditiva es un TRIGGER BEFORE UPDATE que, SOLO en
--   la ruta de autoservicio del cliente, congela las columnas prohibidas. No toca
--   ninguna política de miembros.
-- =============================================================================

begin;

-- ------------------------------------------------------------------------------
-- 0. Helper app.user_customer_ids() — fichas (customers.id) de la cuenta actual
--
-- Espejo EXACTO de app.user_salon_ids() (migración 2/3): SECURITY DEFINER + STABLE
-- + search_path='' y revocado a anon/public. Encapsula la consulta que pide el
-- contrato de la subtarea:  select id from public.customers where user_id = auth.uid().
--
-- Por qué un helper SECURITY DEFINER y no la subconsulta en línea:
--   • Aislamiento limpio: al bypasar RLS de customers, la política de las tablas de
--     fidelización NO depende de que exista la política SELF de customers (evita un
--     acoplamiento frágil entre políticas) y no puede recursar.
--   • Rendimiento: STABLE + `(select app.user_customer_ids())` ⇒ el planner lo
--     evalúa UNA vez por consulta (initPlan), como el resto del esquema.
--   • Multi-tenant seguro: customers.id es PK GLOBAL (único). Cada id pertenece a
--     UN solo salón (lo garantiza la FK compuesta (customer_id, salon_id) de las
--     tablas loyalty). Por tanto "customer_id in (mis ids)" jamás casa una fila de
--     otro cliente ni de otro salón: basta el customer_id, no hace falta salon_id.
--   • Multi-salón: una persona puede tener una ficha por salón (mismo user_id);
--     el helper devuelve TODAS sus fichas, y cada tabla loyalty solo expone las
--     filas cuyo customer_id es una de ellas. Correcto en los N salones.
-- ------------------------------------------------------------------------------
create or replace function app.user_customer_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id
  from public.customers
  where user_id = (select auth.uid());
$$;

comment on function app.user_customer_ids() is
  'Fichas de cliente (customers.id) enlazadas a la cuenta de auth actual (user_id = auth.uid()). SECURITY DEFINER + STABLE (bypasa RLS de customers, se evalúa una vez por consulta). Base de las políticas RLS SELF de las tablas de fidelización. Revocada a anon/public.';

-- Solo usuarios autenticados; nunca anon/public (mismo criterio que user_salon_ids()).
revoke execute on function app.user_customer_ids() from anon, public;
grant  execute on function app.user_customer_ids() to authenticated;

-- ------------------------------------------------------------------------------
-- 0b. Índice de apoyo del camino SELF: customers(user_id)
--
-- El helper y las políticas SELF filtran por `user_id = auth.uid()` en CADA
-- evaluación RLS de customers y de las 4 tablas de fidelización. El único índice
-- que hoy incluye user_id, idx_customers_salon_user (salon_id, user_id) WHERE
-- user_id is not null, tiene salon_id como columna LÍDER ⇒ NO sirve para un lookup
-- por user_id solo (no hay predicado sobre salon_id). Se añade un índice parcial
-- dedicado (misma condición parcial, coherente con el resto de índices de la tabla)
-- para que el filtro por cuenta sea un index scan y no un seq scan.
-- ------------------------------------------------------------------------------
create index idx_customers_user_id
  on public.customers (user_id)
  where user_id is not null;

comment on index public.idx_customers_user_id is
  'Apoya el camino SELF (app.user_customer_ids() y las políticas RLS acotadas por user_id = auth.uid()): lookup eficiente de la(s) ficha(s) de una cuenta. Parcial (user_id not null): no indexa las muchas fichas sin cuenta.';

-- ------------------------------------------------------------------------------
-- 1. customers — el cliente ve y edita SU PROPIA ficha (nunca otra)
--
-- Se AÑADEN dos políticas permisivas `to authenticated`, que conviven (OR) con las
-- de miembros del staff (members_select_customers / members_update_customers), sin
-- tocarlas. Para un cliente que NO es staff de ningún salón, la rama de staff es
-- falsa y solo aplica esta rama SELF ⇒ ve/edita exclusivamente su fila.
--
-- El WITH CHECK del UPDATE exige que la fila NUEVA siga siendo suya (user_id =
-- auth.uid()): impide reasignar la ficha a otra cuenta o dejar user_id en null
-- (null = uid ⇒ falso ⇒ bloqueado). El resto de columnas prohibidas las congela el
-- trigger del paso 2 (RLS no puede hacerlo a nivel de columna).
-- ------------------------------------------------------------------------------
create policy "self_select_own_customer"
  on public.customers for select to authenticated
  using (user_id = (select auth.uid()));

create policy "self_update_own_customer"
  on public.customers for update to authenticated
  using      (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ------------------------------------------------------------------------------
-- 2. Candado de columnas del autoservicio (BEFORE UPDATE en customers)
--
-- Congela las columnas NO permitidas SOLO en la ruta del cliente: el que actualiza
-- es la cuenta enlazada a la ficha (auth.uid() = old.user_id) y NO es personal del
-- salón (old.salon_id NO está entre sus salones). Con eso:
--   · Staff (miembro del salón)  → el candado NO se activa: sigue pudiendo editar
--     notes y cualquier columna como hasta ahora (nada se debilita).
--   · service_role / SECURITY DEFINER (bootstrap, verify-visit) → auth.uid() suele
--     ser null ⇒ el candado NO se activa: no interfiere con la operativa interna.
--   · Enlace inicial de la cuenta (user_id: null → uid), típico de FASE 3 → como
--     old.user_id es null, `old.user_id = auth.uid()` es null (no-true) ⇒ el candado
--     NO se activa: el vínculo se puede crear. Una vez enlazada, el cliente ya no
--     puede cambiar user_id (queda congelado por el propio candado).
--   · Cliente en autoservicio → candado ACTIVO: solo puede cambiar full_name,
--     email, phone, birth_date y marketing_consent. Tocar salon_id, qr_token,
--     notes, user_id, id o created_at aborta la operación.
--
-- SECURITY INVOKER + search_path='' (todo cualificado). Llama a app.user_salon_ids()
-- (SECURITY DEFINER, ya concedida a authenticated). El orden de condiciones pone lo
-- barato primero: para el 99 % de UPDATEs (staff sobre fichas con user_id null o
-- ajeno) corta en `old.user_id = auth.uid()` sin llegar a user_salon_ids().
-- ------------------------------------------------------------------------------
create or replace function app.enforce_customer_self_update_columns()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null
     and old.user_id is not null
     and old.user_id = (select auth.uid())
     and not (old.salon_id in (select app.user_salon_ids()))
  then
    if     new.salon_id   is distinct from old.salon_id
        or new.qr_token   is distinct from old.qr_token
        or new.notes      is distinct from old.notes
        or new.user_id    is distinct from old.user_id
        or new.id         is distinct from old.id
        or new.created_at is distinct from old.created_at
    then
      raise exception
        'RLS SELF: un cliente solo puede modificar full_name, email, phone, birth_date y marketing_consent de su propia ficha (no salon_id, qr_token, notes, user_id, id ni created_at)'
        using errcode = 'insufficient_privilege';
    end if;
  end if;
  return new;
end;
$$;

comment on function app.enforce_customer_self_update_columns() is
  'Candado de columnas del autoservicio del cliente: en la ruta SELF (auth.uid() = old.user_id y el que actualiza NO es staff del salón) congela salon_id, qr_token, notes, user_id, id y created_at; solo deja cambiar full_name, email, phone, birth_date y marketing_consent. No afecta a staff ni a service_role/definer. Complementa (no sustituye) a la política self_update_own_customer, porque RLS no restringe columnas.';

-- Se dispara antes que trg_customers_updated_at ('e' < 'u') y antes del WITH CHECK
-- de la política; ambos irrelevantes porque, si hay cambio prohibido, se aborta.
create trigger trg_customers_enforce_self_update_columns
  before update on public.customers
  for each row execute function app.enforce_customer_self_update_columns();

-- ------------------------------------------------------------------------------
-- 3. Fidelización — el cliente SOLO LEE (SELECT) las filas de su propio customer
--
-- Una política SELF de SELECT por tabla, `to authenticated`, acotada por
-- app.user_customer_ids(). NO se crea ninguna política SELF de INSERT/UPDATE/DELETE:
-- por deny-by-default, el cliente no puede escribir estas tablas (el saldo no se
-- fabrica desde el navegador). Conviven (OR) con las políticas de staff sin tocarlas.
-- ------------------------------------------------------------------------------
create policy "self_select_own_loyalty_account"
  on public.loyalty_accounts for select to authenticated
  using (customer_id in (select app.user_customer_ids()));

create policy "self_select_own_points_movements"
  on public.points_movements for select to authenticated
  using (customer_id in (select app.user_customer_ids()));

create policy "self_select_own_welcome_coupons"
  on public.welcome_coupons for select to authenticated
  using (customer_id in (select app.user_customer_ids()));

create policy "self_select_own_rewards"
  on public.rewards for select to authenticated
  using (customer_id in (select app.user_customer_ids()));

-- ------------------------------------------------------------------------------
-- 4. Guardián de aserción — el OR de políticas NO filtra a otros clientes/salones
--
-- Mismo espíritu que los guardianes de loyalty_base y rls_multitenant_guard: si una
-- migración futura (o esta misma) rompiera el aislamiento, esta comprobación de
-- catálogo ABORTA de forma ruidosa. Verifica, sobre las políticas ACUMULADAS:
--   customers:
--     (a) RLS habilitada.
--     (b) barrera de STAFF intacta: SELECT acotada por app.user_salon_ids().
--     (c) política SELF de SELECT acotada por auth.uid().
--     (d) política SELF de UPDATE acotada por auth.uid() en USING y WITH CHECK.
--     (e) candado de columnas del autoservicio presente (trigger).
--     (f) ninguna política abierta a anon/public.
--   loyalty_accounts / points_movements / welcome_coupons / rewards:
--     (a) RLS habilitada.
--     (b) barrera de STAFF intacta: SELECT acotada por app.user_salon_ids().
--     (c) política SELF de SELECT acotada por app.user_customer_ids().
--     (d) SIN escritura SELF: 0 políticas que referencien user_customer_ids con
--         cmd distinto de SELECT (el cliente jamás escribe puntos).
--     (e) ninguna política abierta a anon/public.
-- ------------------------------------------------------------------------------
do $guard$
declare
  _loyalty_tables constant text[] := array[
    'loyalty_accounts',
    'points_movements',
    'welcome_coupons',
    'rewards'
  ];
  _t   text;
  _cnt integer;
begin
  -- ===================== customers =====================

  -- (a) RLS habilitada.
  select count(*) into _cnt
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'customers' and c.relrowsecurity;
  if _cnt = 0 then
    raise exception 'GUARDIÁN RLS SELF: public.customers no tiene RLS habilitada'
      using errcode = 'raise_exception';
  end if;

  -- (b) Barrera de staff intacta: SELECT acotada por app.user_salon_ids().
  select count(*) into _cnt
  from pg_policies
  where schemaname = 'public' and tablename = 'customers'
    and cmd in ('SELECT', 'ALL') and qual like '%user_salon_ids%';
  if _cnt = 0 then
    raise exception 'GUARDIÁN RLS SELF: customers perdió la política SELECT de staff (user_salon_ids) — barrera multi-tenant rota'
      using errcode = 'raise_exception';
  end if;

  -- (c) SELF SELECT acotada por auth.uid().
  select count(*) into _cnt
  from pg_policies
  where schemaname = 'public' and tablename = 'customers'
    and cmd in ('SELECT', 'ALL') and qual like '%auth.uid%';
  if _cnt = 0 then
    raise exception 'GUARDIÁN RLS SELF: customers no tiene política SELF de SELECT acotada por auth.uid()'
      using errcode = 'raise_exception';
  end if;

  -- (d) SELF UPDATE acotada por auth.uid() en USING y WITH CHECK.
  select count(*) into _cnt
  from pg_policies
  where schemaname = 'public' and tablename = 'customers'
    and cmd = 'UPDATE'
    and qual       like '%auth.uid%'
    and with_check like '%auth.uid%';
  if _cnt = 0 then
    raise exception 'GUARDIÁN RLS SELF: customers no tiene política SELF de UPDATE acotada por auth.uid() (USING + WITH CHECK)'
      using errcode = 'raise_exception';
  end if;

  -- (e) Candado de columnas del autoservicio presente.
  select count(*) into _cnt
  from pg_trigger
  where tgrelid = 'public.customers'::regclass
    and tgname  = 'trg_customers_enforce_self_update_columns'
    and not tgisinternal;
  if _cnt = 0 then
    raise exception 'GUARDIÁN RLS SELF: falta el trigger que congela columnas en el autoservicio del cliente (salon_id/qr_token/notes modificables)'
      using errcode = 'raise_exception';
  end if;

  -- (f) Ninguna política de customers abierta a anon/public.
  select count(*) into _cnt
  from pg_policies
  where schemaname = 'public' and tablename = 'customers'
    and (roles && array['anon', 'public']::name[]);
  if _cnt > 0 then
    raise exception 'GUARDIÁN RLS SELF: customers tiene % política(s) expuesta(s) a anon/public', _cnt
      using errcode = 'raise_exception';
  end if;

  -- ===================== tablas de fidelización =====================
  foreach _t in array _loyalty_tables loop

    -- (a) RLS habilitada.
    select count(*) into _cnt
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = _t and c.relrowsecurity;
    if _cnt = 0 then
      raise exception 'GUARDIÁN RLS SELF: public.% no tiene RLS habilitada', _t
        using errcode = 'raise_exception';
    end if;

    -- (b) Barrera de staff intacta: SELECT acotada por app.user_salon_ids().
    select count(*) into _cnt
    from pg_policies
    where schemaname = 'public' and tablename = _t
      and cmd in ('SELECT', 'ALL') and qual like '%user_salon_ids%';
    if _cnt = 0 then
      raise exception 'GUARDIÁN RLS SELF: public.% perdió la política SELECT de staff (user_salon_ids)', _t
        using errcode = 'raise_exception';
    end if;

    -- (c) SELF SELECT acotada por app.user_customer_ids().
    select count(*) into _cnt
    from pg_policies
    where schemaname = 'public' and tablename = _t
      and cmd in ('SELECT', 'ALL') and qual like '%user_customer_ids%';
    if _cnt = 0 then
      raise exception 'GUARDIÁN RLS SELF: public.% no tiene política SELF de SELECT acotada por app.user_customer_ids()', _t
        using errcode = 'raise_exception';
    end if;

    -- (d) SIN escritura SELF: nada que referencie user_customer_ids fuera de SELECT.
    select count(*) into _cnt
    from pg_policies
    where schemaname = 'public' and tablename = _t
      and cmd <> 'SELECT'
      and (coalesce(qual, '') || coalesce(with_check, '')) like '%user_customer_ids%';
    if _cnt > 0 then
      raise exception 'GUARDIÁN RLS SELF: public.% tiene % política(s) de escritura SELF (el cliente no debe escribir fidelización)', _t, _cnt
        using errcode = 'raise_exception';
    end if;

    -- (e) Ninguna política abierta a anon/public.
    select count(*) into _cnt
    from pg_policies
    where schemaname = 'public' and tablename = _t
      and (roles && array['anon', 'public']::name[]);
    if _cnt > 0 then
      raise exception 'GUARDIÁN RLS SELF: public.% tiene % política(s) expuesta(s) a anon/public', _t, _cnt
        using errcode = 'raise_exception';
    end if;

  end loop;

  raise notice 'GUARDIÁN RLS SELF: autoservicio del cliente verificado (customers + 4 tablas de fidelización); el OR de políticas no expone otros clientes ni otros salones.';
end;
$guard$;

commit;

-- =============================================================================
-- NOTAS DE SEGURIDAD Y ALCANCE (para futuros mantenedores)
--
-- • SELECT de la ficha propia expone TODA la fila del cliente, incluidas notes y
--   qr_token. No es una fuga cross-tenant (es SU propia fila), pero notes puede
--   contener observaciones internas del staff. Si se quisiera OCULTAR columnas al
--   cliente en la LECTURA (RLS no filtra columnas), hágase en la capa de app
--   (PostgREST: seleccionar solo las columnas necesarias) o con una vista/RPC
--   dedicada. Fuera del alcance de esta subtarea (que se centra en el UPDATE).
--
-- • El rol `authenticated` es COMPARTIDO por staff y clientes; el "quién es quién"
--   lo resuelve el contenido de las políticas (salon_members para staff vs
--   user_id = auth.uid() para el cliente), no el rol. Por eso el candado de
--   columnas vive en el trigger y no en GRANT de columnas.
--
-- • Caso de doble rol (INTENCIONADO): si una persona es a la vez STAFF y CLIENTE
--   del MISMO salón, el candado de columnas NO se le aplica sobre su propia ficha
--   (old.salon_id ∈ sus salones ⇒ la guarda del trigger no entra). Es coherente
--   con "staff > cliente": como miembro ya puede editar cualquier ficha de su
--   salón (members_update_customers), incluida la suya. No es una fuga (sigue
--   acotado a SU salón por el WITH CHECK de la política de staff). El candado solo
--   protege la ruta de autoservicio PURO (cliente que no es staff de ese salón).
--
-- • Rollback manual (forward-only; por si hubiera que revertir):
--     drop trigger if exists trg_customers_enforce_self_update_columns on public.customers;
--     drop function if exists app.enforce_customer_self_update_columns();
--     drop policy if exists "self_select_own_customer"         on public.customers;
--     drop policy if exists "self_update_own_customer"         on public.customers;
--     drop policy if exists "self_select_own_loyalty_account"  on public.loyalty_accounts;
--     drop policy if exists "self_select_own_points_movements" on public.points_movements;
--     drop policy if exists "self_select_own_welcome_coupons"  on public.welcome_coupons;
--     drop policy if exists "self_select_own_rewards"          on public.rewards;
--     drop function if exists app.user_customer_ids();
-- =============================================================================
