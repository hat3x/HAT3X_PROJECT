-- =============================================================================
-- Mostoles — restricciones precisas de secciones de jarras/botella.
-- En cada sección se ocultan todos los productos EXCEPTO los aprobados.
-- =============================================================================

DO $$
DECLARE
  v_local UUID;
BEGIN
  SELECT id INTO v_local FROM public.locales WHERE slug = 'mostoles-constitucion';
  IF v_local IS NULL THEN
    RAISE EXCEPTION 'Local mostoles-constitucion no encontrado';
  END IF;

  -- ── JARRAS HELADAS ──────────────────────────────────────────────────────────
  -- Solo: Jarra Cruzcampo Especial · Jarra Ladrón de Verano
  INSERT INTO public.local_restricciones (local_id, producto_id)
  SELECT v_local, id FROM public.menu_productos
  WHERE disponible = true
    AND seccion = 'Jarras Heladas'
    AND NOT (
         nombre ILIKE '%cruzcampo%especial%'
      OR nombre ILIKE '%especial%cruzcampo%'
      OR nombre ILIKE '%ladr_n%verano%'
      OR nombre ILIKE '%verano%ladr_n%'
      OR nombre ILIKE '%ladron%verano%'
      OR nombre ILIKE '%verano%ladron%'
    )
  ON CONFLICT DO NOTHING;

  -- ── CERVEZA PREMIUM ─────────────────────────────────────────────────────────
  -- Solo: Jarra Cruzcampo Radler · Jarra Ladrón de Manzanas · Jarra El Águila Dorada
  INSERT INTO public.local_restricciones (local_id, producto_id)
  SELECT v_local, id FROM public.menu_productos
  WHERE disponible = true
    AND seccion = 'Cerveza Premium'
    AND NOT (
         nombre ILIKE '%cruzcampo%radler%'
      OR nombre ILIKE '%radler%cruzcampo%'
      OR nombre ILIKE '%ladr_n%manzana%'
      OR nombre ILIKE '%manzana%ladr_n%'
      OR nombre ILIKE '%ladron%manzana%'
      OR nombre ILIKE '%manzana%ladron%'
      OR nombre ILIKE '%_guila%dorada%'
      OR nombre ILIKE '%dorada%_guila%'
    )
  ON CONFLICT DO NOTHING;

  -- ── CERVEZA EN BOTELLA ───────────────────────────────────────────────────────
  -- Solo: Heineken 0.0 · Paulaner
  INSERT INTO public.local_restricciones (local_id, producto_id)
  SELECT v_local, id FROM public.menu_productos
  WHERE disponible = true
    AND seccion = 'Cerveza en Botella'
    AND NOT (
         nombre ILIKE '%heineken%'
      OR nombre ILIKE '%paulaner%'
    )
  ON CONFLICT DO NOTHING;

END;
$$;
