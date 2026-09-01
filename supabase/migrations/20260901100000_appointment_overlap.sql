-- =============================================================================
-- salon-os — Solapar citas a propósito, y solo quien tenga permiso
--
-- ── DE DÓNDE SALE ───────────────────────────────────────────────────────────
-- Nadia, en recepción de Biodental: «necesito poder agendar a los pacientes
-- aunque se solapen los tiempos; tengo que mandar el recordatorio y al agendar
-- ya no me deja ponerle en la hora prevista».
--
-- El caso real no es "dos pacientes en el mismo sillón": es que la agenda de
-- una clínica no encaja siempre con la duración nominal del servicio. Un
-- control de cinco minutos entra dentro de otra cita, y hoy la aplicación lo
-- prohíbe y le impide mandar el recordatorio.
--
-- ── POR QUÉ NO SE QUITA EL CONSTRAINT ───────────────────────────────────────
-- `appointments_no_overlap` existe por una razón buena: sin él, la reserva
-- online y la agenda venderían dos veces el mismo hueco. Quitarlo arreglaría lo
-- de Nadia y rompería lo demás.
--
-- Se hace al revés: la cita lleva una marca `allow_overlap`, y el constraint
-- solo ignora las citas marcadas. Las normales siguen sin poder pisarse. El
-- solape deja de ser un agujero y pasa a ser un acto explícito que queda
-- registrado en la fila.
--
-- ── POR QUÉ EL PERMISO ES POR PERSONA Y NO POR ROL ──────────────────────────
-- José lo pidió así: «que pueda solaparlas solo ella». No es el rol lo que
-- decide —hay más gente con el mismo rol en la clínica—, es una autorización
-- concreta a una persona concreta. Un flag en `salon_members` lo dice sin
-- inventarse un rol nuevo ni codificar el id de nadie en el programa.
--
-- ── Y POR QUÉ ADEMÁS UN TRIGGER ─────────────────────────────────────────────
-- La comprobación en la server action es la que da el mensaje bonito, pero no
-- es una garantía: PostgREST está expuesto y cualquiera con su token podría
-- marcar `allow_overlap` desde fuera de la aplicación. El trigger es el que de
-- verdad lo impide.
-- =============================================================================

begin;

-- ── El permiso, por persona ─────────────────────────────────────────────────
alter table public.salon_members
  add column if not exists can_overlap_appointments boolean not null default false;

comment on column public.salon_members.can_overlap_appointments is
  'Autoriza a esta persona a crear citas que se solapan con otras, marcándolas. Por defecto NADIE puede: es una excepción, no una preferencia.';

-- ── La marca, en la cita ────────────────────────────────────────────────────
alter table public.appointments
  add column if not exists allow_overlap boolean not null default false;

comment on column public.appointments.allow_overlap is
  'Esta cita se creó sabiendo que pisa a otra. Queda en la fila para que la agenda pueda avisarlo y para saber después quién solapó qué.';

-- ── El constraint, que ahora respeta la marca ───────────────────────────────
-- Una cita marcada queda FUERA del índice de exclusión: ni estorba a las demás
-- ni las demás le estorban a ella. Las no marcadas se siguen comportando igual
-- que siempre.
alter table public.appointments
  drop constraint if exists appointments_no_overlap;

alter table public.appointments
  add constraint appointments_no_overlap
  exclude using gist (
    professional_id with =,
    tstzrange(starts_at, ends_at) with &&
  )
  where (status in ('pending', 'confirmed') and not allow_overlap);

-- ── La garantía de verdad ───────────────────────────────────────────────────
create or replace function public.check_overlap_permission()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Solo interesa cuando la fila QUEDA marcada. Desmarcarla no necesita
  -- permiso: volver a la regla general nunca es peligroso.
  if not new.allow_overlap then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.allow_overlap then
    return new;
  end if;

  -- Sin `auth.uid()` no hay usuario: es la clave de servicio (migraciones,
  -- volcados, scripts). Ese camino ya tiene acceso total a la base; exigirle
  -- un permiso de aplicación no añadiría seguridad y rompería los seeds.
  if auth.uid() is null then
    return new;
  end if;

  if not exists (
    select 1
      from public.salon_members m
     where m.salon_id = new.salon_id
       and m.user_id  = auth.uid()
       and m.can_overlap_appointments
  ) then
    raise exception 'No tienes permiso para solapar citas'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

comment on function public.check_overlap_permission is
  'Impide marcar una cita como solapable a quien no tenga can_overlap_appointments. La comprobación de la server action da el mensaje; esta es la que no se puede saltar desde PostgREST.';

drop trigger if exists trg_appointments_overlap_permission on public.appointments;

create trigger trg_appointments_overlap_permission
  before insert or update of allow_overlap on public.appointments
  for each row
  execute function public.check_overlap_permission();

commit;
