-- ============================================================================
-- Reversa: Movimientos de caja del TPV
-- Archivo:   20260713000004_tpv_caja.down.sql
-- Autor:     HAT3X · UI Designer (vertical webs-apps) · sub-5
-- ----------------------------------------------------------------------------
-- Deshace 20260713000004_tpv_caja.up.sql:
--   · Elimina la política RLS y la tabla `tpv_movimientos_caja`.
--   · Retira el ENUM `tpv_tipo_movimiento_caja`.
--
-- ADVERTENCIA: eliminar `tpv_movimientos_caja` DESTRUYE el histórico de ajustes
--   manuales de efectivo. Los arqueos ya cerrados conservan su `descuadre` en
--   `tpv_sesiones_caja`, pero se pierde el detalle de qué movimientos lo
--   componían. Ejecutar sólo donde esa pérdida sea aceptable.
-- ============================================================================

BEGIN;

DROP POLICY IF EXISTS tpv_movimientos_caja_aislamiento ON public.tpv_movimientos_caja;
DROP TABLE IF EXISTS public.tpv_movimientos_caja;
DROP TYPE  IF EXISTS public.tpv_tipo_movimiento_caja;

COMMIT;
