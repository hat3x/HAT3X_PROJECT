-- Igual que las diez tablas de datos, el bucket de fotos es categoría
-- especial de RGPD (fotos corporales): cada persona solo puede ver, subir y
-- borrar objetos bajo su propio prefijo de carpeta, que es su id de usuario
-- — el mismo convenio que ya usa la Edge Function `borrar-cuenta` al listar
-- `${id}/...`. RLS en `storage.objects` ya viene activada por la propia
-- extensión de Storage (no por este proyecto): aquí solo se añaden el bucket
-- y la política que decide qué filas ve cada quién.
insert into storage.buckets (id, name, public)
values ('fotos', 'fotos', false)
on conflict (id) do nothing;

create policy "propio" on storage.objects
  for all
  using (bucket_id = 'fotos' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'fotos' and (storage.foldername(name))[1] = auth.uid()::text);
