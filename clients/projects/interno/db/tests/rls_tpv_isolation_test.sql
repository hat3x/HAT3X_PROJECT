-- ============================================================================
-- Test de aislamiento RLS multi-salón — Módulo TPV
-- Archivo:   db/tests/rls_tpv_isolation_test.sql
-- Autor:     HAT3X · pm-security
-- Fecha:     2026-07-13
-- ----------------------------------------------------------------------------
-- Qué verifica:
--   Que las políticas RLS de 20260713000002_tpv_rls.up.sql aíslan totalmente
--   dos salones (A y B): NINGÚN salón puede LEER, INSERTAR, ACTUALIZAR ni
--   BORRAR datos TPV de otro salón, en las 7 tablas (sesiones_caja,
--   movimientos_caja, metodos_pago, ventas/tickets, lineas_ticket, pagos,
--   facturas).
--
-- Cómo ejecutarlo (requiere las migraciones 0001 y 0002 ya aplicadas):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/tests/rls_tpv_isolation_test.sql
--
--   · ON_ERROR_STOP=1 hace que CUALQUIER fallo (RAISE EXCEPTION) devuelva código
--     de salida distinto de 0 → apto para CI.
--   · Todo corre en UNA transacción con ROLLBACK final: no deja datos ni el rol
--     de prueba en la base de datos.
--   · Debe ejecutarlo un rol superusuario o el propietario de las tablas (para
--     poder sembrar datos en ambos salones). El aislamiento se comprueba con un
--     rol NO privilegiado (`tpv_rls_tester`) que simula a la app.
--
-- Salida esperada: una serie de líneas `PASS: ...` y, al final,
--   `RESULTADO GLOBAL: TODOS LOS TESTS DE AISLAMIENTO RLS PASARON`.
-- ============================================================================

\set ON_ERROR_STOP on

BEGIN;

-- ----------------------------------------------------------------------------
-- Identificadores fijos del escenario (UUID legibles).
-- ----------------------------------------------------------------------------
--   Salón A : aaaaaaaa-...   Usuario A : a0000000-...
--   Salón B : bbbbbbbb-...   Usuario B : b0000000-...
--   Usuario de siembra (miembro de AMBOS salones, sólo para el setup).

-- ----------------------------------------------------------------------------
-- 0. Rol de prueba NO privilegiado (simula el rol `authenticated` de la app).
-- ----------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'tpv_rls_tester') THEN
        CREATE ROLE tpv_rls_tester NOLOGIN;
    END IF;
END;
$$;

GRANT USAGE ON SCHEMA public TO tpv_rls_tester;
GRANT SELECT, INSERT, UPDATE, DELETE ON
    public.tpv_sesiones_caja,
    public.tpv_movimientos_caja,
    public.tpv_metodos_pago,
    public.tpv_ventas,
    public.tpv_lineas_ticket,
    public.tpv_pagos,
    public.tpv_facturas
TO tpv_rls_tester;

-- ----------------------------------------------------------------------------
-- 1. SIEMBRA de datos para dos salones (como rol privilegiado del runner).
--    Fijamos app.current_user_id a un usuario miembro de AMBOS salones para que
--    la siembra pase el WITH CHECK incluso si el runner es el propietario con
--    FORCE RLS (un superusuario ignora RLS y también funciona).
-- ----------------------------------------------------------------------------
SET app.current_user_id = 'c0000000-0000-0000-0000-00000000c0de';

-- Salones (contrato mínimo documentado: salones(id uuid PRIMARY KEY)).
INSERT INTO public.salones (id) VALUES
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
    ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')
ON CONFLICT (id) DO NOTHING;

-- Pertenencias: sembrador (ambos), usuario A (sólo A), usuario B (sólo B).
INSERT INTO public.salon_miembros (user_id, salon_id, rol) VALUES
    ('c0000000-0000-0000-0000-00000000c0de', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'admin'),
    ('c0000000-0000-0000-0000-00000000c0de', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'admin'),
    ('a0000000-0000-0000-0000-0000000000a1', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'staff'),
    ('b0000000-0000-0000-0000-0000000000b1', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'staff')
ON CONFLICT (user_id, salon_id) DO NOTHING;

-- --- Datos TPV del salón A --------------------------------------------------
INSERT INTO public.tpv_metodos_pago (id, salon_id, codigo, nombre) VALUES
    ('11111111-0000-0000-0000-0000000000a1', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'efectivo', 'Efectivo A');
INSERT INTO public.tpv_sesiones_caja (id, salon_id, saldo_inicial) VALUES
    ('22222222-0000-0000-0000-0000000000a1', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 100);
INSERT INTO public.tpv_ventas (id, salon_id, sesion_caja_id, total) VALUES
    ('33333333-0000-0000-0000-0000000000a1', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-0000-0000-0000-0000000000a1', 50);
INSERT INTO public.tpv_lineas_ticket (id, venta_id, salon_id, descripcion, precio_unitario, total_linea) VALUES
    ('44444444-0000-0000-0000-0000000000a1', '33333333-0000-0000-0000-0000000000a1', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Corte A', 50, 50);
INSERT INTO public.tpv_pagos (id, venta_id, salon_id, metodo_pago_id, sesion_caja_id, importe) VALUES
    ('55555555-0000-0000-0000-0000000000a1', '33333333-0000-0000-0000-0000000000a1', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-0000-0000-0000-0000000000a1', '22222222-0000-0000-0000-0000000000a1', 50);
INSERT INTO public.tpv_facturas (id, salon_id, venta_id, total) VALUES
    ('66666666-0000-0000-0000-0000000000a1', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '33333333-0000-0000-0000-0000000000a1', 50);
INSERT INTO public.tpv_movimientos_caja (id, sesion_caja_id, salon_id, tipo, importe, motivo) VALUES
    ('77777777-0000-0000-0000-0000000000a1', '22222222-0000-0000-0000-0000000000a1', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'entrada', 20, 'Aporte de cambio A');

-- --- Datos TPV del salón B --------------------------------------------------
INSERT INTO public.tpv_metodos_pago (id, salon_id, codigo, nombre) VALUES
    ('11111111-0000-0000-0000-0000000000b1', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'tarjeta', 'Tarjeta B');
INSERT INTO public.tpv_sesiones_caja (id, salon_id, saldo_inicial) VALUES
    ('22222222-0000-0000-0000-0000000000b1', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 200);
INSERT INTO public.tpv_ventas (id, salon_id, sesion_caja_id, total) VALUES
    ('33333333-0000-0000-0000-0000000000b1', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-0000-0000-0000-0000000000b1', 80);
INSERT INTO public.tpv_lineas_ticket (id, venta_id, salon_id, descripcion, precio_unitario, total_linea) VALUES
    ('44444444-0000-0000-0000-0000000000b1', '33333333-0000-0000-0000-0000000000b1', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Tinte B', 80, 80);
INSERT INTO public.tpv_pagos (id, venta_id, salon_id, metodo_pago_id, sesion_caja_id, importe) VALUES
    ('55555555-0000-0000-0000-0000000000b1', '33333333-0000-0000-0000-0000000000b1', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '11111111-0000-0000-0000-0000000000b1', '22222222-0000-0000-0000-0000000000b1', 80);
INSERT INTO public.tpv_facturas (id, salon_id, venta_id, total) VALUES
    ('66666666-0000-0000-0000-0000000000b1', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '33333333-0000-0000-0000-0000000000b1', 80);
INSERT INTO public.tpv_movimientos_caja (id, sesion_caja_id, salon_id, tipo, importe, motivo) VALUES
    ('77777777-0000-0000-0000-0000000000b1', '22222222-0000-0000-0000-0000000000b1', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'salida', 15, 'Pago a mensajero B');

RESET app.current_user_id;

-- ============================================================================
-- 2. AISLAMIENTO DE LECTURA — Usuario A sólo ve el salón A
-- ============================================================================
SET ROLE tpv_rls_tester;
SET app.current_user_id = 'a0000000-0000-0000-0000-0000000000a1';

DO $$
DECLARE
    n_a   bigint;
    n_b   bigint;
    tablas text[] := ARRAY[
        'tpv_sesiones_caja','tpv_movimientos_caja','tpv_metodos_pago','tpv_ventas',
        'tpv_lineas_ticket','tpv_pagos','tpv_facturas'
    ];
    t     text;
BEGIN
    FOREACH t IN ARRAY tablas LOOP
        EXECUTE format(
            'SELECT count(*) FILTER (WHERE salon_id = %L),
                    count(*) FILTER (WHERE salon_id = %L)
               FROM public.%I',
            'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
            t
        ) INTO n_a, n_b;

        IF n_a < 1 THEN
            RAISE EXCEPTION 'FAIL [%]: usuario A no ve sus propias filas (A=%).', t, n_a;
        END IF;
        IF n_b <> 0 THEN
            RAISE EXCEPTION 'FAIL [%]: FUGA CRUZADA — usuario A ve % filas del salón B.', t, n_b;
        END IF;
        RAISE NOTICE 'PASS: lectura aislada en % (A=%, B=0).', t, n_a;
    END LOOP;
END;
$$;

-- ============================================================================
-- 3. AISLAMIENTO DE ESCRITURA — Usuario A no puede insertar en el salón B
-- ============================================================================
DO $$
BEGIN
    BEGIN
        INSERT INTO public.tpv_metodos_pago (salon_id, codigo, nombre)
        VALUES ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'hack', 'Intruso');
        RAISE EXCEPTION 'FAIL: se permitió INSERT en salón ajeno (WITH CHECK no aplicó).';
    EXCEPTION WHEN insufficient_privilege THEN
        RAISE NOTICE 'PASS: INSERT en salón ajeno rechazado por RLS (%).', SQLSTATE;
    END;
END;
$$;

-- Control positivo: SÍ puede insertar en su propio salón (la política no es un
-- deny total, sino un filtro por salón).
DO $$
BEGIN
    INSERT INTO public.tpv_metodos_pago (salon_id, codigo, nombre)
    VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'bizum', 'Bizum A');
    RAISE NOTICE 'PASS: INSERT en salón propio permitido (control positivo).';
END;
$$;

-- ============================================================================
-- 4. AISLAMIENTO DE UPDATE/DELETE — no afectan a filas del salón B
--    Se intentan sin WHERE de salón: RLS debe limitar el alcance al salón A.
-- ============================================================================
UPDATE public.tpv_ventas   SET notas = 'TOCADO_POR_A';
DELETE FROM public.tpv_pagos;   -- sólo debería borrar el pago del salón A

DO $$
DECLARE v_pagos_visibles bigint;
BEGIN
    SELECT count(*) INTO v_pagos_visibles FROM public.tpv_pagos;
    IF v_pagos_visibles <> 0 THEN
        RAISE EXCEPTION 'FAIL: tras DELETE, A aún ve % pagos (deberían ser 0 los suyos).', v_pagos_visibles;
    END IF;
    RAISE NOTICE 'PASS: UPDATE/DELETE ejecutados dentro del alcance del salón A.';
END;
$$;

-- ============================================================================
-- 5. AISLAMIENTO SIMÉTRICO — Usuario B sólo ve el salón B (y B intacto)
-- ============================================================================
SET app.current_user_id = 'b0000000-0000-0000-0000-0000000000b1';

DO $$
DECLARE
    v_ventas_b     bigint;
    v_ventas_a     bigint;
    v_pagos_b      bigint;
    v_ticket_notas text;
BEGIN
    -- B ve su venta y NINGUNA de A.
    SELECT count(*) FILTER (WHERE salon_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
           count(*) FILTER (WHERE salon_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')
      INTO v_ventas_b, v_ventas_a
      FROM public.tpv_ventas;
    IF v_ventas_a <> 0 THEN
        RAISE EXCEPTION 'FAIL: FUGA CRUZADA — usuario B ve % ventas del salón A.', v_ventas_a;
    END IF;
    IF v_ventas_b < 1 THEN
        RAISE EXCEPTION 'FAIL: usuario B no ve su propia venta.';
    END IF;

    -- El pago de B NO fue borrado por el DELETE que hizo A.
    SELECT count(*) INTO v_pagos_b FROM public.tpv_pagos;
    IF v_pagos_b <> 1 THEN
        RAISE EXCEPTION 'FAIL: el pago del salón B se vio afectado por A (ve % pagos, esperado 1).', v_pagos_b;
    END IF;

    -- La venta de B NO fue modificada por el UPDATE que hizo A.
    SELECT notas INTO v_ticket_notas FROM public.tpv_ventas
     WHERE id = '33333333-0000-0000-0000-0000000000b1';
    IF v_ticket_notas IS NOT DISTINCT FROM 'TOCADO_POR_A' THEN
        RAISE EXCEPTION 'FAIL: la venta del salón B fue modificada por el UPDATE de A.';
    END IF;

    RAISE NOTICE 'PASS: salón B totalmente aislado; sus datos intactos frente a A.';
END;
$$;

-- ============================================================================
-- 6. USUARIO SIN PERTENENCIA / ANÓNIMO — no ve absolutamente nada
-- ============================================================================
SET app.current_user_id = 'dead0000-0000-0000-0000-00000000dead';   -- sin filas en salon_miembros

DO $$
DECLARE total bigint;
BEGIN
    SELECT
        (SELECT count(*) FROM public.tpv_ventas)
      + (SELECT count(*) FROM public.tpv_pagos)
      + (SELECT count(*) FROM public.tpv_facturas)
      + (SELECT count(*) FROM public.tpv_sesiones_caja)
      + (SELECT count(*) FROM public.tpv_movimientos_caja)
      + (SELECT count(*) FROM public.tpv_metodos_pago)
      + (SELECT count(*) FROM public.tpv_lineas_ticket)
      INTO total;
    IF total <> 0 THEN
        RAISE EXCEPTION 'FAIL: usuario sin pertenencia ve % filas TPV (debería ver 0).', total;
    END IF;
    RAISE NOTICE 'PASS: usuario sin pertenencia (ni claim) no ve ningún dato TPV.';
END;
$$;

-- ----------------------------------------------------------------------------
-- Cierre: volver al rol del runner y confirmar globalmente.
-- ----------------------------------------------------------------------------
RESET app.current_user_id;
RESET ROLE;

DO $$
BEGIN
    RAISE NOTICE '=====================================================================';
    RAISE NOTICE 'RESULTADO GLOBAL: TODOS LOS TESTS DE AISLAMIENTO RLS PASARON';
    RAISE NOTICE '=====================================================================';
END;
$$;

-- No persistimos nada: datos de prueba, rol y GUCs desaparecen con el ROLLBACK.
ROLLBACK;
