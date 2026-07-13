-- ============================================================================
-- Migración: Módulo TPV (Terminal Punto de Venta)
-- Archivo:   20260713000001_tpv_module.up.sql
-- Autor:     HAT3X · Database Optimizer (vertical webs-apps)
-- Fecha:     2026-07-13
-- ----------------------------------------------------------------------------
-- Objetivo:
--   Añadir el esquema de facturación / caja del TPV para salones sin modificar
--   ninguna tabla existente (agenda, reservas, ajustes, etc.).
--
-- Naturaleza: ADITIVA. Sólo CREATE. No hay ALTER/DROP sobre tablas previas.
--
-- Supuestos sobre el esquema existente (ver db/README.md → "Supuestos"):
--   · Existe la tabla `public.salones(id uuid PRIMARY KEY)`.
--   · Existen (opcionales, referenciadas como NULL) `public.reservas(id uuid)`,
--     `public.empleados(id uuid)` y `public.clientes(id uuid)`.
--   · El esquema usa claves primarias `uuid` (convención Supabase).
--   Si tu esquema usa `bigint`, cambia los tipos de las columnas *_id y de
--   `salon_id` a `bigint` de forma consistente antes de aplicar.
--
-- Las FKs a tablas cuya existencia no está garantizada (reservas, empleados,
-- clientes) se declaran al final, envueltas en un bloque tolerante, para que la
-- migración sea aplicable de forma incremental. Las FKs a `salones` son
-- obligatorias y no toleran fallo.
-- ============================================================================

BEGIN;

-- Requerido para gen_random_uuid() (incluido en Supabase por defecto).
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ----------------------------------------------------------------------------
-- 0. Tipos ENUM del dominio TPV (nuevos, no colisionan con nada existente)
-- ----------------------------------------------------------------------------
CREATE TYPE public.tpv_estado_caja    AS ENUM ('abierta', 'cerrada');
CREATE TYPE public.tpv_estado_venta   AS ENUM ('abierta', 'pagada', 'anulada', 'reembolsada');
CREATE TYPE public.tpv_estado_pago    AS ENUM ('completado', 'pendiente', 'reembolsado');
CREATE TYPE public.tpv_estado_factura AS ENUM ('emitida', 'rectificada', 'anulada');
CREATE TYPE public.tpv_tipo_linea     AS ENUM ('servicio', 'producto', 'descuento', 'otro');

-- ----------------------------------------------------------------------------
-- Helper: trigger de updated_at (nombre namespaced para no pisar funciones
-- existentes del esquema principal).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tpv_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

-- ============================================================================
-- 1. SESIONES DE CAJA (apertura / cierre)
-- ============================================================================
CREATE TABLE public.tpv_sesiones_caja (
    id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    salon_id               uuid NOT NULL,
    empleado_apertura_id   uuid,
    empleado_cierre_id     uuid,
    estado                 public.tpv_estado_caja NOT NULL DEFAULT 'abierta',

    saldo_inicial          numeric(12,2) NOT NULL DEFAULT 0 CHECK (saldo_inicial >= 0),
    saldo_final_teorico    numeric(12,2),   -- calculado por la app al cerrar
    saldo_final_real       numeric(12,2),   -- efectivo contado físicamente
    descuadre              numeric(12,2),   -- real - teórico (se fija al cerrar)

    notas                  text,
    abierta_at             timestamptz NOT NULL DEFAULT now(),
    cerrada_at             timestamptz,
    created_at             timestamptz NOT NULL DEFAULT now(),
    updated_at             timestamptz NOT NULL DEFAULT now(),

    -- Coherencia temporal y de estado.
    CONSTRAINT tpv_sesiones_caja_cierre_chk CHECK (
        (estado = 'abierta'  AND cerrada_at IS NULL)
        OR
        (estado = 'cerrada'  AND cerrada_at IS NOT NULL AND cerrada_at >= abierta_at)
    )
);

-- Como máximo UNA sesión abierta por salón (índice único parcial).
CREATE UNIQUE INDEX tpv_sesiones_caja_una_abierta_uq
    ON public.tpv_sesiones_caja (salon_id)
    WHERE estado = 'abierta';

CREATE INDEX tpv_sesiones_caja_salon_idx    ON public.tpv_sesiones_caja (salon_id);
CREATE INDEX tpv_sesiones_caja_abierta_idx  ON public.tpv_sesiones_caja (salon_id, abierta_at DESC);

CREATE TRIGGER tpv_sesiones_caja_set_updated_at
    BEFORE UPDATE ON public.tpv_sesiones_caja
    FOR EACH ROW EXECUTE FUNCTION public.tpv_set_updated_at();

-- ============================================================================
-- 2. MÉTODOS DE PAGO (catálogo por salón)
-- ============================================================================
CREATE TABLE public.tpv_metodos_pago (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    salon_id    uuid NOT NULL,
    codigo      text NOT NULL,          -- 'efectivo', 'tarjeta', 'bizum', 'transferencia', 'vale'
    nombre      text NOT NULL,
    activo      boolean NOT NULL DEFAULT true,
    orden       integer NOT NULL DEFAULT 0,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT tpv_metodos_pago_codigo_uq UNIQUE (salon_id, codigo)
);

CREATE INDEX tpv_metodos_pago_salon_idx
    ON public.tpv_metodos_pago (salon_id)
    WHERE activo;

CREATE TRIGGER tpv_metodos_pago_set_updated_at
    BEFORE UPDATE ON public.tpv_metodos_pago
    FOR EACH ROW EXECUTE FUNCTION public.tpv_set_updated_at();

-- ============================================================================
-- 3. VENTAS / TICKETS (cabecera)
-- ============================================================================
CREATE TABLE public.tpv_ventas (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    salon_id         uuid NOT NULL,
    sesion_caja_id   uuid,              -- caja en la que se registró (NULL = fuera de caja)
    reserva_id       uuid,              -- reserva de agenda de la que procede (opcional)
    cliente_id       uuid,              -- cliente (opcional, venta anónima permitida)
    empleado_id      uuid,              -- quién realizó la venta

    numero_ticket    bigint NOT NULL,   -- correlativo por salón (asignado por trigger)
    estado           public.tpv_estado_venta NOT NULL DEFAULT 'abierta',

    subtotal         numeric(12,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),          -- base sin impuestos
    descuento_total  numeric(12,2) NOT NULL DEFAULT 0 CHECK (descuento_total >= 0),
    impuestos_total  numeric(12,2) NOT NULL DEFAULT 0 CHECK (impuestos_total >= 0),
    total            numeric(12,2) NOT NULL DEFAULT 0 CHECK (total >= 0),

    notas            text,
    anulada_at       timestamptz,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT tpv_ventas_numero_uq UNIQUE (salon_id, numero_ticket)
);

CREATE INDEX tpv_ventas_salon_creado_idx ON public.tpv_ventas (salon_id, created_at DESC);
CREATE INDEX tpv_ventas_sesion_idx       ON public.tpv_ventas (sesion_caja_id);
CREATE INDEX tpv_ventas_reserva_idx      ON public.tpv_ventas (reserva_id)  WHERE reserva_id IS NOT NULL;
CREATE INDEX tpv_ventas_cliente_idx      ON public.tpv_ventas (cliente_id)  WHERE cliente_id IS NOT NULL;
CREATE INDEX tpv_ventas_empleado_idx     ON public.tpv_ventas (empleado_id) WHERE empleado_id IS NOT NULL;
-- Filtrado por estado + fecha (p.ej. tickets abiertos del día).
CREATE INDEX tpv_ventas_estado_idx       ON public.tpv_ventas (salon_id, estado, created_at DESC);

CREATE TRIGGER tpv_ventas_set_updated_at
    BEFORE UPDATE ON public.tpv_ventas
    FOR EACH ROW EXECUTE FUNCTION public.tpv_set_updated_at();

-- Correlativo de ticket por salón, asignado en el INSERT de forma segura ante
-- concurrencia (advisory lock por salón). Sólo actúa si la app no fija numero.
CREATE OR REPLACE FUNCTION public.tpv_asignar_numero_ticket()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.numero_ticket IS NULL OR NEW.numero_ticket = 0 THEN
        PERFORM pg_advisory_xact_lock(hashtext('tpv_ticket:' || NEW.salon_id::text));
        SELECT COALESCE(MAX(numero_ticket), 0) + 1
          INTO NEW.numero_ticket
          FROM public.tpv_ventas
         WHERE salon_id = NEW.salon_id;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER tpv_ventas_numero_ticket
    BEFORE INSERT ON public.tpv_ventas
    FOR EACH ROW EXECUTE FUNCTION public.tpv_asignar_numero_ticket();

-- ============================================================================
-- 4. LÍNEAS DE TICKET
-- ============================================================================
CREATE TABLE public.tpv_lineas_ticket (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    venta_id          uuid NOT NULL,
    salon_id          uuid NOT NULL,     -- denormalizado para filtros / RLS
    tipo              public.tpv_tipo_linea NOT NULL DEFAULT 'servicio',

    -- Referencia libre al catálogo de servicios/productos (vive en otro módulo);
    -- sin FK para no acoplar con tablas fuera del alcance de esta migración.
    referencia_id     uuid,
    descripcion       text NOT NULL,

    cantidad          numeric(10,3) NOT NULL DEFAULT 1 CHECK (cantidad > 0),
    precio_unitario   numeric(12,2) NOT NULL CHECK (precio_unitario >= 0),
    descuento         numeric(12,2) NOT NULL DEFAULT 0 CHECK (descuento >= 0),
    tipo_impuesto     numeric(5,2)  NOT NULL DEFAULT 21 CHECK (tipo_impuesto >= 0),  -- % IVA
    importe_impuesto  numeric(12,2) NOT NULL DEFAULT 0 CHECK (importe_impuesto >= 0),
    total_linea       numeric(12,2) NOT NULL CHECK (total_linea >= 0),

    orden             integer NOT NULL DEFAULT 0,
    created_at        timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT tpv_lineas_ticket_venta_fk
        FOREIGN KEY (venta_id) REFERENCES public.tpv_ventas (id) ON DELETE CASCADE
);

CREATE INDEX tpv_lineas_ticket_venta_idx ON public.tpv_lineas_ticket (venta_id);
CREATE INDEX tpv_lineas_ticket_salon_idx ON public.tpv_lineas_ticket (salon_id);

-- ============================================================================
-- 5. PAGOS (aplicados a un ticket, permite pago mixto)
-- ============================================================================
CREATE TABLE public.tpv_pagos (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    venta_id           uuid NOT NULL,
    salon_id           uuid NOT NULL,     -- denormalizado para conciliación
    metodo_pago_id     uuid NOT NULL,
    sesion_caja_id     uuid,              -- caja para cuadre de efectivo

    -- Importe: positivo = cobro, negativo = devolución/cambio.
    importe            numeric(12,2) NOT NULL CHECK (importe <> 0),
    estado             public.tpv_estado_pago NOT NULL DEFAULT 'completado',
    referencia_externa text,              -- p.ej. código de autorización de tarjeta

    pagado_at          timestamptz NOT NULL DEFAULT now(),
    created_at         timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT tpv_pagos_venta_fk
        FOREIGN KEY (venta_id) REFERENCES public.tpv_ventas (id) ON DELETE CASCADE,
    CONSTRAINT tpv_pagos_metodo_fk
        FOREIGN KEY (metodo_pago_id) REFERENCES public.tpv_metodos_pago (id) ON DELETE RESTRICT,
    CONSTRAINT tpv_pagos_sesion_fk
        FOREIGN KEY (sesion_caja_id) REFERENCES public.tpv_sesiones_caja (id) ON DELETE SET NULL
);

CREATE INDEX tpv_pagos_venta_idx      ON public.tpv_pagos (venta_id);
CREATE INDEX tpv_pagos_salon_idx      ON public.tpv_pagos (salon_id);
CREATE INDEX tpv_pagos_metodo_idx     ON public.tpv_pagos (metodo_pago_id);
CREATE INDEX tpv_pagos_sesion_idx     ON public.tpv_pagos (sesion_caja_id) WHERE sesion_caja_id IS NOT NULL;
-- Arqueo de caja: pagos de una sesión ordenados por fecha.
CREATE INDEX tpv_pagos_sesion_fecha_idx ON public.tpv_pagos (sesion_caja_id, pagado_at);

-- ============================================================================
-- 6. FACTURAS
-- ============================================================================
CREATE TABLE public.tpv_facturas (
    id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    salon_id               uuid NOT NULL,
    venta_id               uuid,          -- ticket origen (NULL = factura manual)
    cliente_id             uuid,

    serie                  text   NOT NULL DEFAULT 'A',
    numero                 bigint NOT NULL,           -- correlativo por (salon, serie)
    estado                 public.tpv_estado_factura NOT NULL DEFAULT 'emitida',

    -- Snapshot de datos fiscales (inmutable tras emisión).
    razon_social           text,
    nif                    text,
    direccion_fiscal       text,

    base_imponible         numeric(12,2) NOT NULL DEFAULT 0 CHECK (base_imponible >= 0),
    impuestos              numeric(12,2) NOT NULL DEFAULT 0 CHECK (impuestos >= 0),
    total                  numeric(12,2) NOT NULL DEFAULT 0 CHECK (total >= 0),

    factura_rectificada_id uuid,          -- si es rectificativa, apunta a la original
    emitida_at             timestamptz NOT NULL DEFAULT now(),
    created_at             timestamptz NOT NULL DEFAULT now(),
    updated_at             timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT tpv_facturas_numero_uq   UNIQUE (salon_id, serie, numero),
    -- Un ticket sólo puede facturarse una vez.
    CONSTRAINT tpv_facturas_venta_uq    UNIQUE (venta_id),
    CONSTRAINT tpv_facturas_venta_fk
        FOREIGN KEY (venta_id) REFERENCES public.tpv_ventas (id) ON DELETE RESTRICT,
    CONSTRAINT tpv_facturas_rectificada_fk
        FOREIGN KEY (factura_rectificada_id) REFERENCES public.tpv_facturas (id) ON DELETE RESTRICT
);

CREATE INDEX tpv_facturas_salon_idx        ON public.tpv_facturas (salon_id, emitida_at DESC);
CREATE INDEX tpv_facturas_cliente_idx      ON public.tpv_facturas (cliente_id) WHERE cliente_id IS NOT NULL;
CREATE INDEX tpv_facturas_rectificada_idx  ON public.tpv_facturas (factura_rectificada_id) WHERE factura_rectificada_id IS NOT NULL;

CREATE TRIGGER tpv_facturas_set_updated_at
    BEFORE UPDATE ON public.tpv_facturas
    FOR EACH ROW EXECUTE FUNCTION public.tpv_set_updated_at();

-- Numeración fiscal SIN saltos por (salon_id, serie), segura ante concurrencia.
CREATE OR REPLACE FUNCTION public.tpv_asignar_numero_factura()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.numero IS NULL OR NEW.numero = 0 THEN
        PERFORM pg_advisory_xact_lock(
            hashtext('tpv_factura:' || NEW.salon_id::text || ':' || NEW.serie)
        );
        SELECT COALESCE(MAX(numero), 0) + 1
          INTO NEW.numero
          FROM public.tpv_facturas
         WHERE salon_id = NEW.salon_id
           AND serie    = NEW.serie;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER tpv_facturas_numero
    BEFORE INSERT ON public.tpv_facturas
    FOR EACH ROW EXECUTE FUNCTION public.tpv_asignar_numero_factura();

-- ============================================================================
-- 7. FOREIGN KEYS a `salones` (obligatorias — salon_id NOT NULL en todas)
--    ON DELETE RESTRICT: los registros financieros nunca se borran en cascada.
-- ============================================================================
ALTER TABLE public.tpv_sesiones_caja
    ADD CONSTRAINT tpv_sesiones_caja_salon_fk
    FOREIGN KEY (salon_id) REFERENCES public.salones (id) ON DELETE RESTRICT;

ALTER TABLE public.tpv_metodos_pago
    ADD CONSTRAINT tpv_metodos_pago_salon_fk
    FOREIGN KEY (salon_id) REFERENCES public.salones (id) ON DELETE RESTRICT;

ALTER TABLE public.tpv_ventas
    ADD CONSTRAINT tpv_ventas_salon_fk
    FOREIGN KEY (salon_id) REFERENCES public.salones (id) ON DELETE RESTRICT;

ALTER TABLE public.tpv_ventas
    ADD CONSTRAINT tpv_ventas_sesion_fk
    FOREIGN KEY (sesion_caja_id) REFERENCES public.tpv_sesiones_caja (id) ON DELETE SET NULL;

ALTER TABLE public.tpv_lineas_ticket
    ADD CONSTRAINT tpv_lineas_ticket_salon_fk
    FOREIGN KEY (salon_id) REFERENCES public.salones (id) ON DELETE RESTRICT;

ALTER TABLE public.tpv_pagos
    ADD CONSTRAINT tpv_pagos_salon_fk
    FOREIGN KEY (salon_id) REFERENCES public.salones (id) ON DELETE RESTRICT;

ALTER TABLE public.tpv_facturas
    ADD CONSTRAINT tpv_facturas_salon_fk
    FOREIGN KEY (salon_id) REFERENCES public.salones (id) ON DELETE RESTRICT;

-- ============================================================================
-- 8. FOREIGN KEYS opcionales al esquema existente (reservas, clientes,
--    empleados). Se aplican sólo si la tabla destino existe, para que la
--    migración sea tolerante en entornos donde aún no estén creadas.
-- ============================================================================
DO $$
BEGIN
    IF to_regclass('public.reservas') IS NOT NULL THEN
        ALTER TABLE public.tpv_ventas
            ADD CONSTRAINT tpv_ventas_reserva_fk
            FOREIGN KEY (reserva_id) REFERENCES public.reservas (id) ON DELETE SET NULL;
    ELSE
        RAISE NOTICE 'tpv: tabla public.reservas no encontrada; FK reserva_id omitida.';
    END IF;

    IF to_regclass('public.clientes') IS NOT NULL THEN
        ALTER TABLE public.tpv_ventas
            ADD CONSTRAINT tpv_ventas_cliente_fk
            FOREIGN KEY (cliente_id) REFERENCES public.clientes (id) ON DELETE SET NULL;
        ALTER TABLE public.tpv_facturas
            ADD CONSTRAINT tpv_facturas_cliente_fk
            FOREIGN KEY (cliente_id) REFERENCES public.clientes (id) ON DELETE SET NULL;
    ELSE
        RAISE NOTICE 'tpv: tabla public.clientes no encontrada; FKs cliente_id omitidas.';
    END IF;

    IF to_regclass('public.empleados') IS NOT NULL THEN
        ALTER TABLE public.tpv_ventas
            ADD CONSTRAINT tpv_ventas_empleado_fk
            FOREIGN KEY (empleado_id) REFERENCES public.empleados (id) ON DELETE SET NULL;
        ALTER TABLE public.tpv_sesiones_caja
            ADD CONSTRAINT tpv_sesiones_caja_emp_apertura_fk
            FOREIGN KEY (empleado_apertura_id) REFERENCES public.empleados (id) ON DELETE SET NULL;
        ALTER TABLE public.tpv_sesiones_caja
            ADD CONSTRAINT tpv_sesiones_caja_emp_cierre_fk
            FOREIGN KEY (empleado_cierre_id) REFERENCES public.empleados (id) ON DELETE SET NULL;
    ELSE
        RAISE NOTICE 'tpv: tabla public.empleados no encontrada; FKs empleado_id omitidas.';
    END IF;
END;
$$;

COMMIT;

-- ============================================================================
-- NOTA sobre RLS (Row Level Security):
--   Estas tablas contienen datos multi-salón. Se recomienda ACTIVAR RLS y
--   añadir políticas de aislamiento por salón en una migración posterior, una
--   vez confirmado el mecanismo de pertenencia (p.ej. tabla salon_miembros o
--   claim JWT). NO se activa aquí para no bloquear el acceso de la app antes de
--   definir políticas. Ejemplo de referencia (db/README.md → "RLS").
-- ============================================================================
