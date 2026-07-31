-- =============================================================================
-- salon-os — Migración: notas de visita (public.visit_notes)
--
-- RELACIÓN 1:1 con visits: visit_id es a la vez PK y parte del FK compuesto.
-- Como máximo una nota clínica por visita.
--
-- FK COMPUESTA (visit_id, salon_id) → visits(id, salon_id) hereda el patrón
-- de integridad multi-tenant de 20260712120000_tenant_integrity.sql. Para
-- ello se añade primero la UNIQUE constraint visits_id_salon_key a la tabla
-- visits (mismo hardening que se aplicó a customers, professionals, services
-- y appointments en esa migración; id ya es PK, el par es trivialmente único
-- pero Postgres exige un UNIQUE explícito para poder referenciarlo desde una FK).
--
-- INMUTABILIDAD: cuando signed = TRUE la fila se convierte en registro clínico
-- firmado e inamovible. El trigger BEFORE UPDATE OR DELETE
-- app.guard_visit_note_immutability() lanza una excepción (restrict_violation)
-- si se intenta modificar o borrar una nota ya firmada, bloqueando la operación
-- incluso antes de que llegue al motor de almacenamiento.
--   · UPDATE con old.signed = TRUE       → excepción (modificación denegada)
--   · DELETE con old.signed = TRUE       → excepción (eliminación denegada)
--   · UPDATE signed: TRUE → FALSE        → excepción (no se puede desmarcar firma)
--   · UPDATE signed: FALSE → TRUE        → permitido; signed_at se auto-establece
--                                          si el caller no lo provee
-- El trigger NO distingue entre roles: ni siquiera service_role puede sortear
-- la inmutabilidad en tiempo de ejecución normal. Para correcciones de producción
-- se requiere un superusuario con ALTER TABLE … DISABLE TRIGGER.
--
-- RLS (defensa en profundidad sobre el trigger):
--   SELECT:   cualquier miembro autenticado del salón (app.user_salon_ids())
--   INSERT:   owner o manager (app.has_salon_role)
--   UPDATE:   owner o manager Y old.signed = FALSE (la RLS silencia antes de
--             llegar al trigger para usuarios de app; el trigger protege
--             el acceso de service_role que bypasa RLS)
--   DELETE:   owner o manager Y old.signed = FALSE (ídem)
--   Deny-by-default: nada expuesto a anon/public.
--   service_role bypasa RLS por diseño (Supabase), pero NO el trigger.
--
-- SECTOR-AGNÓSTICA: campo content (texto libre) + extensión jsonb data para
-- información sector-específica:
--   peluqueria:   fórmula utilizada, tiempo de procesado, observaciones
--   odontologia:  códigos FDI de dientes tratados, procedimiento, anestesia,
--                 materiales, instrucciones de seguimiento
--   restauracion: plato, alérgenos detectados, observaciones dietéticas
--
-- APLICACIÓN VÍA MANAGEMENT API:
--   POST /v1/projects/{project-ref}/database/migrations
--   Authorization: Bearer <service_role_key>
--   Content-Type: application/sql
--   Body: <contenido de este archivo>
-- =============================================================================

begin;

-- ------------------------------------------------------------------------------
-- Paso 0: UNIQUE compuesta sobre visits para poder anclar el FK compuesto.
-- El par (id, salon_id) es trivialmente único (id es PK), pero Postgres exige
-- un UNIQUE explícito para poder referenciarlo desde una FK compuesta.
-- Sigue el patrón de 20260712120000_tenant_integrity.sql donde se añadieron
-- customers_id_salon_key, professionals_id_salon_key, services_id_salon_key
-- y appointments_id_salon_key con el mismo objetivo.
-- ------------------------------------------------------------------------------
alter table public.visits
  add constraint visits_id_salon_key unique (id, salon_id);

-- ------------------------------------------------------------------------------
-- visit_notes — nota clínica de la visita, 1:1 con visits
-- ------------------------------------------------------------------------------
create table public.visit_notes (
  -- PK = primera columna del FK compuesto. Impone la relación 1:1 (como mucho
  -- una nota clínica por visita). La PK ya indexa visit_id; no se añade índice extra.
  visit_id         uuid         not null,

  -- salon_id NOT NULL: requerido para el FK compuesto de integridad multi-tenant
  -- y para el filtrado en RLS (app.user_salon_ids() / app.has_salon_role()).
  -- No se añade FK simple salon_id → salons(id): el FK compuesto ya fuerza
  -- la coherencia de tenant a través de visits.
  salon_id         uuid         not null,

  -- ------------------------------------------------------------------
  -- Contenido de la nota clínica
  -- ------------------------------------------------------------------

  -- Texto principal de la nota (observaciones del profesional, evolución del
  -- tratamiento, indicaciones de seguimiento para la próxima visita).
  -- Vacío por defecto; la app DEBE exigir contenido antes de firmar.
  content          text         not null default '',

  -- Extensión sector-específica en JSONB (tipado y validado en capa de app):
  --   peluqueria:   { "formula_used": "...", "processing_time_min": 40,
  --                   "observations": "..." }
  --   odontologia:  { "tooth_codes": ["18","17"], "procedure": "...",
  --                   "anesthesia": "...", "materials": [...],
  --                   "follow_up": "..." }
  --   restauracion: { "dish": "...", "allergen_flags": [...],
  --                   "diet_notes": "..." }
  data             jsonb        not null default '{}',

  -- ------------------------------------------------------------------
  -- Inmutabilidad / firma clínica
  -- ------------------------------------------------------------------

  -- Marca de firmado. Cuando pasa a TRUE la fila es inamovible:
  -- el trigger trg_visit_notes_immutable bloquea UPDATE y DELETE.
  signed           boolean      not null default false,

  -- Timestamp de la firma clínica. NULL si la nota aún no está firmada.
  -- El trigger auto-establece now() si el caller no lo provee al firmar.
  signed_at        timestamptz,

  -- Profesional que firmó la nota.
  -- SET NULL si el usuario es eliminado de auth.users (RGPD: derecho de supresión);
  -- la nota firmada se conserva con signed_by = NULL.
  signed_by        uuid references auth.users (id) on delete set null,

  -- ------------------------------------------------------------------
  -- Auditoría
  -- ------------------------------------------------------------------

  -- Staff que creó la nota (auditoría).
  -- SET NULL si el usuario es eliminado de auth.users (RGPD).
  created_by       uuid references auth.users (id) on delete set null,

  created_at       timestamptz  not null default now(),
  updated_at       timestamptz  not null default now(),

  -- PK sobre visit_id: unicidad 1:1 con visits (una nota por visita).
  primary key (visit_id),

  -- FK compuesta: garantiza que (visit_id, salon_id) pertenecen al mismo tenant.
  -- Usa visits_id_salon_key añadida en el Paso 0 de esta migración.
  -- CASCADE: al borrar la visita su nota desaparece con ella.
  --
  -- NOTA DE DISEÑO — CASCADE y trigger de inmutabilidad:
  -- Un DELETE en CASCADE iniciado desde public.visits NO pasa por el trigger
  -- BEFORE DELETE de visit_notes en PostgreSQL (el motor borra las filas hijas
  -- directamente, sin invocar los triggers del usuario en la propagación
  -- referencial). Si se requiere bloquear el borrado de visitas que tienen
  -- notas firmadas, se debe añadir un trigger BEFORE DELETE en public.visits
  -- que compruebe la existencia de notas firmadas — no incluido en esta
  -- migración por estar fuera del alcance acordado.
  constraint visit_notes_visit_salon_fkey
    foreign key (visit_id, salon_id)
    references public.visits (id, salon_id)
    on delete cascade
);

-- Índice sobre salon_id: acelera consultas de «todas las notas del salón» y
-- las políticas RLS que filtran por salon_id (la PK indexa solo visit_id).
create index idx_visit_notes_salon
  on public.visit_notes (salon_id);

-- Índice parcial sobre notas firmadas + salon_id: optimiza auditorías de
-- registros clínicos firmados por salón.
create index idx_visit_notes_signed
  on public.visit_notes (salon_id, signed_at desc)
  where signed;

-- ------------------------------------------------------------------------------
-- Comentarios de tabla y columnas
-- ------------------------------------------------------------------------------
comment on table public.visit_notes is
  'Nota clínica de la visita: 1:1 con visits (visit_id es PK y parte de la FK '
  'compuesta). Cuando signed = TRUE la fila es inamovible (trigger BEFORE UPDATE/DELETE '
  'app.guard_visit_note_immutability()). Sector-agnóstica: campo content + '
  'extensión jsonb ''data'' para peluquería, odontología o restauración. '
  'Aplicada en 20260731120000_visit_notes.sql.';

comment on column public.visit_notes.visit_id is
  'PK y primera columna de la FK compuesta → visits(id, salon_id). '
  'Garantiza la relación 1:1 (como mucho una nota clínica por visita).';

comment on column public.visit_notes.salon_id is
  'Tenant propietario. NOT NULL; segunda columna de la FK compuesta para '
  'integridad multi-tenant (patrón 20260712120000_tenant_integrity.sql). '
  'Permite filtros RLS eficientes vía idx_visit_notes_salon.';

comment on column public.visit_notes.content is
  'Texto principal de la nota clínica (observaciones, evolución, seguimiento). '
  'Vacío por defecto; la app debe exigir contenido antes de firmar.';

comment on column public.visit_notes.data is
  'Extensión sector-específica en JSONB. '
  'peluqueria: fórmula utilizada, tiempo de procesado, observaciones capilares. '
  'odontologia: códigos FDI de dientes, procedimiento, anestesia, materiales, seguimiento. '
  'restauracion: plato, alérgenos detectados, observaciones dietéticas.';

comment on column public.visit_notes.signed is
  'TRUE cuando la nota ha sido firmada por el profesional y es inamovible. '
  'El trigger trg_visit_notes_immutable bloquea todo UPDATE o DELETE mientras sea TRUE. '
  'El campo no puede pasar de TRUE a FALSE (la firma es irreversible).';

comment on column public.visit_notes.signed_at is
  'Timestamp de la firma clínica. NULL si la nota no está firmada. '
  'El trigger auto-establece now() si no se provee al firmar (signed: FALSE → TRUE).';

comment on column public.visit_notes.signed_by is
  'UUID del profesional que firmó la nota. SET NULL si el usuario es eliminado '
  'de auth.users (RGPD: derecho de supresión); la nota firmada se conserva.';

comment on column public.visit_notes.created_by is
  'UUID del staff que creó la nota (auditoría). SET NULL si el usuario es '
  'eliminado de auth.users (RGPD).';

-- ------------------------------------------------------------------------------
-- Inmutabilidad — trigger BEFORE UPDATE OR DELETE cuando signed = TRUE
--
-- SECURITY INVOKER (default): la función no necesita privilegios especiales;
-- únicamente lee OLD, opcionalmente modifica NEW.signed_at y lanza excepciones.
-- set search_path = '' previene ataques de search_path injection.
--
-- Lógica por operación:
--   DELETE y old.signed = TRUE
--     → restrict_violation (eliminación denegada)
--   UPDATE y old.signed = TRUE
--     → restrict_violation (modificación denegada; la nota ya está firmada)
--   UPDATE y new.signed = FALSE cuando old.signed = TRUE
--     → restrict_violation (la firma es irreversible)
--   UPDATE y signed: FALSE → TRUE
--     → auto-establece signed_at = now() si es NULL, devuelve new
--   Cualquier otro UPDATE (old.signed = FALSE, new.signed = FALSE)
--     → devuelve new sin acción adicional
--
-- Orden de triggers BEFORE UPDATE en esta tabla (Postgres: orden alfabético):
--   1. trg_visit_notes_immutable  ("i" < "u")  ← ejecuta primero
--   2. trg_visit_notes_updated_at
-- Si immutability lanza excepción, updated_at nunca llega a ejecutarse. ✓
-- ------------------------------------------------------------------------------
create or replace function app.guard_visit_note_immutability()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- ------------------------------------------------------------------ DELETE --
  if tg_op = 'DELETE' then
    if old.signed then
      raise exception
        'visit_notes: la nota de la visita % está firmada (signed = TRUE) y es '
        'inamovible — eliminación denegada. Para correcciones de producción se '
        'requiere superusuario con ALTER TABLE … DISABLE TRIGGER.',
        old.visit_id
        using errcode = 'restrict_violation';
    end if;
    return old;
  end if;

  -- ------------------------------------------------------------------ UPDATE --

  -- Bloquear si la nota YA estaba firmada (ninguna modificación permitida).
  if old.signed then
    raise exception
      'visit_notes: la nota de la visita % está firmada (signed = TRUE) y es '
      'inamovible — modificación denegada. Para correcciones de producción se '
      'requiere superusuario con ALTER TABLE … DISABLE TRIGGER.',
      old.visit_id
      using errcode = 'restrict_violation';
  end if;

  -- Bloquear el intento de desmarcar la firma (signed = TRUE → FALSE).
  -- La firma es irreversible: una vez firmada, no se puede "desfirmar".
  if (old.signed is distinct from new.signed) and (not new.signed) then
    raise exception
      'visit_notes: la firma de la nota de la visita % es irreversible — '
      'signed no puede pasar de TRUE a FALSE.',
      old.visit_id
      using errcode = 'restrict_violation';
  end if;

  -- Al firmar (signed: FALSE → TRUE), auto-establecer signed_at si no viene
  -- ya provisto por el caller. La app puede enviar un timestamp explícito
  -- (p.ej. hora en que el profesional aprobó offline).
  if new.signed and not old.signed then
    new.signed_at = coalesce(new.signed_at, now());
  end if;

  return new;
end;
$$;

-- El trigger BEFORE garantiza que la operación no llega al motor de almacenamiento.
create trigger trg_visit_notes_immutable
  before update or delete on public.visit_notes
  for each row execute function app.guard_visit_note_immutability();

-- ------------------------------------------------------------------------------
-- updated_at automático (función compartida app.set_updated_at, esquema inicial)
-- ------------------------------------------------------------------------------
create trigger trg_visit_notes_updated_at
  before update on public.visit_notes
  for each row execute function app.set_updated_at();

-- ------------------------------------------------------------------------------
-- RLS — patrón estándar del proyecto (defensa en profundidad sobre el trigger):
--   SELECT:   cualquier miembro autenticado del salón (app.user_salon_ids())
--   INSERT:   owner o manager (app.has_salon_role)
--   UPDATE:   owner o manager Y old.signed = FALSE
--             (USING filtra por old row: filas con signed = TRUE son invisibles
--              para UPDATE desde la app → 0 rows affected, sin error. El trigger
--              bloquea explícitamente el caso de service_role que bypasa RLS.)
--   DELETE:   owner o manager Y old.signed = FALSE (ídem)
--   Deny-by-default: nada expuesto a anon/public.
--   service_role bypasa RLS (Supabase) pero NO el trigger.
-- ------------------------------------------------------------------------------
alter table public.visit_notes enable row level security;

create policy "members_select_visit_notes"
  on public.visit_notes for select to authenticated
  using (salon_id in (select app.user_salon_ids()));

create policy "managers_insert_visit_notes"
  on public.visit_notes for insert to authenticated
  with check (app.has_salon_role(salon_id, array['owner','manager']::public.member_role[]));

-- USING (old row): solo notas no firmadas son visibles para UPDATE.
-- WITH CHECK (new row): solo valida rol; permite que el caller establezca signed = TRUE.
create policy "managers_update_unsigned_visit_notes"
  on public.visit_notes for update to authenticated
  using  (
    app.has_salon_role(salon_id, array['owner','manager']::public.member_role[])
    and not signed
  )
  with check (
    app.has_salon_role(salon_id, array['owner','manager']::public.member_role[])
  );

create policy "managers_delete_unsigned_visit_notes"
  on public.visit_notes for delete to authenticated
  using (
    app.has_salon_role(salon_id, array['owner','manager']::public.member_role[])
    and not signed
  );

-- ------------------------------------------------------------------------------
-- Guardián de aislamiento (defensa en profundidad — patrón 20260718110000)
-- Verifica que los invariantes de seguridad multi-tenant se cumplen en el momento
-- de aplicar la migración. Si alguna comprobación falla, la transacción aborta.
-- ------------------------------------------------------------------------------
do $guard$
declare
  _t   constant text := 'visit_notes';
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

  -- (e) FK compuesta hacia visits existe y referencia (visit_id, salon_id).
  select count(*) into _cnt
  from information_schema.referential_constraints rc
  join information_schema.key_column_usage kcu
    on kcu.constraint_name = rc.constraint_name
   and kcu.constraint_schema = rc.constraint_schema
  where rc.constraint_schema = 'public'
    and rc.constraint_name   = 'visit_notes_visit_salon_fkey'
    and kcu.column_name in ('visit_id', 'salon_id');
  if _cnt <> 2 then
    raise exception
      'GUARDIÁN: FK compuesta visit_notes_visit_salon_fkey no tiene exactamente 2 columnas '
      '(visit_id, salon_id) — integridad multi-tenant comprometida'
      using errcode = 'raise_exception';
  end if;

  -- (f) UNIQUE visits_id_salon_key existe sobre visits.
  select count(*) into _cnt
  from pg_indexes
  where schemaname = 'public'
    and tablename  = 'visits'
    and indexname  = 'visits_id_salon_key';
  if _cnt = 0 then
    raise exception
      'GUARDIÁN: la UNIQUE constraint visits_id_salon_key no existe en public.visits — '
      'la FK compuesta de visit_notes no puede ser válida'
      using errcode = 'raise_exception';
  end if;

  -- (g) El trigger de inmutabilidad existe y está habilitado.
  select count(*) into _cnt
  from pg_trigger
  where tgname    = 'trg_visit_notes_immutable'
    and tgenabled <> 'D';  -- 'D' = DISABLED
  if _cnt = 0 then
    raise exception
      'GUARDIÁN: el trigger trg_visit_notes_immutable no existe o está deshabilitado — '
      'notas firmadas no protegidas ante UPDATE/DELETE'
      using errcode = 'raise_exception';
  end if;

  raise notice
    'GUARDIÁN: aislamiento multi-tenant, RLS, FK compuesta, UNIQUE en visits '
    'y trigger de inmutabilidad verificados en public.%.', _t;
end;
$guard$;

commit;
