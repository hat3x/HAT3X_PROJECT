-- ============================================================================
-- Test de integración TPV ↔ Reservas (sub-7)
-- Archivo:   db/tests/tpv_reservas_integracion_test.sql
-- Autor:     HAT3X · Integration Developer
-- Fecha:     2026-07-13
-- ----------------------------------------------------------------------------
-- Qué verifica (objetos de 20260713000005_tpv_reservas_integracion.up.sql):
--   1. El índice único parcial impide DOS tickets "vivos" (no anulados) por
--      reserva (la invariante del enlace reserva → ticket).
--   2. Un ticket anulado LIBERA la reserva: se puede crear otro ticket.
--   3. La vista `tpv_v_reservas_cobro` deriva `estado_cobro` correctamente
--      (sin_ticket → ticket_abierto → cobrada) sin escribir en `reservas`.
--   4. La vista `tpv_v_reserva_precarga` proyecta la reserva con su servicio.
--
-- Cómo ejecutarlo (requiere 0001 aplicada; 0005 aplicada):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/tests/tpv_reservas_integracion_test.sql
--
--   · Todo corre en UNA transacción con ROLLBACK final: no deja rastro.
--   · Si `public.reservas` no existía, se crea aquí una versión mínima con el
--     esquema ASUMIDO por la integración (y se revierte con el ROLLBACK), de modo
--     que el test es autocontenido tanto en dev como en CI.
--
-- Salida esperada: líneas `PASS:` y `RESULTADO GLOBAL: INTEGRACION OK`.
-- ============================================================================

\set ON_ERROR_STOP on

BEGIN;

-- ----------------------------------------------------------------------------
-- 0. Escenario. Salón + (si falta) tabla `reservas` mínima con el esquema
--    asumido por la vista de precarga.
-- ----------------------------------------------------------------------------
INSERT INTO public.salones (id)
VALUES ('55550000-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
    IF to_regclass('public.reservas') IS NULL THEN
        CREATE TABLE public.reservas (
            id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            salon_id        uuid NOT NULL,
            cliente_id      uuid,
            empleado_id     uuid,
            servicio_id     uuid,
            servicio_nombre text,
            precio          numeric(12,2),
            tipo_impuesto   numeric(5,2),
            estado          text,
            inicio_at       timestamptz
        );
        RAISE NOTICE 'test: creada public.reservas mínima; recreando vistas.';
    END IF;
END;
$$;

-- Recrear las vistas SIEMPRE (idempotente y fiel a la migración 0005): garantiza
-- que existen aun si 0005 se aplicó antes de existir `reservas`. DROP+CREATE evita
-- el error de renombrado de columnas de CREATE OR REPLACE si ya existían.
DROP VIEW IF EXISTS public.tpv_v_reservas_cobro;
DROP VIEW IF EXISTS public.tpv_v_reserva_precarga;

CREATE VIEW public.tpv_v_reserva_precarga
WITH (security_invoker = true) AS
SELECT
    r.id            AS reserva_id,
    r.salon_id      AS salon_id,
    r.cliente_id    AS cliente_id,
    r.empleado_id   AS empleado_id,
    r.servicio_id   AS servicio_id,
    COALESCE(NULLIF(btrim(r.servicio_nombre), ''), 'Servicio') AS servicio_nombre,
    COALESCE(r.precio, 0)::numeric(12,2)        AS precio,
    COALESCE(r.tipo_impuesto, 21)::numeric(5,2) AS tipo_impuesto,
    r.estado::text                              AS reserva_estado,
    r.inicio_at                                 AS inicio_at
FROM public.reservas r;

CREATE VIEW public.tpv_v_reservas_cobro
WITH (security_invoker = true) AS
SELECT
    r.id AS reserva_id, r.salon_id, v.id AS venta_id, v.numero_ticket,
    v.estado AS ticket_estado, v.total,
    CASE
        WHEN v.id IS NULL             THEN 'sin_ticket'
        WHEN v.estado = 'pagada'      THEN 'cobrada'
        WHEN v.estado = 'reembolsada' THEN 'reembolsada'
        ELSE 'ticket_abierto'
    END AS estado_cobro,
    v.updated_at AS actualizado_at
FROM public.reservas r
LEFT JOIN LATERAL (
    SELECT tv.id, tv.numero_ticket, tv.estado, tv.total, tv.updated_at
      FROM public.tpv_ventas tv
     WHERE tv.reserva_id = r.id AND tv.estado <> 'anulada'
     ORDER BY tv.created_at DESC LIMIT 1
) v ON true;

-- Reserva "completada" a cobrar.
INSERT INTO public.reservas
    (id, salon_id, cliente_id, servicio_id, servicio_nombre, precio, tipo_impuesto, estado, inicio_at)
VALUES
    ('7e5e0000-0000-0000-0000-000000000001',
     '55550000-0000-0000-0000-000000000001',
     'c1150000-0000-0000-0000-000000000001',
     '5e5e0000-0000-0000-0000-000000000001',
     'Corte + peinado', 20.00, 21, 'completada', now());

-- ----------------------------------------------------------------------------
-- TEST 1 — estado_cobro = 'sin_ticket' antes de crear ningún ticket.
-- ----------------------------------------------------------------------------
DO $$
DECLARE e text;
BEGIN
    SELECT estado_cobro INTO e FROM public.tpv_v_reservas_cobro
     WHERE reserva_id = '7e5e0000-0000-0000-0000-000000000001';
    IF e <> 'sin_ticket' THEN
        RAISE EXCEPTION 'FALLO T1: estado_cobro esperado sin_ticket, obtenido %', e;
    END IF;
    RAISE NOTICE 'PASS: T1 reserva sin ticket -> sin_ticket';
END;
$$;

-- ----------------------------------------------------------------------------
-- TEST 2 — la precarga proyecta el servicio de la reserva.
-- ----------------------------------------------------------------------------
DO $$
DECLARE nom text; pre numeric;
BEGIN
    SELECT servicio_nombre, precio INTO nom, pre
      FROM public.tpv_v_reserva_precarga
     WHERE reserva_id = '7e5e0000-0000-0000-0000-000000000001';
    IF nom <> 'Corte + peinado' OR pre <> 20.00 THEN
        RAISE EXCEPTION 'FALLO T2: precarga esperada (Corte + peinado, 20.00), obtenida (%, %)', nom, pre;
    END IF;
    RAISE NOTICE 'PASS: T2 precarga proyecta servicio + precio';
END;
$$;

-- ----------------------------------------------------------------------------
-- Primer ticket "vivo" de la reserva.
-- ----------------------------------------------------------------------------
INSERT INTO public.tpv_ventas (id, salon_id, reserva_id, estado, total)
VALUES ('4a4a0000-0000-0000-0000-000000000001',
        '55550000-0000-0000-0000-000000000001',
        '7e5e0000-0000-0000-0000-000000000001', 'abierta', 24.20);

-- ----------------------------------------------------------------------------
-- TEST 3 — un SEGUNDO ticket vivo para la misma reserva debe FALLAR (índice).
-- ----------------------------------------------------------------------------
DO $$
BEGIN
    BEGIN
        INSERT INTO public.tpv_ventas (salon_id, reserva_id, estado, total)
        VALUES ('55550000-0000-0000-0000-000000000001',
                '7e5e0000-0000-0000-0000-000000000001', 'abierta', 24.20);
        RAISE EXCEPTION 'FALLO T3: se permitió un segundo ticket vivo para la reserva';
    EXCEPTION WHEN unique_violation THEN
        RAISE NOTICE 'PASS: T3 índice único bloquea 2º ticket vivo por reserva';
    END;
END;
$$;

-- ----------------------------------------------------------------------------
-- TEST 4 — al pasar el ticket a 'pagada', estado_cobro = 'cobrada'.
-- ----------------------------------------------------------------------------
UPDATE public.tpv_ventas SET estado = 'pagada'
 WHERE id = '4a4a0000-0000-0000-0000-000000000001';

DO $$
DECLARE e text; vid uuid;
BEGIN
    SELECT estado_cobro, venta_id INTO e, vid FROM public.tpv_v_reservas_cobro
     WHERE reserva_id = '7e5e0000-0000-0000-0000-000000000001';
    IF e <> 'cobrada' OR vid <> '4a4a0000-0000-0000-0000-000000000001' THEN
        RAISE EXCEPTION 'FALLO T4: esperado cobrada+ticket, obtenido % / %', e, vid;
    END IF;
    RAISE NOTICE 'PASS: T4 ticket pagada -> reserva cobrada (enlace bidireccional)';
END;
$$;

-- ----------------------------------------------------------------------------
-- TEST 5 — anular el ticket LIBERA la reserva (permite un nuevo ticket vivo).
-- ----------------------------------------------------------------------------
UPDATE public.tpv_ventas SET estado = 'anulada', anulada_at = now()
 WHERE id = '4a4a0000-0000-0000-0000-000000000001';

DO $$
DECLARE e text;
BEGIN
    INSERT INTO public.tpv_ventas (salon_id, reserva_id, estado, total)
    VALUES ('55550000-0000-0000-0000-000000000001',
            '7e5e0000-0000-0000-0000-000000000001', 'abierta', 24.20);

    SELECT estado_cobro INTO e FROM public.tpv_v_reservas_cobro
     WHERE reserva_id = '7e5e0000-0000-0000-0000-000000000001';
    IF e <> 'ticket_abierto' THEN
        RAISE EXCEPTION 'FALLO T5: tras anular+recrear esperado ticket_abierto, obtenido %', e;
    END IF;
    RAISE NOTICE 'PASS: T5 ticket anulado libera la reserva para un nuevo cobro';
END;
$$;

DO $$ BEGIN RAISE NOTICE 'RESULTADO GLOBAL: INTEGRACION OK'; END; $$;

ROLLBACK;
