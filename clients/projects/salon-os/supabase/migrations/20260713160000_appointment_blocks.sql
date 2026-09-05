-- =============================================================================
-- salon-os — Migración: appointment_blocks para solapamiento por fases
--
-- Problema: con servicios de 3 fases (application / exposure / post_exposure)
-- el profesional está LIBRE durante la exposición y puede atender a otro cliente.
-- La exclusion constraint simple en appointments (sobre el rango total) impide
-- esto incorrectamente.
--
-- Solución: tabla auxiliar appointment_blocks que almacena SOLO los rangos en
-- que el profesional está físicamente ocupado (application + post_exposure).
-- La exclusion constraint se traslada aquí. La original en appointments se elimina.
--
-- Trigger AFTER INSERT/UPDATE/DELETE en appointments regenera los bloques de
-- forma automática y atómica en la misma transacción.
-- =============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Tabla appointment_blocks
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE public.appointment_blocks (
  id               uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id   uuid         NOT NULL
                   REFERENCES public.appointments (id) ON DELETE CASCADE,
  professional_id  uuid         NOT NULL
                   REFERENCES public.professionals (id) ON DELETE CASCADE,
  salon_id         uuid         NOT NULL
                   REFERENCES public.salons (id) ON DELETE CASCADE,
  occupied_range   tstzrange    NOT NULL,
  -- Etiqueta de fase para trazabilidad (no afecta al constraint de solapamiento)
  phase            text         NOT NULL
                   CHECK (phase IN ('application', 'post_exposure'))
);

-- Exclusion constraint: el mismo profesional en el mismo salón no puede tener
-- dos bloques ocupados que se solapen en el tiempo
ALTER TABLE public.appointment_blocks
  ADD CONSTRAINT appointment_blocks_no_overlap
  EXCLUDE USING GIST (
    professional_id  WITH =,
    salon_id         WITH =,
    occupied_range   WITH &&
  );

-- Índice de soporte para búsquedas por cita (ON DELETE CASCADE lo usa implícitamente)
CREATE INDEX idx_appointment_blocks_appointment_id
  ON public.appointment_blocks (appointment_id);

-- Índice GIST compuesto para consultas de disponibilidad en rango de tiempo
CREATE INDEX idx_appointment_blocks_professional_range
  ON public.appointment_blocks USING GIST (professional_id, occupied_range);

COMMENT ON TABLE public.appointment_blocks IS
  'Rangos de tiempo en que un profesional está físicamente ocupado. '
  'Incluye fases application y post_exposure; excluye exposure (el profesional '
  'puede atender a otro cliente durante el procesado). '
  'Gestionada automáticamente por trg_appointment_blocks_sync.';

COMMENT ON COLUMN public.appointment_blocks.phase IS
  'Fase del servicio que genera el bloque: application (primera fase activa) '
  'o post_exposure (fase final activa tras el procesado).';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Eliminar la exclusion constraint original de appointments
--    (sustituida por appointment_blocks_no_overlap)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.appointments
  DROP CONSTRAINT appointments_no_overlap;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Función que sincroniza appointment_blocks desde una fila de appointments
--
--    Lógica por operación:
--      INSERT → elimina bloques anteriores (defensivo) + inserta los nuevos
--      UPDATE → elimina bloques de la versión anterior + inserta según datos nuevos
--      DELETE → elimina los bloques (ON DELETE CASCADE los borraría igual,
--               pero aquí es explícito para un RETURN OLD limpio)
--
--    Bloques que se insertan para una cita activa (pending/confirmed):
--      · application:   [starts_at,                starts_at + application_min)
--      · post_exposure: [starts_at + app + exp,    ends_at)   — solo si > 0 min
--
--    Si exposure_min = 0 los dos bloques son contiguos; los rangos '[)' son
--    adyacentes (no solapados), por lo que el constraint los acepta correctamente.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION app.sync_appointment_blocks()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_app_min    integer;
  v_exp_min    integer;
  v_post_min   integer;
  v_app_end    timestamptz;
  v_post_start timestamptz;
  v_post_end   timestamptz;
BEGIN

  -- ── Limpiar bloques existentes ──────────────────────────────────────────
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.appointment_blocks WHERE appointment_id = OLD.id;
    RETURN OLD;
  ELSE
    DELETE FROM public.appointment_blocks WHERE appointment_id = NEW.id;
  END IF;

  -- ── Sin bloques si la cita no está activa ───────────────────────────────
  IF NEW.status NOT IN ('pending', 'confirmed') THEN
    RETURN NEW;
  END IF;

  -- ── Obtener duraciones de fases desde el servicio ────────────────────────
  SELECT s.application_min, s.exposure_min, s.post_exposure_min
  INTO   v_app_min, v_exp_min, v_post_min
  FROM   public.services s
  WHERE  s.id = NEW.service_id;

  -- ── Calcular extremos ────────────────────────────────────────────────────
  v_app_end    := NEW.starts_at + (v_app_min * interval '1 minute');
  v_post_start := NEW.starts_at + ((v_app_min + v_exp_min) * interval '1 minute');
  v_post_end   := v_post_start  + (v_post_min * interval '1 minute');

  -- ── Bloque de aplicación (siempre: application_min >= 1) ─────────────────
  INSERT INTO public.appointment_blocks
    (appointment_id, professional_id, salon_id, occupied_range, phase)
  VALUES
    (NEW.id, NEW.professional_id, NEW.salon_id,
     tstzrange(NEW.starts_at, v_app_end, '[)'),
     'application');

  -- ── Bloque post-exposición (solo si tiene duración > 0) ──────────────────
  IF v_post_min > 0 THEN
    INSERT INTO public.appointment_blocks
      (appointment_id, professional_id, salon_id, occupied_range, phase)
    VALUES
      (NEW.id, NEW.professional_id, NEW.salon_id,
       tstzrange(v_post_start, v_post_end, '[)'),
       'post_exposure');
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION app.sync_appointment_blocks() IS
  'Trigger function: mantiene appointment_blocks sincronizado con appointments. '
  'Genera bloques de application y post_exposure; omite el tramo de exposure.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Trigger en appointments
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TRIGGER trg_appointment_blocks_sync
  AFTER INSERT OR UPDATE OR DELETE
  ON public.appointments
  FOR EACH ROW
  EXECUTE FUNCTION app.sync_appointment_blocks();

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Backfill: generar bloques para citas activas ya existentes
--    (creadas antes del trigger)
-- ─────────────────────────────────────────────────────────────────────────────

-- 5a. Bloque de aplicación para todas las citas activas existentes
INSERT INTO public.appointment_blocks
  (appointment_id, professional_id, salon_id, occupied_range, phase)
SELECT
  a.id,
  a.professional_id,
  a.salon_id,
  tstzrange(
    a.starts_at,
    a.starts_at + (s.application_min * interval '1 minute'),
    '[)'
  ),
  'application'
FROM public.appointments a
JOIN public.services s ON s.id = a.service_id
WHERE a.status IN ('pending', 'confirmed');

-- 5b. Bloque post-exposición para citas activas con post_exposure_min > 0
INSERT INTO public.appointment_blocks
  (appointment_id, professional_id, salon_id, occupied_range, phase)
SELECT
  a.id,
  a.professional_id,
  a.salon_id,
  tstzrange(
    a.starts_at + ((s.application_min + s.exposure_min) * interval '1 minute'),
    a.starts_at + ((s.application_min + s.exposure_min + s.post_exposure_min) * interval '1 minute'),
    '[)'
  ),
  'post_exposure'
FROM public.appointments a
JOIN public.services s ON s.id = a.service_id
WHERE a.status IN ('pending', 'confirmed')
  AND s.post_exposure_min > 0;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. RLS — appointment_blocks es interna; los clientes pueden leerla
--    (agenda del día) pero no modificarla directamente.
--    Las escrituras van siempre a través del trigger SECURITY DEFINER.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.appointment_blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members_select_appointment_blocks"
  ON public.appointment_blocks FOR SELECT TO authenticated
  USING (salon_id IN (SELECT app.user_salon_ids()));

COMMIT;
