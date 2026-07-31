-- =============================================================================
-- salon-os — Migración: gate de escritura dental para staff en fichas clínicas
--
-- CONTEXTO:
-- Las tablas clinical_records, visit_notes y odontogram_findings tienen RLS
-- habilitada (20260731110000 / 20260731120000) con:
--   SELECT → cualquier miembro del salón (app.user_salon_ids())
--   INSERT/UPDATE/DELETE → solo owner o manager (app.has_salon_role)
--
-- Esta migración añade el gate de escritura para staff dental: profesionales
-- con rol 'staff' en salones con sector 'odontologia' obtienen permiso de INSERT
-- sobre las tres tablas clínicas. Son ellos quienes crean fichas, registran
-- hallazgos del odontograma y redactan notas clínicas de visita.
--
-- DISEÑO DE SEGURIDAD:
--   · UPDATE/DELETE no cambia: permanecen en owner/manager (mínimo privilegio).
--     Solo se expande INSERT, que es la operación clínica principal del staff.
--   · Doble restricción en el INSERT dental-staff:
--       (1) app.has_salon_role — verifica membresía activa y rol
--       (2) app.salon_is_sector — verifica que el salón pertenece al sector
--     Un staff de peluquería NO puede insertar en fichas clínicas aunque sea
--     miembro del salón; el gate de sector lo bloquea a nivel de BD.
--   · PERMISSIVE policies (defecto de Postgres): múltiples políticas PERMISSIVE
--     se combinan con OR. El INSERT dental-staff coexiste con la policy de
--     owner/manager sin interferir: cada una opera en su propio scope.
--   · Owner/manager de cualquier sector siguen teniendo INSERT sin restricción
--     de sector (sus políticas pre-existentes no cambian).
--   · SELECT no cambia: cualquier miembro autenticado del salón puede leer
--     fichas, notas y hallazgos de su propio tenant.
--   · Deny-by-default se mantiene: anon/public nunca llegan a ninguna política.
--   · service_role (backoffice HAT3X) bypasa RLS por diseño de Supabase.
--
-- HELPER FUNCIÓN:
--   app.salon_is_sector(salon_id uuid, sector salon_sector) → boolean
--     STABLE / SECURITY DEFINER / set search_path = ''
--     Lee public.salons sin depender de RLS del caller.
--     El planner puede memoizarla una vez por consulta (initPlan).
--
-- POLÍTICAS AÑADIDAS:
--   clinical_records    → dental_staff_insert_clinical_records
--   visit_notes         → dental_staff_insert_visit_notes
--   odontogram_findings → dental_staff_insert_odontogram_findings
--
-- APLICACIÓN VÍA MANAGEMENT API:
--   POST /v1/projects/{project-ref}/database/migrations
--   Authorization: Bearer <service_role_key>
--   Content-Type: application/sql
--   Body: <contenido de este archivo>
-- =============================================================================

begin;

-- ------------------------------------------------------------------------------
-- Helper: verifica que el salón pertenece al sector indicado.
--
-- Usado como segunda dimensión del gate de escritura dental (la primera
-- dimensión es app.has_salon_role). SECURITY DEFINER para leer public.salons
-- incluso si el caller es un role autenticado sin acceso directo a la tabla.
-- STABLE: el planner evalúa la función una sola vez por consulta (initPlan),
-- al igual que app.user_salon_ids() y app.has_salon_role().
-- set search_path = '': previene search_path injection.
-- ------------------------------------------------------------------------------
create or replace function app.salon_is_sector(
  _salon_id uuid,
  _sector   public.salon_sector
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.salons
    where id     = _salon_id
      and sector = _sector
  );
$$;

-- Acceso: solo usuarios autenticados; nunca anon ni public.
revoke execute on function app.salon_is_sector(uuid, public.salon_sector) from anon, public;
grant  execute on function app.salon_is_sector(uuid, public.salon_sector) to authenticated;

comment on function app.salon_is_sector(uuid, public.salon_sector) is
  'Devuelve TRUE si el salón dado pertenece al sector indicado. '
  'SECURITY DEFINER + search_path='''' — seguro para uso en WITH CHECK. '
  'STABLE — el planner lo evalúa una vez por consulta (initPlan).';

-- ------------------------------------------------------------------------------
-- Gate dental — INSERT sobre clinical_records
--
-- Permite a staff de salones odontológicos crear/registrar fichas clínicas.
-- Coexiste con "managers_insert_clinical_records" (owner/manager cualquier sector)
-- mediante OR lógico (ambas PERMISSIVE).
--
-- WITH CHECK (INSERT): doble restricción:
--   (1) app.has_salon_role — el usuario tiene rol owner|manager|staff en el salón
--   (2) app.salon_is_sector — el salón es de sector 'odontologia'
-- Un staff de peluquería queda bloqueado por la restricción de sector.
-- ------------------------------------------------------------------------------
create policy "dental_staff_insert_clinical_records"
  on public.clinical_records for insert to authenticated
  with check (
    app.has_salon_role(salon_id, array['owner','manager','staff']::public.member_role[])
    and app.salon_is_sector(salon_id, 'odontologia'::public.salon_sector)
  );

-- ------------------------------------------------------------------------------
-- Gate dental — INSERT sobre visit_notes
--
-- Permite a staff dental crear notas clínicas de visita. UPDATE y DELETE no
-- cambian (owner/manager únicamente, y solo sobre notas no firmadas).
-- ------------------------------------------------------------------------------
create policy "dental_staff_insert_visit_notes"
  on public.visit_notes for insert to authenticated
  with check (
    app.has_salon_role(salon_id, array['owner','manager','staff']::public.member_role[])
    and app.salon_is_sector(salon_id, 'odontologia'::public.salon_sector)
  );

-- ------------------------------------------------------------------------------
-- Gate dental — INSERT sobre odontogram_findings
--
-- Tabla append-only: UPDATE bloqueado por trigger; DELETE reservado a CASCADE.
-- Esta policy permite a staff dental registrar nuevos eventos clínicos del
-- odontograma (hallazgos, procedimientos).
-- ------------------------------------------------------------------------------
create policy "dental_staff_insert_odontogram_findings"
  on public.odontogram_findings for insert to authenticated
  with check (
    app.has_salon_role(salon_id, array['owner','manager','staff']::public.member_role[])
    and app.salon_is_sector(salon_id, 'odontologia'::public.salon_sector)
  );

-- ------------------------------------------------------------------------------
-- Guardián de aislamiento (defensa en profundidad — patrón 20260718110000)
-- Verifica que los invariantes de seguridad se cumplen al aplicar esta migración.
-- Si alguna comprobación falla, la transacción aborta íntegramente.
-- ------------------------------------------------------------------------------
do $guard$
declare
  _cnt integer;
begin
  -- (a) app.salon_is_sector existe y es SECURITY DEFINER.
  --     Sin esta función, los WITH CHECK fallarían silenciosamente.
  select count(*) into _cnt
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'app'
    and p.proname = 'salon_is_sector'
    and p.prosecdef;
  if _cnt = 0 then
    raise exception
      'GUARDIÁN: app.salon_is_sector no existe o no es SECURITY DEFINER '
      '— las políticas de INSERT dental quedarían sin gate de sector'
      using errcode = 'raise_exception';
  end if;

  -- (b) Policy dental existe en clinical_records.
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'clinical_records'
      and policyname = 'dental_staff_insert_clinical_records'
  ) then
    raise exception
      'GUARDIÁN: falta la policy "dental_staff_insert_clinical_records" en public.clinical_records'
      using errcode = 'raise_exception';
  end if;

  -- (c) Policy dental existe en visit_notes.
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'visit_notes'
      and policyname = 'dental_staff_insert_visit_notes'
  ) then
    raise exception
      'GUARDIÁN: falta la policy "dental_staff_insert_visit_notes" en public.visit_notes'
      using errcode = 'raise_exception';
  end if;

  -- (d) Policy dental existe en odontogram_findings.
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'odontogram_findings'
      and policyname = 'dental_staff_insert_odontogram_findings'
  ) then
    raise exception
      'GUARDIÁN: falta la policy "dental_staff_insert_odontogram_findings" en public.odontogram_findings'
      using errcode = 'raise_exception';
  end if;

  -- (e) Ninguna de las nuevas políticas dentales está expuesta a anon/public.
  select count(*) into _cnt
  from pg_policies
  where schemaname = 'public'
    and tablename  in ('clinical_records', 'visit_notes', 'odontogram_findings')
    and policyname like 'dental_staff_%'
    and (roles && array['anon', 'public']::name[]);
  if _cnt > 0 then
    raise exception
      'GUARDIÁN: % política(s) dental(es) expuesta(s) a anon/public (acceso no autenticado a datos clínicos)', _cnt
      using errcode = 'raise_exception';
  end if;

  -- (f) Las 3 políticas dentales exigen AMBOS gates: has_salon_role + salon_is_sector.
  --     Si una regresión futura eliminara uno de los dos checks, la migración aborta.
  select count(*) into _cnt
  from pg_policies
  where schemaname = 'public'
    and policyname in (
      'dental_staff_insert_clinical_records',
      'dental_staff_insert_visit_notes',
      'dental_staff_insert_odontogram_findings'
    )
    and coalesce(with_check, '') like '%has_salon_role%'
    and coalesce(with_check, '') like '%salon_is_sector%';
  if _cnt <> 3 then
    raise exception
      'GUARDIÁN: solo % de 3 políticas dentales tienen el gate dual has_salon_role + salon_is_sector '
      '(gate de escritura dental incompleto)', _cnt
      using errcode = 'raise_exception';
  end if;

  -- (g) Las tablas clínicas siguen con RLS habilitada (no debilitadas por esta migración).
  select count(*) into _cnt
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname in ('clinical_records', 'visit_notes', 'odontogram_findings')
    and c.relrowsecurity;
  if _cnt <> 3 then
    raise exception
      'GUARDIÁN: RLS deshabilitada en % de 3 tablas clínicas (aislamiento multi-tenant roto)', 3 - _cnt
      using errcode = 'raise_exception';
  end if;

  raise notice
    'GUARDIÁN: app.salon_is_sector (SECURITY DEFINER) verificado; '
    '3 gates INSERT dental activos con has_salon_role + salon_is_sector en '
    'clinical_records, visit_notes y odontogram_findings. '
    'RLS habilitada en las 3 tablas.';
end;
$guard$;

commit;
