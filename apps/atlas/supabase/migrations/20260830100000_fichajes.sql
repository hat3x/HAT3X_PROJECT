-- apps/atlas/supabase/migrations/20260830100000_fichajes.sql
--
-- Las horas, medidas desde Atlas.
--
-- Dos ejes, no uno: trabajar en Kairos PARA Biodental y trabajar en Kairos en
-- general no son lo mismo, y con un solo campo no se distinguen. Los dos son
-- opcionales porque también hay horas de estructura que no van a nadie.
create table fichajes (
  id           uuid primary key default gen_random_uuid(),
  usuario_id   uuid not null references perfiles(id) on delete restrict,
  proyecto_id  uuid references proyectos(id) on delete set null,
  cliente_id   uuid references clientes(id)  on delete set null,
  inicio       timestamptz not null,
  fin          timestamptz,                  -- nulo = en curso
  nota         text,
  -- 'atlas' = fichado en vivo. 'anadido' = reconstruido después. Separa lo
  -- medido de lo recordado: la pantalla enseña qué parte del mes es cada cosa,
  -- y esa señal es la que dice si la regla «ficha antes de empezar» se cumple.
  origen       text not null default 'atlas'
               check (origen in ('atlas','anadido')),
  creado_en    timestamptz not null default now(),
  check (fin is null or fin > inicio),
  -- Un tramo reconstruido siempre está cerrado: nadie «recuerda» que sigue
  -- trabajando. Sin esto, un añadido sin fin quedaría en curso para siempre y
  -- bloquearía el índice de abajo.
  check (origen = 'atlas' or fin is not null)
);

-- Una sola en curso por persona, garantizado en la base. Un `if` en el código
-- lo saltaría cualquier escritura directa; un índice único, no.
create unique index fichajes_uno_en_curso
  on fichajes (usuario_id) where fin is null;

create index fichajes_usuario_inicio on fichajes (usuario_id, inicio desc);
create index fichajes_cliente        on fichajes (cliente_id, inicio desc);
create index fichajes_proyecto       on fichajes (proyecto_id, inicio desc);

-- Los `grant` generales del bloque 1 solo alcanzaron a las tablas que existían
-- entonces. Esta hay que concederla a mano, a los dos roles.
grant select, insert, update, delete on fichajes to authenticated;
grant all privileges on fichajes to service_role;

alter table fichajes enable row level security;

-- Primera vez que un colaborador ESCRIBE en Atlas. Lo suyo, y solo lo suyo:
-- el `with check` impide que inserte una fila a nombre de otro.
create policy fichajes_propios on fichajes for all to authenticated
  using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());

-- El propietario ve las horas de todos. Verlas, no editarlas: corregir el
-- tramo de otra persona a sus espaldas es justo lo que la marca `origen`
-- quiere hacer imposible.
create policy fichajes_propietario_ve on fichajes for select to authenticated
  using (atlas_es_propietario());
