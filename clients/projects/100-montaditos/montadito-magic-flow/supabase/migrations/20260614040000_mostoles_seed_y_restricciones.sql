-- =============================================================================
-- Insertar local Móstoles (si no existe) y sus restricciones de carta.
-- La migración 20260614030000 detectó que el slug 'mostoles-constitucion'
-- no estaba en la BD; se re-inserta aquí de forma idempotente.
-- =============================================================================

-- ── 1. Franchisee (idempotente) ──────────────────────────────────────────────

INSERT INTO public.franchisees (nombre, email, application_fee_percent)
VALUES ('Móstoles', 'mostoles@hat3x.com', 0)
ON CONFLICT (email) DO NOTHING;

-- ── 2. Local (idempotente) ───────────────────────────────────────────────────
-- franchisee_id es NOT NULL (añadido en migración 20260522).

INSERT INTO public.locales (nombre, ciudad, direccion, slug, lat, lng, activo, franchisee_id)
SELECT
  'Móstoles - Av. de la Constitución',
  'Móstoles',
  'Av. de la Constitución, 23, 28931 Móstoles, Madrid',
  'mostoles-constitucion',
  40.3223,
  -3.8652,
  true,
  f.id
FROM public.franchisees f
WHERE f.email = 'mostoles@hat3x.com'
ON CONFLICT (slug) DO NOTHING;

-- ── 2. Restricciones ─────────────────────────────────────────────────────────

DO $$
DECLARE
  v_local UUID;
BEGIN
  SELECT id INTO v_local FROM public.locales WHERE slug = 'mostoles-constitucion';
  IF v_local IS NULL THEN
    RAISE EXCEPTION 'Local mostoles-constitucion no encontrado incluso después del INSERT';
  END IF;

  -- Sección "Tardeo Chill" completa
  INSERT INTO public.local_restricciones (local_id, seccion)
  VALUES (v_local, 'Tardeo Chill')
  ON CONFLICT DO NOTHING;

  -- "Café e Infusiones" no disponible a partir de las 17:00
  INSERT INTO public.local_restricciones (local_id, seccion, hora_limite)
  VALUES (v_local, 'Café e Infusiones', '17:00')
  ON CONFLICT DO NOTHING;

  -- Appletiser
  INSERT INTO public.local_restricciones (local_id, producto_id)
  SELECT v_local, id FROM public.menu_productos
  WHERE disponible = true AND nombre ILIKE '%appletiser%'
  ON CONFLICT DO NOTHING;

  -- Batidos que no sean de chocolate
  INSERT INTO public.local_restricciones (local_id, producto_id)
  SELECT v_local, id FROM public.menu_productos
  WHERE disponible = true
    AND nombre ILIKE '%batido%'
    AND nombre NOT ILIKE '%chocolate%'
  ON CONFLICT DO NOTHING;

  -- Monster que no sea Ultra White / Blanco
  INSERT INTO public.local_restricciones (local_id, producto_id)
  SELECT v_local, id FROM public.menu_productos
  WHERE disponible = true
    AND nombre ILIKE '%monster%'
    AND nombre !~* 'ultra|blanco|white'
  ON CONFLICT DO NOTHING;

  -- Heineken (no Heineken 0.0 / sin alcohol)
  INSERT INTO public.local_restricciones (local_id, producto_id)
  SELECT v_local, id FROM public.menu_productos
  WHERE disponible = true
    AND nombre ILIKE '%heineken%'
    AND nombre !~* '0[.,]0|sin\s*alcohol|00'
  ON CONFLICT DO NOTHING;

  -- Tercios Cruzcampo (no Cruzcampo Sin Gluten)
  INSERT INTO public.local_restricciones (local_id, producto_id)
  SELECT v_local, id FROM public.menu_productos
  WHERE disponible = true
    AND nombre ILIKE '%cruzcampo%'
    AND nombre NOT ILIKE '%sin gluten%'
  ON CONFLICT DO NOTHING;

  -- Spritz y Petroni
  INSERT INTO public.local_restricciones (local_id, producto_id)
  SELECT v_local, id FROM public.menu_productos
  WHERE disponible = true
    AND (nombre ILIKE '%spritz%' OR nombre ILIKE '%petroni%')
  ON CONFLICT DO NOTHING;

  -- Desperados
  INSERT INTO public.local_restricciones (local_id, producto_id)
  SELECT v_local, id FROM public.menu_productos
  WHERE disponible = true
    AND nombre ILIKE '%desperados%'
  ON CONFLICT DO NOTHING;

END;
$$;
