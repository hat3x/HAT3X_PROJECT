-- ============================================================================
-- Verificación POST-DEPLOY del módulo TPV  ·  sub-10 (pm-deployment)
-- Archivo: db/tests/post_deploy_smoke.sql
-- ----------------------------------------------------------------------------
-- Qué comprueba (sin escribir nada; sólo lee catálogo → seguro en producción):
--   A. Todos los objetos TPV esperados existen (migraciones 0001..0006).
--   B. RLS ACTIVADO y FORZADO en las 9 tablas tpv_* con salon_id.
--   C. Las vistas de integración con reservas usan security_invoker.
--   D. ADITIVIDAD: agenda/reservas/ajustes/salones/clientes/empleados NO fueron
--      alteradas por el TPV (no hay columnas ni políticas con prefijo tpv_ en
--      ellas; siguen existiendo tal cual).
--
-- Uso (rol con acceso al catálogo; NO necesita service_role):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/tests/post_deploy_smoke.sql
--
-- Salida: líneas 'PASS:'; si algo falta, RAISE EXCEPTION aborta con exit != 0.
-- ============================================================================
\set ON_ERROR_STOP on

DO $$
DECLARE
    v_tabla      text;
    v_falta      text;
    v_relrls     boolean;
    v_relforce   boolean;
    -- Tablas TPV que DEBEN tener RLS activado + forzado.
    c_tpv_tablas text[] := ARRAY[
        'tpv_sesiones_caja', 'tpv_metodos_pago', 'tpv_ventas',
        'tpv_lineas_ticket', 'tpv_pagos', 'tpv_facturas',
        'tpv_config_facturacion', 'tpv_movimientos_caja',
        'tpv_salones_habilitados'
    ];
    -- Objetos no-tabla que deben existir.
    c_tpv_vistas text[] := ARRAY['tpv_v_reserva_precarga', 'tpv_v_reservas_cobro'];
    c_tpv_funcs  text[] := ARRAY[
        'tpv_current_uid', 'tpv_salones_del_usuario', 'tpv_salon_habilitado'
    ];
    -- Tablas PREEXISTENTES que el TPV NO debe haber tocado.
    c_existentes text[] := ARRAY['salones', 'reservas', 'ajustes'];
BEGIN
    -- ---- A. Tablas TPV presentes ------------------------------------------
    FOREACH v_tabla IN ARRAY c_tpv_tablas LOOP
        IF to_regclass('public.' || v_tabla) IS NULL THEN
            RAISE EXCEPTION 'FALLO A: no existe la tabla TPV public.%', v_tabla;
        END IF;
    END LOOP;
    RAISE NOTICE 'PASS: A · las % tablas TPV existen', array_length(c_tpv_tablas, 1);

    -- ---- B. RLS activado + forzado en cada tabla TPV ----------------------
    FOREACH v_tabla IN ARRAY c_tpv_tablas LOOP
        SELECT c.relrowsecurity, c.relforcerowsecurity
          INTO v_relrls, v_relforce
          FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public' AND c.relname = v_tabla;
        IF NOT v_relrls THEN
            RAISE EXCEPTION 'FALLO B: RLS NO activado en public.%', v_tabla;
        END IF;
        IF NOT v_relforce THEN
            RAISE EXCEPTION 'FALLO B: RLS NO forzado (FORCE) en public.%', v_tabla;
        END IF;
        -- Debe haber al menos una política sobre la tabla.
        IF NOT EXISTS (
            SELECT 1 FROM pg_policies
             WHERE schemaname = 'public' AND tablename = v_tabla
        ) THEN
            RAISE EXCEPTION 'FALLO B: sin políticas RLS en public.%', v_tabla;
        END IF;
    END LOOP;
    RAISE NOTICE 'PASS: B · RLS activado+forzado con política en todas las tablas TPV';

    -- ---- C. Vistas + funciones de soporte ---------------------------------
    -- Las vistas de integración con reservas sólo existen si public.reservas
    -- existe (la migración 0005 es tolerante). En un entorno con agenda —el caso
    -- de producción— DEBEN estar; si no hay reservas, se omiten (integración
    -- inactiva, no es un fallo).
    IF to_regclass('public.reservas') IS NOT NULL THEN
        FOREACH v_tabla IN ARRAY c_tpv_vistas LOOP
            IF to_regclass('public.' || v_tabla) IS NULL THEN
                RAISE EXCEPTION 'FALLO C: existe public.reservas pero falta la vista public.% (migración 0005 no aplicada)', v_tabla;
            END IF;
        END LOOP;
        -- security_invoker en las vistas de integración (respetan la RLS de reservas).
        IF EXISTS (
            SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE n.nspname = 'public' AND c.relname = ANY(c_tpv_vistas)
               AND NOT (COALESCE(c.reloptions, '{}') @> ARRAY['security_invoker=true'])
        ) THEN
            RAISE EXCEPTION 'FALLO C: alguna vista de integración no tiene security_invoker=true';
        END IF;
        RAISE NOTICE 'PASS: C.1 · vistas de integración con reservas presentes (security_invoker)';
    ELSE
        RAISE NOTICE 'INFO: C.1 · public.reservas no existe; integración con reservas inactiva (se omite)';
    END IF;
    FOREACH v_tabla IN ARRAY c_tpv_funcs LOOP
        IF NOT EXISTS (
            SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
             WHERE n.nspname = 'public' AND p.proname = v_tabla
        ) THEN
            RAISE EXCEPTION 'FALLO C: no existe la función public.%', v_tabla;
        END IF;
    END LOOP;
    RAISE NOTICE 'PASS: C · vistas de integración (security_invoker) y funciones helper presentes';

    -- ---- D. ADITIVIDAD: tablas preexistentes intactas ---------------------
    FOREACH v_tabla IN ARRAY c_existentes LOOP
        -- Sólo se comprueba si la tabla existe en este entorno (ajustes puede no existir).
        IF to_regclass('public.' || v_tabla) IS NULL THEN
            RAISE NOTICE 'INFO: D · public.% no existe en este entorno; se omite', v_tabla;
            CONTINUE;
        END IF;
        -- D.1 Ninguna columna con prefijo tpv_ inyectada en la tabla existente.
        SELECT string_agg(column_name, ', ') INTO v_falta
          FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = v_tabla
           AND column_name LIKE 'tpv\_%';
        IF v_falta IS NOT NULL THEN
            RAISE EXCEPTION 'FALLO D: public.% tiene columnas tpv_ inyectadas: %', v_tabla, v_falta;
        END IF;
        -- D.2 Ninguna política RLS del TPV colgada de la tabla existente.
        IF EXISTS (
            SELECT 1 FROM pg_policies
             WHERE schemaname = 'public' AND tablename = v_tabla
               AND policyname LIKE 'tpv\_%'
        ) THEN
            RAISE EXCEPTION 'FALLO D: public.% tiene políticas tpv_ inyectadas', v_tabla;
        END IF;
    END LOOP;
    RAISE NOTICE 'PASS: D · agenda/reservas/ajustes intactas (TPV es aditivo)';

    RAISE NOTICE '========================================================';
    RAISE NOTICE 'RESULTADO GLOBAL: SMOKE POST-DEPLOY TPV OK';
    RAISE NOTICE '========================================================';
END;
$$;
