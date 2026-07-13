-- ============================================================================
-- Reversa: Facturación TPV (config por salón + snapshot fiscal)
-- Archivo:   20260713000003_tpv_facturacion.down.sql
-- Autor:     HAT3X · Database Optimizer (vertical webs-apps)
-- Fecha:     2026-07-13
-- ----------------------------------------------------------------------------
-- Deshace 20260713000003_tpv_facturacion.up.sql:
--   · Elimina la política RLS y la tabla `tpv_config_facturacion`.
--   · Retira las columnas de snapshot añadidas a `tpv_facturas`.
--
-- ADVERTENCIA: retirar las columnas de snapshot de `tpv_facturas` DESTRUYE los
--   datos fiscales congelados (emisor, desglose de IVA, líneas) de las facturas
--   ya emitidas. Ejecutar sólo en entornos donde esa pérdida sea aceptable.
-- ============================================================================

BEGIN;

-- 1. Config de facturación ----------------------------------------------------
DROP POLICY IF EXISTS tpv_config_facturacion_aislamiento ON public.tpv_config_facturacion;
DROP TABLE IF EXISTS public.tpv_config_facturacion;

-- 2. Columnas de snapshot de tpv_facturas -------------------------------------
ALTER TABLE public.tpv_facturas
    DROP COLUMN IF EXISTS emisor_razon_social,
    DROP COLUMN IF EXISTS emisor_nif,
    DROP COLUMN IF EXISTS emisor_direccion_fiscal,
    DROP COLUMN IF EXISTS cliente_email,
    DROP COLUMN IF EXISTS desglose_iva,
    DROP COLUMN IF EXISTS lineas_snapshot,
    DROP COLUMN IF EXISTS pie_factura,
    DROP COLUMN IF EXISTS moneda;

COMMIT;
