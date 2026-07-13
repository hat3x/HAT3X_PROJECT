-- ============================================================================
-- Migración: RLS multi-salón para el módulo TPV
-- Archivo:   20260713000002_tpv_rls.up.sql
-- Autor:     HAT3X · pm-security (vertical webs-apps)
-- Fecha:     2026-07-13
-- Depende de: 20260713000001_tpv_module.up.sql
-- ----------------------------------------------------------------------------
-- Objetivo:
--   Activar Row Level Security (RLS) y definir políticas de AISLAMIENTO POR
--   `salon_id` sobre TODAS las tablas nuevas del TPV, de modo que ningún salón
--   pueda leer ni escribir datos de otro salón. Replica el patrón multi-tenant
--   documentado en db/README.md ("RLS"):
--
--       salon_id ∈ { salones de los que el usuario autenticado es miembro }
--
-- Tablas cubiertas (todas las que llevan `salon_id NOT NULL`):
--   · tpv_sesiones_caja   (sesiones de caja)
--   · tpv_metodos_pago    (catálogo por salón)
--   · tpv_ventas          (tickets)
--   · tpv_lineas_ticket   (líneas de ticket — salon_id denormalizado)
--   · tpv_pagos           (pagos)
--   · tpv_facturas        (facturas)
--
-- Naturaleza: ADITIVA. No altera columnas ni datos; sólo añade la tabla de
--   pertenencia (si no existe), funciones helper y políticas RLS.
--
-- Mecanismo de identidad (portátil Supabase + CI):
--   `tpv_current_uid()` resuelve el usuario actual desde el claim JWT de
--   Supabase (`request.jwt.claims -> sub`, idéntico a lo que usa auth.uid()) y,
--   como respaldo para tests/CI sin Supabase, desde el GUC `app.current_user_id`.
--   Así el mismo esquema RLS es verificable en Postgres puro (ver db/tests/).
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 0. Tabla de pertenencia salón ↔ usuario (mecanismo multi-tenant).
--    Se crea sólo si no existe: si el esquema principal ya tiene su propia
--    `salon_miembros`, esta sentencia es un no-op y se reutiliza la existente.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.salon_miembros (
    user_id    uuid NOT NULL,
    salon_id   uuid NOT NULL,
    rol        text NOT NULL DEFAULT 'staff',
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT salon_miembros_pk PRIMARY KEY (user_id, salon_id)
);

-- Índice para el patrón de consulta de las políticas (por usuario).
CREATE INDEX IF NOT EXISTS salon_miembros_user_idx
    ON public.salon_miembros (user_id);
-- Índice inverso (miembros de un salón).
CREATE INDEX IF NOT EXISTS salon_miembros_salon_idx
    ON public.salon_miembros (salon_id);

-- FK a salones sólo si aún no está declarada (tolerante a esquema previo).
DO $$
BEGIN
    IF to_regclass('public.salones') IS NOT NULL
       AND NOT EXISTS (
           SELECT 1 FROM pg_constraint WHERE conname = 'salon_miembros_salon_fk'
       ) THEN
        ALTER TABLE public.salon_miembros
            ADD CONSTRAINT salon_miembros_salon_fk
            FOREIGN KEY (salon_id) REFERENCES public.salones (id) ON DELETE CASCADE;
    END IF;
END;
$$;

-- ----------------------------------------------------------------------------
-- 1. Helper: identidad del usuario actual (SECURITY INVOKER).
--    No accede a tablas; sólo lee claims/GUC. Devuelve NULL si no hay identidad
--    (p.ej. rol anónimo) → las políticas denegarán todo acceso.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tpv_current_uid()
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = pg_catalog, pg_temp
AS $$
    SELECT COALESCE(
        -- Supabase: 'sub' del JWT (equivalente a auth.uid()).
        NULLIF(current_setting('request.jwt.claims', true), '')::json ->> 'sub',
        -- Respaldo portátil para tests/CI sin capa de auth de Supabase.
        NULLIF(current_setting('app.current_user_id', true), '')
    )::uuid
$$;

COMMENT ON FUNCTION public.tpv_current_uid() IS
    'UUID del usuario actual: claim JWT sub (Supabase) o GUC app.current_user_id (CI). NULL si anónimo.';

-- ----------------------------------------------------------------------------
-- 2. Helper: conjunto de salones visibles para el usuario actual.
--    SECURITY DEFINER para poder leer `salon_miembros` sin depender de permisos
--    directos del rol invocante y para no recursar sobre RLS. search_path fijo
--    para evitar secuestro de resolución de nombres.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tpv_salones_del_usuario()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT m.salon_id
      FROM public.salon_miembros AS m
     WHERE m.user_id = public.tpv_current_uid()
$$;

COMMENT ON FUNCTION public.tpv_salones_del_usuario() IS
    'Salones de los que el usuario actual es miembro. Base del aislamiento RLS del TPV.';

-- Ambos helpers son seguros de exponer: sólo revelan la pertenencia del propio
-- llamante. Se conceden a todos los roles (incluye authenticated / anon).
GRANT EXECUTE ON FUNCTION public.tpv_current_uid()        TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.tpv_salones_del_usuario() TO PUBLIC;

-- ----------------------------------------------------------------------------
-- 3. Activación de RLS + política de aislamiento por salón en cada tabla TPV.
--
--    · ENABLE  ROW LEVEL SECURITY → aplica políticas a roles no privilegiados.
--    · FORCE   ROW LEVEL SECURITY → aplica también al PROPIETARIO de la tabla,
--      de modo que el aislamiento se cumple aunque la app conecte como owner.
--      (service_role de Supabase tiene BYPASSRLS y sigue teniendo acceso total
--      para tareas administrativas; los superusuarios también.)
--
--    Política FOR ALL con USING (lectura/actualización/borrado) y WITH CHECK
--    (inserción/actualización): impide tanto VER filas de otro salón como
--    CREAR/MOVER filas hacia otro salón.
-- ----------------------------------------------------------------------------

-- 3.1 tpv_sesiones_caja -------------------------------------------------------
ALTER TABLE public.tpv_sesiones_caja ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tpv_sesiones_caja FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tpv_sesiones_caja_aislamiento ON public.tpv_sesiones_caja;
CREATE POLICY tpv_sesiones_caja_aislamiento ON public.tpv_sesiones_caja
    FOR ALL
    USING      (salon_id IN (SELECT public.tpv_salones_del_usuario()))
    WITH CHECK (salon_id IN (SELECT public.tpv_salones_del_usuario()));

-- 3.2 tpv_metodos_pago --------------------------------------------------------
ALTER TABLE public.tpv_metodos_pago ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tpv_metodos_pago FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tpv_metodos_pago_aislamiento ON public.tpv_metodos_pago;
CREATE POLICY tpv_metodos_pago_aislamiento ON public.tpv_metodos_pago
    FOR ALL
    USING      (salon_id IN (SELECT public.tpv_salones_del_usuario()))
    WITH CHECK (salon_id IN (SELECT public.tpv_salones_del_usuario()));

-- 3.3 tpv_ventas (tickets) ----------------------------------------------------
ALTER TABLE public.tpv_ventas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tpv_ventas FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tpv_ventas_aislamiento ON public.tpv_ventas;
CREATE POLICY tpv_ventas_aislamiento ON public.tpv_ventas
    FOR ALL
    USING      (salon_id IN (SELECT public.tpv_salones_del_usuario()))
    WITH CHECK (salon_id IN (SELECT public.tpv_salones_del_usuario()));

-- 3.4 tpv_lineas_ticket -------------------------------------------------------
--     salon_id está denormalizado en esta tabla precisamente para poder aplicar
--     la misma política de aislamiento sin un JOIN a tpv_ventas.
ALTER TABLE public.tpv_lineas_ticket ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tpv_lineas_ticket FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tpv_lineas_ticket_aislamiento ON public.tpv_lineas_ticket;
CREATE POLICY tpv_lineas_ticket_aislamiento ON public.tpv_lineas_ticket
    FOR ALL
    USING      (salon_id IN (SELECT public.tpv_salones_del_usuario()))
    WITH CHECK (salon_id IN (SELECT public.tpv_salones_del_usuario()));

-- 3.5 tpv_pagos ---------------------------------------------------------------
ALTER TABLE public.tpv_pagos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tpv_pagos FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tpv_pagos_aislamiento ON public.tpv_pagos;
CREATE POLICY tpv_pagos_aislamiento ON public.tpv_pagos
    FOR ALL
    USING      (salon_id IN (SELECT public.tpv_salones_del_usuario()))
    WITH CHECK (salon_id IN (SELECT public.tpv_salones_del_usuario()));

-- 3.6 tpv_facturas ------------------------------------------------------------
ALTER TABLE public.tpv_facturas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tpv_facturas FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tpv_facturas_aislamiento ON public.tpv_facturas;
CREATE POLICY tpv_facturas_aislamiento ON public.tpv_facturas
    FOR ALL
    USING      (salon_id IN (SELECT public.tpv_salones_del_usuario()))
    WITH CHECK (salon_id IN (SELECT public.tpv_salones_del_usuario()));

COMMIT;

-- ============================================================================
-- NOTAS OPERATIVAS
--   · service_role (Supabase) mantiene acceso total: úsalo SÓLO en backend de
--     confianza (Edge Functions, jobs). El acceso desde el navegador debe ir
--     siempre con el rol `authenticated`, sujeto a estas políticas.
--   · Para que un usuario vea el TPV de un salón, debe existir la fila
--     (user_id, salon_id) en public.salon_miembros.
--   · Verificación de aislamiento: db/tests/rls_tpv_isolation_test.sql
-- ============================================================================
