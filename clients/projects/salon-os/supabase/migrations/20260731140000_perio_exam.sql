-- =============================================================================
-- salon-os — Migración: exploración periodontal
-- (public.perio_exam, public.perio_tooth, public.perio_site)
--
-- MÓDULO PERIODONTAL — DISEÑO GENERAL:
-- Tres tablas forman la jerarquía de una exploración periodontal completa:
--
--   perio_exam  → cabecera de la exploración (datos globales + firma clínica)
--   perio_tooth → datos por diente (1:N desde perio_exam): movilidad, furca, placa
--   perio_site  → mediciones por sitio (6 sitios/diente, 1:N desde perio_tooth):
--                 PD, margen gingival, CAL (generado), BoP, supuración, placa
--
-- RELACIÓN CON clinical_records:
-- perio_exam se ancla mediante FK compuesta (customer_id, salon_id) →
-- clinical_records(customer_id, salon_id). Requiere la UNIQUE constraint
-- clinical_records_customer_id_salon_key añadida en 20260731120000_odontogram_findings.
-- El CASCADE propaga el borrado RGPD completo:
--   auth.users → customers → clinical_records → perio_exam → perio_tooth → perio_site
--
-- CAL (Clinical Attachment Level — Nivel de Inserción Clínica):
-- perio_site.cal_mm es una columna GENERATED ALWAYS AS STORED:
--   cal_mm = pd_mm - gingival_margin_mm
-- Convención de signo para gingival_margin_mm (respecto al CEJ):
--   positivo → hiperplasia gingival (margen coronal al CEJ) → CAL < PD
--   negativo → recesión gingival   (margen apical al CEJ)   → CAL > PD
--   cero     → margen al nivel del CEJ                      → CAL = PD
-- Rango: pd_mm [0,20], gingival_margin_mm [-15,10] → cal_mm [-15,35]
--
-- INMUTABILIDAD — defensa en profundidad en dos capas:
--
-- Capa 1 · perio_exam (firma):
--   trigger BEFORE UPDATE OR DELETE trg_perio_exam_immutable:
--     · old.signed = TRUE  → bloquea UPDATE y DELETE (restrict_violation)
--     · signed TRUE → FALSE → bloquea reversión de firma
--     · signed FALSE → TRUE → auto-establece signed_at = now() si NULL
--   Mismo patrón que visit_notes / app.guard_visit_note_immutability().
--
-- Capa 2 · perio_tooth + perio_site (guard de padre firmado):
--   trigger BEFORE INSERT OR UPDATE OR DELETE en cada tabla hija:
--     · Consulta perio_exam.signed del examen padre
--     · Si TRUE → bloquea la operación (restrict_violation)
--   Los triggers aplican a todos los roles, incluido service_role.
--   Para correcciones de producción: superusuario con ALTER TABLE … DISABLE TRIGGER.
--
-- NOTA DE DISEÑO — CASCADE vs. triggers de inmutabilidad:
-- En PostgreSQL, los DELETE en CASCADE desde la tabla padre NO activan los
-- triggers BEFORE DELETE de las tablas hija (la propagación referencial omite
-- los triggers de usuario). El borrado RGPD desde clinical_records propaga en
-- cascada sin activar los triggers de inmutabilidad. ✓
--
-- MULTI-TENANT — cross-tenant FK guard:
-- salon_id NOT NULL en las tres tablas.
-- FK compuestas (x_id, salon_id) garantizan aislamiento de tenant a nivel de
-- BD sin depender de RLS. Patrón idéntico a 20260712120000_tenant_integrity.sql.
-- UNIQUE constraints (id, salon_id) en perio_exam y perio_tooth permiten que
-- las tablas hija referencien el par de forma que Postgres lo acepte como FK.
--
-- RLS — SELECT + INSERT con gate dual (patrón 20260731130000):
--   SELECT:   cualquier miembro autenticado del salón (app.user_salon_ids())
--   INSERT:   owner/manager [app.has_salon_role] O staff dental
--             [app.has_salon_role + app.salon_is_sector='odontologia']
--   UPDATE:   owner/manager Y NOT signed (solo perio_exam)
--   DELETE:   owner/manager Y NOT signed (solo perio_exam)
--   perio_tooth / perio_site: sin políticas UPDATE/DELETE → deny-by-default
--     Los triggers de guard bloquean toda modificación directa cuando el
--     examen padre está firmado.
--   service_role bypasa RLS por diseño de Supabase, pero NO los triggers.
--
-- FDI (ISO 3950): mismo CHECK que odontogram_findings (52 dientes válidos).
-- SITIOS: 1=MV · 2=V · 3=DV · 4=MP/ML · 5=P/L · 6=DP/DL (estándar BSP/AAP).
-- MOVILIDAD: grados 0–3 según Miller (1985).
-- FURCACIÓN: clases 0–3 según Hamp et al. (1975).
--
-- APLICACIÓN VÍA MANAGEMENT API:
--   POST /v1/projects/{project-ref}/database/migrations
--   User-Agent: Mozilla/5.0
--   Authorization: Bearer <service_role_key>
--   Content-Type: application/sql
--   Body: <contenido de este archivo>
-- =============================================================================

begin;

-- ==============================================================================
-- 1. TABLA: perio_exam — cabecera de la exploración periodontal
-- ==============================================================================
create table public.perio_exam (

  id           uuid        not null default gen_random_uuid(),

  -- Tenant propietario. NOT NULL: requerido para FK compuesta multi-tenant y
  -- filtros RLS eficientes (app.user_salon_ids() / app.has_salon_role()).
  salon_id     uuid        not null,

  -- Paciente al que pertenece la exploración.
  -- Primera columna de la FK compuesta → clinical_records(customer_id, salon_id).
  customer_id  uuid        not null,

  -- Profesional que realizó la exploración periodontal.
  -- SET NULL si el usuario es eliminado de auth.users (RGPD: derecho de supresión).
  examiner_id  uuid        references auth.users(id) on delete set null,

  -- Observaciones globales de la exploración (diagnóstico periodontal, índice PSR,
  -- clasificación AAP 2017, plan de tratamiento inicial, etc.).
  notes        text,

  -- ─── Firma clínica ────────────────────────────────────────────────────────
  -- Cuando signed = TRUE la exploración y sus datos (perio_tooth, perio_site)
  -- son inamovibles. El trigger trg_perio_exam_immutable + los triggers de guard
  -- en tablas hija bloquean toda modificación posterior.
  signed       boolean     not null default false,

  -- Timestamp de firma. NULL si aún no está firmada.
  -- Auto-establecido a now() por el trigger al firmar si el caller no lo provee.
  signed_at    timestamptz,

  -- Profesional que firmó. SET NULL si el usuario es eliminado (RGPD).
  signed_by    uuid        references auth.users(id) on delete set null,

  -- ─── Auditoría ────────────────────────────────────────────────────────────
  created_by   uuid        references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  primary key (id),

  -- UNIQUE sobre (id, salon_id): necesario para que perio_tooth pueda referenciar
  -- el par en su FK compuesta. Postgres exige un UNIQUE explícito sobre el par
  -- referenciado (id es PK pero no incluye salon_id en su índice).
  constraint perio_exam_id_salon_key unique (id, salon_id),

  -- FK compuesta multi-tenant → clinical_records(customer_id, salon_id).
  -- Garantiza que la exploración pertenece al mismo tenant que la ficha clínica.
  -- Requiere clinical_records_customer_id_salon_key (añadida en
  -- 20260731120000_odontogram_findings.sql).
  -- CASCADE: el borrado RGPD del paciente elimina ficha → exploraciones en cascada.
  constraint perio_exam_customer_salon_fkey
    foreign key (customer_id, salon_id)
    references public.clinical_records (customer_id, salon_id)
    on delete cascade

);

-- Filtros RLS por salón y consultas de «todas las exploraciones del salón»
create index idx_perio_exam_salon
  on public.perio_exam (salon_id);

-- Todas las exploraciones de un paciente (cronología periodontal)
create index idx_perio_exam_customer
  on public.perio_exam (customer_id, created_at desc);

-- Exploraciones firmadas por salón (auditoría clínica)
create index idx_perio_exam_signed
  on public.perio_exam (salon_id, signed_at desc)
  where signed;

-- ==============================================================================
-- 2. TABLA: perio_tooth — datos periodontales por diente
-- ==============================================================================
create table public.perio_tooth (

  id         uuid     not null default gen_random_uuid(),

  -- Exploración periodontal a la que pertenece este diente.
  -- Primera columna de la FK compuesta → perio_exam(id, salon_id).
  exam_id    uuid     not null,

  -- Tenant propietario. Segunda columna de la FK compuesta multi-tenant.
  salon_id   uuid     not null,

  -- Número FDI (ISO 3950). Mismo catálogo y CHECK que odontogram_findings.
  -- Permanentes: 11-18 · 21-28 · 31-38 · 41-48
  -- Temporales:  51-55 · 61-65 · 71-75 · 81-85
  fdi_tooth  smallint not null,

  -- ─── Movilidad dental — grados Miller (1985) ─────────────────────────────
  -- 0 = fisiológica (< 0.2 mm horizontal)
  -- 1 = Grado I (0.2–1 mm horizontal)
  -- 2 = Grado II (> 1 mm horizontal)
  -- 3 = Grado III (> 1 mm horizontal y/o desplazamiento vertical)
  mobility   smallint not null default 0,

  -- ─── Afectación de furca — clases Hamp et al. (1975) ─────────────────────
  -- 0 = sin afectación de furca
  -- 1 = Clase I  (exploración horizontal < 3 mm, no atraviesa)
  -- 2 = Clase II (exploración horizontal > 3 mm, no traspasa)
  -- 3 = Clase III (traspasante de lado a lado)
  furcation  smallint not null default 0,

  -- Presencia de placa visible a nivel de diente (índice O'Leary o similar).
  plaque     boolean  not null default false,

  created_at timestamptz not null default now(),

  primary key (id),

  -- UNIQUE sobre (id, salon_id): necesario para que perio_site pueda referenciar
  -- el par (tooth_id, salon_id) en su FK compuesta.
  constraint perio_tooth_id_salon_key unique (id, salon_id),

  -- Un único registro por diente dentro de la misma exploración.
  -- Permite upsert por (exam_id, fdi_tooth) desde la app.
  constraint perio_tooth_exam_fdi_unique unique (exam_id, fdi_tooth),

  -- FK compuesta multi-tenant → perio_exam(id, salon_id).
  -- Garantiza aislamiento de tenant a nivel de BD.
  -- CASCADE: al eliminar la exploración, sus datos por diente desaparecen.
  constraint perio_tooth_exam_salon_fkey
    foreign key (exam_id, salon_id)
    references public.perio_exam (id, salon_id)
    on delete cascade,

  -- Validación FDI (ISO 3950): exactamente los 52 números válidos.
  -- Espeja odontogram_findings_fdi_valid.
  constraint perio_tooth_fdi_valid
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

  constraint perio_tooth_mobility_valid  check (mobility  between 0 and 3),
  constraint perio_tooth_furcation_valid check (furcation between 0 and 3)

);

-- Filtros RLS por salón
create index idx_perio_tooth_salon
  on public.perio_tooth (salon_id);

-- Todos los dientes de una exploración (carga completa del chart periodontal)
create index idx_perio_tooth_exam
  on public.perio_tooth (exam_id);

-- ==============================================================================
-- 3. TABLA: perio_site — mediciones por sitio (6 sitios/diente)
-- ==============================================================================
create table public.perio_site (

  id                 uuid     not null default gen_random_uuid(),

  -- Diente al que pertenece este sitio.
  -- Primera columna de la FK compuesta → perio_tooth(id, salon_id).
  tooth_id           uuid     not null,

  -- Tenant propietario. Segunda columna de la FK compuesta multi-tenant.
  salon_id           uuid     not null,

  -- Sitio de sondaje — convención estándar de 6 sitios por diente (BSP / AAP):
  --   1 = Mesio-Vestibular  (MV)    |  4 = Mesio-Palatino/Lingual  (MP/ML)
  --   2 = Vestibular        (V)     |  5 = Palatino/Lingual         (P/L)
  --   3 = Disto-Vestibular  (DV)    |  6 = Disto-Palatino/Lingual   (DP/DL)
  site               smallint not null,

  -- ─── Profundidad de sondaje ──────────────────────────────────────────────
  -- Distancia en mm desde el margen gingival hasta el fondo de la bolsa periodontal.
  -- Rango clínico: 0–20 mm (valores > 10 mm son infrecuentes pero válidos).
  pd_mm              smallint not null,

  -- ─── Posición del margen gingival respecto al CEJ ────────────────────────
  -- CEJ = Límite Amelocementario (Cemento-Enamel Junction).
  --   positivo → margen coronal al CEJ (hiperplasia gingival)
  --   negativo → margen apical al CEJ  (recesión gingival)
  --   cero     → margen al nivel del CEJ (referencia anatómica)
  -- Rango clínico: -15 mm (recesión severa) a +10 mm (hiperplasia marcada).
  gingival_margin_mm smallint not null default 0,

  -- ─── Nivel de Inserción Clínica (CAL) — columna GENERATED ───────────────
  -- CAL = pd_mm - gingival_margin_mm
  -- Interpretación:
  --   Margen al CEJ (0):        CAL = PD
  --   Hiperplasia (+mm):        CAL = PD − mm  → CAL < PD (tejido cubre inserción)
  --   Recesión     (−mm):       CAL = PD + |mm| → CAL > PD (pérdida adicional)
  -- Columna persistida (STORED): calculada en INSERT/UPDATE, consultable con índice.
  cal_mm             smallint generated always as (pd_mm - gingival_margin_mm) stored,

  -- ─── Índices clínicos por sitio ──────────────────────────────────────────

  -- BoP (Bleeding on Probing — Sangrado al Sondaje):
  -- Indicador primario de inflamación gingival activa en el sitio.
  bop                boolean  not null default false,

  -- Supuración: exudado purulento al sondaje. Indica infección activa severa.
  suppuration        boolean  not null default false,

  -- Placa a nivel de sitio. Complementa el índice de placa por diente (perio_tooth).
  plaque             boolean  not null default false,

  created_at         timestamptz not null default now(),

  primary key (id),

  -- Exactamente un registro por sitio y diente (máx. 6 filas por tooth_id).
  -- Permite upsert por (tooth_id, site) desde la app.
  constraint perio_site_tooth_site_unique unique (tooth_id, site),

  -- FK compuesta multi-tenant → perio_tooth(id, salon_id).
  -- Garantiza aislamiento de tenant a nivel de BD.
  -- CASCADE: al eliminar el diente, sus 6 sitios desaparecen.
  constraint perio_site_tooth_salon_fkey
    foreign key (tooth_id, salon_id)
    references public.perio_tooth (id, salon_id)
    on delete cascade,

  -- Sitio válido: exactamente 6 posiciones por diente
  constraint perio_site_site_valid
    check (site between 1 and 6),

  -- Profundidad de sondaje: rango clínico 0–20 mm
  constraint perio_site_pd_valid
    check (pd_mm between 0 and 20),

  -- Margen gingival: recesión severa hasta hiperplasia marcada
  constraint perio_site_gingival_margin_valid
    check (gingival_margin_mm between -15 and 10)

);

-- Filtros RLS por salón
create index idx_perio_site_salon
  on public.perio_site (salon_id);

-- Todos los sitios de un diente (carga del sextante en la UI)
create index idx_perio_site_tooth
  on public.perio_site (tooth_id);

-- ==============================================================================
-- 4. COMENTARIOS DE TABLA Y COLUMNA
-- ==============================================================================

comment on table public.perio_exam is
  'Cabecera de la exploración periodontal del paciente. '
  'FK compuesta (customer_id, salon_id) → clinical_records garantiza integridad '
  'multi-tenant. Cuando signed = TRUE la exploración y sus tablas hija '
  '(perio_tooth, perio_site) son inamovibles via triggers de inmutabilidad. '
  'Aplicada en 20260731140000_perio_exam.sql.';

comment on column public.perio_exam.signed is
  'TRUE cuando la exploración ha sido firmada por el profesional. '
  'Activa la inmutabilidad de perio_exam (trigger trg_perio_exam_immutable) '
  'y bloquea INSERT/UPDATE/DELETE en perio_tooth y perio_site. '
  'La firma es irreversible: signed no puede pasar de TRUE a FALSE.';

comment on column public.perio_exam.signed_at is
  'Timestamp de la firma clínica. NULL si la exploración no está firmada. '
  'Auto-establecido a now() por el trigger si el caller no lo provee al firmar.';

comment on column public.perio_exam.examiner_id is
  'UUID del profesional que realizó la exploración periodontal. '
  'SET NULL si el usuario es eliminado de auth.users (RGPD: derecho de supresión).';

comment on column public.perio_exam.notes is
  'Observaciones globales de la exploración: diagnóstico periodontal, '
  'índice PSR, clasificación AAP 2017, plan de tratamiento, etc.';

comment on table public.perio_tooth is
  'Datos periodontales a nivel de diente dentro de una exploración (perio_exam). '
  'Recoge movilidad dental (Miller 1985), afectación de furca (Hamp 1975) '
  'e índice de placa. Un diente por exploración (UNIQUE exam_id+fdi_tooth). '
  'FK compuesta (exam_id, salon_id) → perio_exam. '
  'Aplicada en 20260731140000_perio_exam.sql.';

comment on column public.perio_tooth.fdi_tooth is
  'Número FDI (ISO 3950) del diente explorado. '
  'Permanentes: 11-18, 21-28, 31-38, 41-48. '
  'Temporales: 51-55, 61-65, 71-75, 81-85. '
  'Validado por perio_tooth_fdi_valid. Espeja odontogram_findings.fdi_tooth.';

comment on column public.perio_tooth.mobility is
  'Grado de movilidad dental según Miller (1985): '
  '0=fisiológica (<0.2mm), 1=Grado I (0.2–1mm horizontal), '
  '2=Grado II (>1mm horizontal), 3=Grado III (>1mm y/o desplazamiento vertical). '
  'CHECK: 0–3.';

comment on column public.perio_tooth.furcation is
  'Clase de afectación de furca según Hamp et al. (1975): '
  '0=ninguna, 1=Clase I (< 3mm horizontal, no atraviesa), '
  '2=Clase II (> 3mm, no traspasa), 3=Clase III (traspasante). '
  'CHECK: 0–3.';

comment on column public.perio_tooth.plaque is
  'Presencia de placa dental visible a nivel de diente (índice O''Leary o similar).';

comment on table public.perio_site is
  'Mediciones por sitio periodontal (6 sitios/diente, estándar BSP/AAP). '
  'Incluye PD (profundidad de sondaje), margen gingival respecto al CEJ, '
  'CAL (columna GENERATED STORED = pd_mm − gingival_margin_mm), BoP, '
  'supuración y placa. FK compuesta (tooth_id, salon_id) → perio_tooth. '
  'Aplicada en 20260731140000_perio_exam.sql.';

comment on column public.perio_site.site is
  'Sitio de sondaje (1–6): '
  '1=MV, 2=V, 3=DV (vestibulares) | 4=MP/ML, 5=P/L, 6=DP/DL (palatinos/linguales). '
  'Convención estándar de 6 sondajes por diente (BSP / AAP). CHECK: 1–6.';

comment on column public.perio_site.pd_mm is
  'Profundidad de sondaje en mm (0–20): '
  'distancia desde el margen gingival hasta el fondo de la bolsa periodontal.';

comment on column public.perio_site.gingival_margin_mm is
  'Posición del margen gingival respecto al CEJ (mm): '
  'positivo = hiperplasia (coronal al CEJ), '
  'negativo = recesión   (apical al CEJ), '
  'cero     = al nivel del CEJ. '
  'Rango: −15 (recesión severa) a +10 (hiperplasia). CHECK: −15 a +10.';

comment on column public.perio_site.cal_mm is
  'CAL (Clinical Attachment Level / Nivel de Inserción Clínica) — columna GENERATED STORED. '
  'Fórmula: pd_mm − gingival_margin_mm. '
  'Margen al CEJ: CAL = PD. '
  'Hiperplasia (+): CAL < PD (el tejido cubre parte de la inserción). '
  'Recesión   (−): CAL > PD (pérdida de inserción adicional al sondaje). '
  'No puede insertarse ni actualizarse directamente (GENERATED ALWAYS).';

comment on column public.perio_site.bop is
  'BoP (Bleeding on Probing / Sangrado al Sondaje). '
  'Indicador primario de inflamación gingival activa en el sitio sondado.';

comment on column public.perio_site.suppuration is
  'Supuración: exudado purulento al sondaje. Indica infección activa severa.';

comment on column public.perio_site.plaque is
  'Presencia de placa a nivel de sitio periodontal. '
  'Complementa el índice de placa por diente registrado en perio_tooth.plaque.';

-- ==============================================================================
-- 5. INMUTABILIDAD — CAPA 1: trigger sobre perio_exam
-- ==============================================================================
-- Lógica idéntica a app.guard_visit_note_immutability() (20260731120000_visit_notes).
-- Protege la firma clínica del examen:
--   DELETE con old.signed = TRUE → restrict_violation
--   UPDATE con old.signed = TRUE → restrict_violation
--   signed: TRUE → FALSE         → restrict_violation (firma irreversible)
--   signed: FALSE → TRUE         → auto-establece signed_at = now() si NULL
-- El trigger no distingue roles: service_role tampoco puede bypasarlo en runtime.
-- Correcciones de producción: superusuario con ALTER TABLE … DISABLE TRIGGER.
--
-- Orden BEFORE UPDATE en perio_exam (alfabético por nombre de trigger):
--   1. trg_perio_exam_immutable  ("i") → ejecuta primero ✓
--   2. trg_perio_exam_updated_at ("u")
-- Si immutability lanza excepción, updated_at nunca llega a ejecutarse. ✓
-- ==============================================================================
create or replace function app.guard_perio_exam_immutability()
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
        'perio_exam: la exploración periodontal % está firmada (signed = TRUE) y es '
        'inamovible — eliminación denegada. Para correcciones de producción se '
        'requiere superusuario con ALTER TABLE … DISABLE TRIGGER.',
        old.id
        using errcode = 'restrict_violation';
    end if;
    return old;
  end if;

  -- ------------------------------------------------------------------ UPDATE --

  -- Bloquear toda modificación si el examen YA estaba firmado.
  if old.signed then
    raise exception
      'perio_exam: la exploración periodontal % está firmada (signed = TRUE) y es '
      'inamovible — modificación denegada. Para correcciones de producción se '
      'requiere superusuario con ALTER TABLE … DISABLE TRIGGER.',
      old.id
      using errcode = 'restrict_violation';
  end if;

  -- Bloquear la reversión de firma (signed: TRUE → FALSE).
  -- La firma clínica es irreversible por diseño.
  if (old.signed is distinct from new.signed) and (not new.signed) then
    raise exception
      'perio_exam: la firma de la exploración periodontal % es irreversible — '
      'signed no puede pasar de TRUE a FALSE.',
      old.id
      using errcode = 'restrict_violation';
  end if;

  -- Al firmar (signed: FALSE → TRUE), auto-establecer signed_at si no viene provisto.
  -- La app puede enviar un timestamp explícito (p. ej. momento de aprobación offline).
  if new.signed and not old.signed then
    new.signed_at := coalesce(new.signed_at, now());
  end if;

  return new;
end;
$$;

-- BEFORE garantiza que la operación no llega al motor de almacenamiento.
create trigger trg_perio_exam_immutable
  before update or delete on public.perio_exam
  for each row execute function app.guard_perio_exam_immutability();

-- updated_at automático (función compartida app.set_updated_at del esquema inicial)
create trigger trg_perio_exam_updated_at
  before update on public.perio_exam
  for each row execute function app.set_updated_at();

-- ==============================================================================
-- 6. INMUTABILIDAD — CAPA 2: triggers en perio_tooth y perio_site
-- ==============================================================================
-- Cuando el examen padre está firmado (perio_exam.signed = TRUE), todo
-- INSERT / UPDATE / DELETE directo en las tablas hija queda bloqueado.
--
-- NOTA: los DELETE en CASCADE desde perio_exam NO activan estos triggers.
-- PostgreSQL propaga el CASCADE referencial sin invocar triggers de usuario
-- en las filas hija. El borrado RGPD fluye sin interferencia. ✓
-- ==============================================================================

-- ─── Guard en perio_tooth ────────────────────────────────────────────────────
create or replace function app.guard_perio_tooth_on_signed_exam()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  _exam_id uuid;
  _signed  boolean;
begin
  _exam_id := case when tg_op = 'DELETE' then old.exam_id else new.exam_id end;

  select signed into _signed
  from public.perio_exam
  where id = _exam_id;

  if _signed then
    raise exception
      'perio_tooth: la exploración periodontal % está firmada (signed = TRUE) — '
      '% directo sobre perio_tooth denegado. El registro es inamovible.',
      _exam_id, tg_op
      using errcode = 'restrict_violation';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger trg_perio_tooth_on_signed_exam
  before insert or update or delete on public.perio_tooth
  for each row execute function app.guard_perio_tooth_on_signed_exam();

-- ─── Guard en perio_site ─────────────────────────────────────────────────────
create or replace function app.guard_perio_site_on_signed_exam()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  _tooth_id uuid;
  _signed   boolean;
begin
  _tooth_id := case when tg_op = 'DELETE' then old.tooth_id else new.tooth_id end;

  -- Subir un nivel: perio_site → perio_tooth → perio_exam
  select pe.signed into _signed
  from public.perio_tooth  pt
  join public.perio_exam   pe on pe.id = pt.exam_id
  where pt.id = _tooth_id;

  if _signed then
    raise exception
      'perio_site: el diente % pertenece a una exploración firmada (signed = TRUE) — '
      '% directo sobre perio_site denegado. El registro es inamovible.',
      _tooth_id, tg_op
      using errcode = 'restrict_violation';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger trg_perio_site_on_signed_exam
  before insert or update or delete on public.perio_site
  for each row execute function app.guard_perio_site_on_signed_exam();

-- ==============================================================================
-- 7. RLS — perio_exam
-- ==============================================================================
alter table public.perio_exam enable row level security;

-- SELECT: cualquier miembro autenticado del salón puede leer exploraciones
create policy "members_select_perio_exam"
  on public.perio_exam for select to authenticated
  using (salon_id in (select app.user_salon_ids()));

-- INSERT owner/manager (cualquier sector)
create policy "managers_insert_perio_exam"
  on public.perio_exam for insert to authenticated
  with check (app.has_salon_role(salon_id, array['owner','manager']::public.member_role[]));

-- INSERT staff dental — gate dual: rol + sector odontologia
-- Coexiste con managers_insert_perio_exam via OR (ambas PERMISSIVE).
-- Un staff de peluquería queda bloqueado por el gate de sector.
create policy "dental_staff_insert_perio_exam"
  on public.perio_exam for insert to authenticated
  with check (
    app.has_salon_role(salon_id, array['owner','manager','staff']::public.member_role[])
    and app.salon_is_sector(salon_id, 'odontologia'::public.salon_sector)
  );

-- UPDATE: owner/manager Y examen no firmado.
-- USING filtra por old row: exámenes firmados son invisibles a UPDATE desde la app
-- (devuelve 0 rows en lugar de error). El trigger bloquea el caso de service_role.
create policy "managers_update_unsigned_perio_exam"
  on public.perio_exam for update to authenticated
  using (
    app.has_salon_role(salon_id, array['owner','manager']::public.member_role[])
    and not signed
  )
  with check (
    app.has_salon_role(salon_id, array['owner','manager']::public.member_role[])
  );

-- DELETE: owner/manager Y examen no firmado.
create policy "managers_delete_unsigned_perio_exam"
  on public.perio_exam for delete to authenticated
  using (
    app.has_salon_role(salon_id, array['owner','manager']::public.member_role[])
    and not signed
  );

-- ==============================================================================
-- 8. RLS — perio_tooth
-- ==============================================================================
alter table public.perio_tooth enable row level security;

create policy "members_select_perio_tooth"
  on public.perio_tooth for select to authenticated
  using (salon_id in (select app.user_salon_ids()));

create policy "managers_insert_perio_tooth"
  on public.perio_tooth for insert to authenticated
  with check (app.has_salon_role(salon_id, array['owner','manager']::public.member_role[]));

create policy "dental_staff_insert_perio_tooth"
  on public.perio_tooth for insert to authenticated
  with check (
    app.has_salon_role(salon_id, array['owner','manager','staff']::public.member_role[])
    and app.salon_is_sector(salon_id, 'odontologia'::public.salon_sector)
  );

-- UPDATE / DELETE: sin política → deny-by-default para roles autenticados.
-- Los triggers de guard bloquean la modificación directa incluso para service_role.

-- ==============================================================================
-- 9. RLS — perio_site
-- ==============================================================================
alter table public.perio_site enable row level security;

create policy "members_select_perio_site"
  on public.perio_site for select to authenticated
  using (salon_id in (select app.user_salon_ids()));

create policy "managers_insert_perio_site"
  on public.perio_site for insert to authenticated
  with check (app.has_salon_role(salon_id, array['owner','manager']::public.member_role[]));

create policy "dental_staff_insert_perio_site"
  on public.perio_site for insert to authenticated
  with check (
    app.has_salon_role(salon_id, array['owner','manager','staff']::public.member_role[])
    and app.salon_is_sector(salon_id, 'odontologia'::public.salon_sector)
  );

-- UPDATE / DELETE: sin política → deny-by-default para roles autenticados.
-- El trigger trg_perio_site_on_signed_exam bloquea toda modificación directa.

-- ==============================================================================
-- 10. GUARDIÁN DE AISLAMIENTO (defensa en profundidad — patrón 20260718110000)
-- Verifica los invariantes de seguridad multi-tenant al aplicar la migración.
-- Si alguna comprobación falla, la transacción aborta íntegramente.
-- ==============================================================================
do $guard$
declare
  _t   text;
  _cnt integer;
  _pol record;
begin

  -- ──────────────────────────────────────────────────────────────────────────
  -- Prerequisito: UNIQUE de apoyo en clinical_records ya existe
  -- (creada en 20260731120000_odontogram_findings.sql).
  -- perio_exam no puede referenciar el par (customer_id, salon_id) sin ella.
  -- ──────────────────────────────────────────────────────────────────────────
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
      'GUARDIÁN: UNIQUE clinical_records_customer_id_salon_key no existe en public.clinical_records — '
      'la FK compuesta perio_exam_customer_salon_fkey no puede ser establecida. '
      'Asegúrese de que 20260731120000_odontogram_findings.sql se aplicó primero.'
      using errcode = 'raise_exception';
  end if;

  -- ──────────────────────────────────────────────────────────────────────────
  -- perio_exam
  -- ──────────────────────────────────────────────────────────────────────────
  _t := 'perio_exam';

  -- (a) RLS habilitada
  select count(*) into _cnt
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = _t and c.relrowsecurity;
  if _cnt = 0 then
    raise exception
      'GUARDIÁN RLS: la tabla public.% no tiene RLS habilitada (aislamiento multi-tenant roto)', _t
      using errcode = 'raise_exception';
  end if;

  -- (b) Política SELECT acotada por app.user_salon_ids()
  select count(*) into _cnt
  from pg_policies
  where schemaname = 'public' and tablename = _t
    and cmd in ('SELECT', 'ALL')
    and qual is not null
    and qual like '%user_salon_ids%';
  if _cnt = 0 then
    raise exception
      'GUARDIÁN RLS: public.% no tiene política SELECT acotada por app.user_salon_ids() (posible fuga cross-tenant)', _t
      using errcode = 'raise_exception';
  end if;

  -- (c) Sin políticas expuestas a anon/public
  select count(*) into _cnt
  from pg_policies
  where schemaname = 'public' and tablename = _t
    and (roles && array['anon', 'public']::name[]);
  if _cnt > 0 then
    raise exception
      'GUARDIÁN RLS: public.% tiene % política(s) expuesta(s) a anon/public (acceso no autenticado)', _t, _cnt
      using errcode = 'raise_exception';
  end if;

  -- (d) Toda política de escritura exige app.has_salon_role
  for _pol in
    select policyname, cmd, qual, with_check
    from pg_policies
    where schemaname = 'public' and tablename = _t
      and cmd in ('INSERT', 'UPDATE', 'DELETE')
  loop
    if coalesce(_pol.qual, '') || coalesce(_pol.with_check, '') not like '%has_salon_role%' then
      raise exception
        'GUARDIÁN RLS: política de escritura %.% (%) no exige app.has_salon_role',
        _t, _pol.policyname, _pol.cmd
        using errcode = 'raise_exception';
    end if;
  end loop;

  -- (e) FK compuesta perio_exam_customer_salon_fkey tiene exactamente 2 columnas
  select count(*) into _cnt
  from information_schema.referential_constraints rc
  join information_schema.key_column_usage kcu
    on kcu.constraint_name = rc.constraint_name
   and kcu.constraint_schema = rc.constraint_schema
  where rc.constraint_schema = 'public'
    and rc.constraint_name   = 'perio_exam_customer_salon_fkey'
    and kcu.column_name in ('customer_id', 'salon_id');
  if _cnt <> 2 then
    raise exception
      'GUARDIÁN: FK compuesta perio_exam_customer_salon_fkey no tiene exactamente 2 columnas '
      '(customer_id, salon_id) — integridad multi-tenant comprometida'
      using errcode = 'raise_exception';
  end if;

  -- (f) UNIQUE perio_exam_id_salon_key existe (requerido por FK de perio_tooth)
  select count(*) into _cnt
  from pg_constraint c
  join pg_class cl on cl.oid = c.conrelid
  join pg_namespace n on n.oid = cl.relnamespace
  where n.nspname = 'public' and cl.relname = _t
    and c.conname = 'perio_exam_id_salon_key' and c.contype = 'u';
  if _cnt = 0 then
    raise exception
      'GUARDIÁN: UNIQUE perio_exam_id_salon_key no existe en public.% — '
      'la FK compuesta de perio_tooth no puede referenciar el par (id, salon_id)', _t
      using errcode = 'raise_exception';
  end if;

  -- (g) Trigger de inmutabilidad en perio_exam activo
  select count(*) into _cnt
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = _t
    and t.tgname = 'trg_perio_exam_immutable'
    and t.tgenabled <> 'D';
  if _cnt = 0 then
    raise exception
      'GUARDIÁN: trigger trg_perio_exam_immutable no existe o está desactivado en public.% — '
      'la firma clínica del examen no está protegida', _t
      using errcode = 'raise_exception';
  end if;

  raise notice 'GUARDIÁN: perio_exam — RLS, FK compuesta, UNIQUE y trigger de inmutabilidad verificados.';

  -- ──────────────────────────────────────────────────────────────────────────
  -- perio_tooth
  -- ──────────────────────────────────────────────────────────────────────────
  _t := 'perio_tooth';

  -- (a) RLS habilitada
  select count(*) into _cnt
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = _t and c.relrowsecurity;
  if _cnt = 0 then
    raise exception
      'GUARDIÁN RLS: la tabla public.% no tiene RLS habilitada (aislamiento multi-tenant roto)', _t
      using errcode = 'raise_exception';
  end if;

  -- (b) Política SELECT acotada por app.user_salon_ids()
  select count(*) into _cnt
  from pg_policies
  where schemaname = 'public' and tablename = _t
    and cmd in ('SELECT', 'ALL')
    and qual is not null
    and qual like '%user_salon_ids%';
  if _cnt = 0 then
    raise exception
      'GUARDIÁN RLS: public.% no tiene política SELECT acotada por app.user_salon_ids() (posible fuga cross-tenant)', _t
      using errcode = 'raise_exception';
  end if;

  -- (c) Sin políticas expuestas a anon/public
  select count(*) into _cnt
  from pg_policies
  where schemaname = 'public' and tablename = _t
    and (roles && array['anon', 'public']::name[]);
  if _cnt > 0 then
    raise exception
      'GUARDIÁN RLS: public.% tiene % política(s) expuesta(s) a anon/public', _t, _cnt
      using errcode = 'raise_exception';
  end if;

  -- (d) Toda política de escritura exige app.has_salon_role
  for _pol in
    select policyname, cmd, qual, with_check
    from pg_policies
    where schemaname = 'public' and tablename = _t
      and cmd in ('INSERT', 'UPDATE', 'DELETE')
  loop
    if coalesce(_pol.qual, '') || coalesce(_pol.with_check, '') not like '%has_salon_role%' then
      raise exception
        'GUARDIÁN RLS: política de escritura %.% (%) no exige app.has_salon_role',
        _t, _pol.policyname, _pol.cmd
        using errcode = 'raise_exception';
    end if;
  end loop;

  -- (e) FK compuesta perio_tooth_exam_salon_fkey tiene exactamente 2 columnas
  select count(*) into _cnt
  from information_schema.referential_constraints rc
  join information_schema.key_column_usage kcu
    on kcu.constraint_name = rc.constraint_name
   and kcu.constraint_schema = rc.constraint_schema
  where rc.constraint_schema = 'public'
    and rc.constraint_name   = 'perio_tooth_exam_salon_fkey'
    and kcu.column_name in ('exam_id', 'salon_id');
  if _cnt <> 2 then
    raise exception
      'GUARDIÁN: FK compuesta perio_tooth_exam_salon_fkey no tiene exactamente 2 columnas '
      '(exam_id, salon_id) — integridad multi-tenant comprometida'
      using errcode = 'raise_exception';
  end if;

  -- (f) UNIQUE perio_tooth_id_salon_key existe (requerido por FK de perio_site)
  select count(*) into _cnt
  from pg_constraint c
  join pg_class cl on cl.oid = c.conrelid
  join pg_namespace n on n.oid = cl.relnamespace
  where n.nspname = 'public' and cl.relname = _t
    and c.conname = 'perio_tooth_id_salon_key' and c.contype = 'u';
  if _cnt = 0 then
    raise exception
      'GUARDIÁN: UNIQUE perio_tooth_id_salon_key no existe en public.% — '
      'la FK compuesta de perio_site no puede referenciar el par (id, salon_id)', _t
      using errcode = 'raise_exception';
  end if;

  -- (g) Trigger guard en perio_tooth activo
  select count(*) into _cnt
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = _t
    and t.tgname = 'trg_perio_tooth_on_signed_exam'
    and t.tgenabled <> 'D';
  if _cnt = 0 then
    raise exception
      'GUARDIÁN: trigger trg_perio_tooth_on_signed_exam no existe o está desactivado en public.% — '
      'las tablas hija no están protegidas ante modificación cuando el examen está firmado', _t
      using errcode = 'raise_exception';
  end if;

  raise notice 'GUARDIÁN: perio_tooth — RLS, FK compuesta, UNIQUE y trigger guard verificados.';

  -- ──────────────────────────────────────────────────────────────────────────
  -- perio_site
  -- ──────────────────────────────────────────────────────────────────────────
  _t := 'perio_site';

  -- (a) RLS habilitada
  select count(*) into _cnt
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = _t and c.relrowsecurity;
  if _cnt = 0 then
    raise exception
      'GUARDIÁN RLS: la tabla public.% no tiene RLS habilitada (aislamiento multi-tenant roto)', _t
      using errcode = 'raise_exception';
  end if;

  -- (b) Política SELECT acotada por app.user_salon_ids()
  select count(*) into _cnt
  from pg_policies
  where schemaname = 'public' and tablename = _t
    and cmd in ('SELECT', 'ALL')
    and qual is not null
    and qual like '%user_salon_ids%';
  if _cnt = 0 then
    raise exception
      'GUARDIÁN RLS: public.% no tiene política SELECT acotada por app.user_salon_ids() (posible fuga cross-tenant)', _t
      using errcode = 'raise_exception';
  end if;

  -- (c) Sin políticas expuestas a anon/public
  select count(*) into _cnt
  from pg_policies
  where schemaname = 'public' and tablename = _t
    and (roles && array['anon', 'public']::name[]);
  if _cnt > 0 then
    raise exception
      'GUARDIÁN RLS: public.% tiene % política(s) expuesta(s) a anon/public', _t, _cnt
      using errcode = 'raise_exception';
  end if;

  -- (d) Toda política de escritura exige app.has_salon_role
  for _pol in
    select policyname, cmd, qual, with_check
    from pg_policies
    where schemaname = 'public' and tablename = _t
      and cmd in ('INSERT', 'UPDATE', 'DELETE')
  loop
    if coalesce(_pol.qual, '') || coalesce(_pol.with_check, '') not like '%has_salon_role%' then
      raise exception
        'GUARDIÁN RLS: política de escritura %.% (%) no exige app.has_salon_role',
        _t, _pol.policyname, _pol.cmd
        using errcode = 'raise_exception';
    end if;
  end loop;

  -- (e) FK compuesta perio_site_tooth_salon_fkey tiene exactamente 2 columnas
  select count(*) into _cnt
  from information_schema.referential_constraints rc
  join information_schema.key_column_usage kcu
    on kcu.constraint_name = rc.constraint_name
   and kcu.constraint_schema = rc.constraint_schema
  where rc.constraint_schema = 'public'
    and rc.constraint_name   = 'perio_site_tooth_salon_fkey'
    and kcu.column_name in ('tooth_id', 'salon_id');
  if _cnt <> 2 then
    raise exception
      'GUARDIÁN: FK compuesta perio_site_tooth_salon_fkey no tiene exactamente 2 columnas '
      '(tooth_id, salon_id) — integridad multi-tenant comprometida'
      using errcode = 'raise_exception';
  end if;

  -- (f) Columna cal_mm es GENERATED ALWAYS en perio_site
  select count(*) into _cnt
  from information_schema.columns
  where table_schema = 'public'
    and table_name   = _t
    and column_name  = 'cal_mm'
    and is_generated = 'ALWAYS';
  if _cnt = 0 then
    raise exception
      'GUARDIÁN: la columna cal_mm de public.% no es GENERATED ALWAYS — '
      'el cálculo de CAL (pd_mm − gingival_margin_mm) no está garantizado por la BD', _t
      using errcode = 'raise_exception';
  end if;

  -- (g) Trigger guard en perio_site activo
  select count(*) into _cnt
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = _t
    and t.tgname = 'trg_perio_site_on_signed_exam'
    and t.tgenabled <> 'D';
  if _cnt = 0 then
    raise exception
      'GUARDIÁN: trigger trg_perio_site_on_signed_exam no existe o está desactivado en public.% — '
      'los sitios no están protegidos ante modificación cuando el examen está firmado', _t
      using errcode = 'raise_exception';
  end if;

  raise notice 'GUARDIÁN: perio_site — RLS, FK compuesta, CAL GENERATED y trigger guard verificados.';

  -- ──────────────────────────────────────────────────────────────────────────
  -- Verificación transversal: gate dental dual (has_salon_role + salon_is_sector)
  -- Las 3 políticas dental_staff_insert_* deben tener ambos gates.
  -- ──────────────────────────────────────────────────────────────────────────
  select count(*) into _cnt
  from pg_policies
  where schemaname = 'public'
    and policyname in (
      'dental_staff_insert_perio_exam',
      'dental_staff_insert_perio_tooth',
      'dental_staff_insert_perio_site'
    )
    and coalesce(with_check, '') like '%has_salon_role%'
    and coalesce(with_check, '') like '%salon_is_sector%';
  if _cnt <> 3 then
    raise exception
      'GUARDIÁN: solo % de 3 políticas de gate dental tienen has_salon_role + salon_is_sector '
      '(gate de escritura dental incompleto en módulo periodontal)', _cnt
      using errcode = 'raise_exception';
  end if;

  raise notice
    'GUARDIÁN: módulo periodontal completo — '
    'perio_exam, perio_tooth, perio_site con RLS, FKs compuestas, '
    'CAL GENERATED, triggers de inmutabilidad y gate dental dual verificados. ✓';

end;
$guard$;

commit;
