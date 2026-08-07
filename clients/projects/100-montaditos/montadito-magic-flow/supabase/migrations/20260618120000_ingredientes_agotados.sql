-- ───────────────────────────────────────────────────────────────────────────
-- SISTEMA DE INGREDIENTES Y "AGOTADOS" POR LOCAL
--
-- Objetivo: que el personal pueda marcar agotado:
--   (a) un INGREDIENTE (incluye los panes) -> los montaditos/ensaladas que lo
--       lleven aparecen en la app del cliente con aviso "AGOTADO" (no se ocultan).
--   (b) un PRODUCTO entero (aperitivos, raciones, bebidas, cookies, ruedas) ->
--       ese producto aparece con aviso "AGOTADO".
-- Todo es POR LOCAL (cada restaurante marca lo suyo).
-- ───────────────────────────────────────────────────────────────────────────

-- Catálogo de ingredientes (tipo 'ingrediente' o 'pan')
CREATE TABLE IF NOT EXISTS public.ingredientes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre     text NOT NULL UNIQUE,
  tipo       text NOT NULL DEFAULT 'ingrediente' CHECK (tipo IN ('ingrediente','pan')),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Qué ingredientes lleva cada producto (solo montaditos + ensaladas)
CREATE TABLE IF NOT EXISTS public.producto_ingredientes (
  producto_id    uuid NOT NULL REFERENCES public.menu_productos(id) ON DELETE CASCADE,
  ingrediente_id uuid NOT NULL REFERENCES public.ingredientes(id)   ON DELETE CASCADE,
  PRIMARY KEY (producto_id, ingrediente_id)
);

-- Ingredientes agotados por local (la fila existe = está agotado en ese local)
CREATE TABLE IF NOT EXISTS public.local_ingredientes_agotados (
  local_id       uuid NOT NULL REFERENCES public.locales(id)      ON DELETE CASCADE,
  ingrediente_id uuid NOT NULL REFERENCES public.ingredientes(id) ON DELETE CASCADE,
  agotado_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (local_id, ingrediente_id)
);

-- Productos enteros agotados por local (aperitivos/raciones/bebidas/cookies/ruedas)
CREATE TABLE IF NOT EXISTS public.local_productos_agotados (
  local_id    uuid NOT NULL REFERENCES public.locales(id)        ON DELETE CASCADE,
  producto_id uuid NOT NULL REFERENCES public.menu_productos(id) ON DELETE CASCADE,
  agotado_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (local_id, producto_id)
);

CREATE INDEX IF NOT EXISTS idx_prod_ing_ingrediente ON public.producto_ingredientes(ingrediente_id);
CREATE INDEX IF NOT EXISTS idx_local_ing_agot_local ON public.local_ingredientes_agotados(local_id);
CREATE INDEX IF NOT EXISTS idx_local_prod_agot_local ON public.local_productos_agotados(local_id);

-- ─── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.ingredientes                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.producto_ingredientes        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.local_ingredientes_agotados  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.local_productos_agotados     ENABLE ROW LEVEL SECURITY;

-- Lectura para todos (cliente anónimo + dashboard)
CREATE POLICY "ingredientes_read"          ON public.ingredientes                FOR SELECT USING (true);
CREATE POLICY "producto_ingredientes_read" ON public.producto_ingredientes       FOR SELECT USING (true);
CREATE POLICY "local_ing_agotados_read"    ON public.local_ingredientes_agotados FOR SELECT USING (true);
CREATE POLICY "local_prod_agotados_read"   ON public.local_productos_agotados    FOR SELECT USING (true);

-- Escritura (marcar/desmarcar agotado) solo para staff autenticado (dashboard)
CREATE POLICY "local_ing_agotados_write" ON public.local_ingredientes_agotados
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "local_prod_agotados_write" ON public.local_productos_agotados
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─── Realtime (para que la app del cliente se actualice al instante) ─────────
ALTER TABLE public.local_ingredientes_agotados REPLICA IDENTITY FULL;
ALTER TABLE public.local_productos_agotados    REPLICA IDENTITY FULL;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='local_ingredientes_agotados') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.local_ingredientes_agotados';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='local_productos_agotados') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.local_productos_agotados';
  END IF;
END $$;
