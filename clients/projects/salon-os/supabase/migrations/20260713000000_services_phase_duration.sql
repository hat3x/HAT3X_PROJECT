-- =============================================================================
-- salon-os — Migración: duración por fases en servicios
--
-- Contexto: la duración de un servicio de salón se divide en 3 fases:
--   1. application_min  — tiempo de aplicación (siempre requerido)
--   2. exposure_min     — tiempo de exposición/procesado (ej: tinte actuando)
--   3. post_exposure_min — tiempo post-exposición (ej: aclarado, secado)
--
-- duration_minutes_total se mantiene como columna generada = suma de las 3 fases.
-- duration_minutes se re-crea también como generada (mismo cálculo) para que el
-- código existente que ya lo consulta siga funcionando sin cambios.
--
-- Dato existente: application_min ← duration_minutes actual (0 exposure/post).
-- =============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Añadir columnas de fases
--    application_min: DEFAULT 0 temporal para satisfacer NOT NULL con datos
--    existentes; el DEFAULT se elimina al final para que sea obligatorio en
--    nuevos registros.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.services
  ADD COLUMN application_min     integer NOT NULL DEFAULT 0
             CONSTRAINT services_application_min_check CHECK (application_min >= 1),
  ADD COLUMN exposure_min        integer NOT NULL DEFAULT 0
             CONSTRAINT services_exposure_min_check CHECK (exposure_min >= 0),
  ADD COLUMN post_exposure_min   integer NOT NULL DEFAULT 0
             CONSTRAINT services_post_exposure_min_check CHECK (post_exposure_min >= 0);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Migrar datos existentes: toda la duración va a la fase de aplicación
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE public.services
  SET application_min = duration_minutes;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Eliminar el DEFAULT temporal de application_min
--    A partir de ahora se debe proporcionar explícitamente en cada INSERT.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.services
  ALTER COLUMN application_min DROP DEFAULT;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Añadir duration_minutes_total como columna generada (suma de las 3 fases)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.services
  ADD COLUMN duration_minutes_total integer
    GENERATED ALWAYS AS (application_min + exposure_min + post_exposure_min) STORED;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Reemplazar duration_minutes (columna regular) por columna generada
--    La columna generada produce el mismo valor que duration_minutes_total,
--    manteniendo compatibilidad con todas las consultas existentes.
-- ─────────────────────────────────────────────────────────────────────────────

-- 5a. Eliminar la columna original (arrastra su CHECK constraint)
ALTER TABLE public.services
  DROP COLUMN duration_minutes;

-- 5b. Re-añadir como columna generada; el CHECK hereda la semántica original
ALTER TABLE public.services
  ADD COLUMN duration_minutes integer
    GENERATED ALWAYS AS (application_min + exposure_min + post_exposure_min) STORED
    CONSTRAINT services_duration_minutes_check
      CHECK (duration_minutes BETWEEN 5 AND 600);

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Constraint de integridad sobre el total (guard redundante pero explícito)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.services
  ADD CONSTRAINT services_duration_total_check
    CHECK (application_min + exposure_min + post_exposure_min BETWEEN 5 AND 600);

COMMIT;

-- Comentarios de columna para PostgREST / Supabase Studio
COMMENT ON COLUMN public.services.application_min IS
  'Minutos de aplicación activa del profesional (fase 1, obligatorio).';
COMMENT ON COLUMN public.services.exposure_min IS
  'Minutos de exposición/procesado sin intervención (fase 2, puede ser 0).';
COMMENT ON COLUMN public.services.post_exposure_min IS
  'Minutos de post-exposición: aclarado, secado, etc. (fase 3, puede ser 0).';
COMMENT ON COLUMN public.services.duration_minutes_total IS
  'Duración total en minutos = application_min + exposure_min + post_exposure_min. Columna generada, no editable.';
COMMENT ON COLUMN public.services.duration_minutes IS
  'Alias generado de duration_minutes_total para compatibilidad con código existente. No editable.';
