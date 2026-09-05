-- =============================================================================
-- salon-os — Migración: ficha clínica del cliente (public.clinical_records)
--
-- RELACIÓN 1:1 con customers: customer_id es a la vez PK y parte del FK
-- compuesto. La PK garantiza como máximo una ficha por cliente; CASCADE en
-- borrado de cliente (la ficha es un dato personal del titular).
--
-- FK COMPUESTA (customer_id, salon_id) → customers(id, salon_id) hereda el
-- patrón de integridad multi-tenant de 20260712120000_tenant_integrity.sql,
-- apoyándose en la UNIQUE constraint customers_id_salon_key. Garantiza que
-- la ficha y el cliente pertenecen siempre al mismo tenant sin depender de RLS.
--
-- salon_id NOT NULL: permite filtrar todas las fichas del salón vía índice
-- explícito idx_clinical_records_salon y anclar las políticas RLS al patrón
-- estándar del proyecto (app.user_salon_ids() / app.has_salon_role()).
--
-- RGPD ART. 9 — Datos de categoría especial (alergias, antecedentes médicos):
-- El campo consent_signed_at documenta el consentimiento informado explícito
-- del interesado; la app debe verificarlo antes de mostrar datos sensibles.
--
-- SECTOR-AGNÓSTICA: campos comunes (alergias, contraindicaciones, medicaciones,
-- notas) + extensión jsonb 'data' para información sector-específica:
--   peluqueria   → historial de color, test de sensibilidad, tipo capilar
--   odontologia  → odontograma, anestesia, última radiografía, medicación relevante
--   restauracion → alérgenos EU (Reglamento 1169/2011), intolerancias alimentarias
--
-- RLS: lectura para cualquier miembro del salón; escritura (INSERT/UPDATE/DELETE)
-- restringida a owner/manager (patrón salon_branding / salon_sector). El guardián
-- de aislamiento verifica el invariante al aplicar la migración.
--
-- APLICACIÓN VÍA MANAGEMENT API:
--   POST /v1/projects/{project-ref}/database/migrations
--   Authorization: Bearer <service_role_key>
--   Content-Type: application/sql
--   Body: <contenido de este archivo>
-- =============================================================================

begin;

-- ------------------------------------------------------------------------------
-- clinical_records — ficha clínica del cliente, 1:1 con customers
-- ------------------------------------------------------------------------------
create table public.clinical_records (
  -- PK = primera columna del FK compuesto. Impone la relación 1:1 (como mucho
  -- una ficha por cliente). La PK ya indexa customer_id; no se añade índice extra.
  customer_id            uuid         not null,

  -- salon_id NOT NULL: requerido para el FK compuesto de integridad multi-tenant
  -- y para el filtrado en RLS (app.user_salon_ids() / app.has_salon_role()).
  -- NO se añade FK simple salon_id → salons(id) porque el FK compuesto ya fuerza
  -- la coherencia de tenant a través de customers.
  salon_id               uuid         not null,

  -- ------------------------------------------------------------------
  -- Datos clínicos comunes a todos los sectores
  -- ------------------------------------------------------------------

  -- Alérgenos conocidos (p. ej. PPD, parafenilendiamina, látex, mariscos).
  -- Array vacío = «sin alergias documentadas» (diferente de NULL = «no preguntado»).
  allergies              text[]       not null default '{}',

  -- Contraindicaciones absolutas para tratamientos (embarazo, psoriasis activa,
  -- anticoagulación, etc.).
  contraindications      text[]       not null default '{}',

  -- Clasificación del tipo de piel/cabello en texto libre.
  -- Relevante principalmente para peluquería y estética.
  skin_hair_type         text,

  -- Medicación habitual (especialmente relevante en odontología:
  -- anticoagulantes, bifosfonatos, antihipertensivos...).
  medications            text[]       not null default '{}',

  -- Notas clínicas de contexto general para el profesional (historial
  -- relevante no capturado en los campos anteriores).
  medical_notes          text,

  -- ------------------------------------------------------------------
  -- Extensión sector-específica (jsonb libre, tipado en la capa de app)
  -- ------------------------------------------------------------------
  -- peluqueria:   { "hair_color_history": [...], "last_color": "...",
  --                 "sensitivity_test_at": "...", "scalp_condition": "..." }
  -- odontologia:  { "last_xray_at": "...", "tooth_map": {...},
  --                 "anesthesia_type": "...", "anesthesia_notes": "..." }
  -- restauracion: { "eu_allergens": ["gluten","crustaceos",...],
  --                 "intolerances": [...], "diet_notes": "..." }
  data                   jsonb        not null default '{}',

  -- ------------------------------------------------------------------
  -- Consentimiento informado RGPD Art. 9
  -- ------------------------------------------------------------------

  -- Fecha y hora en que el cliente firmó el consentimiento explícito para
  -- el tratamiento de datos de categoría especial. NULL = no obtenido todavía.
  -- La app DEBE verificar este campo antes de mostrar o registrar datos sensibles.
  consent_signed_at      timestamptz,

  -- Versión del formulario de consentimiento firmado (trazabilidad legal).
  -- Permite detectar si el cliente firmó una versión obsoleta del documento.
  consent_version        varchar(20),

  -- ------------------------------------------------------------------
  -- Auditoría
  -- ------------------------------------------------------------------

  -- Staff que realizó la última modificación. Anulable: si el usuario
  -- es eliminado de auth.users (RGPD: derecho de supresión) la referencia
  -- se anula en lugar de borrar la ficha clínica.
  last_updated_by        uuid references auth.users(id) on delete set null,

  created_at             timestamptz  not null default now(),
  updated_at             timestamptz  not null default now(),

  -- PK sobre customer_id solo: unicidad 1:1 con customers (una ficha por cliente).
  primary key (customer_id),

  -- FK compuesta: garantiza que (customer_id, salon_id) pertenecen al mismo tenant.
  -- Usa la UNIQUE constraint customers_id_salon_key añadida en
  -- 20260712120000_tenant_integrity.sql. CASCADE: al borrar al cliente
  -- (titular), su ficha clínica desaparece con él.
  constraint clinical_records_customer_salon_fkey
    foreign key (customer_id, salon_id)
    references public.customers (id, salon_id)
    on delete cascade
);

-- Índice explícito sobre salon_id: acelera consultas de «todas las fichas
-- del salón» y las políticas RLS que filtran por salon_id (la PK solo indexa
-- customer_id y no sería usada para ese patrón de acceso).
create index idx_clinical_records_salon
  on public.clinical_records (salon_id);

-- ------------------------------------------------------------------------------
-- Comentarios de tabla y columnas
-- ------------------------------------------------------------------------------
comment on table public.clinical_records is
  'Ficha clínica del cliente: 1:1 con customers (customer_id es PK y parte de la FK '
  'compuesta). Contiene datos de categoría especial RGPD Art. 9; el campo '
  'consent_signed_at es requisito legal antes de mostrar o registrar datos sensibles. '
  'Sector-agnóstica: campos comunes + extensión jsonb ''data'' para información '
  'específica de peluquería, odontología o restauración. Aplicada en '
  '20260731110000_clinical_records.sql.';

comment on column public.clinical_records.customer_id is
  'PK y primera columna de la FK compuesta → customers(id, salon_id). '
  'Garantiza la relación 1:1 (como mucho una ficha clínica por cliente).';

comment on column public.clinical_records.salon_id is
  'Tenant propietario. NOT NULL; segunda columna de la FK compuesta para '
  'integridad multi-tenant (patrón 20260712120000_tenant_integrity.sql). '
  'Permite filtros RLS eficientes vía idx_clinical_records_salon.';

comment on column public.clinical_records.allergies is
  'Lista de alérgenos conocidos del cliente (p. ej. PPD, látex, gluten). '
  'Vacío = ninguno documentado; NULL no se usa para esta columna.';

comment on column public.clinical_records.contraindications is
  'Contraindicaciones absolutas para tratamientos (embarazo, dermatitis activa, '
  'anticoagulación, etc.).';

comment on column public.clinical_records.skin_hair_type is
  'Clasificación de tipo de piel/cabello en texto libre. '
  'Relevante principalmente para peluquería y estética.';

comment on column public.clinical_records.medications is
  'Medicación habitual del cliente. Especialmente relevante en odontología '
  '(anticoagulantes, bifosfonatos, antihipertensivos...).';

comment on column public.clinical_records.medical_notes is
  'Notas clínicas de contexto general para el profesional.';

comment on column public.clinical_records.data is
  'Extensión sector-específica en JSONB. '
  'peluqueria: historial de coloración, test de sensibilidad, condición del cuero '
  'cabelludo. odontologia: odontograma, tipo y notas de anestesia, última radiografía. '
  'restauracion: alérgenos EU (Reglamento 1169/2011), intolerancias alimentarias.';

comment on column public.clinical_records.consent_signed_at is
  'Timestamp de firma del consentimiento informado RGPD Art. 9 (datos de categoría '
  'especial). NULL = no obtenido. La app DEBE verificarlo antes de mostrar/registrar '
  'datos sensibles.';

comment on column public.clinical_records.consent_version is
  'Versión del formulario de consentimiento firmado (trazabilidad legal). '
  'Permite detectar si el cliente firmó una versión obsoleta.';

comment on column public.clinical_records.last_updated_by is
  'UUID del profesional/staff que realizó la última modificación (auditoría). '
  'SET NULL si el usuario es eliminado de auth.users (RGPD).';

-- ------------------------------------------------------------------------------
-- updated_at automático (mismo trigger compartido que el resto de tablas mutables)
-- ------------------------------------------------------------------------------
create trigger trg_clinical_records_updated_at
  before update on public.clinical_records
  for each row execute function app.set_updated_at();

-- ------------------------------------------------------------------------------
-- RLS — patrón estándar del proyecto:
--   SELECT: cualquier miembro autenticado del salón (app.user_salon_ids())
--   INSERT/UPDATE/DELETE: solo owner o manager (app.has_salon_role)
--   Deny-by-default: nada expuesto a anon/public.
--   Escritura de service_role (backoffice HAT3X) bypasa RLS por diseño.
-- ------------------------------------------------------------------------------
alter table public.clinical_records enable row level security;

create policy "members_select_clinical_records"
  on public.clinical_records for select to authenticated
  using (salon_id in (select app.user_salon_ids()));

create policy "managers_insert_clinical_records"
  on public.clinical_records for insert to authenticated
  with check (app.has_salon_role(salon_id, array['owner','manager']::public.member_role[]));

create policy "managers_update_clinical_records"
  on public.clinical_records for update to authenticated
  using  (app.has_salon_role(salon_id, array['owner','manager']::public.member_role[]))
  with check (app.has_salon_role(salon_id, array['owner','manager']::public.member_role[]));

create policy "managers_delete_clinical_records"
  on public.clinical_records for delete to authenticated
  using (app.has_salon_role(salon_id, array['owner','manager']::public.member_role[]));

-- ------------------------------------------------------------------------------
-- Guardián de aislamiento (defensa en profundidad — patrón 20260718110000)
-- Verifica que los invariantes de seguridad multi-tenant se cumplen en el momento
-- de aplicar la migración. Si alguna comprobación falla, la transacción aborta.
-- ------------------------------------------------------------------------------
do $guard$
declare
  _t   constant text := 'clinical_records';
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

  -- (d) Toda política de escritura (INSERT/UPDATE/DELETE) está anclada en
  --     app.has_salon_role (owner/manager). Si alguna la pierde, aborta ruidosamente.
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

  -- (e) FK compuesta hacia customers existe y referencia (customer_id, salon_id).
  select count(*) into _cnt
  from information_schema.referential_constraints rc
  join information_schema.key_column_usage kcu
    on kcu.constraint_name = rc.constraint_name
   and kcu.constraint_schema = rc.constraint_schema
  where rc.constraint_schema = 'public'
    and rc.constraint_name = 'clinical_records_customer_salon_fkey'
    and kcu.column_name in ('customer_id', 'salon_id');
  if _cnt <> 2 then
    raise exception
      'GUARDIÁN: FK compuesta clinical_records_customer_salon_fkey no tiene exactamente 2 columnas (customer_id, salon_id) — integridad multi-tenant comprometida'
      using errcode = 'raise_exception';
  end if;

  raise notice 'GUARDIÁN: aislamiento multi-tenant, RLS y FK compuesta verificados en public.%.', _t;
end;
$guard$;

commit;
