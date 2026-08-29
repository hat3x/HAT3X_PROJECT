--
-- Las plataformas que HAT3X paga, como entidad y no como texto suelto.
--
-- Hasta ahora el proveedor de un gasto era un `text` libre. Con eso, «Twilio»,
-- «twilio» y «Twilio Inc» son tres plataformas distintas en cualquier suma, y
-- la pregunta que motivó esta tabla —«¿cuánto gastamos al mes en cada
-- plataforma?»— no tiene respuesta fiable.
--
-- Se sustituye `proveedor` por una referencia en vez de dejar los dos
-- conviviendo: dos campos para la misma idea es exactamente cómo se acaba con
-- el nombre en uno y la referencia en el otro, y las sumas dejándose fuera la
-- mitad de las filas.
--

create table plataformas (
  id        uuid primary key default gen_random_uuid(),
  nombre    text not null unique,
  para_que  text,
  -- 'variable' = lo que se paga depende del uso. Sube sin avisar, no se
  --              controla a ojo, y es candidata a conector automático.
  -- 'fija'     = lo mismo todos los meses. Se da de alta una vez en
  --              `gastos_recurrentes` y no necesita conector ninguno.
  -- La distinción no es de comodidad, es de riesgo: una cuota fija mal
  -- apuntada descuadra por una cantidad conocida; un consumo variable sin
  -- vigilar descuadra por una que no se sabe hasta que llega la factura.
  tipo      text not null check (tipo in ('variable','fija')),
  activa    boolean not null default true,
  notas     text,
  creado_en timestamptz not null default now()
);

-- ---------- el gasto apunta a la plataforma ----------
--
-- Se puede eliminar `proveedor` sin pérdida: las dos tablas están vacías.
-- `plataforma_id` es NULO a propósito, para el gasto suelto que no es de
-- ninguna plataforma —un notario, un billete—, que se describe en el concepto.
-- Y lo que se pague dos veces, merece ser plataforma.
alter table gastos
  add column plataforma_id uuid references plataformas(id) on delete set null,
  drop column proveedor;

alter table gastos_recurrentes
  add column plataforma_id uuid references plataformas(id) on delete set null,
  drop column proveedor;

create index gastos_por_plataforma on gastos(plataforma_id)
  where plataforma_id is not null;

-- ---------- permisos ----------
--
-- Los `grant` generales de `20260815100300_rls.sql` solo alcanzaron a las
-- tablas que existían entonces. Una tabla nueva nace sin permisos para nadie.
grant select, insert, update, delete on plataformas to authenticated;
grant all privileges on plataformas to service_role;

alter table plataformas enable row level security;

-- Del propietario, como todo lo económico: qué proveedores usa HAT3X y para
-- qué es información del negocio, no de un proyecto concreto.
create policy plataformas_todo on plataformas for all to authenticated
  using (atlas_es_propietario()) with check (atlas_es_propietario());

-- ---------- el inventario de partida ----------
--
-- Sale de `memoria/plataformas.md`, armado leyendo los ficheros de entorno del
-- repositorio. Está incompleto A PROPÓSITO y se sabe por qué: el código solo
-- revela las plataformas a las que se LLAMA por API. Lo que simplemente se
-- paga —un dominio, una licencia, la gestoría— no deja rastro en ningún
-- fichero. El resto entra a mano desde la pantalla.
insert into plataformas (nombre, para_que, tipo) values
  ('Retell AI',        'Agentes de voz',                       'variable'),
  ('Zadarma',          'Telefonía',                            'variable'),
  ('Twilio',           'SMS y WhatsApp',                       'variable'),
  ('Stripe',           'Cobros de 100 Montaditos',             'variable'),
  ('OpenAI',           'El chat «Monty» de 100 Montaditos',    'variable'),
  ('Anthropic',        'Claude MAX',                           'fija'),
  ('IONOS',            'Dominios y alojamiento',               'fija'),
  ('Google Workspace', 'Correo y ofimática',                   'fija'),
  ('Supabase',         'Base de datos de todos los proyectos', 'fija'),
  ('Vercel',           'Alojamiento de webs y apps',           'fija'),
  ('ElevenLabs',       'Síntesis de voz',                      'fija'),
  ('Lovable',          'Por confirmar',                        'fija'),
  ('Resend',           'Envío de correo de Atlas',             'fija'),
  ('n8n',              'Automatizaciones',                     'fija');
