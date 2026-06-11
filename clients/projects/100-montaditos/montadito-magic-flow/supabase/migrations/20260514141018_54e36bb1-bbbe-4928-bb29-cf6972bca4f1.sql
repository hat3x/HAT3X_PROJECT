-- Añadir campos geo, contacto y horarios al local
ALTER TABLE public.locales
  ADD COLUMN IF NOT EXISTS lat numeric,
  ADD COLUMN IF NOT EXISTS lng numeric,
  ADD COLUMN IF NOT EXISTS telefono text,
  ADD COLUMN IF NOT EXISTS sitio_web text,
  ADD COLUMN IF NOT EXISTS horarios jsonb;

-- Insertar local de Móstoles si no existe (por slug único)
INSERT INTO public.locales (nombre, ciudad, direccion, slug, lat, lng, telefono, sitio_web, horarios, activo)
SELECT
  'Móstoles - Av. de la Constitución',
  'Móstoles',
  'Av. de la Constitución, 23, 28931 Móstoles, Madrid',
  'mostoles-constitucion',
  40.3223,
  -3.8652,
  '913519001',
  'https://spain.100montaditos.com',
  '{
    "lunes":     {"open": "10:00", "close": "23:00"},
    "martes":    {"open": "10:00", "close": "23:00"},
    "miercoles": {"open": "10:00", "close": "23:00"},
    "jueves":    {"open": "10:00", "close": "23:00"},
    "viernes":   {"open": "10:00", "close": "24:00"},
    "sabado":    {"open": "11:30", "close": "24:00"},
    "domingo":   {"open": "11:30", "close": "23:00"}
  }'::jsonb,
  true
WHERE NOT EXISTS (SELECT 1 FROM public.locales WHERE slug = 'mostoles-constitucion');

-- Asegurar que los locales existentes (Gran Vía seed) tengan también lat/lng aproximadas si están vacías
UPDATE public.locales
SET lat = 40.4200, lng = -3.7025
WHERE slug = 'madrid-gran-via' AND (lat IS NULL OR lng IS NULL);