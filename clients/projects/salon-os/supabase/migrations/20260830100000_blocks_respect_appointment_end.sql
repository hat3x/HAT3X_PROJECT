-- =============================================================================
-- salon-os — Migración: el hueco ocupado respeta la duración REAL de la cita
--
-- Nadia (Biodental) pidió poder dar una cita a la hora que quiera y de la
-- duración que quiera — "como si hago una revisión de dos minutos". No podía, y
-- por dos motivos distintos: la pantalla solo ofrecía huecos de 15 en 15 (eso
-- es interfaz y se arregla aparte) y ESTE, que es el de fondo.
--
-- El trigger calculaba el bloque a partir del `application_min` del SERVICIO e
-- ignoraba por completo el `ends_at` de la cita. Consecuencia: una revisión de
-- dos minutos seguía ocupando los treinta del servicio, la agenda mentía sobre
-- lo que está libre y la restricción de exclusión rechazaba la cita siguiente.
-- Es la misma raíz que dejó 21 citas de Espiral sin poder importarse.
--
-- El arreglo es acotar cada bloque al final real de la cita. Cuando la cita
-- dura lo que dice el servicio —el caso normal— `least` devuelve exactamente lo
-- mismo que antes: NADA cambia para las citas existentes. Solo deja de inventar
-- ocupación cuando alguien acorta una cita a propósito.
--
-- Lo que NO cambia: el modelo de fases. El tramo de exposición sigue sin
-- bloquear al profesional, que es lo que permite atender a otra persona
-- mientras un tinte o un composite reposa.
-- =============================================================================

begin;

create or replace function app.sync_appointment_blocks()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
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
  -- `least` es la clave de esta migración: con una cita de duración normal
  -- devuelve el mismo valor de siempre; con una acortada a mano, impide
  -- bloquear tiempo que la cita no ocupa.
  v_app_end    := least(new.starts_at + (v_app_min * interval '1 minute'), new.ends_at);
  v_post_start := new.starts_at + ((v_app_min + v_exp_min) * interval '1 minute');
  v_post_end   := least(v_post_start + (v_post_min * interval '1 minute'), new.ends_at);

  -- ── Bloque de aplicación ─────────────────────────────────────────────────
  -- Solo si tiene ancho. Una cita de duración cero no ocupa nada, y un rango
  -- vacío no aportaría más que ruido a la tabla de bloques.
  if v_app_end > new.starts_at then
    insert into public.appointment_blocks
      (appointment_id, professional_id, salon_id, occupied_range, phase)
    values
      (new.id, new.professional_id, new.salon_id,
       tstzrange(new.starts_at, v_app_end, '[)'),
       'application');
  end if;

  -- ── Bloque post-exposición ───────────────────────────────────────────────
  -- Solo si el servicio lo tiene Y cabe dentro de la cita. Si alguien acorta la
  -- cita por debajo del tramo de reposo, este bloque desaparece en lugar de
  -- sobresalir por el final y ocupar tiempo que ya no es de nadie.
  if v_post_min > 0 and v_post_start < new.ends_at and v_post_end > v_post_start then
    insert into public.appointment_blocks
      (appointment_id, professional_id, salon_id, occupied_range, phase)
    values
      (new.id, new.professional_id, new.salon_id,
       tstzrange(v_post_start, v_post_end, '[)'),
       'post_exposure');
  end if;

  return new;
end;
$$;

comment on function app.sync_appointment_blocks() is
  'Trigger: mantiene appointment_blocks sincronizado con appointments. Genera los bloques de application y post_exposure ACOTADOS al ends_at de la cita, y omite el tramo de exposure. El acotado permite citas más cortas que su servicio (una revisión de 2 minutos ocupa 2 minutos) sin cambiar nada para las de duración normal.';

commit;
