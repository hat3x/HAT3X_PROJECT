-- =============================================================================
-- salon-os — Migración: hallazgos del odontograma (public.odontogram_findings)
--
-- DISEÑO EVENT-SOURCED APPEND-ONLY:
-- Cada fila es un evento clínico inmutable que registra un hallazgo o
-- procedimiento sobre uno o varios dientes. El estado actual del odontograma
-- se reconstruye consultando los eventos más recientes por diente
-- (ORDER BY recorded_at DESC). Nada se modifica ni borra a nivel de app.
--
-- RELACIÓN CON clinical_records:
-- FK compuesta (clinical_record_id, salon_id) → clinical_records(customer_id,
-- salon_id). Requiere que clinical_records exponga un UNIQUE sobre esas dos
-- columnas, que se añade aquí previamente. El CASCADE propaga el borrado RGPD
-- desde customers → clinical_records → odontogram_findings.
--
-- FDI (ISO 3950):
-- fdi_tooth SMALLINT con CHECK que acepta exactamente los 52 números FDI
-- válidos: 11-18, 21-28, 31-38, 41-48 (permanentes) y 51-55, 61-65,
-- 71-75, 81-85 (temporales). Espeja el catálogo TS en src/lib/dental/tooth.ts.
--
-- SUPERFICIES:
-- surfaces TEXT[] con CHECK de subconjunto de los 7 valores válidos según
-- src/lib/dental/catalog.ts: mesial, distal, vestibular, palatino, lingual,
-- incisal, oclusal. Array vacío admitido (hallazgo aplica al diente global).
--
-- ENUMS:
-- dental_finding_type — tipo de hallazgo/procedimiento clínico (ej. caries,
--   obturacion, corona...).
-- dental_tooth_state  — estado visual resultante del evento; espeja ToothState
--   de src/lib/dental/color.ts.
--
-- APPEND-ONLY:
-- Trigger BEFORE UPDATE → raise exception para todos los roles. Ninguna UPDATE
-- puede alterar el historial clínico. Para correcciones se inserta un nuevo
-- evento (notes puede referenciar el evento anterior). DELETE está permitido
-- exclusivamente para el flujo CASCADE (borrado del titular por RGPD) y para
-- service_role; no se expone a roles autenticados vía RLS.
--
-- MULTI-TENANT:
-- salon_id NOT NULL en todas las filas. FK compuesta garantiza aislamiento a
-- nivel de base de datos. RLS filtra por app.user_salon_ids().
--
-- RLS:
--   SELECT: cualquier miembro autenticado del salón.
--   INSERT: solo owner/manager (app.has_salon_role).
--   UPDATE/DELETE: sin política → denegado para autenticados (RLS deny-by-default).
--   service_role bypasa RLS por diseño (escritura backoffice + RGPD cascade).
--
-- ÍNDICES:
--   idx_odontogram_findings_salon              — filtros RLS por salon_id
--   idx_odontogram_findings_record             — hallazgos de una ficha
--   idx_odontogram_findings_record_tooth_time  — estado actual de un diente
--
-- APLICACIÓN VÍA MANAGEMENT API:
--   POST /v1/projects/{project-ref}/database/migrations
--   Authorization: Bearer <service_role_key>
--   Content-Type: application/sql
--   Body: <contenido de este archivo>
-- =============================================================================

begin;

-- ------------------------------------------------------------------------------
-- Paso 0: UNIQUE de apoyo en clinical_records
-- Necesario para que la FK compuesta desde odontogram_findings pueda referenciar
-- (customer_id, salon_id). La PK solo indexa customer_id; Postgres exige un
-- UNIQUE explícito sobre el par para aceptar el FK compuesto.
-- ------------------------------------------------------------------------------
alter table public.clinical_records
  add constraint clinical_records_customer_id_salon_key
  unique (customer_id, salon_id);

-- ------------------------------------------------------------------------------
-- Enums — idempotente: se crea solo si no existe
-- ------------------------------------------------------------------------------

-- Tipos de hallazgo/procedimiento dental
do $$ begin
  if not exists (select 1 from pg_type where typname = 'dental_finding_type') then
    create type public.dental_finding_type as enum (
      'sano',            -- Diente sano (evento de «alta de salud», resetea estado)
      'caries',          -- Caries activa — pendiente de tratamiento
      'obturacion',      -- Obturación/restauración realizada
      'endodoncia',      -- Tratamiento de conducto realizado
      'corona',          -- Corona protésica colocada
      'implante',        -- Implante oseointegrado
      'extraccion',      -- Extracción realizada → diente ausente
      'puente',          -- Pilar o póntico de puente
      'fractura',        -- Fractura coronaria o radicular
      'erosion',         -- Erosión/abrasión del esmalte
      'sellador',        -- Sellador de fosas y fisuras (preventivo)
      'blanqueamiento',  -- Blanqueamiento dental realizado
      'nota'             -- Observación clínica sin cambio de estado
    );
  end if;
end $$;

-- Estado visual del diente resultante del evento.
-- Espeja exactamente ToothState en src/lib/dental/color.ts.
do $$ begin
  if not exists (select 1 from pg_type where typname = 'dental_tooth_state') then
    create type public.dental_tooth_state as enum (
      'sano',       -- Sano — sin tratamiento necesario
      'pendiente',  -- Tratamiento pendiente (rojo)
      'hecho',      -- Tratado/completado (azul)
      'en_curso',   -- En tratamiento activo (ámbar)
      'ausente',    -- Extraído/ausente (gris)
      'corona',     -- Coronado (dorado)
      'implante'    -- Implante (teal)
    );
  end if;
end $$;

-- ------------------------------------------------------------------------------
-- Tabla principal: odontogram_findings
-- ------------------------------------------------------------------------------
create table public.odontogram_findings (

  -- Identificador único del evento clínico
  id                 uuid         not null default gen_random_uuid(),

  -- Referencia a la ficha clínica del paciente.
  -- Primera columna de la FK compuesta multi-tenant.
  clinical_record_id uuid         not null,

  -- Tenant propietario. Segunda columna de la FK compuesta.
  -- Permite filtros RLS eficientes y aisla eventos entre salones.
  salon_id           uuid         not null,

  -- Número FDI del diente afectado (ISO 3950).
  -- Permanentes: 11-18 · 21-28 · 31-38 · 41-48
  -- Temporales:  51-55 · 61-65 · 71-75 · 81-85
  fdi_tooth          smallint     not null,

  -- Superficies afectadas por el hallazgo.
  -- Subconjunto de: mesial, distal, vestibular, palatino, lingual, incisal, oclusal.
  -- Vacío = hallazgo aplica al diente en su conjunto (p. ej. extracción, implante).
  surfaces           text[]       not null default '{}',

  -- Tipo de hallazgo o procedimiento clínico.
  finding_type       public.dental_finding_type not null,

  -- Estado visual resultante en el odontograma tras este evento.
  -- La UI reconstruye el estado actual buscando el último evento por diente.
  tooth_state        public.dental_tooth_state  not null,

  -- Observaciones clínicas adicionales del profesional (texto libre).
  notes              text,

  -- Profesional que registró el hallazgo.
  -- SET NULL si el usuario es eliminado de auth.users (RGPD: derecho de supresión).
  recorded_by        uuid         references auth.users(id) on delete set null,

  -- Momento clínico del hallazgo. Puede ser diferente de created_at si se
  -- registra un hallazgo histórico (retroceso de fecha).
  recorded_at        timestamptz  not null default now(),

  -- Timestamp de inserción en base de datos (trazabilidad técnica).
  -- En registros backfill puede diferir de recorded_at.
  created_at         timestamptz  not null default now(),

  -- ------------------------------------------------------------------
  -- Constraints
  -- ------------------------------------------------------------------

  primary key (id),

  -- FK compuesta multi-tenant → clinical_records(customer_id, salon_id).
  -- CASCADE: el borrado RGPD de un paciente elimina su ficha y,
  -- en cascada, todos sus eventos clínicos.
  constraint odontogram_findings_record_salon_fkey
    foreign key (clinical_record_id, salon_id)
    references public.clinical_records (customer_id, salon_id)
    on delete cascade,

  -- Validación de número FDI (ISO 3950): exactamente los 52 dientes válidos.
  -- Permanentes: cuadrantes 1-4 (posiciones 1-8).
  -- Temporales:  cuadrantes 5-8 (posiciones 1-5).
  constraint odontogram_findings_fdi_valid
    check (
      (fdi_tooth between 11 and 18) or
      (fdi_tooth between 21 and 28) or
      (fdi_tooth between 31 and 38) or
      (fdi_tooth between 41 and 48) or
      (fdi_tooth between 51 and 55) or
      (fdi_tooth between 61 and 65) or
      (fdi_tooth between 71 and 75) or
      (fdi_tooth between 81 and 85)
    ),

  -- Validación de superficies: subconjunto estricto de los 7 valores del catálogo.
  -- El operador <@ comprueba que cada elemento del array está en el conjunto válido.
  constraint odontogram_findings_surfaces_valid
    check (
      surfaces <@ array[
        'mesial','distal','vestibular','palatino','lingual','incisal','oclusal'
      ]::text[]
    )

);

-- ------------------------------------------------------------------------------
-- Índices
-- ------------------------------------------------------------------------------

-- Filtrado RLS por salon_id (el PK solo indexa id, no sirve para este patrón)
create index idx_odontogram_findings_salon
  on public.odontogram_findings (salon_id);

-- Todos los hallazgos de una ficha clínica (lista de eventos del paciente)
create index idx_odontogram_findings_record
  on public.odontogram_findings (clinical_record_id);

-- Estado actual de cada diente: obtener el evento más reciente por diente
-- en una ficha. SELECT DISTINCT ON (fdi_tooth) … ORDER BY fdi_tooth, recorded_at DESC
create index idx_odontogram_findings_record_tooth_time
  on public.odontogram_findings (clinical_record_id, fdi_tooth, recorded_at desc);

-- ------------------------------------------------------------------------------
-- Append-only: trigger que bloquea cualquier UPDATE
-- Las filas de odontogram_findings son inmutables una vez insertadas.
-- Para correcciones: insertar un nuevo evento (notes puede referir al anterior).
-- DELETE está reservado al flujo CASCADE (RGPD) y no se bloquea vía trigger
-- para no interrumpir la propagación desde clinical_records → customers.
-- ------------------------------------------------------------------------------
create or replace function app.odontogram_findings_no_update()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'ODONTOGRAMA: odontogram_findings es append-only — los eventos clínicos son '
    'inmutables. Para corregir un hallazgo registra un nuevo evento; no se '
    'permiten modificaciones de registros existentes.'
    using errcode = 'raise_exception';
end;
$$;

create trigger trg_odontogram_findings_no_update
  before update on public.odontogram_findings
  for each row execute function app.odontogram_findings_no_update();

-- ------------------------------------------------------------------------------
-- Comentarios de tabla y columnas
-- ------------------------------------------------------------------------------
comment on table public.odontogram_findings is
  'Historial event-sourced de hallazgos clínicos del odontograma. '
  'Tabla append-only: cada fila es un evento inmutable con número FDI, '
  'superficies afectadas, tipo de hallazgo y estado visual resultante. '
  'El estado actual se obtiene tomando el evento más reciente por diente '
  '(ORDER BY recorded_at DESC). '
  'FK compuesta (clinical_record_id, salon_id) garantiza integridad multi-tenant. '
  'Aplicada en 20260731120000_odontogram_findings.sql.';

comment on column public.odontogram_findings.id is
  'Identificador único del evento clínico (UUID v4).';

comment on column public.odontogram_findings.clinical_record_id is
  'Primera columna de la FK compuesta → clinical_records(customer_id, salon_id). '
  'Identifica la ficha clínica del paciente.';

comment on column public.odontogram_findings.salon_id is
  'Tenant propietario. Segunda columna de la FK compuesta para aislamiento '
  'multi-tenant a nivel de base de datos. Permite filtros RLS eficientes.';

comment on column public.odontogram_findings.fdi_tooth is
  'Número FDI (ISO 3950) del diente afectado. '
  'Permanentes: 11-18, 21-28, 31-38, 41-48. '
  'Temporales: 51-55, 61-65, 71-75, 81-85. '
  'Validado por odontogram_findings_fdi_valid.';

comment on column public.odontogram_findings.surfaces is
  'Superficies del diente afectadas por el hallazgo. '
  'Subconjunto de: mesial, distal, vestibular, palatino, lingual, incisal, oclusal. '
  'Array vacío = hallazgo aplica al diente completo (ej. extracción, implante). '
  'Validado por odontogram_findings_surfaces_valid.';

comment on column public.odontogram_findings.finding_type is
  'Tipo de hallazgo clínico o procedimiento realizado '
  '(caries, obturacion, endodoncia, corona, implante, extraccion, etc.).';

comment on column public.odontogram_findings.tooth_state is
  'Estado visual del diente en el odontograma tras este evento. '
  'Espeja ToothState de src/lib/dental/color.ts: '
  'sano · pendiente · hecho · en_curso · ausente · corona · implante.';

comment on column public.odontogram_findings.notes is
  'Observaciones clínicas adicionales del profesional (texto libre).';

comment on column public.odontogram_findings.recorded_by is
  'UUID del profesional que registró el hallazgo. '
  'SET NULL si el usuario es eliminado de auth.users (RGPD).';

comment on column public.odontogram_findings.recorded_at is
  'Momento clínico del hallazgo (puede ser retroactivo). '
  'Usado para reconstruir el estado actual del odontograma (ORDER BY DESC).';

comment on column public.odontogram_findings.created_at is
  'Timestamp de inserción en base de datos (trazabilidad técnica). '
  'Puede diferir de recorded_at en registros históricos.';

-- ------------------------------------------------------------------------------
-- RLS — patrón estándar del proyecto:
--   SELECT: cualquier miembro autenticado del salón (app.user_salon_ids())
--   INSERT: solo owner o manager (app.has_salon_role)
--   UPDATE: sin política → denegado para roles autenticados (deny-by-default + trigger)
--   DELETE: sin política → denegado para roles autenticados (deny-by-default)
--   Cascade/service_role bypasan RLS por diseño de Supabase.
-- ------------------------------------------------------------------------------
alter table public.odontogram_findings enable row level security;

create policy "members_select_odontogram_findings"
  on public.odontogram_findings for select to authenticated
  using (salon_id in (select app.user_salon_ids()));

create policy "managers_insert_odontogram_findings"
  on public.odontogram_findings for insert to authenticated
  with check (app.has_salon_role(salon_id, array['owner','manager']::public.member_role[]));

-- ------------------------------------------------------------------------------
-- Guardián de aislamiento (defensa en profundidad — patrón 20260718110000)
-- Verifica invariantes de seguridad multi-tenant al aplicar la migración.
-- Si alguna comprobación falla, la transacción aborta íntegramente.
-- ------------------------------------------------------------------------------
do $guard$
declare
  _t   constant text := 'odontogram_findings';
  _cnt integer;
  _pol record;
begin
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

  -- (b) Política SELECT acotada por app.user_salon_ids().
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

  -- (c) Ninguna política expuesta a anon/public.
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

  -- (d) Toda política de escritura (INSERT/UPDATE/DELETE) está anclada en
  --     app.has_salon_role. Si alguna la pierde, aborta ruidosamente.
  for _pol in
    select policyname, cmd, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and tablename  = _t
      and cmd in ('INSERT', 'UPDATE', 'DELETE')
  loop
    if coalesce(_pol.qual, '') || coalesce(_pol.with_check, '') not like '%has_salon_role%' then
      raise exception
        'GUARDIÁN RLS: la política de escritura %.% (%) no exige app.has_salon_role (escritura no restringida a owner/manager)',
        _t, _pol.policyname, _pol.cmd
        using errcode = 'raise_exception';
    end if;
  end loop;

  -- (e) FK compuesta hacia clinical_records existe y referencia
  --     (clinical_record_id, salon_id).
  select count(*) into _cnt
  from information_schema.referential_constraints rc
  join information_schema.key_column_usage kcu
    on kcu.constraint_name = rc.constraint_name
   and kcu.constraint_schema = rc.constraint_schema
  where rc.constraint_schema = 'public'
    and rc.constraint_name = 'odontogram_findings_record_salon_fkey'
    and kcu.column_name in ('clinical_record_id', 'salon_id');
  if _cnt <> 2 then
    raise exception
      'GUARDIÁN: FK compuesta odontogram_findings_record_salon_fkey no tiene exactamente 2 columnas (clinical_record_id, salon_id) — integridad multi-tenant comprometida'
      using errcode = 'raise_exception';
  end if;

  -- (f) Trigger append-only activo (UPDATE bloqueado).
  select count(*) into _cnt
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = _t
    and t.tgname  = 'trg_odontogram_findings_no_update'
    and t.tgenabled <> 'D';
  if _cnt = 0 then
    raise exception
      'GUARDIÁN: trigger trg_odontogram_findings_no_update no existe o está desactivado en public.% — la tabla no está protegida contra UPDATE', _t
      using errcode = 'raise_exception';
  end if;

  -- (g) UNIQUE de apoyo en clinical_records existe (necesario para la FK compuesta).
  select count(*) into _cnt
  from pg_constraint c
  join pg_class cl on cl.oid = c.conrelid
  join pg_namespace n on n.oid = cl.relnamespace
  where n.nspname = 'public'
    and cl.relname = 'clinical_records'
    and c.conname  = 'clinical_records_customer_id_salon_key'
    and c.contype  = 'u';
  if _cnt = 0 then
    raise exception
      'GUARDIÁN: UNIQUE constraint clinical_records_customer_id_salon_key no existe en public.clinical_records — la FK compuesta multi-tenant de odontogram_findings no puede ser establecida'
      using errcode = 'raise_exception';
  end if;

  raise notice 'GUARDIÁN: aislamiento multi-tenant, RLS, FK compuesta y trigger append-only verificados en public.%.', _t;
end;
$guard$;

commit;
