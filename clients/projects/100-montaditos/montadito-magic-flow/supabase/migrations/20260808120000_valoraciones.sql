-- ───────────────────────────────────────────────────────────────────────────
-- Valoraciones de clientes (5 estrellas + comentario opcional).
-- La app de pedidos inserta una valoración tras el pedido (1 vez/día por móvil);
-- el dashboard (pestaña "Valoraciones") las lee para ver media y comentarios.
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.valoraciones (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  local_id   uuid REFERENCES public.locales(id) ON DELETE SET NULL,
  pedido_id  uuid REFERENCES public.pedidos(id) ON DELETE SET NULL,
  estrellas  smallint NOT NULL CHECK (estrellas BETWEEN 1 AND 5),
  comentario text,
  device_id  text,              -- id anónimo del dispositivo (solo para limitar frecuencia)
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_valoraciones_local_created
  ON public.valoraciones (local_id, created_at DESC);

ALTER TABLE public.valoraciones ENABLE ROW LEVEL SECURITY;

-- El cliente (anon) puede dejar su valoración; staff/cliente pueden leer (no es dato sensible).
DROP POLICY IF EXISTS valoraciones_insert ON public.valoraciones;
CREATE POLICY valoraciones_insert ON public.valoraciones FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS valoraciones_select ON public.valoraciones;
CREATE POLICY valoraciones_select ON public.valoraciones FOR SELECT USING (true);

GRANT SELECT, INSERT ON public.valoraciones TO anon, authenticated;
