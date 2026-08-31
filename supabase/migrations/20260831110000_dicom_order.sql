-- =============================================================================
-- salon-os — Migración: peticiones de radiología (lista de trabajo DICOM)
--
-- ── QUÉ ES UNA PETICIÓN ─────────────────────────────────────────────────────
-- "A este paciente se le va a hacer una radiografía hoy". Es lo que Kairos
-- publica en la lista de trabajo y lo que el profesional elige en el equipo en
-- lugar de teclear el nombre. La imagen vuelve con el identificador de esta
-- fila dentro, y por eso entra sola en la ficha correcta.
--
-- Una petición puede dar VARIAS imágenes: un periapical del 36 y otro del 46 en
-- la misma visita son dos instancias del mismo estudio. Por eso la petición es
-- por visita y no por disparo.
--
-- ── DOS IDENTIFICADORES, Y NO SOBRAN ────────────────────────────────────────
--   · `accession` es corto porque el equipo lo exige: AccNumSupportChar_RIS
--     limita a 20 caracteres y un UUID son 36. Mismo problema y misma solución
--     que `customers.patient_code`: un contador por salón que la aplicación
--     rellena a diez dígitos.
--   · `study_instance_uid` es el identificador DICOM del estudio y tiene que
--     ser único EN EL MUNDO, no solo aquí: si dos estudios lo comparten, se
--     pisan en cualquier archivo DICOM que los reciba. Se genera de la rama
--     2.25 a partir del uuid de la fila (ver `dicomUidFromUuid`).
--
-- ── POR QUÉ SE MATERIALIZA Y NO SE CALCULA AL VUELO ─────────────────────────
-- Sería tentador construir la lista de trabajo directamente de `appointments`.
-- Pero entonces el número de petición y el UID cambiarían en cada consulta, y
-- la imagen volvería con un identificador que ya no existe. Tienen que quedar
-- escritos ANTES de publicarlos, y no volver a moverse.
-- =============================================================================

begin;

-- Contador de peticiones por salón. Mismo mecanismo que `patient_seq`: el
-- UPDATE ... RETURNING bloquea la fila del salón, así que dos peticiones
-- simultáneas del mismo salón se serializan y nunca sacan el mismo número.
alter table public.salons
  add column if not exists dicom_order_seq bigint not null default 0;

comment on column public.salons.dicom_order_seq is
  'Último número de petición de radiología entregado en este salón. Lo incrementa app.next_dicom_order_accession().';

create or replace function app.next_dicom_order_accession(p_salon_id uuid)
returns bigint
language sql
security definer
set search_path = ''
as $$
  update public.salons
     set dicom_order_seq = dicom_order_seq + 1
   where id = p_salon_id
  returning dicom_order_seq;
$$;

comment on function app.next_dicom_order_accession(uuid) is
  'Entrega el siguiente número de petición del salón. El UPDATE bloquea la fila del salón, así que dos peticiones simultáneas se serializan.';

-- ── Estado de la petición ───────────────────────────────────────────────────
do $$ begin
  if not exists (select 1 from pg_type where typname = 'dicom_order_status') then
    create type public.dicom_order_status as enum (
      'scheduled',  -- publicada en la lista, esperando que se dispare
      'received',   -- ya ha llegado al menos una imagen
      'cancelled'   -- se retiró antes de hacerse
    );
  end if;
end $$;

-- ── La tabla ────────────────────────────────────────────────────────────────
create table if not exists public.dicom_order (
  id                   uuid primary key default gen_random_uuid(),
  salon_id             uuid not null references public.salons (id) on delete cascade,
  customer_id          uuid not null,

  -- Nullable: una radiografía puede hacerse sin cita previa, y esa es una
  -- situación normal en una clínica, no un caso raro. `set null` al borrar la
  -- cita porque la radiografía sigue existiendo aunque la cita desaparezca.
  appointment_id       uuid references public.appointments (id) on delete set null,

  accession            bigint not null,
  study_instance_uid   text   not null,

  scheduled_at         timestamptz not null,
  modality             varchar(16) not null default 'IO',
  station_ae_title     varchar(16) not null,
  description          text,
  performing_physician text,

  status               public.dicom_order_status not null default 'scheduled',
  created_by           uuid,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  -- El paciente tiene que tener ficha clínica: sin ella no hay dónde colgar la
  -- radiografía cuando vuelva.
  constraint dicom_order_customer_fk
    foreign key (customer_id, salon_id)
    references public.clinical_records (customer_id, salon_id) on delete cascade,

  -- Dos peticiones con el mismo número en el mismo salón harían imposible saber
  -- a cuál corresponde una imagen.
  constraint dicom_order_accession_unique unique (salon_id, accession),

  -- Único en el mundo, no solo por salón: es la garantía que da sentido al UID.
  constraint dicom_order_study_uid_unique unique (study_instance_uid),

  -- El AE Title de DICOM son 16 caracteres como mucho, y sin espacios a los
  -- lados. Que lo garantice la base evita descubrirlo cuando el equipo cuelgue.
  constraint dicom_order_ae_title_valid
    check (station_ae_title = btrim(station_ae_title) and station_ae_title <> '')
);

comment on table public.dicom_order is
  'Peticiones de radiología publicadas en la lista de trabajo DICOM. Una por visita, no por disparo: varias imágenes de la misma visita comparten petición. Los identificadores se escriben antes de publicarse y no se mueven, porque la imagen vuelve trayéndolos.';

-- Una cita no puede generar dos peticiones: si la lista se reconstruye —y se
-- reconstruye cada vez que alguien la abre— tiene que reutilizar la que ya hay,
-- no crear otra con identificadores nuevos.
create unique index if not exists dicom_order_appointment_unique
  on public.dicom_order (appointment_id)
  where appointment_id is not null;

-- La consulta que hace el agente: las peticiones de un día para un equipo.
create index if not exists dicom_order_agenda_idx
  on public.dicom_order (salon_id, scheduled_at)
  where status = 'scheduled';

create index if not exists dicom_order_customer_idx
  on public.dicom_order (salon_id, customer_id, scheduled_at desc);

create trigger trg_dicom_order_updated_at
  before update on public.dicom_order
  for each row execute function app.set_updated_at();

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Leer y crear, cualquier miembro: quien atiende necesita poder mandar a un
-- paciente a rayos. Borrar, nadie: una petición cumplida es el rastro de que se
-- irradió a alguien, y eso no se borra — se anula (`cancelled`).
alter table public.dicom_order enable row level security;

create policy members_select_dicom_order
  on public.dicom_order for select to authenticated
  using (salon_id in (select app.user_salon_ids()));

create policy members_insert_dicom_order
  on public.dicom_order for insert to authenticated
  with check (salon_id in (select app.user_salon_ids()));

create policy members_update_dicom_order
  on public.dicom_order for update to authenticated
  using (salon_id in (select app.user_salon_ids()))
  with check (salon_id in (select app.user_salon_ids()));

-- ── Enlace de la imagen con su petición ─────────────────────────────────────
-- `patient_images` ya existe y ya guarda `dicom_metadata`. Lo que le faltaba es
-- saber de qué petición vino, que es lo que permite reconstruir el estudio
-- completo y distinguir dos visitas del mismo paciente el mismo día.
alter table public.patient_images
  add column if not exists dicom_order_id uuid references public.dicom_order (id) on delete set null;

comment on column public.patient_images.dicom_order_id is
  'Petición de la que vino esta imagen. NULL si se subió a mano o si llegó sin identificador reconocible y alguien la asignó después.';

create index if not exists patient_images_order_idx
  on public.patient_images (dicom_order_id)
  where dicom_order_id is not null;

commit;
