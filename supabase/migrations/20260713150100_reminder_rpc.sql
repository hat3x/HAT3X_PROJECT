-- =============================================================================
-- salon-os — Migración: RPCs para la Edge Function process-reminders
--
-- Dos funciones SECURITY DEFINER llamadas por la Edge Function (service_role):
--
--   app.get_appointments_for_reminder(p_min_minutes, p_max_minutes)
--     → citas activas cuyo starts_at cae en la ventana [now+p_min, now+p_max]
--       con cliente con teléfono. La Edge Function la llama una vez por ventana.
--
--   app.get_appointment_details(p_appointment_id)
--     → datos denormalizados de una cita para construir las variables de plantilla.
-- =============================================================================

-- ──────────────────────────────────────────────────────────────────────────────
-- Tipo compuesto de retorno compartido por ambas funciones
-- ──────────────────────────────────────────────────────────────────────────────

create type app.appointment_reminder_details as (
  id                 uuid,
  salon_id           uuid,
  starts_at          timestamptz,
  ends_at            timestamptz,
  price_cents        integer,
  currency           char(3),
  customer_name      text,
  customer_phone     text,
  service_name       text,
  professional_name  text,
  salon_name         text,
  salon_timezone     text,
  salon_phone        text,
  salon_settings     jsonb
);

-- ──────────────────────────────────────────────────────────────────────────────
-- app.get_appointments_for_reminder
-- ──────────────────────────────────────────────────────────────────────────────
-- Ventanas estándar (minutos):
--   24 h → p_min = 1380, p_max = 1500  (23 h – 25 h)
--   2 h  → p_min = 110,  p_max = 130   (1 h 50 min – 2 h 10 min)
-- ──────────────────────────────────────────────────────────────────────────────

create or replace function app.get_appointments_for_reminder(
  p_min_minutes integer,
  p_max_minutes integer
)
returns setof app.appointment_reminder_details
language sql
stable
security definer
set search_path = ''
as $$
  select
    a.id,
    a.salon_id,
    a.starts_at,
    a.ends_at,
    a.price_cents,
    a.currency::char(3),
    c.full_name          as customer_name,
    c.phone              as customer_phone,
    sv.name              as service_name,
    p.full_name          as professional_name,
    sl.name              as salon_name,
    sl.timezone          as salon_timezone,
    sl.phone             as salon_phone,
    sl.settings          as salon_settings
  from public.appointments  a
  join public.customers     c  on c.id  = a.customer_id  and c.salon_id  = a.salon_id
  join public.services      sv on sv.id = a.service_id   and sv.salon_id = a.salon_id
  join public.professionals p  on p.id  = a.professional_id and p.salon_id = a.salon_id
  join public.salons        sl on sl.id = a.salon_id
  where a.status in ('pending', 'confirmed')
    and a.starts_at >= now() + (p_min_minutes || ' minutes')::interval
    and a.starts_at <= now() + (p_max_minutes || ' minutes')::interval
    and c.phone is not null
    and trim(c.phone) <> ''
$$;

revoke execute on function app.get_appointments_for_reminder(integer, integer)
  from anon, authenticated, public;
grant  execute on function app.get_appointments_for_reminder(integer, integer)
  to service_role;

-- ──────────────────────────────────────────────────────────────────────────────
-- app.get_appointment_details
-- ──────────────────────────────────────────────────────────────────────────────
-- Retorna los datos denormalizados de una cita por su id.
-- La Edge Function la llama justo antes de construir las variables de plantilla.
-- ──────────────────────────────────────────────────────────────────────────────

create or replace function app.get_appointment_details(
  p_appointment_id uuid
)
returns app.appointment_reminder_details
language sql
stable
security definer
set search_path = ''
as $$
  select
    a.id,
    a.salon_id,
    a.starts_at,
    a.ends_at,
    a.price_cents,
    a.currency::char(3),
    c.full_name          as customer_name,
    c.phone              as customer_phone,
    sv.name              as service_name,
    p.full_name          as professional_name,
    sl.name              as salon_name,
    sl.timezone          as salon_timezone,
    sl.phone             as salon_phone,
    sl.settings          as salon_settings
  from public.appointments  a
  join public.customers     c  on c.id  = a.customer_id  and c.salon_id  = a.salon_id
  join public.services      sv on sv.id = a.service_id   and sv.salon_id = a.salon_id
  join public.professionals p  on p.id  = a.professional_id and p.salon_id = a.salon_id
  join public.salons        sl on sl.id = a.salon_id
  where a.id = p_appointment_id
  limit 1
$$;

revoke execute on function app.get_appointment_details(uuid)
  from anon, authenticated, public;
grant  execute on function app.get_appointment_details(uuid)
  to service_role;
