-- Conceder acceso de tabla al rol `authenticated` antes de activar RLS.
--
-- Esta instancia de Supabase (CLI reciente) NO expone automáticamente las
-- tablas nuevas del esquema `public` a los roles de la API (comportamiento
-- por defecto en la nube, ver `auto_expose_new_tables` en config.toml): sin
-- estos GRANT, `authenticated` no tiene ningún privilegio sobre las tablas y
-- toda consulta falla con "permission denied" pase lo que pase con RLS.
-- RLS y GRANT son capas independientes: el GRANT decide si el rol puede
-- tocar la tabla; la política RLS decide qué filas ve una vez que puede.
-- No se concede nada a `anon`: esta app exige sesión, y los datos son
-- categoría especial de RGPD (peso, medidas, alimentación).
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;

alter table perfiles           enable row level security;
alter table objetivos          enable row level security;
alter table alimentos          enable row level security;
alter table comidas            enable row level security;
alter table comida_items       enable row level security;
alter table registros_agua     enable row level security;
alter table entrenamientos     enable row level security;
alter table habitos            enable row level security;
alter table habitos_registro   enable row level security;
alter table pesos              enable row level security;

create policy "propio" on perfiles         for all using (id = auth.uid())      with check (id = auth.uid());
create policy "propio" on objetivos        for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "propio" on alimentos        for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "propio" on comidas          for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "propio" on comida_items     for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "propio" on registros_agua   for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "propio" on entrenamientos   for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "propio" on habitos          for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "propio" on habitos_registro for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "propio" on pesos            for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Crear el perfil automáticamente al registrarse
create function public.crear_perfil()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.perfiles (id) values (new.id);
  return new;
end;
$$;

create trigger al_crear_usuario
  after insert on auth.users
  for each row execute function public.crear_perfil();
