-- =============================================================================
-- salon-os — Migración: guardián RLS del autoservicio del cliente — parte D
--
-- Cierre defensivo de las partes A/B/C de FASE 3 (la app de cliente re-apuntada a
-- la BD de Salón OS; ver docs/roadmap-productizacion.md):
--   · A — 20260717100000_customers_user_id.sql      (enlace ficha↔cuenta auth)
--   · B — 20260717110000_customers_phone_e164.sql   (identidad por teléfono)
--   · C — 20260717120000_rls_self_customer.sql       (políticas RLS SELF + trigger)
--
-- Esta migración (parte D) es un GUARDIÁN DE ASERCIÓN PURO, hermano de
-- 20260714110000_rls_multitenant_guard (que cubre el lado TPV/facturación) y del
-- guardián en línea de 20260716120000_loyalty_base. Aquí consolida, en un ÚNICO
-- punto y como "última palabra", el contrato de aislamiento de TODA la superficie
-- de cara al cliente: customers + las 4 tablas de fidelización.
--
-- NO crea ni redefine políticas, funciones ni triggers (sería "already exists" y
-- duplicaría lógica). Solo:
--   1. Reafirma RLS habilitada en las 5 tablas (idempotente: no-op si ya lo está).
--   2. Un bloque DO que verifica, a nivel de CATÁLOGO (pg_class / pg_policies /
--      pg_proc / pg_trigger), que la garantía multi-tenant + SELF sigue intacta y
--      ABORTA la migración si detecta CUALQUIER debilitamiento del aislamiento:
--        · RLS deshabilitada en customers o en cualquier tabla de fidelización.
--        · Los HELPERS del aislamiento (app.user_salon_ids / app.user_customer_ids)
--          dejan de ser SECURITY DEFINER o quedan ejecutables por anon/public.
--        · Se pierde la barrera de STAFF (SELECT acotado por app.user_salon_ids()).
--        · Se pierde la barrera SELF (SELECT/UPDATE acotado por auth.uid() /
--          app.user_customer_ids()) o el candado de columnas del autoservicio.
--        · Una política SELF queda SIN el filtro user_id = auth.uid() (p. ej. un
--          `using (true)` que expondría un cliente a otro).
--        · CUALQUIER política (staff o self) pierde su anclaje de aislamiento —
--          p. ej. un `using (true)` sobre un UPDATE de staff dejaría la tabla
--          abierta a cualquier autenticado, saltándose el aislamiento por salón.
--        · El cliente gana escritura sobre fidelización (SELF write): el saldo es
--          "casi dinero" y no se fabrica desde el navegador.
--        · Cualquier política abierta a anon / public (fuga sin autenticar).
--        · points_movements gana una política de UPDATE (rompe el libro mayor
--          append-only, análogo a la inmutabilidad fiscal de pos_invoices).
--
-- ¿Por qué duplica parcialmente el guardián en línea de la parte C? A propósito:
-- defensa en profundidad (belt & suspenders). Un guardián standalone es más
-- descubrible, cubre además la INTEGRIDAD DE LOS HELPERS (que la parte C no
-- comprueba) y sirve de gate único re-ejecutable en CI. Si una migración futura
-- (o una edición de A/B/C en un rebuild limpio) degradara el aislamiento, este
-- bloque falla de forma RUIDOSA en lugar de filtrar datos en silencio.
--
-- Sin efectos sobre datos ni sobre otras tablas: solo re-afirma RLS y lee catálogo.
-- =============================================================================

begin;

-- ------------------------------------------------------------------------------
-- 1. Reafirmar RLS (deny-by-default). Idempotente: si ya está activa, no-op.
-- ------------------------------------------------------------------------------
alter table public.customers         enable row level security;
alter table public.loyalty_accounts  enable row level security;
alter table public.points_movements  enable row level security;
alter table public.welcome_coupons   enable row level security;
alter table public.rewards           enable row level security;

-- ------------------------------------------------------------------------------
-- 2. Guardián de aserción del aislamiento (multi-tenant + autoservicio SELF).
-- ------------------------------------------------------------------------------
do $guard$
declare
  -- Los dos helpers SECURITY DEFINER sobre los que se apoya TODO el aislamiento:
  -- user_salon_ids() (barrera de tenant/staff) y user_customer_ids() (barrera SELF
  -- de fidelización). Si dejan de ser DEFINER o se exponen a anon, el resto de
  -- comprobaciones sobre políticas serían papel mojado.
  _helpers constant text[] := array[
    'app.user_salon_ids()',
    'app.user_customer_ids()'
  ];
  -- Tablas de fidelización (mismo patrón que loyalty_base y la parte C).
  _loyalty_tables constant text[] := array[
    'loyalty_accounts',
    'points_movements',
    'welcome_coupons',
    'rewards'
  ];
  -- Superficie completa de cara al cliente (customers + fidelización). Se usa para
  -- el barrido genérico de políticas SELF y no aparece expuesta a anon/public.
  _all_tables constant text[] := array[
    'customers',
    'loyalty_accounts',
    'points_movements',
    'welcome_coupons',
    'rewards'
  ];
  _h    text;
  _t    text;
  _sd   boolean;
  _cnt  integer;
  _pol  record;
begin

  -- =========================================================================
  -- (0) Integridad de los HELPERS de aislamiento — la base de todo lo demás.
  -- =========================================================================
  foreach _h in array _helpers loop

    -- Debe existir y seguir siendo SECURITY DEFINER. Si un `create or replace`
    -- futuro lo pasara a SECURITY INVOKER, correría con los privilegios/RLS del
    -- llamante y la garantía de "una sola evaluación, sin recursión" se rompería.
    select p.prosecdef into _sd
    from pg_proc p
    where p.oid = to_regprocedure(_h);

    if _sd is null then
      raise exception
        'GUARDIÁN RLS SELF: falta la función helper de aislamiento % (base de todas las políticas)', _h
        using errcode = 'raise_exception';
    elsif not _sd then
      raise exception
        'GUARDIÁN RLS SELF: la función helper % ya no es SECURITY DEFINER (aislamiento degradado)', _h
        using errcode = 'raise_exception';
    end if;

    -- No debe ser ejecutable por anon/public. has_function_privilege('anon', …)
    -- devuelve true tanto si se concedió a anon directamente como a PUBLIC (todo
    -- rol pertenece a PUBLIC), así cubre también el GRANT-a-public por defecto de
    -- CREATE FUNCTION si un rebuild olvidara el `revoke`. Se guarda con la
    -- existencia del rol para no depender de entornos no-Supabase.
    if exists (select 1 from pg_roles where rolname = 'anon')
       and has_function_privilege('anon', _h, 'execute')
    then
      raise exception
        'GUARDIÁN RLS SELF: el rol anon puede EJECUTAR % (helper de aislamiento expuesto sin login)', _h
        using errcode = 'raise_exception';
    end if;

  end loop;

  -- =========================================================================
  -- (1) customers — barrera de STAFF + barrera SELF + candado de columnas.
  -- =========================================================================

  -- (a) RLS habilitada.
  select count(*) into _cnt
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'customers' and c.relrowsecurity;
  if _cnt = 0 then
    raise exception 'GUARDIÁN RLS SELF: public.customers no tiene RLS habilitada'
      using errcode = 'raise_exception';
  end if;

  -- (b) Barrera de STAFF intacta: SELECT acotada por app.user_salon_ids().
  select count(*) into _cnt
  from pg_policies
  where schemaname = 'public' and tablename = 'customers'
    and cmd in ('SELECT', 'ALL') and qual like '%user_salon_ids%';
  if _cnt = 0 then
    raise exception 'GUARDIÁN RLS SELF: customers perdió la política SELECT de staff (user_salon_ids) — barrera multi-tenant rota'
      using errcode = 'raise_exception';
  end if;

  -- (c) Barrera SELF de SELECT acotada por auth.uid().
  select count(*) into _cnt
  from pg_policies
  where schemaname = 'public' and tablename = 'customers'
    and cmd in ('SELECT', 'ALL') and qual like '%auth.uid%';
  if _cnt = 0 then
    raise exception 'GUARDIÁN RLS SELF: customers no tiene política SELF de SELECT acotada por auth.uid()'
      using errcode = 'raise_exception';
  end if;

  -- (d) Barrera SELF de UPDATE acotada por auth.uid() en USING y WITH CHECK.
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

  -- (e) Candado de columnas del autoservicio presente (RLS no filtra columnas).
  select count(*) into _cnt
  from pg_trigger
  where tgrelid = 'public.customers'::regclass
    and tgname  = 'trg_customers_enforce_self_update_columns'
    and not tgisinternal;
  if _cnt = 0 then
    raise exception 'GUARDIÁN RLS SELF: falta el trigger que congela columnas en el autoservicio (salon_id/qr_token/notes/user_id modificables por el cliente)'
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

  -- =========================================================================
  -- (2) Fidelización — barrera de STAFF + SELF de solo lectura, sin escritura.
  -- =========================================================================
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

    -- (b) Barrera de STAFF intacta: SELECT acotada por app.user_salon_ids().
    select count(*) into _cnt
    from pg_policies
    where schemaname = 'public' and tablename = _t
      and cmd in ('SELECT', 'ALL') and qual like '%user_salon_ids%';
    if _cnt = 0 then
      raise exception 'GUARDIÁN RLS SELF: public.% perdió la política SELECT de staff (user_salon_ids) — posible fuga cross-tenant', _t
        using errcode = 'raise_exception';
    end if;

    -- (c) Barrera SELF de SELECT acotada por app.user_customer_ids().
    select count(*) into _cnt
    from pg_policies
    where schemaname = 'public' and tablename = _t
      and cmd in ('SELECT', 'ALL') and qual like '%user_customer_ids%';
    if _cnt = 0 then
      raise exception 'GUARDIÁN RLS SELF: public.% no tiene política SELF de SELECT acotada por app.user_customer_ids()', _t
        using errcode = 'raise_exception';
    end if;

    -- (d) SIN escritura SELF: nada que referencie user_customer_ids fuera de SELECT
    --     (el cliente jamás fabrica puntos/cupones/recompensas desde el navegador).
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

  -- =========================================================================
  -- (3) Barrido GENÉRICO de TODAS las políticas de la superficie de cliente.
  --     Dos garantías sobre cada política de las 5 tablas:
  --       (i)  NINGUNA queda sin anclaje de aislamiento: su USING (y su WITH CHECK,
  --            si lo tiene) debe referenciar al menos uno de los anclajes conocidos
  --            —app.user_salon_ids() / app.has_salon_role() (tenant·staff) o
  --            app.user_customer_ids() / auth.uid() (autoservicio)—. Caza el
  --            debilitamiento más grave, que los checks por-tabla NO ven: sustituir
  --            un `using (salon_id in …)` de STAFF por `using (true)` (p. ej. en el
  --            UPDATE de welcome_coupons/rewards) dejaría la tabla abierta a
  --            cualquier autenticado, saltándose el aislamiento por salón.
  --       (ii) Las políticas SELF (prefijo `self`) deben estar acotadas
  --            ESPECÍFICAMENTE al cliente (auth.uid()/user_customer_ids()), nunca
  --            solo al salón: cambiar `using (user_id = auth.uid())` por `using
  --            (true)` expondría TODOS los clientes entre sí.
  -- =========================================================================
  for _pol in
    select tablename, policyname, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and tablename::text = any (_all_tables)
  loop
    -- (i) Todo USING presente debe citar algún anclaje de tenant o de autoservicio.
    if _pol.qual is not null
       and _pol.qual not like '%user_salon_ids%'
       and _pol.qual not like '%has_salon_role%'
       and _pol.qual not like '%user_customer_ids%'
       and _pol.qual not like '%auth.uid%'
    then
      raise exception
        'GUARDIÁN RLS SELF: la política %.% tiene USING sin anclaje de aislamiento (tenant o self) — posible using(true) que abre la tabla',
        _pol.tablename, _pol.policyname
        using errcode = 'raise_exception';
    end if;

    -- (i) Todo WITH CHECK presente (INSERT/UPDATE) debe citar algún anclaje.
    if _pol.with_check is not null
       and _pol.with_check not like '%user_salon_ids%'
       and _pol.with_check not like '%has_salon_role%'
       and _pol.with_check not like '%user_customer_ids%'
       and _pol.with_check not like '%auth.uid%'
    then
      raise exception
        'GUARDIÁN RLS SELF: la política %.% tiene WITH CHECK sin anclaje de aislamiento (tenant o self) — posible with check(true)',
        _pol.tablename, _pol.policyname
        using errcode = 'raise_exception';
    end if;

    -- (ii) Una política SELF debe acotarse al CLIENTE, no solo al salón.
    if _pol.policyname like 'self%' then
      -- USING de la política SELF sin acotar por auth.uid()/user_customer_ids().
      if coalesce(_pol.qual, '') not like '%auth.uid%'
         and coalesce(_pol.qual, '') not like '%user_customer_ids%'
      then
        raise exception
          'GUARDIÁN RLS SELF: la política SELF %.% no está acotada por auth.uid()/app.user_customer_ids() en USING (fuga entre clientes)',
          _pol.tablename, _pol.policyname
          using errcode = 'raise_exception';
      end if;

      -- WITH CHECK (solo INSERT/UPDATE lo tienen) igualmente acotado al cliente.
      if _pol.with_check is not null
         and _pol.with_check not like '%auth.uid%'
         and _pol.with_check not like '%user_customer_ids%'
      then
        raise exception
          'GUARDIÁN RLS SELF: la política SELF %.% tiene WITH CHECK no acotado por auth.uid()/app.user_customer_ids()',
          _pol.tablename, _pol.policyname
          using errcode = 'raise_exception';
      end if;
    end if;
  end loop;

  -- =========================================================================
  -- (4) Inmutabilidad del libro mayor de puntos: points_movements no debe tener
  --     política de UPDATE (append-only). Los puntos son "casi dinero"; análogo a
  --     la inmutabilidad fiscal de pos_invoices en rls_multitenant_guard. El
  --     borrado por owner (correcciones excepcionales) SÍ está permitido por
  --     diseño, así que aquí solo se veta el UPDATE.
  -- =========================================================================
  select count(*) into _cnt
  from pg_policies
  where schemaname = 'public' and tablename = 'points_movements'
    and cmd in ('UPDATE', 'ALL');
  if _cnt > 0 then
    raise exception
      'GUARDIÁN RLS SELF: points_movements tiene política(s) de UPDATE — el libro mayor de puntos es append-only (inmutable)'
      using errcode = 'raise_exception';
  end if;

  raise notice 'GUARDIÁN RLS SELF: aislamiento verificado — helpers DEFINER intactos, barrera staff + SELF acotadas, sin escritura de cliente en fidelización, nada expuesto a anon/public, libro de puntos inmutable (customers + % tablas de fidelización).',
    array_length(_loyalty_tables, 1);
end;
$guard$;

commit;

-- =============================================================================
-- NOTAS PARA FUTUROS MANTENEDORES
--
-- • Migración FORWARD-ONLY sin objetos que revertir: no crea políticas/funciones/
--   triggers, solo re-afirma RLS (idempotente) y comprueba catálogo. Su "rollback"
--   es un no-op; eliminarla no revierte nada, solo retira la red de seguridad.
--
-- • Solape intencionado con el guardián en línea de la parte C
--   (20260717120000_rls_self_customer.sql): defensa en profundidad. Si se refactor
--   izan/unifican, conservar AL MENOS un guardián que cubra los mismos invariantes,
--   incluida la integridad de los helpers (que la parte C no comprueba).
--
-- • Si en el futuro se concede al cliente ALGUNA escritura legítima sobre
--   fidelización (hoy prohibida), habrá que revisar el check (2d) y el barrido (3):
--   la nueva política SELF de escritura deberá seguir acotada por
--   app.user_customer_ids() en USING y WITH CHECK, o el guardián abortará (correcto).
--
-- • El barrido (3) tiene dos capas: (i) TODA política de las 5 tablas debe citar un
--   anclaje de aislamiento (user_salon_ids/has_salon_role/user_customer_ids/auth.uid),
--   sea cual sea su nombre —esto caza un `using (true)` en cualquier política—; y
--   (ii) las políticas SELF, identificadas por el prefijo `self`, deben acotarse al
--   CLIENTE (auth.uid()/user_customer_ids()), no solo al salón. La capa (i) no
--   depende del nombre; conviene igualmente mantener el convenio `self` para que la
--   capa (ii) cubra automáticamente las nuevas políticas de autoservicio.
--
-- • El check (0) localiza los helpers por su firma textual exacta
--   ('app.user_salon_ids()' / 'app.user_customer_ids()'). Si algún helper cambiara
--   de firma (p. ej. ganara un parámetro), actualizar esas cadenas o el guardián lo
--   dará por "ausente" y abortará. Es intencional: obliga a revisar el aislamiento.
--
-- • Anclajes reconocidos hoy: app.user_salon_ids(), app.has_salon_role(),
--   app.user_customer_ids() y auth.uid(). Si se introduce un mecanismo de acotado
--   distinto (p. ej. una subconsulta directa a salon_members sin el helper), añadir
--   su patrón al barrido (3) o el guardián abortará al no reconocerlo (correcto:
--   fuerza una revisión consciente del nuevo camino de aislamiento).
-- =============================================================================
