-- ============================================================================
-- Reversa: Feature flag de activación del TPV por salón
-- Archivo:  20260713000006_tpv_feature_flag.down.sql
-- ----------------------------------------------------------------------------
-- Elimina únicamente lo creado por 20260713000006_tpv_feature_flag.up.sql.
-- No toca ningún otro objeto TPV ni ninguna tabla existente.
-- ============================================================================

BEGIN;

DROP POLICY IF EXISTS tpv_salones_habilitados_lectura ON public.tpv_salones_habilitados;
DROP FUNCTION IF EXISTS public.tpv_salon_habilitado(uuid);
DROP TABLE    IF EXISTS public.tpv_salones_habilitados;

COMMIT;
