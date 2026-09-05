-- =============================================================================
-- salon-os — Migración: consentimientos informados + imágenes/radiografías (odontología)
-- (public.consents, public.patient_images) + bucket privado storage `patient-media`
--
-- consents: consentimiento informado por paciente. INMUTABLE tras firmar (revocar
--   = nuevo estado, nunca editar el texto). Se conserva el texto exacto (body) y la
--   versión de plantilla (template_version).
-- patient_images: metadatos de radiografías/fotos; el BINARIO vive en Storage
--   (bucket privado `patient-media`, path `{salon_id}/{customer_id}/{file}`), la fila
--   guarda storage_path + metadatos. Acceso vía signed URLs (bucket no público).
--
-- Multi-tenant: salon_id NOT NULL + FK compuesta (customer_id, salon_id) → clinical_records.
-- RLS: acotado a app.user_salon_ids(); gate de rol/sector reforzado en server actions.
-- Storage RLS: replica el patrón de `salon-logos` con app.storage_object_salon_id(name).
-- =============================================================================

begin;

create type public.consent_type as enum
  ('general','endodoncia','exodoncia','implante','ortodoncia','anestesia','periodoncia','blanqueamiento','rgpd');

create type public.consent_status as enum ('pending','signed','revoked');

create type public.image_modality as enum
  ('periapical','bitewing','panoramic','cbct','cefalometrica','foto_intraoral','scan_stl');

-- ---------------------------------------------------------------------------
-- consents
-- ---------------------------------------------------------------------------
create table public.consents (
  id                uuid primary key default gen_random_uuid(),
  salon_id          uuid not null references public.salons(id) on delete cascade,
  customer_id       uuid not null,
  type              public.consent_type not null,
  treatment_plan_id uuid references public.treatment_plan(id) on delete set null,
  plan_item_id      uuid references public.plan_item(id) on delete set null,
  fdi_code          smallint,
  title             text not null,
  body              text,                       -- texto exacto de la plantilla firmada
  template_version  text not null default 'v1',
  document_uri      text,                        -- opcional: PDF firmado en patient-media
  status            public.consent_status not null default 'pending',
  signed_at         timestamptz,
  signed_by_patient text,                        -- nombre/firma del paciente
  witnessed_by      uuid,
  revoked_at        timestamptz,
  revoked_by        uuid,
  created_by        uuid,
  created_at        timestamptz not null default now(),
  constraint consents_customer_fk
    foreign key (customer_id, salon_id)
    references public.clinical_records (customer_id, salon_id) on delete cascade
);
create index consents_customer_idx on public.consents (salon_id, customer_id, created_at desc);

-- Inmutabilidad: un consentimiento firmado no se edita; solo se puede REVOCAR
-- (status signed→revoked, fijando revoked_at). Un revocado no se edita ni borra.
create or replace function public.consents_guard_signed()
returns trigger language plpgsql as $$
begin
  if (tg_op = 'DELETE') then
    if old.status <> 'pending' then
      raise exception 'un consentimiento firmado o revocado no se puede borrar';
    end if;
    return old;
  end if;
  -- UPDATE
  if old.status = 'revoked' then
    raise exception 'un consentimiento revocado es inmutable';
  end if;
  if old.status = 'signed' then
    -- Solo se permite la transición a revoked; el resto de columnas de contenido
    -- deben permanecer intactas.
    if new.status not in ('signed','revoked') then
      raise exception 'un consentimiento firmado solo puede pasar a revocado';
    end if;
    if new.type is distinct from old.type
       or new.body is distinct from old.body
       or new.template_version is distinct from old.template_version
       or new.title is distinct from old.title
       or new.document_uri is distinct from old.document_uri
       or new.signed_at is distinct from old.signed_at
       or new.signed_by_patient is distinct from old.signed_by_patient then
      raise exception 'un consentimiento firmado es inmutable (solo se puede revocar)';
    end if;
  end if;
  return new;
end $$;

create trigger consents_guard
  before update or delete on public.consents
  for each row execute function public.consents_guard_signed();

alter table public.consents enable row level security;
create policy consents_rw on public.consents
  for all using (salon_id in (select app.user_salon_ids()))
  with check (salon_id in (select app.user_salon_ids()));

-- ---------------------------------------------------------------------------
-- patient_images
-- ---------------------------------------------------------------------------
create table public.patient_images (
  id                uuid primary key default gen_random_uuid(),
  salon_id          uuid not null references public.salons(id) on delete cascade,
  customer_id       uuid not null,
  treatment_plan_id uuid references public.treatment_plan(id) on delete set null,
  fdi_code          smallint,
  modality          public.image_modality not null,
  taken_at          timestamptz,
  taken_by          uuid,
  device            text,
  storage_path      text not null,               -- clave en el bucket patient-media
  thumbnail_path    text,
  mime              text,
  dicom_metadata    jsonb,
  tags              text[] not null default '{}',
  note              text,
  created_by        uuid,
  created_at        timestamptz not null default now(),
  constraint patient_images_customer_fk
    foreign key (customer_id, salon_id)
    references public.clinical_records (customer_id, salon_id) on delete cascade
);
create index patient_images_customer_idx on public.patient_images (salon_id, customer_id, created_at desc);

alter table public.patient_images enable row level security;
create policy patient_images_rw on public.patient_images
  for all using (salon_id in (select app.user_salon_ids()))
  with check (salon_id in (select app.user_salon_ids()));

-- ---------------------------------------------------------------------------
-- Storage: bucket PRIVADO patient-media + políticas (patrón salon-logos)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
  values ('patient-media','patient-media', false)
  on conflict (id) do nothing;

-- Lectura: cualquier miembro del salón (el path empieza por {salon_id}/...).
create policy patient_media_members_read on storage.objects
  for select using (
    bucket_id = 'patient-media'
    and app.storage_object_salon_id(name) in (select app.user_salon_ids())
  );

-- Escritura (insert/update/delete): owner/manager/staff del salón dueño del path.
create policy patient_media_staff_insert on storage.objects
  for insert with check (
    bucket_id = 'patient-media'
    and app.has_salon_role(app.storage_object_salon_id(name),
        array['owner','manager','staff']::member_role[])
  );
create policy patient_media_staff_update on storage.objects
  for update using (
    bucket_id = 'patient-media'
    and app.has_salon_role(app.storage_object_salon_id(name),
        array['owner','manager','staff']::member_role[])
  )
  with check (
    bucket_id = 'patient-media'
    and app.has_salon_role(app.storage_object_salon_id(name),
        array['owner','manager','staff']::member_role[])
  );
create policy patient_media_staff_delete on storage.objects
  for delete using (
    bucket_id = 'patient-media'
    and app.has_salon_role(app.storage_object_salon_id(name),
        array['owner','manager','staff']::member_role[])
  );

commit;
