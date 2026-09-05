-- ============================================================================
-- Test de aislamiento RLS — tabla de configuración de facturación (sub-6)
-- Archivo:   db/tests/rls_tpv_config_facturacion_test.sql
-- Autor:     HAT3X · API Tester (sub-8)
-- Fecha:     2026-07-13
-- ----------------------------------------------------------------------------
-- Qué verifica:
--   Complementa a rls_tpv_isolation_test.sql (que cubre las 7 tablas base)
--   probando la tabla `tpv_config_facturacion` añadida en la migración
--   20260713000003_tpv_facturacion.up.sql, cuya política de aislamiento por
--   salón (tpv_config_facturacion_aislamiento) NO estaba cubierta:
--
--     1. LECTURA: el salón A ve su config y NO la del salón B (ni al revés).
--     2. ESCRITURA: A no puede INSERTAR/ACTUALIZAR la config del salón B.
--     3. CONTROL POSITIVO: A sí gestiona la config de su propio salón.
--     4. UPDATE sin filtro de salón: RLS acota el alcance al salón A; la config
--        de B queda intacta.
--
-- Cómo ejecutarlo (requiere 0001, 0002 y 0003 aplicadas):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/tests/rls_tpv_config_facturacion_test.sql
--
--   · ON_ERROR_STOP=1 → cualquier RAISE EXCEPTION corta con exit != 0 (CI).
--   · Todo en UNA transacción con ROLLBACK final: no deja rastro ni rol.
--   · El aislamiento se comprueba con el rol NO privilegiado `tpv_rls_tester`,
--     igual que en el test de las 7 tablas.
--
-- Salida esperada: líneas `PASS:` y `RESULTADO GLOBAL: RLS CONFIG FACTURACION OK`.
-- ============================================================================

\set ON_ERROR_STOP on

BEGIN;

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
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tpv_config_facturacion TO tpv_rls_tester;

-- ----------------------------------------------------------------------------
-- 1. SIEMBRA (como rol privilegiado del runner). Dos salones y su pertenencia.
-- ----------------------------------------------------------------------------
SET app.current_user_id = 'c0000000-0000-0000-0000-00000000c0de';

INSERT INTO public.salones (id) VALUES
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
    ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.salon_miembros (user_id, salon_id, rol) VALUES
    ('a0000000-0000-0000-0000-0000000000a1', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'admin'),
    ('b0000000-0000-0000-0000-0000000000b1', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'admin')
ON CONFLICT (user_id, salon_id) DO NOTHING;

-- Config de facturación de cada salón (emisor distinto).
INSERT INTO public.tpv_config_facturacion (salon_id, serie_por_defecto, emisor_razon_social) VALUES
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'A', 'Salón A SL'),
    ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'B', 'Salón B SL')
ON CONFLICT (salon_id) DO NOTHING;

RESET app.current_user_id;

-- ============================================================================
-- 2. LECTURA — el usuario A sólo ve la config del salón A
-- ============================================================================
SET ROLE tpv_rls_tester;
SET app.current_user_id = 'a0000000-0000-0000-0000-0000000000a1';

DO $$
DECLARE n_a bigint; n_b bigint; emisor text;
BEGIN
    SELECT count(*) FILTER (WHERE salon_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
           count(*) FILTER (WHERE salon_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')
      INTO n_a, n_b
      FROM public.tpv_config_facturacion;

    IF n_a <> 1 THEN
        RAISE EXCEPTION 'FAIL: A no ve su propia config (esperado 1, obtenido %).', n_a;
    END IF;
    IF n_b <> 0 THEN
        RAISE EXCEPTION 'FAIL: FUGA — A ve % filas de config del salón B.', n_b;
    END IF;

    SELECT emisor_razon_social INTO emisor FROM public.tpv_config_facturacion;
    IF emisor <> 'Salón A SL' THEN
        RAISE EXCEPTION 'FAIL: A ve un emisor inesperado: %.', emisor;
    END IF;
    RAISE NOTICE 'PASS: lectura de config aislada al salón A.';
END;
$$;

-- ============================================================================
-- 3. ESCRITURA — A no puede crear ni tocar la config del salón B
-- ============================================================================
DO $$
BEGIN
    BEGIN
        INSERT INTO public.tpv_config_facturacion (salon_id, serie_por_defecto)
        VALUES ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'HACK');
        RAISE EXCEPTION 'FAIL: se permitió INSERT de config en salón ajeno.';
    EXCEPTION WHEN insufficient_privilege THEN
        RAISE NOTICE 'PASS: INSERT de config en salón ajeno rechazado por RLS (%).', SQLSTATE;
    END;
END;
$$;

-- UPDATE sin filtro de salón: RLS debe limitar el alcance al salón A.
UPDATE public.tpv_config_facturacion SET emisor_razon_social = 'TOCADO_POR_A';

-- Control positivo: A gestiona la config de su propio salón.
DO $$
DECLARE v_serie text;
BEGIN
    UPDATE public.tpv_config_facturacion
       SET serie_por_defecto = 'A2'
     WHERE salon_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    SELECT serie_por_defecto INTO v_serie FROM public.tpv_config_facturacion
     WHERE salon_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    IF v_serie <> 'A2' THEN
        RAISE EXCEPTION 'FAIL: A no pudo actualizar su propia config.';
    END IF;
    RAISE NOTICE 'PASS: A gestiona la config de su propio salón (control positivo).';
END;
$$;

-- ============================================================================
-- 4. SIMÉTRICO — la config del salón B quedó intacta frente a A
-- ============================================================================
SET app.current_user_id = 'b0000000-0000-0000-0000-0000000000b1';

DO $$
DECLARE v_emisor text; v_n bigint;
BEGIN
    SELECT count(*), max(emisor_razon_social) INTO v_n, v_emisor
      FROM public.tpv_config_facturacion;
    IF v_n <> 1 THEN
        RAISE EXCEPTION 'FAIL: B ve % filas de config (esperado 1, sólo la suya).', v_n;
    END IF;
    IF v_emisor IS NOT DISTINCT FROM 'TOCADO_POR_A' THEN
        RAISE EXCEPTION 'FAIL: el UPDATE de A alcanzó la config del salón B.';
    END IF;
    IF v_emisor <> 'Salón B SL' THEN
        RAISE EXCEPTION 'FAIL: la config de B tiene un emisor inesperado: %.', v_emisor;
    END IF;
    RAISE NOTICE 'PASS: la config del salón B permanece intacta y aislada.';
END;
$$;

RESET app.current_user_id;
RESET ROLE;

DO $$
BEGIN
    RAISE NOTICE '=====================================================================';
    RAISE NOTICE 'RESULTADO GLOBAL: RLS CONFIG FACTURACION OK';
    RAISE NOTICE '=====================================================================';
END;
$$;

ROLLBACK;
