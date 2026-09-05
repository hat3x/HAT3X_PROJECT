-- ============================================================================
-- Migración: Integración TPV ↔ Agenda/Reservas (sub-7)
-- Archivo:   20260713000005_tpv_reservas_integracion.up.sql
-- Autor:     HAT3X · Integration Developer (vertical webs-apps) · sub-7
-- Fecha:     2026-07-13
-- Depende de: 20260713000001_tpv_module.up.sql · 20260713000002_tpv_rls.up.sql
-- ----------------------------------------------------------------------------
-- Objetivo (sub-7):
--   Conectar el TPV con la agenda existente para (1) precargar un ticket a
--   partir de una reserva completada (servicio + cliente) y (2) exponer el
--   ENLACE BIDIRECCIONAL de estado (reserva ↔ ticket / reserva cobrada).
--
-- Naturaleza: ADITIVA y NO INVASIVA.
--   · NO altera la tabla `public.reservas` ni ninguna tabla de la agenda: el
--     flujo de reservas actual queda intacto.
--   · El enlace hacia atrás (reserva → ticket / cobro) se DERIVA con una vista
--     sobre `tpv_ventas`; no se escribe estado en `reservas`.
--   · Sólo crea: 1 índice único parcial sobre NUESTRA tabla `tpv_ventas` y 2
--     vistas nuevas con prefijo `tpv_v_`.
--
-- Enlace hacia adelante (ticket → reserva): ya existe la columna
--   `tpv_ventas.reserva_id` (creada en 20260713000001) con su FK tolerante a
--   `public.reservas`. Esta migración añade la integridad y las lecturas.
--
-- Supuestos sobre el esquema existente (ver db/README.md → "Integración TPV ↔
-- reservas"). Las vistas se crean SÓLO si `public.reservas` existe (bloque DO
-- tolerante); si tu agenda usa otros nombres de columna, adapta ÚNICAMENTE la
-- vista `tpv_v_reserva_precarga` — el resto del TPV no cambia.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. INTEGRIDAD: como máximo UN ticket "vivo" (no anulado) por reserva.
--    Impide cobrar dos veces la misma reserva y hace determinista el enlace
--    reserva → ticket. Sólo afecta a ventas con `reserva_id` (las ventas de
--    mostrador con reserva_id NULL no se ven restringidas).
-- ----------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS tpv_ventas_reserva_activa_uq
    ON public.tpv_ventas (reserva_id)
    WHERE reserva_id IS NOT NULL AND estado <> 'anulada';

-- ============================================================================
-- 2. VISTAS DE INTEGRACIÓN (creadas sólo si existe `public.reservas`)
--    `security_invoker = true` (PG15+): la RLS de `reservas` y de `tpv_ventas`
--    se aplica con la identidad del usuario que consulta. Un usuario sólo ve
--    reservas/ventas de sus salones (aislamiento de sub-2 extremo a extremo).
-- ============================================================================
DO $$
BEGIN
    IF to_regclass('public.reservas') IS NULL THEN
        RAISE NOTICE 'tpv: tabla public.reservas no encontrada; vistas de integración omitidas.';
        RETURN;
    END IF;

    -- ------------------------------------------------------------------------
    -- 2a. PRECARGA: normaliza una reserva a la forma que el TPV necesita para
    --     abrir un ticket (servicio como línea + cliente/empleado). Encapsula
    --     TODOS los supuestos sobre el esquema de la agenda en un único lugar.
    --
    --     Supone en `public.reservas` las columnas: id, salon_id, cliente_id,
    --     empleado_id, servicio_id, servicio_nombre, precio (BASE sin IVA),
    --     tipo_impuesto (% IVA), estado, inicio_at.
    --
    --     ¿Tu precio/nombre viven en `public.servicios`? Sustituye el cuerpo por
    --     el JOIN documentado en db/README.md; NADA más del TPV cambia.
    -- ------------------------------------------------------------------------
    EXECUTE $view$
        CREATE OR REPLACE VIEW public.tpv_v_reserva_precarga
        WITH (security_invoker = true) AS
        SELECT
            r.id                                          AS reserva_id,
            r.salon_id                                    AS salon_id,
            r.cliente_id                                  AS cliente_id,
            r.empleado_id                                 AS empleado_id,
            r.servicio_id                                 AS servicio_id,
            COALESCE(NULLIF(btrim(r.servicio_nombre), ''), 'Servicio')
                                                          AS servicio_nombre,
            COALESCE(r.precio, 0)::numeric(12,2)          AS precio,
            COALESCE(r.tipo_impuesto, 21)::numeric(5,2)   AS tipo_impuesto,
            r.estado::text                                AS reserva_estado,
            r.inicio_at                                   AS inicio_at
        FROM public.reservas r
    $view$;

    COMMENT ON VIEW public.tpv_v_reserva_precarga IS
        'TPV sub-7: normaliza una reserva de la agenda a la forma de precarga de '
        'ticket (servicio + cliente). Unico punto de acoplamiento con el esquema '
        'de reservas: adaptala si tus columnas difieren.';

    GRANT SELECT ON public.tpv_v_reserva_precarga TO authenticated;

    -- ------------------------------------------------------------------------
    -- 2b. COBRO: enlace BIDIRECCIONAL derivado. Para cada reserva expone su
    --     ticket "vivo" (si lo hay) y el estado de cobro, SIN escribir en
    --     `reservas`. `estado_cobro` ∈
    --       'sin_ticket'     → no hay ticket asociado todavía
    --       'ticket_abierto' → ticket creado, aún no cobrado
    --       'cobrada'        → ticket 'pagada'
    --       'reembolsada'    → ticket 'reembolsada'
    -- ------------------------------------------------------------------------
    EXECUTE $view$
        CREATE OR REPLACE VIEW public.tpv_v_reservas_cobro
        WITH (security_invoker = true) AS
        SELECT
            r.id            AS reserva_id,
            r.salon_id      AS salon_id,
            v.id            AS venta_id,
            v.numero_ticket AS numero_ticket,
            v.estado        AS ticket_estado,
            v.total         AS total,
            CASE
                WHEN v.id IS NULL              THEN 'sin_ticket'
                WHEN v.estado = 'pagada'       THEN 'cobrada'
                WHEN v.estado = 'reembolsada'  THEN 'reembolsada'
                ELSE 'ticket_abierto'
            END             AS estado_cobro,
            v.updated_at    AS actualizado_at
        FROM public.reservas r
        LEFT JOIN LATERAL (
            SELECT tv.id, tv.numero_ticket, tv.estado, tv.total, tv.updated_at
              FROM public.tpv_ventas tv
             WHERE tv.reserva_id = r.id
               AND tv.estado <> 'anulada'
             ORDER BY tv.created_at DESC
             LIMIT 1
        ) v ON true
    $view$;

    COMMENT ON VIEW public.tpv_v_reservas_cobro IS
        'TPV sub-7: enlace bidireccional derivado reserva -> ticket vivo + estado '
        'de cobro. No modifica reservas; se calcula sobre tpv_ventas.';

    GRANT SELECT ON public.tpv_v_reservas_cobro TO authenticated;
END;
$$;

COMMIT;

-- ============================================================================
-- NOTA — Variante si el precio/nombre del servicio viven en `public.servicios`:
--   reemplaza el cuerpo de `tpv_v_reserva_precarga` por (ejemplo):
--
--     ... FROM public.reservas r
--         LEFT JOIN public.servicios s ON s.id = r.servicio_id
--     con  s.nombre AS servicio_nombre, s.precio AS precio, s.iva AS tipo_impuesto
--
--   Es el ÚNICO objeto a tocar: las Edge Functions consumen la vista, no las
--   tablas de la agenda.
-- ============================================================================
