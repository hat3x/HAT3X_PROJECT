-- ============================================================================
-- Reversa de: 20260713000001_tpv_module.up.sql
-- Archivo:    20260713000001_tpv_module.down.sql
-- ----------------------------------------------------------------------------
-- Elimina TODO el módulo TPV. No toca ninguna tabla del esquema existente.
-- El orden respeta las dependencias de FK (hijas antes que padres). Los
-- DROP TABLE en cascada retiran también sus triggers/índices/constraints.
--
-- ⚠️ DESTRUCTIVO: borra ventas, pagos y facturas. Ejecutar sólo en entornos
--    donde se acepte la pérdida de estos datos.
-- ============================================================================

BEGIN;

DROP TABLE IF EXISTS public.tpv_facturas       CASCADE;
DROP TABLE IF EXISTS public.tpv_pagos          CASCADE;
DROP TABLE IF EXISTS public.tpv_lineas_ticket  CASCADE;
DROP TABLE IF EXISTS public.tpv_ventas         CASCADE;
DROP TABLE IF EXISTS public.tpv_metodos_pago   CASCADE;
DROP TABLE IF EXISTS public.tpv_sesiones_caja  CASCADE;

DROP FUNCTION IF EXISTS public.tpv_asignar_numero_factura();
DROP FUNCTION IF EXISTS public.tpv_asignar_numero_ticket();
DROP FUNCTION IF EXISTS public.tpv_set_updated_at();

DROP TYPE IF EXISTS public.tpv_tipo_linea;
DROP TYPE IF EXISTS public.tpv_estado_factura;
DROP TYPE IF EXISTS public.tpv_estado_pago;
DROP TYPE IF EXISTS public.tpv_estado_venta;
DROP TYPE IF EXISTS public.tpv_estado_caja;

COMMIT;
