-- =============================================================================
-- salon-os — Migración: guardián RLS multi-tenant (TPV + facturación + productos)
--
-- Contexto: las políticas RLS de products, pos_payment_methods, pos_sessions,
-- pos_sales, pos_sale_lines, pos_payments y pos_invoices ya se crearon EN LÍNEA
-- en sus migraciones de origen (fiscal_base, pos_base, verifactu_invoices), al
-- estilo de rls_policies (migración 2/3): aislamiento por `salon_id in
-- (select app.user_salon_ids())` para lectura/operativa y `app.has_salon_role(...)`
-- para configuración y borrados sensibles.
--
-- Esta migración NO redefine esas políticas (sería un error "policy already
-- exists" y duplicaría la lógica). Su cometido es de SEGURIDAD DEFENSIVA:
--
--   1. Reafirmar RLS habilitada en las 7 tablas (idempotente: no-op si ya lo está).
--   2. Un GUARDIÁN de aserción (bloque DO) que verifica, a nivel de catálogo, que
--      la garantía multi-tenant sigue intacta y ABORTA la migración si detecta
--      una regresión:
--        · RLS deshabilitada en cualquiera de las 7 tablas.
--        · Falta la política de SELECT acotada por app.user_salon_ids()
--          (una venta/factura de un salón sería visible desde otro).
--        · Alguna política abierta a `anon` o `public` (fuga sin autenticar).
--        · pos_invoices con política de UPDATE/DELETE (rompe la inmutabilidad
--          fiscal Veri*factu).
--
-- Así, si una migración futura llegara a borrar una política o a exponer estas
-- tablas, este guardián (re-ejecutado en un entorno limpio/CI) falla de forma
-- ruidosa en lugar de degradar el aislamiento en silencio.
--
-- No toca agenda/reservas/ajustes/login: solo re-afirma RLS y comprueba el
-- catálogo (pg_class / pg_policies). Sin efectos sobre datos ni sobre otras tablas.
-- =============================================================================

begin;

-- ------------------------------------------------------------------------------
-- 1. Reafirmar RLS (deny-by-default). Idempotente: si ya está activa, no-op.
-- ------------------------------------------------------------------------------
alter table public.products            enable row level security;
alter table public.pos_payment_methods enable row level security;
alter table public.pos_sessions        enable row level security;
alter table public.pos_sales           enable row level security;
alter table public.pos_sale_lines      enable row level security;
alter table public.pos_payments        enable row level security;
alter table public.pos_invoices        enable row level security;

-- ------------------------------------------------------------------------------
-- 2. Guardián de aserción del aislamiento multi-tenant.
-- ------------------------------------------------------------------------------
do $guard$
declare
  -- Tablas cubiertas por esta subtarea (sub-5).
  _tenant_tables constant text[] := array[
    'products',
    'pos_payment_methods',
    'pos_sessions',
    'pos_sales',
    'pos_sale_lines',
    'pos_payments',
    'pos_invoices'
  ];
  _t   text;
  _cnt integer;
begin
  foreach _t in array _tenant_tables loop

    -- (a) RLS debe estar habilitada.
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

    -- (b) Debe existir una política de SELECT acotada por app.user_salon_ids().
    --     Es la barrera que impide ver ventas/facturas de otro salón.
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

    -- (c) Ninguna política puede estar abierta a anon / public (fuga sin login).
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

  -- (d) Inmutabilidad fiscal: pos_invoices no debe tener políticas de UPDATE/DELETE.
  --     La inmutabilidad la refuerza además el trigger trg_pos_invoices_immutable,
  --     pero una política de escritura aquí sería una señal de regresión.
  select count(*) into _cnt
  from pg_policies
  where schemaname = 'public'
    and tablename  = 'pos_invoices'
    and cmd        in ('UPDATE', 'DELETE', 'ALL');
  if _cnt > 0 then
    raise exception
      'GUARDIÁN RLS: pos_invoices tiene política(s) de UPDATE/DELETE — rompe la inmutabilidad Veri*factu'
      using errcode = 'raise_exception';
  end if;

  raise notice 'GUARDIÁN RLS: aislamiento multi-tenant verificado en % tablas (TPV, facturación y productos).',
    array_length(_tenant_tables, 1);
end;
$guard$;

commit;
