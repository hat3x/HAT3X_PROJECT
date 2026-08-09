-- =============================================================================
-- salon-os — Migración: historial clínico / evolutivo (public.clinical_history)
--
-- RELACIÓN 1:N con customers: un cliente tiene muchas entradas de historial
-- (cada actuación, nota de evolución, comunicación o procedimiento con su fecha).
-- Es el "evolutivo" clínico importado del software dental de origen (segcli) y
-- el destino donde la clínica seguirá registrando la actividad del paciente.
--
-- FK COMPUESTA (customer_id, salon_id) → customers(id, salon_id) hereda el
-- patrón de integridad multi-tenant de 20260712120000_tenant_integrity.sql,
-- apoyándose en la UNIQUE constraint customers_id_salon_key. Garantiza que la
-- entrada y el cliente pertenecen siempre al mismo tenant sin depender de RLS.
-- CASCADE: al borrar el cliente su historial desaparece con él (dato personal).
--
-- IDEMPOTENCIA: (salon_id, source_ref) es UNIQUE. source_ref guarda el id de
-- origen (segcli.id) para que reejecutar el volcado no duplique filas
-- (ON CONFLICT DO NOTHING). Las entradas creadas dentro de Kairos usan
-- source_ref = NULL (el UNIQUE permite múltiples NULL).
--
-- RLS: lectura para cualquier miembro del salón; escritura (INSERT/UPDATE/DELETE)
-- restringida a owner/manager (patrón visit_notes / clinical_records). El
-- guardián de aislamiento verifica el invariante al aplicar la migración.
--
-- APLICACIÓN VÍA MANAGEMENT API:
--   POST /v1/projects/{project-ref}/database/migrations
--   Content-Type: application/sql
-- =============================================================================

begin;

-- ------------------------------------------------------------------------------
-- clinical_history — entrada de historial clínico / evolutivo, 1:N con customers
-- ------------------------------------------------------------------------------
create table public.clinical_history (
  -- PK propia (relación 1:N; un cliente tiene muchas entradas).
  id            uuid         not null default gen_random_uuid(),

  -- salon_id NOT NULL: segunda columna de la FK compuesta multi-tenant y
  -- filtrado en RLS (app.user_salon_ids() / app.has_salon_role()).
  salon_id      uuid         not null,

  -- Cliente titular del historial. Primera columna de la FK compuesta.
  customer_id   uuid         not null,

  -- Fecha/hora de la actuación o anotación (dfechaact en el origen).
  occurred_on   timestamptz  not null,

  -- Tipo/título de la actuación tal cual en el origen (sactuacion):
  -- "Primera Consulta", "ENDODONCIA", "RECONSTRUCCIÓN", "Conservadora", etc.
  kind          text,

  -- Categoría derivada para filtrar en la UI:
  --   'clinica'      → procedimiento o consulta clínica
  --   'comunicacion' → WhatsApp/SMS/email/recordatorio enviado
  --   'nota'         → anotación de evolución
  --   'otro'         → sin clasificar
  category      text         not null default 'otro',

  -- Texto de la nota clínica (RTF del origen ya limpiado a texto plano).
  note          text,

  -- Diente FDI asociado a la actuación, si aplica (11–48 permanentes,
  -- 51–85 temporales). NULL si la actuación no es de un diente concreto.
  fdi_tooth     smallint,

  -- Importe de la actuación en céntimos (importe/precio del origen). NULL si no aplica.
  amount_cents  integer,

  -- TRUE si la actuación estaba marcada como realizada en el origen.
  done          boolean      not null default false,

  -- Nombre del profesional que realizó la actuación (resuelto desde subusuario).
  professional  text,

  -- Referencia al registro de origen (segcli.id) para idempotencia del volcado.
  -- NULL para entradas creadas dentro de Kairos.
  source_ref    text,

  -- Extensión libre (jsonb) para metadatos adicionales del origen.
  data          jsonb        not null default '{}',

  created_at    timestamptz  not null default now(),

  primary key (id),

  -- FK compuesta: garantiza que (customer_id, salon_id) pertenecen al mismo tenant.
  -- Usa customers_id_salon_key (20260712120000_tenant_integrity.sql).
  constraint clinical_history_customer_salon_fkey
    foreign key (customer_id, salon_id)
    references public.customers (id, salon_id)
    on delete cascade,

  -- Categoría acotada a valores conocidos.
  constraint clinical_history_category_chk
    check (category in ('clinica', 'comunicacion', 'nota', 'otro'))
);

-- Idempotencia del volcado: una entrada por registro de origen y tenant.
-- Los NULL (entradas nativas de Kairos) no colisionan entre sí en Postgres.
create unique index clinical_history_source_uniq
  on public.clinical_history (salon_id, source_ref)
  where source_ref is not null;

-- Índice principal de consulta: el evolutivo de un cliente ordenado por fecha desc.
create index idx_clinical_history_customer
  on public.clinical_history (salon_id, customer_id, occurred_on desc);

comment on table public.clinical_history is
  'Historial clínico / evolutivo del cliente (1:N). Importado del software dental '
  'de origen (segcli) y destino de la actividad clínica continua. source_ref '
  'guarda el id de origen para idempotencia del volcado. '
  'Aplicada en 20260806120000_clinical_history.sql.';

-- ------------------------------------------------------------------------------
-- RLS — patrón estándar del proyecto (visit_notes / clinical_records)
-- ------------------------------------------------------------------------------
alter table public.clinical_history enable row level security;

create policy "members_select_clinical_history"
  on public.clinical_history for select to authenticated
  using (salon_id in (select app.user_salon_ids()));

create policy "managers_insert_clinical_history"
  on public.clinical_history for insert to authenticated
  with check (app.has_salon_role(salon_id, array['owner','manager']::public.member_role[]));

create policy "managers_update_clinical_history"
  on public.clinical_history for update to authenticated
  using  (app.has_salon_role(salon_id, array['owner','manager']::public.member_role[]))
  with check (app.has_salon_role(salon_id, array['owner','manager']::public.member_role[]));

create policy "managers_delete_clinical_history"
  on public.clinical_history for delete to authenticated
  using (app.has_salon_role(salon_id, array['owner','manager']::public.member_role[]));

-- ------------------------------------------------------------------------------
-- Guardián de aislamiento (defensa en profundidad — patrón 20260731120000)
-- ------------------------------------------------------------------------------
do $guard$
declare
  _t   constant text := 'clinical_history';
  _cnt integer;
  _pol record;
begin
  -- (a) RLS habilitada.
  select count(*) into _cnt
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = _t and c.relrowsecurity;
  if _cnt = 0 then
    raise exception 'GUARDIÁN RLS: public.% sin RLS habilitada', _t using errcode = 'raise_exception';
  end if;

  -- (b) Política SELECT acotada por app.user_salon_ids().
  select count(*) into _cnt from pg_policies
  where schemaname = 'public' and tablename = _t and cmd in ('SELECT','ALL')
    and qual is not null and qual like '%user_salon_ids%';
  if _cnt = 0 then
    raise exception 'GUARDIÁN RLS: public.% sin SELECT acotado por app.user_salon_ids()', _t using errcode = 'raise_exception';
  end if;

  -- (c) Ninguna política abierta a anon/public.
  select count(*) into _cnt from pg_policies
  where schemaname = 'public' and tablename = _t and (roles && array['anon','public']::name[]);
  if _cnt > 0 then
    raise exception 'GUARDIÁN RLS: public.% con % política(s) a anon/public', _t, _cnt using errcode = 'raise_exception';
  end if;

  -- (d) Toda política de escritura anclada en app.has_salon_role.
  for _pol in
    select policyname, cmd, qual, with_check from pg_policies
    where schemaname = 'public' and tablename = _t and cmd in ('INSERT','UPDATE','DELETE')
  loop
    if coalesce(_pol.qual,'') || coalesce(_pol.with_check,'') not like '%has_salon_role%' then
      raise exception 'GUARDIÁN RLS: política de escritura %.% (%) sin app.has_salon_role', _t, _pol.policyname, _pol.cmd using errcode = 'raise_exception';
    end if;
  end loop;

  -- (e) FK compuesta (customer_id, salon_id) existe.
  select count(*) into _cnt
  from information_schema.referential_constraints rc
  join information_schema.key_column_usage kcu
    on kcu.constraint_name = rc.constraint_name and kcu.constraint_schema = rc.constraint_schema
  where rc.constraint_schema = 'public'
    and rc.constraint_name = 'clinical_history_customer_salon_fkey'
    and kcu.column_name in ('customer_id','salon_id');
  if _cnt <> 2 then
    raise exception 'GUARDIÁN: FK compuesta clinical_history_customer_salon_fkey no tiene (customer_id, salon_id)' using errcode = 'raise_exception';
  end if;

  raise notice 'GUARDIÁN: RLS, SELECT acotado, FK compuesta verificados en public.%.', _t;
end;
$guard$;

commit;
