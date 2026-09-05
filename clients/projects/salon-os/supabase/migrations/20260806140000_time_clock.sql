-- =============================================================================
-- salon-os — Migración: fichajes del personal (public.time_clock)
--
-- Control horario: cada empleado (usuario del salón) ficha ENTRADA (crea una
-- fila con clock_in) y SALIDA (rellena clock_out de su fila abierta). Una fila
-- por sesión de trabajo. "Fichado ahora" = filas con clock_out IS NULL.
--
-- RLS:
--   SELECT:  el propio empleado ve sus fichajes; owner/manager ven los de todo
--            el salón (para el informe de horas).
--   INSERT:  cualquier miembro del salón crea SU propio fichaje (user_id = auth.uid()).
--   UPDATE:  el propio empleado cierra su fichaje (clock_out); owner/manager pueden
--            corregir cualquiera del salón.
--   DELETE:  owner/manager (corrección de errores).
--   Deny-by-default a anon/public.
-- =============================================================================

begin;

create table public.time_clock (
  id          uuid         not null default gen_random_uuid(),
  salon_id    uuid         not null references public.salons (id) on delete cascade,
  -- Empleado que ficha. SET NULL si se borra la cuenta (RGPD): el registro de
  -- horas se conserva de forma anonimizada.
  user_id     uuid         references auth.users (id) on delete set null,
  clock_in    timestamptz  not null default now(),
  clock_out   timestamptz,
  -- Nota opcional (p. ej. correcciones manuales del owner).
  note        text,
  created_at  timestamptz  not null default now(),

  primary key (id),
  -- clock_out, si existe, no puede ser anterior a clock_in.
  constraint time_clock_range_chk check (clock_out is null or clock_out >= clock_in)
);

-- Índice principal: fichajes de un salón por fecha (informe).
create index idx_time_clock_salon on public.time_clock (salon_id, clock_in desc);
-- Índice para «mi fichaje abierto» y «quién está dentro».
create index idx_time_clock_open on public.time_clock (salon_id, user_id)
  where clock_out is null;

comment on table public.time_clock is
  'Fichajes del personal (control horario). Una fila por sesión de trabajo: '
  'clock_in al fichar entrada, clock_out al fichar salida. Aplicada en '
  '20260806140000_time_clock.sql.';

alter table public.time_clock enable row level security;

-- SELECT: el propio empleado, o cualquier owner/manager del salón.
create policy "members_select_own_or_managers_time_clock"
  on public.time_clock for select to authenticated
  using (
    salon_id in (select app.user_salon_ids())
    and (
      user_id = (select auth.uid())
      or app.has_salon_role(salon_id, array['owner','manager']::public.member_role[])
    )
  );

-- INSERT: un miembro del salón ficha SU propia entrada.
create policy "members_insert_own_time_clock"
  on public.time_clock for insert to authenticated
  with check (
    salon_id in (select app.user_salon_ids())
    and user_id = (select auth.uid())
  );

-- UPDATE: el propio empleado cierra su fichaje; owner/manager corrigen cualquiera.
create policy "members_update_own_or_managers_time_clock"
  on public.time_clock for update to authenticated
  using (
    salon_id in (select app.user_salon_ids())
    and (
      user_id = (select auth.uid())
      or app.has_salon_role(salon_id, array['owner','manager']::public.member_role[])
    )
  )
  with check (
    salon_id in (select app.user_salon_ids())
    and (
      user_id = (select auth.uid())
      or app.has_salon_role(salon_id, array['owner','manager']::public.member_role[])
    )
  );

-- DELETE: solo owner/manager (corrección de errores).
create policy "managers_delete_time_clock"
  on public.time_clock for delete to authenticated
  using (app.has_salon_role(salon_id, array['owner','manager']::public.member_role[]));

-- ------------------------------------------------------------------------------
-- Guardián de aislamiento
-- ------------------------------------------------------------------------------
do $guard$
declare
  _t   constant text := 'time_clock';
  _cnt integer;
begin
  select count(*) into _cnt from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = _t and c.relrowsecurity;
  if _cnt = 0 then raise exception 'GUARDIÁN RLS: public.% sin RLS', _t using errcode = 'raise_exception'; end if;

  select count(*) into _cnt from pg_policies
  where schemaname = 'public' and tablename = _t and cmd in ('SELECT','ALL')
    and qual is not null and qual like '%user_salon_ids%';
  if _cnt = 0 then raise exception 'GUARDIÁN RLS: public.% sin SELECT acotado', _t using errcode = 'raise_exception'; end if;

  select count(*) into _cnt from pg_policies
  where schemaname = 'public' and tablename = _t and (roles && array['anon','public']::name[]);
  if _cnt > 0 then raise exception 'GUARDIÁN RLS: public.% expuesta a anon/public', _t using errcode = 'raise_exception'; end if;

  raise notice 'GUARDIÁN: RLS verificada en public.%.', _t;
end;
$guard$;

commit;
