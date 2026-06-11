ALTER TABLE public.producto_alergenos
  ADD CONSTRAINT producto_alergenos_producto_id_fkey FOREIGN KEY (producto_id) REFERENCES public.menu_productos(id) ON DELETE CASCADE,
  ADD CONSTRAINT producto_alergenos_alergeno_id_fkey FOREIGN KEY (alergeno_id) REFERENCES public.alergenos(id) ON DELETE CASCADE,
  ADD CONSTRAINT producto_alergenos_unique UNIQUE (producto_id, alergeno_id);
NOTIFY pgrst, 'reload schema';