-- ---------- funciones de apoyo ----------
-- SECURITY DEFINER a propósito: consultan `perfiles` y `permisos`, que a su vez
-- tienen RLS. Sin definer, las políticas se llamarían a sí mismas en bucle.
create or replace function atlas_es_propietario() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select es_propietario from perfiles where id = auth.uid()), false)
$$;

create or replace function atlas_ve_proyecto(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select atlas_es_propietario()
      or exists (select 1 from permisos
                 where usuario_id = auth.uid() and proyecto_id = p)
$$;

create or replace function atlas_edita_proyecto(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select atlas_es_propietario()
      or exists (select 1 from permisos
                 where usuario_id = auth.uid() and proyecto_id = p and rol = 'editor')
$$;

-- ---------- permisos de tabla ----------
-- RLS filtra FILAS, pero antes hace falta permiso sobre la TABLA. Las tablas
-- creadas por migraciones propias no lo reciben solas: hay que concederlo.
grant usage on schema public to authenticated;

grant select, insert, update, delete on
  clientes, contactos, proyectos, enlaces, servicios, checks,
  incidencias, ventanas_mantenimiento, perfiles, permisos,
  credenciales, credencial_usos, notas, suscripciones_push
to authenticated;

-- Solo lectura: las escribe el motor de vigilancia con service_role.
grant select on check_resultados, check_agregados, notificaciones to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- ---------- activar RLS en todo ----------
alter table clientes               enable row level security;
alter table contactos              enable row level security;
alter table proyectos              enable row level security;
alter table enlaces                enable row level security;
alter table contratos              enable row level security;
alter table servicios              enable row level security;
alter table checks                 enable row level security;
alter table check_resultados       enable row level security;
alter table check_agregados        enable row level security;
alter table incidencias            enable row level security;
alter table ventanas_mantenimiento enable row level security;
alter table perfiles               enable row level security;
alter table permisos               enable row level security;
alter table credenciales           enable row level security;
alter table credencial_usos        enable row level security;
alter table notas                  enable row level security;
alter table suscripciones_push     enable row level security;
alter table notificaciones         enable row level security;

-- ---------- proyectos y lo que cuelga de ellos ----------
create policy proyectos_ver on proyectos for select to authenticated
  using (atlas_ve_proyecto(id));
create policy proyectos_escribir on proyectos for all to authenticated
  using (atlas_es_propietario()) with check (atlas_es_propietario());

create policy enlaces_ver on enlaces for select to authenticated
  using (atlas_ve_proyecto(proyecto_id));
create policy enlaces_escribir on enlaces for all to authenticated
  using (atlas_edita_proyecto(proyecto_id))
  with check (atlas_edita_proyecto(proyecto_id));

create policy servicios_ver on servicios for select to authenticated
  using (atlas_ve_proyecto(proyecto_id));
create policy servicios_escribir on servicios for all to authenticated
  using (atlas_edita_proyecto(proyecto_id))
  with check (atlas_edita_proyecto(proyecto_id));

create policy checks_ver on checks for select to authenticated
  using (exists (select 1 from servicios s
                 where s.id = servicio_id and atlas_ve_proyecto(s.proyecto_id)));
create policy checks_escribir on checks for all to authenticated
  using (exists (select 1 from servicios s
                 where s.id = servicio_id and atlas_edita_proyecto(s.proyecto_id)))
  with check (exists (select 1 from servicios s
                 where s.id = servicio_id and atlas_edita_proyecto(s.proyecto_id)));

create policy resultados_ver on check_resultados for select to authenticated
  using (exists (select 1 from checks c join servicios s on s.id = c.servicio_id
                 where c.id = check_id and atlas_ve_proyecto(s.proyecto_id)));
create policy agregados_ver on check_agregados for select to authenticated
  using (exists (select 1 from checks c join servicios s on s.id = c.servicio_id
                 where c.id = check_id and atlas_ve_proyecto(s.proyecto_id)));

create policy incidencias_ver on incidencias for select to authenticated
  using (exists (select 1 from servicios s
                 where s.id = servicio_id and atlas_ve_proyecto(s.proyecto_id)));
-- Silenciar es la única escritura que un editor hace sobre incidencias.
create policy incidencias_silenciar on incidencias for update to authenticated
  using (exists (select 1 from servicios s
                 where s.id = servicio_id and atlas_edita_proyecto(s.proyecto_id)))
  with check (exists (select 1 from servicios s
                 where s.id = servicio_id and atlas_edita_proyecto(s.proyecto_id)));

create policy ventanas_ver on ventanas_mantenimiento for select to authenticated
  using (atlas_ve_proyecto(proyecto_id));
create policy ventanas_escribir on ventanas_mantenimiento for all to authenticated
  using (atlas_edita_proyecto(proyecto_id))
  with check (atlas_edita_proyecto(proyecto_id));

-- ---------- clientes: se ven a través de sus contratos ----------
create policy clientes_ver on clientes for select to authenticated
  using (
    atlas_es_propietario()
    or exists (select 1 from contratos ct
               where ct.cliente_id = clientes.id and atlas_ve_proyecto(ct.proyecto_id))
  );
create policy clientes_escribir on clientes for all to authenticated
  using (atlas_es_propietario()) with check (atlas_es_propietario());

create policy contactos_ver on contactos for select to authenticated
  using (exists (select 1 from clientes c where c.id = cliente_id));
create policy contactos_escribir on contactos for all to authenticated
  using (atlas_es_propietario()) with check (atlas_es_propietario());

-- ---------- contratos: la tabla es solo del propietario ----------
create policy contratos_propietario on contratos for all to authenticated
  using (atlas_es_propietario()) with check (atlas_es_propietario());

-- La LECTURA de la tabla queda revocada para los roles de API: toda la
-- aplicación lee de `contratos_visibles`. Las escrituras sí van a la tabla, y la
-- política de arriba las limita al propietario.
revoke all on contratos from anon, authenticated;
grant  insert, update, delete on contratos to authenticated;

-- La vista tiene privilegios del definidor (comportamiento por defecto): aplica
-- ella misma AMBAS reglas — qué filas se ven y qué columnas se anulan. Una vista
-- `security_invoker` no serviría: heredaría el veto de la tabla y el editor no
-- vería ni las filas sin importe.
create view contratos_visibles as
select
  ct.id,
  ct.cliente_id,
  ct.proyecto_id,
  case when atlas_es_propietario() then ct.cuota_mensual end as cuota_mensual,
  case when atlas_es_propietario() then ct.notas         end as notas,
  ct.moneda,
  ct.addons,
  ct.alta,
  ct.baja,
  ct.estado,
  ct.creado_en
from contratos ct
where atlas_ve_proyecto(ct.proyecto_id);

grant select on contratos_visibles to authenticated;

-- ---------- personas ----------
create policy perfiles_ver on perfiles for select to authenticated
  using (id = auth.uid() or atlas_es_propietario());
create policy perfiles_propio on perfiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
create policy perfiles_propietario on perfiles for all to authenticated
  using (atlas_es_propietario()) with check (atlas_es_propietario());

create policy permisos_ver on permisos for select to authenticated
  using (usuario_id = auth.uid() or atlas_es_propietario());
create policy permisos_escribir on permisos for all to authenticated
  using (atlas_es_propietario()) with check (atlas_es_propietario());

-- ---------- el llavero: exclusivo del propietario ----------
create policy credenciales_propietario on credenciales for all to authenticated
  using (atlas_es_propietario()) with check (atlas_es_propietario());
create policy usos_propietario on credencial_usos for all to authenticated
  using (atlas_es_propietario()) with check (atlas_es_propietario());

-- ---------- notas ----------
create policy notas_ver on notas for select to authenticated
  using (
    (entidad_tipo = 'proyecto' and atlas_ve_proyecto(entidad_id))
    or (entidad_tipo = 'cliente'
        and exists (select 1 from clientes c where c.id = entidad_id))
  );
create policy notas_escribir on notas for insert to authenticated
  with check (
    (entidad_tipo = 'proyecto' and atlas_edita_proyecto(entidad_id))
    or (entidad_tipo = 'cliente' and atlas_es_propietario())
  );

-- ---------- notificaciones: cada uno las suyas ----------
create policy push_propias on suscripciones_push for all to authenticated
  using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());
create policy notificaciones_propias on notificaciones for select to authenticated
  using (usuario_id = auth.uid() or atlas_es_propietario());
