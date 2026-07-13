-- =============================================================================
-- salon-os — Migración: cola de recordatorios WhatsApp
--
-- Tabla `whatsapp_reminder_queue`: registro persistente de cada recordatorio
-- pendiente, su estado (pending → sent | failed | skipped) y conteo de reintentos.
--
-- Flujo:
--   1. Trigger `trg_appointment_enqueue_confirmation` → encola la confirmación
--      en cuanto se crea la cita (status pending/confirmed).
--   2. Edge Function `process-reminders` (cron cada 5 min):
--      a. Encola recordatorio_24h y recordatorio_2h para citas próximas.
--      b. Encola post_visita para citas recién completadas.
--      c. Procesa las filas pending con scheduled_for <= now().
--      d. Reintenta las filas failed con next_retry_at <= now() y attempts < max.
-- =============================================================================

-- ──────────────────────────────────────────────────────────────────────────────
-- Enums
-- ──────────────────────────────────────────────────────────────────────────────

create type public.reminder_type as enum (
  'confirmacion',      -- confirmación inmediata al crear cita
  'recordatorio_24h',  -- recordatorio 24 h antes
  'recordatorio_2h',   -- recordatorio 2 h antes
  'post_visita'        -- seguimiento post-visita (solicitud de reseña)
);

create type public.reminder_status as enum (
  'pending',   -- en cola, scheduled_for aún no ha llegado
  'sending',   -- la Edge Function lo está procesando (bloqueo anti-duplicado)
  'sent',      -- enviado con éxito a Twilio
  'failed',    -- falló; se reintentará si attempts < max_attempts
  'skipped'    -- descartado (sin teléfono, cita cancelada, etc.)
);

-- ──────────────────────────────────────────────────────────────────────────────
-- whatsapp_reminder_queue
-- ──────────────────────────────────────────────────────────────────────────────

create table public.whatsapp_reminder_queue (
  id                  uuid        primary key default gen_random_uuid(),
  salon_id            uuid        not null references public.salons (id) on delete cascade,
  appointment_id      uuid        not null references public.appointments (id) on delete cascade,
  reminder_type       public.reminder_type   not null,
  status              public.reminder_status not null default 'pending',

  -- Cuándo debe salir el mensaje (se compara con now() en cada pasada del cron)
  scheduled_for       timestamptz not null,

  -- Reintentos
  attempts            smallint    not null default 0 check (attempts >= 0),
  max_attempts        smallint    not null default 3  check (max_attempts > 0),
  next_retry_at       timestamptz,

  -- Resultado
  sent_at             timestamptz,
  twilio_message_sid  text,
  last_error          text,

  -- Snapshot del teléfono en el momento de encolado (el cliente puede cambiar)
  customer_phone      text        not null,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  -- Una cita solo puede tener un recordatorio de cada tipo
  constraint uq_appointment_reminder unique (appointment_id, reminder_type)
);

comment on table public.whatsapp_reminder_queue is
  'Cola de recordatorios WhatsApp. Gestionada por la Edge Function process-reminders '
  '(cron cada 5 min). La Edge Function usa service_role y sortea el RLS.';

-- ──────────────────────────────────────────────────────────────────────────────
-- Índices
-- ──────────────────────────────────────────────────────────────────────────────

-- Consulta principal del cron: pending listos para enviar
create index idx_reminder_queue_pending
  on public.whatsapp_reminder_queue (scheduled_for)
  where status = 'pending';

-- Reintentos: failed con siguiente intento pendiente
create index idx_reminder_queue_retry
  on public.whatsapp_reminder_queue (next_retry_at, attempts)
  where status = 'failed';

-- Listado por salón (dashboard de auditoría)
create index idx_reminder_queue_salon_created
  on public.whatsapp_reminder_queue (salon_id, created_at desc);

-- Lookup por cita
create index idx_reminder_queue_appointment
  on public.whatsapp_reminder_queue (appointment_id);

-- ──────────────────────────────────────────────────────────────────────────────
-- Trigger updated_at
-- ──────────────────────────────────────────────────────────────────────────────

create trigger trg_reminder_queue_updated_at
  before update on public.whatsapp_reminder_queue
  for each row execute function app.set_updated_at();

-- ──────────────────────────────────────────────────────────────────────────────
-- RLS
-- La Edge Function usa service_role → bypasa RLS automáticamente.
-- Los miembros del salón pueden leer (auditoría) y los managers pueden
-- marcar manualmente un recordatorio como 'skipped'.
-- ──────────────────────────────────────────────────────────────────────────────

alter table public.whatsapp_reminder_queue enable row level security;

create policy "members_select_reminder_queue"
  on public.whatsapp_reminder_queue for select to authenticated
  using (salon_id in (select app.user_salon_ids()));

create policy "managers_skip_reminder"
  on public.whatsapp_reminder_queue for update to authenticated
  using  (app.has_salon_role(salon_id, array['owner','manager']::public.member_role[]))
  with check (app.has_salon_role(salon_id, array['owner','manager']::public.member_role[]));

-- ──────────────────────────────────────────────────────────────────────────────
-- Trigger: encolar confirmación al crear una cita
-- ──────────────────────────────────────────────────────────────────────────────

create or replace function app.enqueue_confirmation_reminder()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_phone text;
begin
  select phone into v_phone
  from public.customers
  where id = new.customer_id;

  -- Sin teléfono → insertar como skipped para tener registro de auditoría
  if v_phone is null or trim(v_phone) = '' then
    insert into public.whatsapp_reminder_queue (
      salon_id, appointment_id, reminder_type,
      status, scheduled_for, customer_phone
    ) values (
      new.salon_id, new.id, 'confirmacion',
      'skipped', now(), 'sin-telefono'
    )
    on conflict (appointment_id, reminder_type) do nothing;
    return new;
  end if;

  insert into public.whatsapp_reminder_queue (
    salon_id, appointment_id, reminder_type,
    status, scheduled_for, customer_phone
  ) values (
    new.salon_id, new.id, 'confirmacion',
    'pending', now(), trim(v_phone)
  )
  on conflict (appointment_id, reminder_type) do nothing;

  return new;
end;
$$;

create trigger trg_appointment_enqueue_confirmation
  after insert on public.appointments
  for each row
  when (new.status in ('pending', 'confirmed'))
  execute function app.enqueue_confirmation_reminder();

-- ──────────────────────────────────────────────────────────────────────────────
-- SETUP DEL CRON (ejecutar tras el primer deploy de la Edge Function)
-- ──────────────────────────────────────────────────────────────────────────────
--
-- Opción A — pg_cron + pg_net (Supabase Pro / Team):
--
--   1. Habilitar extensiones (una vez, desde el Dashboard > Database > Extensions):
--        create extension if not exists pg_cron;
--        create extension if not exists pg_net;
--
--   2. Guardar secretos como parámetros de DB:
--        alter database postgres set app.supabase_url    = 'https://YOUR_REF.supabase.co';
--        alter database postgres set app.cron_secret     = 'YOUR_CRON_SECRET';
--
--   3. Crear el job (cada 5 minutos):
--        select cron.schedule(
--          'process-whatsapp-reminders',
--          '*/5 * * * *',
--          $$
--            select net.http_post(
--              url     := current_setting('app.supabase_url')
--                         || '/functions/v1/process-reminders',
--              headers := jsonb_build_object(
--                'Content-Type',  'application/json',
--                'x-cron-secret', current_setting('app.cron_secret')
--              ),
--              body    := '{}'::jsonb
--            );
--          $$
--        );
--
-- Opción B — Vercel Cron Jobs (recomendado para este stack Next.js + Vercel):
--   El fichero vercel.json define el job */5 * * * * → /api/cron/reminders.
--   Esa ruta Next.js llama a la Edge Function con x-cron-secret.
--   Ver: src/app/api/cron/reminders/route.ts
--
-- Opción C — Supabase Dashboard > Edge Functions > Schedules (preview UI).
-- ──────────────────────────────────────────────────────────────────────────────
