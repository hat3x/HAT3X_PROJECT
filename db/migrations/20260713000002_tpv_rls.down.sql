-- ============================================================================
-- Reversa: RLS multi-salón para el módulo TPV
-- Archivo:   20260713000002_tpv_rls.down.sql
-- Autor:     HAT3X · pm-security (vertical webs-apps)
-- Fecha:     2026-07-13
-- ----------------------------------------------------------------------------
-- Deshace 20260713000002_tpv_rls.up.sql: elimina políticas, desactiva RLS y
-- borra las funciones helper.
--
-- IMPORTANTE: NO se elimina la tabla `public.salon_miembros`. La migración up
-- la crea con IF NOT EXISTS y puede pertenecer al esquema principal / contener
-- datos de pertenencia reales. Borrarla aquí sería destructivo. Si realmente
-- deseas eliminarla, hazlo de forma manual y consciente.
-- ============================================================================

BEGIN;

-- 1. Políticas -----------------------------------------------------------------
DROP POLICY IF EXISTS tpv_sesiones_caja_aislamiento ON public.tpv_sesiones_caja;
DROP POLICY IF EXISTS tpv_metodos_pago_aislamiento  ON public.tpv_metodos_pago;
DROP POLICY IF EXISTS tpv_ventas_aislamiento        ON public.tpv_ventas;
DROP POLICY IF EXISTS tpv_lineas_ticket_aislamiento ON public.tpv_lineas_ticket;
DROP POLICY IF EXISTS tpv_pagos_aislamiento         ON public.tpv_pagos;
DROP POLICY IF EXISTS tpv_facturas_aislamiento      ON public.tpv_facturas;

-- 2. Desactivar RLS (FORCE se limpia junto con DISABLE) -------------------------
ALTER TABLE public.tpv_sesiones_caja NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.tpv_sesiones_caja DISABLE  ROW LEVEL SECURITY;

ALTER TABLE public.tpv_metodos_pago  NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.tpv_metodos_pago  DISABLE  ROW LEVEL SECURITY;

ALTER TABLE public.tpv_ventas        NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.tpv_ventas        DISABLE  ROW LEVEL SECURITY;

ALTER TABLE public.tpv_lineas_ticket NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.tpv_lineas_ticket DISABLE  ROW LEVEL SECURITY;

ALTER TABLE public.tpv_pagos         NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.tpv_pagos         DISABLE  ROW LEVEL SECURITY;

ALTER TABLE public.tpv_facturas      NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.tpv_facturas      DISABLE  ROW LEVEL SECURITY;

-- 3. Funciones helper ----------------------------------------------------------
DROP FUNCTION IF EXISTS public.tpv_salones_del_usuario();
DROP FUNCTION IF EXISTS public.tpv_current_uid();

COMMIT;

-- salon_miembros y sus índices se conservan a propósito (ver cabecera).
