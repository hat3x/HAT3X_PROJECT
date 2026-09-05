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
-- ── DÓNDE SE IMPIDE DE VERDAD ───────────────────────────────────────────────
-- No en `appointments`. El constraint `appointments_no_overlap` que declara
-- `20260711100000_initial_schema.sql` NO existe en producción —comprobado el
-- 01-09-2026— y no se puede crear: ya hay 4 pares de citas activas solapadas.
--
-- Quien lo impide es `appointment_blocks`, con su propio EXCLUDE. Un trigger
-- (`app.sync_appointment_blocks`) traduce cada cita a bloques por fases, y es
-- el bloque el que choca y devuelve 23P01. Por eso la marca tiene que llegar
-- hasta el BLOQUE: marcar solo la cita no serviría de nada.
--
-- ── POR QUÉ NO SE QUITA EL CONSTRAINT ───────────────────────────────────────
-- Existe por una razón buena: sin él, la reserva online vendería dos veces el
-- mismo hueco. Quitarlo arreglaría lo de Nadia y rompería lo demás.
--
-- Se hace al revés: el bloque lleva `allow_overlap`, y el constraint solo mira
-- los que NO están marcados. Los normales siguen sin poder pisarse. El solape
-- deja de ser un agujero y pasa a ser un acto explícito que queda registrado.
--
-- ── POR QUÉ EL PERMISO ES POR PERSONA Y NO POR ROL ──────────────────────────
-- José lo pidió así: «que pueda solaparlas solo ella». No es el rol lo que
-- decide —Nadia es `owner` y hay más `owner` en la base—, es una autorización
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
  'Esta cita se creó sabiendo que pisa a otra. Queda en la fila para saber después quién solapó qué; el efecto real lo tiene la copia en appointment_blocks.';

-- ── Y su copia en el bloque, que es donde muerde ────────────────────────────
-- Se copia en vez de consultarse con un join porque el constraint de exclusión
-- solo puede mirar columnas de SU tabla: un EXCLUDE no puede preguntar por la
-- cita. La copia la mantiene el trigger de sincronización, que ya reescribe los
-- bloques enteros cada vez que la cita cambia.
alter table public.appointment_blocks
  add column if not exists allow_overlap boolean not null default false;

comment on column public.appointment_blocks.allow_overlap is
  'Copiado de appointments.allow_overlap por app.sync_appointment_blocks. Un bloque marcado queda FUERA del constraint de exclusión: ni estorba ni se deja estorbar.';

-- ── El constraint, que ahora respeta la marca ───────────────────────────────
-- Añadir el `where` solo lo hace MÁS permisivo, así que no puede fallar con los
-- datos actuales: todo lo que cumplía la regla anterior sigue cumpliéndola.
alter table public.appointment_blocks
  drop constraint if exists appointment_blocks_no_overlap;

alter table public.appointment_blocks
  add constraint appointment_blocks_no_overlap
  exclude using gist (
    professional_id with =,
    salon_id with =,
    occupied_range with &&
  )
  where (not allow_overlap);

-- ── Que la marca llegue al bloque ───────────────────────────────────────────
-- Misma función que ya había, con `new.allow_overlap` añadido a los dos
-- inserts. Se reescribe entera porque `create or replace` no admite parches.
create or replace function app.sync_appointment_blocks()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_app_min    integer;
  v_exp_min    integer;
  v_post_min   integer;
  v_app_end    timestamptz;
  v_post_start timestamptz;
  v_post_end   timestamptz;
begin

  -- ── Limpiar bloques existentes ──────────────────────────────────────────
  if tg_op = 'DELETE' then
    delete from public.appointment_blocks where appointment_id = old.id;
    return old;
  else
    delete from public.appointment_blocks where appointment_id = new.id;
  end if;

  -- ── Sin bloques si la cita no está activa ───────────────────────────────
  if new.status not in ('pending', 'confirmed') then
    return new;
  end if;

  -- ── Duraciones de fases desde el servicio ────────────────────────────────
  select s.application_min, s.exposure_min, s.post_exposure_min
  into   v_app_min, v_exp_min, v_post_min
  from   public.services s
  where  s.id = new.service_id;

  -- Cita sin servicio resoluble: no se inventa ocupación.
  if v_app_min is null then
    return new;
  end if;

  -- ── Extremos, ACOTADOS al final real de la cita ─────────────────────────
  v_app_end    := least(new.starts_at + (v_app_min * interval '1 minute'), new.ends_at);
  v_post_start := new.starts_at + ((v_app_min + v_exp_min) * interval '1 minute');
  v_post_end   := least(v_post_start + (v_post_min * interval '1 minute'), new.ends_at);

  -- ── Bloque de aplicación ─────────────────────────────────────────────────
  if v_app_end > new.starts_at then
    insert into public.appointment_blocks
      (appointment_id, professional_id, salon_id, occupied_range, phase, allow_overlap)
    values
      (new.id, new.professional_id, new.salon_id,
       tstzrange(new.starts_at, v_app_end, '[)'),
       'application', new.allow_overlap);
  end if;

  -- ── Bloque post-exposición ───────────────────────────────────────────────
  if v_post_min > 0 and v_post_start < new.ends_at and v_post_end > v_post_start then
    insert into public.appointment_blocks
      (appointment_id, professional_id, salon_id, occupied_range, phase, allow_overlap)
    values
      (new.id, new.professional_id, new.salon_id,
       tstzrange(v_post_start, v_post_end, '[)'),
       'post_exposure', new.allow_overlap);
  end if;

  return new;
end;
$function$;

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
