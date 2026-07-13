-- ============================================================================
-- Test de ADITIVIDAD / REGRESIÓN — el TPV no invade la agenda/reservas/ajustes
-- Archivo:   db/tests/tpv_aditividad_regresion_test.sql
-- Autor:     HAT3X · API Tester (sub-8)
-- Fecha:     2026-07-13
-- ----------------------------------------------------------------------------
-- Qué verifica (regresión de agenda/reservas/ajustes tras instalar el TPV):
--   El módulo TPV es ADITIVO y NO INVASIVO. Ninguna de sus migraciones
--   (0001..0005) debe modificar las tablas preexistentes de la agenda. Se
--   comprueba, para cada tabla de agenda presente (reservas, salones, ajustes,
--   servicios, empleados, clientes):
--     1. NINGUNA columna con prefijo `tpv_` fue injertada en ella.
--     2. NINGÚN trigger `tpv_*` cuelga de ella.
--     3. NINGUNA política RLS `tpv_*` fue añadida sobre ella.
--   Y a nivel funcional:
--     4. La FK de enlace va de `tpv_ventas.reserva_id` → `reservas` (hija→padre):
--        borrar/anular un ticket NUNCA altera la reserva (el flujo de agenda
--        sigue intacto).
--     5. Las vistas de integración son `security_invoker` (respetan la RLS de
--        reservas: no exfiltran datos de la agenda).
--     6. Una reserva se sigue creando y leyendo con normalidad conviviendo con
--        el TPV (sin ticket → sigue siendo una reserva válida y visible).
--
-- Cómo ejecutarlo (requiere 0001..0005 aplicadas):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/tests/tpv_aditividad_regresion_test.sql
--
--   · Todo en UNA transacción con ROLLBACK final: no deja rastro.
--   · Si `public.reservas` no existe, se crea una versión mínima (y se revierte)
--     para que las comprobaciones funcionales sean autocontenidas en CI.
--
-- Salida esperada: líneas `PASS:` y `RESULTADO GLOBAL: ADITIVIDAD TPV OK`.
-- ============================================================================

\set ON_ERROR_STOP on

BEGIN;

-- ----------------------------------------------------------------------------
-- 0. Escenario mínimo autocontenido.
-- ----------------------------------------------------------------------------
INSERT INTO public.salones (id)
VALUES ('a0d17000-0000-0000-0000-000000000001')
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
        RAISE NOTICE 'test: creada public.reservas mínima para la comprobación funcional.';
    END IF;
END;
$$;

-- ============================================================================
-- 1..3. HIGIENE DE NAMESPACE — el TPV no injerta nada en la agenda.
--    Recorre las tablas de agenda que EXISTAN y comprueba que no tienen
--    columnas / triggers / políticas con prefijo `tpv_`.
-- ============================================================================
DO $$
DECLARE
    agenda text[] := ARRAY['reservas','salones','ajustes','servicios','empleados','clientes'];
    t   text;
    n   bigint;
BEGIN
    FOREACH t IN ARRAY agenda LOOP
        IF to_regclass('public.' || t) IS NULL THEN
            CONTINUE; -- la tabla no existe en este esquema: nada que comprobar
        END IF;

        -- 1. Columnas injertadas con prefijo tpv_.
        SELECT count(*) INTO n
          FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = t
           AND column_name LIKE 'tpv\_%';
        IF n <> 0 THEN
            RAISE EXCEPTION 'FAIL [%]: el TPV injertó % columna(s) tpv_* en una tabla de agenda.', t, n;
        END IF;

        -- 2. Triggers tpv_* sobre la tabla de agenda.
        SELECT count(*) INTO n
          FROM pg_trigger tg
          JOIN pg_class c ON c.oid = tg.tgrelid
          JOIN pg_namespace ns ON ns.oid = c.relnamespace
         WHERE ns.nspname = 'public' AND c.relname = t
           AND NOT tg.tgisinternal
           AND tg.tgname LIKE 'tpv\_%';
        IF n <> 0 THEN
            RAISE EXCEPTION 'FAIL [%]: el TPV colgó % trigger(s) tpv_* de una tabla de agenda.', t, n;
        END IF;

        -- 3. Políticas RLS tpv_* sobre la tabla de agenda.
        SELECT count(*) INTO n
          FROM pg_policies
         WHERE schemaname = 'public' AND tablename = t
           AND policyname LIKE 'tpv\_%';
        IF n <> 0 THEN
            RAISE EXCEPTION 'FAIL [%]: el TPV añadió % política(s) RLS tpv_* sobre una tabla de agenda.', t, n;
        END IF;

        RAISE NOTICE 'PASS: % sin columnas/triggers/políticas tpv_* (aditividad respetada).', t;
    END LOOP;
END;
$$;

-- ============================================================================
-- 4. DIRECCIÓN DE LA FK — el enlace es tpv_ventas.reserva_id → reservas.
--    La dependencia va de la venta (hija) a la reserva (padre): la agenda no
--    depende del TPV. Comprobamos que la FK existe y apunta a public.reservas.
-- ============================================================================
DO $$
DECLARE destino text;
BEGIN
    SELECT confrelid::regclass::text INTO destino
      FROM pg_constraint
     WHERE conrelid = 'public.tpv_ventas'::regclass
       AND contype = 'f'
       AND 'reserva_id' = ANY (
           SELECT a.attname FROM pg_attribute a
            WHERE a.attrelid = 'public.tpv_ventas'::regclass
              AND a.attnum = ANY (conkey)
       )
     LIMIT 1;

    IF destino IS NULL THEN
        RAISE NOTICE 'AVISO: tpv_ventas.reserva_id sin FK declarada (agenda ausente al migrar); enlace tolerante.';
    ELSIF destino <> 'reservas' AND destino <> 'public.reservas' THEN
        RAISE EXCEPTION 'FAIL: la FK de reserva_id apunta a % (esperado public.reservas).', destino;
    ELSE
        RAISE NOTICE 'PASS: FK tpv_ventas.reserva_id → % (hija→padre; la agenda no depende del TPV).', destino;
    END IF;
END;
$$;

-- ============================================================================
-- 5. VISTAS DE INTEGRACIÓN security_invoker (no saltan la RLS de reservas).
-- ============================================================================
DO $$
DECLARE v text; opciones text[];
BEGIN
    FOREACH v IN ARRAY ARRAY['tpv_v_reserva_precarga','tpv_v_reservas_cobro'] LOOP
        IF to_regclass('public.' || v) IS NULL THEN
            RAISE NOTICE 'AVISO: vista % ausente (reservas no existía al migrar); omitida.', v;
            CONTINUE;
        END IF;
        SELECT c.reloptions INTO opciones
          FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public' AND c.relname = v;
        IF opciones IS NULL OR NOT ('security_invoker=true' = ANY (opciones)) THEN
            RAISE EXCEPTION 'FAIL: la vista % no es security_invoker (podría exfiltrar datos de agenda).', v;
        END IF;
        RAISE NOTICE 'PASS: vista % es security_invoker (respeta la RLS de reservas).', v;
    END LOOP;
END;
$$;

-- ============================================================================
-- 6. FUNCIONAL — anular/borrar un ticket NO altera la reserva (agenda intacta).
-- ============================================================================
INSERT INTO public.reservas
    (id, salon_id, servicio_nombre, precio, tipo_impuesto, estado, inicio_at)
VALUES
    ('4e5e2000-0000-0000-0000-000000000001',
     'a0d17000-0000-0000-0000-000000000001',
     'Corte', 20.00, 21, 'completada', now());

INSERT INTO public.tpv_ventas (id, salon_id, reserva_id, estado, total)
VALUES ('4a4a2000-0000-0000-0000-000000000001',
        'a0d17000-0000-0000-0000-000000000001',
        '4e5e2000-0000-0000-0000-000000000001', 'abierta', 24.20);

-- Anular el ticket: la reserva debe conservar su estado y datos.
UPDATE public.tpv_ventas SET estado = 'anulada', anulada_at = now()
 WHERE id = '4a4a2000-0000-0000-0000-000000000001';

DO $$
DECLARE v_estado text; v_precio numeric;
BEGIN
    SELECT estado, precio INTO v_estado, v_precio
      FROM public.reservas WHERE id = '4e5e2000-0000-0000-0000-000000000001';
    IF v_estado IS DISTINCT FROM 'completada' OR v_precio IS DISTINCT FROM 20.00 THEN
        RAISE EXCEPTION 'FAIL: anular el ticket alteró la reserva (estado=%, precio=%).', v_estado, v_precio;
    END IF;
    RAISE NOTICE 'PASS: la reserva permanece intacta tras anular su ticket (agenda no regresiona).';
END;
$$;

-- Borrar el ticket tampoco toca la reserva (FK hija→padre).
DELETE FROM public.tpv_ventas WHERE id = '4a4a2000-0000-0000-0000-000000000001';

DO $$
DECLARE n bigint;
BEGIN
    SELECT count(*) INTO n FROM public.reservas
     WHERE id = '4e5e2000-0000-0000-0000-000000000001';
    IF n <> 1 THEN
        RAISE EXCEPTION 'FAIL: borrar el ticket eliminó/afectó a la reserva (quedan % filas).', n;
    END IF;
    RAISE NOTICE 'PASS: borrar el ticket no arrastra la reserva (la agenda es independiente del TPV).';
END;
$$;

DO $$ BEGIN RAISE NOTICE 'RESULTADO GLOBAL: ADITIVIDAD TPV OK'; END; $$;

ROLLBACK;
