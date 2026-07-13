-- ============================================================================
-- Migración: Feature flag de activación del TPV por salón
-- Archivo:   20260713000006_tpv_feature_flag.up.sql
-- Autor:     HAT3X · pm-deployment (vertical webs-apps) · sub-10
-- Fecha:     2026-07-13
-- Depende de: 20260713000001 (esquema) y 20260713000002 (RLS + salon_miembros)
-- ----------------------------------------------------------------------------
-- Objetivo:
--   Permitir un despliegue CONTROLADO del TPV salón por salón (canary), sin
--   redeploy de código: un interruptor por salón que la capa web consulta para
--   mostrar/ocultar el punto de entrada del TPV. Las Edge Functions siguen
--   protegidas por la RLS de sub-2 pase lo que pase con el flag.
--
-- Naturaleza: ADITIVA. Sólo CREATE (tabla nueva + helper + política). No toca
--   ninguna tabla existente (agenda, reservas, ajustes, salones) ni las tablas
--   tpv_* previas.
--
-- Semántica de reparto (opt-in / default-deny):
--   · Salón SIN fila            → TPV NO habilitado (invisible en la UI).
--   · Salón con habilitado=true → TPV habilitado.
--   · Salón con habilitado=false→ TPV apagado (kill-switch por salón).
--   Así el arranque es seguro: nadie ve el TPV hasta que se activa su salón.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Tabla de activación por salón.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tpv_salones_habilitados (
    salon_id     uuid        NOT NULL,
    habilitado   boolean     NOT NULL DEFAULT true,
    activado_at  timestamptz NOT NULL DEFAULT now(),
    activado_por uuid,                    -- usuario/admin que activó (auditoría)
    notas        text,
    CONSTRAINT tpv_salones_habilitados_pk PRIMARY KEY (salon_id)
);

-- FK a salones sólo si la tabla existe y aún no está declarada (tolerante).
DO $$
BEGIN
    IF to_regclass('public.salones') IS NOT NULL
       AND NOT EXISTS (
           SELECT 1 FROM pg_constraint WHERE conname = 'tpv_salones_habilitados_salon_fk'
       ) THEN
        ALTER TABLE public.tpv_salones_habilitados
            ADD CONSTRAINT tpv_salones_habilitados_salon_fk
            FOREIGN KEY (salon_id) REFERENCES public.salones (id) ON DELETE CASCADE;
    END IF;
END;
$$;

COMMENT ON TABLE public.tpv_salones_habilitados IS
    'Feature flag de rollout del TPV por salón. Sin fila = TPV oculto (default-deny).';

-- ----------------------------------------------------------------------------
-- 2. Helper: ¿está el TPV habilitado para este salón?  (default-deny)
--    SECURITY DEFINER para poder leer el flag sin depender de la RLS del
--    llamante; search_path fijo para evitar secuestro de nombres.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tpv_salon_habilitado(p_salon_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT COALESCE(
        (SELECT h.habilitado
           FROM public.tpv_salones_habilitados AS h
          WHERE h.salon_id = p_salon_id),
        false)
$$;

COMMENT ON FUNCTION public.tpv_salon_habilitado(uuid) IS
    'true si el salón tiene el TPV activado. Sin fila → false (arranque seguro).';

GRANT EXECUTE ON FUNCTION public.tpv_salon_habilitado(uuid) TO PUBLIC;

-- ----------------------------------------------------------------------------
-- 3. RLS: un usuario sólo LEE el flag de los salones de los que es miembro.
--    Las ESCRITURAS (activar/desactivar) las hace HAT3X vía service_role/SQL
--    admin (BYPASSRLS): no se define política de INSERT/UPDATE/DELETE para el
--    rol authenticated, de modo que ningún salón puede auto-activarse.
-- ----------------------------------------------------------------------------
ALTER TABLE public.tpv_salones_habilitados ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tpv_salones_habilitados FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tpv_salones_habilitados_lectura ON public.tpv_salones_habilitados;
CREATE POLICY tpv_salones_habilitados_lectura ON public.tpv_salones_habilitados
    FOR SELECT
    USING (salon_id IN (SELECT public.tpv_salones_del_usuario()));

COMMIT;

-- ============================================================================
-- OPERATIVA DE ROLLOUT (ejecutar como service_role / propietario)
--
--   -- Activar el TPV en un salón (canary):
--   INSERT INTO public.tpv_salones_habilitados (salon_id, notas)
--   VALUES (:salon_id, 'canary sub-10')
--   ON CONFLICT (salon_id) DO UPDATE SET habilitado = true, activado_at = now();
--
--   -- Kill-switch (apagar sin borrar histórico):
--   UPDATE public.tpv_salones_habilitados SET habilitado = false WHERE salon_id = :salon_id;
--
--   -- Estado del rollout:
--   SELECT salon_id, habilitado, activado_at FROM public.tpv_salones_habilitados ORDER BY activado_at;
-- ============================================================================
