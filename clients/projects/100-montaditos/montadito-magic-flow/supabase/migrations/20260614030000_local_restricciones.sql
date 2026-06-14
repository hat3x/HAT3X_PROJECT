-- =============================================================================
-- FEATURE: Restricciones por local
-- Permite a cada local desactivar productos o secciones, con soporte
-- opcional para restricciones horarias (hora_limite: no disponible desde esa hora).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.local_restricciones (
  id          UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
  local_id    UUID      NOT NULL REFERENCES public.locales(id) ON DELETE CASCADE,
  producto_id UUID               REFERENCES public.menu_productos(id) ON DELETE CASCADE,
  seccion     TEXT,
  -- null  → siempre no disponible en este local
  -- valor → no disponible A PARTIR de esa hora (ej. '17:00')
  hora_limite TIME,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_restriccion_target CHECK (producto_id IS NOT NULL OR seccion IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS local_restricciones_producto_uq
  ON public.local_restricciones (local_id, producto_id)
  WHERE producto_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS local_restricciones_seccion_uq
  ON public.local_restricciones (local_id, seccion)
  WHERE seccion IS NOT NULL;

ALTER TABLE public.local_restricciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view restricciones"
  ON public.local_restricciones FOR SELECT USING (true);

CREATE POLICY "Admins can manage restricciones"
  ON public.local_restricciones FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- ── Restricciones del local de Móstoles ──────────────────────────────────────

DO $$
DECLARE
  v_local UUID;
BEGIN
  SELECT id INTO v_local FROM public.locales WHERE slug = 'mostoles-constitucion';
  IF v_local IS NULL THEN
    RAISE NOTICE 'Local mostoles-constitucion no encontrado, saltando restricciones.';
    RETURN;
  END IF;

  -- 1. Sección "Tardeo Chill" completa
  INSERT INTO public.local_restricciones (local_id, seccion)
  VALUES (v_local, 'Tardeo Chill')
  ON CONFLICT DO NOTHING;

  -- 2. "Café e Infusiones" no disponible a partir de las 17:00
  INSERT INTO public.local_restricciones (local_id, seccion, hora_limite)
  VALUES (v_local, 'Café e Infusiones', '17:00')
  ON CONFLICT DO NOTHING;

  -- 3. Appletiser
  INSERT INTO public.local_restricciones (local_id, producto_id)
  SELECT v_local, id FROM public.menu_productos
  WHERE disponible = true AND nombre ILIKE '%appletiser%'
  ON CONFLICT DO NOTHING;

  -- 4. Batidos que no sean de chocolate
  INSERT INTO public.local_restricciones (local_id, producto_id)
  SELECT v_local, id FROM public.menu_productos
  WHERE disponible = true
    AND nombre ILIKE '%batido%'
    AND nombre NOT ILIKE '%chocolate%'
  ON CONFLICT DO NOTHING;

  -- 5. Monster que no sea Ultra White / Blanco
  INSERT INTO public.local_restricciones (local_id, producto_id)
  SELECT v_local, id FROM public.menu_productos
  WHERE disponible = true
    AND nombre ILIKE '%monster%'
    AND nombre !~* 'ultra|blanco|white'
  ON CONFLICT DO NOTHING;

  -- 6. Heineken con jarra (no Heineken 0.0 / sin alcohol)
  INSERT INTO public.local_restricciones (local_id, producto_id)
  SELECT v_local, id FROM public.menu_productos
  WHERE disponible = true
    AND nombre ILIKE '%heineken%'
    AND nombre !~* '0[.,]0|sin\s*alcohol|00'
  ON CONFLICT DO NOTHING;

  -- 7. Tercios Cruzcampo (no Cruzcampo Sin Gluten)
  INSERT INTO public.local_restricciones (local_id, producto_id)
  SELECT v_local, id FROM public.menu_productos
  WHERE disponible = true
    AND nombre ILIKE '%cruzcampo%'
    AND nombre NOT ILIKE '%sin gluten%'
  ON CONFLICT DO NOTHING;

  -- 8. Spritz y Petroni
  INSERT INTO public.local_restricciones (local_id, producto_id)
  SELECT v_local, id FROM public.menu_productos
  WHERE disponible = true
    AND (nombre ILIKE '%spritz%' OR nombre ILIKE '%petroni%')
  ON CONFLICT DO NOTHING;

  -- 9. Desperados
  INSERT INTO public.local_restricciones (local_id, producto_id)
  SELECT v_local, id FROM public.menu_productos
  WHERE disponible = true
    AND nombre ILIKE '%desperados%'
  ON CONFLICT DO NOTHING;

END;
$$;
