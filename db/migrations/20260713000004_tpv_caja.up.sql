-- ============================================================================
-- Migración: Movimientos de caja del TPV (entradas/salidas manuales)
-- Archivo:   20260713000004_tpv_caja.up.sql
-- Autor:     HAT3X · UI Designer (vertical webs-apps) · sub-5
-- Depende de: 20260713000001_tpv_module.up.sql · 20260713000002_tpv_rls.up.sql
-- ----------------------------------------------------------------------------
-- Objetivo (sub-5):
--   El módulo de caja necesita registrar movimientos de efectivo que NO son
--   cobros de ticket: aportaciones de fondo, retiradas para gastos, pago a
--   proveedor en efectivo, etc. Sin ellos el arqueo (efectivo teórico esperado
--   vs. contado) no cuadraría con la realidad del cajón.
--
--   La apertura (`saldo_inicial`) y el cierre (`saldo_final_teorico`,
--   `saldo_final_real`, `descuadre`) ya viven en `tpv_sesiones_caja` (sub-1);
--   aquí sólo se añade la tabla de MOVIMIENTOS que alimenta el teórico:
--
--       teórico = saldo_inicial
--               + Σ cobros en efectivo de la sesión
--               + Σ entradas manuales
--               − Σ salidas manuales
--
-- Naturaleza: ADITIVA. Un ENUM nuevo y una tabla nueva con su RLS de
--   aislamiento por salón. No altera columnas ni datos existentes.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 0. Tipo de movimiento (entrada suma al cajón, salida resta).
-- ----------------------------------------------------------------------------
CREATE TYPE public.tpv_tipo_movimiento_caja AS ENUM ('entrada', 'salida');

-- ----------------------------------------------------------------------------
-- 1. MOVIMIENTOS DE CAJA
--    Cada fila es un ajuste manual de efectivo sobre una sesión de caja abierta.
--    `importe` es SIEMPRE positivo; el signo lo aporta `tipo`. `salon_id` va
--    denormalizado (como en el resto del TPV) para aplicar la misma RLS sin JOIN.
-- ----------------------------------------------------------------------------
CREATE TABLE public.tpv_movimientos_caja (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    sesion_caja_id uuid NOT NULL,
    salon_id       uuid NOT NULL,
    empleado_id    uuid,                       -- quién registró el movimiento

    tipo           public.tpv_tipo_movimiento_caja NOT NULL,
    importe        numeric(12,2) NOT NULL CHECK (importe > 0),
    motivo         text NOT NULL
        CONSTRAINT tpv_movimientos_caja_motivo_chk
        CHECK (btrim(motivo) <> '' AND length(motivo) <= 300),

    created_at     timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT tpv_movimientos_caja_sesion_fk
        FOREIGN KEY (sesion_caja_id)
        REFERENCES public.tpv_sesiones_caja (id) ON DELETE CASCADE
);

-- Arqueo: recuperar todos los movimientos de una sesión ordenados por fecha.
CREATE INDEX tpv_movimientos_caja_sesion_idx
    ON public.tpv_movimientos_caja (sesion_caja_id, created_at);
CREATE INDEX tpv_movimientos_caja_salon_idx
    ON public.tpv_movimientos_caja (salon_id);

-- FK a salones sólo si la tabla existe y aún no está declarada (tolerante a CI).
DO $$
BEGIN
    IF to_regclass('public.salones') IS NOT NULL
       AND NOT EXISTS (
           SELECT 1 FROM pg_constraint
           WHERE conname = 'tpv_movimientos_caja_salon_fk'
       ) THEN
        ALTER TABLE public.tpv_movimientos_caja
            ADD CONSTRAINT tpv_movimientos_caja_salon_fk
            FOREIGN KEY (salon_id) REFERENCES public.salones (id) ON DELETE CASCADE;
    END IF;
END;
$$;

-- ----------------------------------------------------------------------------
-- 2. RLS de aislamiento por salón (mismo patrón que sub-2).
--    Reutiliza el helper `tpv_salones_del_usuario()` definido en la migración de
--    RLS. ENABLE + FORCE para aplicar también al propietario de la tabla.
-- ----------------------------------------------------------------------------
ALTER TABLE public.tpv_movimientos_caja ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tpv_movimientos_caja FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tpv_movimientos_caja_aislamiento ON public.tpv_movimientos_caja;
CREATE POLICY tpv_movimientos_caja_aislamiento ON public.tpv_movimientos_caja
    FOR ALL
    USING      (salon_id IN (SELECT public.tpv_salones_del_usuario()))
    WITH CHECK (salon_id IN (SELECT public.tpv_salones_del_usuario()));

COMMIT;

-- ============================================================================
-- NOTAS OPERATIVAS
--   · Un movimiento sólo tiene sentido sobre una sesión 'abierta'; esa regla la
--     aplica la Edge Function `tpv-movimiento-caja` (no un CHECK, para conservar
--     el histórico si la sesión se cierra después).
--   · El efectivo teórico del arqueo lo recalcula SIEMPRE el servidor desde los
--     pagos en efectivo + estos movimientos (fuente de verdad: shared/caja.ts).
--   · Verificación de aislamiento: ampliable en db/tests/rls_tpv_isolation_test.sql
-- ============================================================================
