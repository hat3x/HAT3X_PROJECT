-- ============================================================================
-- Migración: Facturación TPV (config por salón + snapshot fiscal inmutable)
-- Archivo:   20260713000003_tpv_facturacion.up.sql
-- Autor:     HAT3X · Database Optimizer (vertical webs-apps)
-- Fecha:     2026-07-13
-- Depende de: 20260713000001_tpv_module.up.sql · 20260713000002_tpv_rls.up.sql
-- ----------------------------------------------------------------------------
-- Objetivo (sub-6):
--   Completar la emisión de facturas a partir de un ticket:
--     1) Configuración de facturación POR SALÓN: serie por defecto + datos
--        fiscales del emisor (razón social, NIF, dirección) + pie legal.
--     2) SNAPSHOT fiscal INMUTABLE en `tpv_facturas`: al emitir se congelan los
--        datos del emisor, el desglose de IVA y las líneas, de modo que la
--        factura es autocontenida y reimprimible aunque cambien config o ticket.
--
-- Naturaleza: ADITIVA. Sólo CREATE TABLE nueva y ALTER ... ADD COLUMN sobre
--   `tpv_facturas` (columnas nuevas, con DEFAULT → sin reescritura de tabla en
--   PostgreSQL 11+). No modifica datos existentes ni otras tablas.
--
-- Numeración: el correlativo por (salon_id, serie) SIN saltos ya lo garantiza
--   el trigger `tpv_asignar_numero_factura()` de la migración sub-1. Aquí sólo
--   se añade la CONFIGURACIÓN de la serie, no se toca la numeración.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. CONFIGURACIÓN DE FACTURACIÓN POR SALÓN
--    Una fila por salón. Guarda la serie por defecto y los datos fiscales del
--    EMISOR (el salón). Estos datos son la fuente al emitir; la factura los
--    copia como snapshot para no depender de cambios posteriores aquí.
-- ----------------------------------------------------------------------------
CREATE TABLE public.tpv_config_facturacion (
    salon_id                uuid PRIMARY KEY,

    -- Serie por defecto para las facturas nuevas del salón (p.ej. 'A', '2026').
    serie_por_defecto       text NOT NULL DEFAULT 'A'
        CONSTRAINT tpv_config_fact_serie_chk
        CHECK (btrim(serie_por_defecto) <> '' AND length(serie_por_defecto) <= 16),

    -- Datos fiscales del emisor (el salón). Nullable: se pueden completar más
    -- tarde; al emitir sin ellos se genera un tique/factura simplificada.
    emisor_razon_social     text,
    emisor_nif              text,
    emisor_direccion_fiscal text,

    -- Pie legal opcional que se imprime al final de cada factura.
    pie_factura             text,
    -- Moneda ISO-4217 (España = EUR). Se propaga como snapshot a la factura.
    moneda                  text NOT NULL DEFAULT 'EUR'
        CONSTRAINT tpv_config_fact_moneda_chk CHECK (length(moneda) = 3),

    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT tpv_config_facturacion_salon_fk
        FOREIGN KEY (salon_id) REFERENCES public.salones (id) ON DELETE CASCADE
);

CREATE TRIGGER tpv_config_facturacion_set_updated_at
    BEFORE UPDATE ON public.tpv_config_facturacion
    FOR EACH ROW EXECUTE FUNCTION public.tpv_set_updated_at();

-- ----------------------------------------------------------------------------
-- 2. SNAPSHOT FISCAL INMUTABLE EN LA FACTURA
--    Al emitir se congelan aquí el emisor, el desglose de IVA por tipo y las
--    líneas facturadas. Así la factura se reimprime igual para siempre, sin
--    releer config (que puede cambiar) ni el ticket (que podría editarse).
--
--    Las columnas cliente (razon_social/nif/direccion_fiscal) y los importes
--    (base_imponible/impuestos/total) ya existen desde sub-1; aquí se añaden el
--    emisor, el desglose, las líneas y la moneda/pie del snapshot.
-- ----------------------------------------------------------------------------
ALTER TABLE public.tpv_facturas
    ADD COLUMN emisor_razon_social     text,
    ADD COLUMN emisor_nif              text,
    ADD COLUMN emisor_direccion_fiscal text,
    -- Domicilio/identificación adicional del cliente (además de los de sub-1).
    ADD COLUMN cliente_email           text,
    -- Desglose de IVA por tipo: [{ tipo_impuesto, base, cuota }, ...].
    ADD COLUMN desglose_iva            jsonb NOT NULL DEFAULT '[]'::jsonb,
    -- Líneas facturadas congeladas (copia de tpv_lineas_ticket en la emisión).
    ADD COLUMN lineas_snapshot         jsonb NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN pie_factura             text,
    ADD COLUMN moneda                  text NOT NULL DEFAULT 'EUR'
        CONSTRAINT tpv_facturas_moneda_chk CHECK (length(moneda) = 3);

COMMENT ON COLUMN public.tpv_facturas.desglose_iva IS
    'Snapshot del desglose de IVA por tipo: [{tipo_impuesto, base, cuota}]. Inmutable tras emitir.';
COMMENT ON COLUMN public.tpv_facturas.lineas_snapshot IS
    'Snapshot de las líneas facturadas. Hace la factura autocontenida y reimprimible.';

-- ----------------------------------------------------------------------------
-- 3. RLS de la nueva tabla de configuración: mismo aislamiento por salón que
--    el resto del TPV (helper `tpv_salones_del_usuario()` de sub-2).
--    `tpv_facturas` ya tiene RLS activada en sub-2; las columnas nuevas quedan
--    cubiertas por la política existente.
-- ----------------------------------------------------------------------------
ALTER TABLE public.tpv_config_facturacion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tpv_config_facturacion FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tpv_config_facturacion_aislamiento ON public.tpv_config_facturacion;
CREATE POLICY tpv_config_facturacion_aislamiento ON public.tpv_config_facturacion
    FOR ALL
    USING      (salon_id IN (SELECT public.tpv_salones_del_usuario()))
    WITH CHECK (salon_id IN (SELECT public.tpv_salones_del_usuario()));

COMMIT;

-- ============================================================================
-- NOTAS
--   · La numeración correlativa por (salon_id, serie) la asigna el trigger
--     tpv_asignar_numero_factura() (sub-1) bajo advisory lock: sin saltos y
--     seguro ante concurrencia. Cambiar de serie reinicia el correlativo de esa
--     serie desde 1, comportamiento fiscal esperado.
--   · Un ticket sólo puede facturarse una vez: UNIQUE(venta_id) en tpv_facturas
--     (sub-1). El segundo intento devuelve 23505 → CONFLICTO/TICKET_YA_FACTURADO.
-- ============================================================================
