-- ============================================================================
-- Reversa: Integración TPV ↔ Agenda/Reservas (sub-7)
-- Archivo:  20260713000005_tpv_reservas_integracion.down.sql
-- ----------------------------------------------------------------------------
-- Elimina lo creado por la .up: las 2 vistas de integración y el índice único
-- parcial. No toca `reservas` (nunca se modificó) ni el resto del módulo TPV.
-- ============================================================================

BEGIN;

DROP VIEW IF EXISTS public.tpv_v_reservas_cobro;
DROP VIEW IF EXISTS public.tpv_v_reserva_precarga;

DROP INDEX IF EXISTS public.tpv_ventas_reserva_activa_uq;

COMMIT;
