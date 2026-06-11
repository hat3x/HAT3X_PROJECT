
-- Reemplazar las ensaladas con las dos oficiales de 100 Montaditos
DELETE FROM public.menu_productos
WHERE categoria_id = (SELECT id FROM public.menu_categorias WHERE nombre ILIKE 'ensaladas');

INSERT INTO public.menu_productos (categoria_id, nombre, descripcion, precio, disponible, destacado, nuevo)
SELECT id, 'Campera', 'Lechuga, pollo, tomate, queso madurado, aceitunas, picatostes y salsa alioli', 6.50, true, false, false
FROM public.menu_categorias WHERE nombre ILIKE 'ensaladas';

INSERT INTO public.menu_productos (categoria_id, nombre, descripcion, precio, disponible, destacado, nuevo)
SELECT id, 'TexMex', 'Lechuga, pollo kebab, tomate, maíz, aceitunas, nachos sabor TexMex y salsa mostaza y miel', 6.50, true, true, true
FROM public.menu_categorias WHERE nombre ILIKE 'ensaladas';
