-- =============================================================================
-- salon-os — Equipos de imagen por salón (A1a)
--
-- LA DECISIÓN DE PRODUCTO QUE ESTA TABLA MATERIALIZA: el equipo de rayos lo
-- elige CADA CLÍNICA, no nosotros. Atar el producto a un fabricante dejaría
-- fuera a cualquier clínica con otro aparato, que son casi todas. Por eso no hay
-- marca cableada en ningún sitio: hay ADAPTADORES, y cada salón configura los
-- suyos. Lo normal es un sensor por gabinete más un ortopantomógrafo compartido,
-- de ahí que sea una tabla y no unas columnas en `salons`.
--
-- Los cuatro adaptadores, de universal a específico:
--   · carpeta — vigila un directorio. Funciona con CUALQUIER equipo capaz de
--     exportar a disco, ortopantomógrafos incluidos. Es el suelo: ninguna clínica
--     se queda fuera, y es el único que se construye y prueba sin hardware.
--   · twain   — el estándar de los sensores intraorales. Carestream, Vatech, Dürr
--     y los sensores de terceros bajo Romexis exponen driver TWAIN: una
--     integración cubre lo que veinte integraciones por marca cubrirían.
--   · dicom   — ortopantomógrafos y CBCT de gama alta.
--   · sdk     — SDK propietario, donde compense. Aporta captura multiplexada y
--     metadatos que TWAIN pierde; es mejora, no requisito de entrada.
--
-- ── POR QUÉ `settings` ES JSONB Y NO COLUMNAS ───────────────────────────────
-- Cada adaptador necesita datos distintos (una ruta, un nombre de fuente, un AE
-- title y un puerto, un fabricante). En columnas serían cuatro grupos mutuamente
-- excluyentes casi siempre NULL, y añadir un adaptador exigiría una migración.
-- La coherencia entre `adapter` y `settings` se impone en la aplicación con una
-- unión discriminada de Zod (`src/lib/validations/imaging-device.ts`), que además
-- es `.strict()`: una carpeta con AE title se rechaza en el formulario. Ese
-- rechazo importa porque una configuración incoherente no falla al guardarse —
-- falla el día que alguien intenta radiografiar con el paciente en el sillón.
--
-- Tabla nueva y vacía: aditiva, sin backfill.
-- =============================================================================

begin;

create type public.imaging_adapter as enum ('carpeta', 'twain', 'dicom', 'sdk');

comment on type public.imaging_adapter is
  'Cómo se captura la imagen. carpeta=directorio vigilado (universal) | twain=sensor intraoral estándar | dicom=OPG/CBCT | sdk=integración de fabricante.';

create table public.salon_imaging_device (
  id         uuid primary key default gen_random_uuid(),
  salon_id   uuid not null references public.salons (id) on delete cascade,
  -- Como lo llama la clínica: "sensor del gabinete 2", "OPG de recepción".
  name       text not null,
  adapter    public.imaging_adapter not null,
  -- Ajustes propios del adaptador. Ver cabecera §"por qué jsonb".
  settings   jsonb not null default '{}'::jsonb,
  -- Modalidad por defecto de lo que captura este equipo. Mismo catálogo que
  -- `patient_images.modality`, para que la imagen nazca ya bien clasificada.
  modality   public.image_modality not null,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Dos equipos con el mismo nombre en un salón serían indistinguibles para
  -- quien tiene que elegir uno con el paciente delante.
  constraint salon_imaging_device_name_unique unique (salon_id, name),
  constraint salon_imaging_device_name_not_blank check (btrim(name) <> ''),
  -- `settings` es un objeto, nunca un escalar ni un array.
  constraint salon_imaging_device_settings_object check (jsonb_typeof(settings) = 'object')
);

comment on table public.salon_imaging_device is
  'Equipos de captura de imagen configurados por cada salón. Un salón puede tener varios (un sensor por gabinete, un OPG compartido).';

comment on column public.salon_imaging_device.settings is
  'Ajustes del adaptador. carpeta: {"path"} | twain: {"source"} | dicom: {"aeTitle","port"} | sdk: {"vendor"}. La coherencia con `adapter` la valida la app (unión discriminada de Zod).';

-- Lo que consulta la pantalla de captura: los equipos utilizables del salón.
create index salon_imaging_device_activos_idx
  on public.salon_imaging_device (salon_id, active);

create trigger trg_salon_imaging_device_updated_at
  before update on public.salon_imaging_device
  for each row execute function app.set_updated_at();

-- ------------------------------------------------------------------------------
-- RLS — lectura: cualquier miembro (quien captura es el staff clínico);
--       escritura: owner/manager (configurar el equipo es administrar la clínica).
-- Mismo criterio que `salon_opening_hours`.
-- ------------------------------------------------------------------------------
alter table public.salon_imaging_device enable row level security;

create policy "members_select_salon_imaging_device"
  on public.salon_imaging_device for select to authenticated
  using (salon_id in (select app.user_salon_ids()));

create policy "managers_insert_salon_imaging_device"
  on public.salon_imaging_device for insert to authenticated
  with check (app.has_salon_role(salon_id, array['owner','manager']::public.member_role[]));

create policy "managers_update_salon_imaging_device"
  on public.salon_imaging_device for update to authenticated
  using (app.has_salon_role(salon_id, array['owner','manager']::public.member_role[]))
  with check (app.has_salon_role(salon_id, array['owner','manager']::public.member_role[]));

create policy "managers_delete_salon_imaging_device"
  on public.salon_imaging_device for delete to authenticated
  using (app.has_salon_role(salon_id, array['owner','manager']::public.member_role[]));

commit;
