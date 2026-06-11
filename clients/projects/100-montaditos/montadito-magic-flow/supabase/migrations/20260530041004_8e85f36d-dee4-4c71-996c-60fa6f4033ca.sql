-- Maestra de alérgenos (14 obligatorios UE 1169/2011)
CREATE TABLE public.alergenos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo TEXT NOT NULL UNIQUE,
  nombre TEXT NOT NULL,
  descripcion TEXT,
  icono TEXT,
  orden INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.alergenos TO anon;
GRANT SELECT ON public.alergenos TO authenticated;
GRANT ALL ON public.alergenos TO service_role;

ALTER TABLE public.alergenos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view alergenos"
  ON public.alergenos FOR SELECT
  USING (true);

CREATE POLICY "Admins manage alergenos"
  ON public.alergenos FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Relación productos <-> alérgenos
CREATE TABLE public.producto_alergenos (
  producto_id UUID NOT NULL,
  alergeno_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (producto_id, alergeno_id)
);

CREATE INDEX idx_producto_alergenos_alergeno ON public.producto_alergenos(alergeno_id);

GRANT SELECT ON public.producto_alergenos TO anon;
GRANT SELECT ON public.producto_alergenos TO authenticated;
GRANT ALL ON public.producto_alergenos TO service_role;

ALTER TABLE public.producto_alergenos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view producto_alergenos"
  ON public.producto_alergenos FOR SELECT
  USING (true);

CREATE POLICY "Admins manage producto_alergenos"
  ON public.producto_alergenos FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Seed 14 alérgenos oficiales
INSERT INTO public.alergenos (codigo, nombre, descripcion, icono, orden) VALUES
('gluten',       'Gluten',           'Cereales que contienen gluten: trigo, centeno, cebada, avena', '🌾', 1),
('crustaceos',   'Crustáceos',       'Cangrejos, langostas, gambas, langostinos', '🦐', 2),
('huevos',       'Huevos',           'Huevos y productos a base de huevo', '🥚', 3),
('pescado',      'Pescado',          'Pescado y productos a base de pescado', '🐟', 4),
('cacahuetes',   'Cacahuetes',       'Cacahuetes y productos a base de cacahuetes', '🥜', 5),
('soja',         'Soja',             'Soja y productos a base de soja', '🫘', 6),
('lacteos',      'Lácteos',          'Leche y sus derivados incluida la lactosa', '🥛', 7),
('frutas_cascara','Frutos de cáscara','Almendras, avellanas, nueces, anacardos, pistachos', '🌰', 8),
('apio',         'Apio',             'Apio y productos derivados', '🌿', 9),
('mostaza',      'Mostaza',          'Mostaza y productos derivados', '🌼', 10),
('sesamo',       'Sésamo',           'Semillas de sésamo y productos a base de sésamo', '⚪', 11),
('sulfitos',     'Sulfitos',         'Dióxido de azufre y sulfitos en concentraciones superiores a 10mg/kg', '🍷', 12),
('altramuces',   'Altramuces',       'Altramuces y productos a base de altramuces', '🌱', 13),
('moluscos',     'Moluscos',         'Moluscos y productos a base de moluscos', '🐚', 14);