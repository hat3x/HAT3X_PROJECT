-- Tabla clinics: una fila por usuario registrado
create table if not exists public.clinics (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references auth.users(id) on delete cascade,
  name                 text not null,
  cif                  text,
  address              text,
  phone                text,
  email                text,
  logo_initials        text not null default 'CF',
  primary_color        text not null default '#3b82f6',
  vat                  numeric not null default 21,
  appointment_duration integer not null default 30,
  invoice_series       text not null default 'F-2026-',
  budget_series        text not null default 'PR-2026-',
  receipt_series       text not null default 'R-2026-',
  schedule             text,
  dentist_name         text,
  dentist_email        text,
  mic_device_id        text not null default 'default',
  mic_sensitivity      numeric not null default 70,
  created_at           timestamptz not null default now(),

  constraint clinics_user_id_unique unique (user_id)
);

-- Row Level Security: cada usuario solo accede a su propia clínica
alter table public.clinics enable row level security;

create policy "Clinic owner full access"
  on public.clinics
  for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);
