-- apps/atlas/supabase/migrations/20260829100000_economia.sql
--
-- El libro: dónde vive el dinero de HAT3X.
--
-- Hasta ahora lo económico estaba en cuatro sitios que no se hablaban:
-- `contratos.cuota_mensual` aquí, `hat3x_transactions` en jarvis, un
-- `fichaje.json` local, y HTML escrito a mano por cliente. Esto es el sitio
-- único.
--
-- Todo lo de aquí es del propietario. No es un dato de proyecto que un editor
-- pueda tocar: es el negocio.
--

-- ---------- lo fijo de cada mes ----------
--
-- Va primero porque `gastos` la referencia. Vercel, Supabase, Twilio, Retell:
-- doce recibos iguales al año que nadie va a teclear a mano doce veces. Se dan
-- de alta una vez y un `pg_cron` mensual los materializa.
create table gastos_recurrentes (
  id           uuid primary key default gen_random_uuid(),
  concepto     text not null,
  proveedor    text,
  base         numeric(12,2) not null check (base >= 0),
  iva          numeric(12,2) not null default 0 check (iva >= 0),
  categoria    text not null,
  -- Imputación. Ambos nulos = gasto de estructura, que NO se reparte.
  cliente_id   uuid references clientes(id)  on delete set null,
  proyecto_id  uuid references proyectos(id) on delete set null,
  -- Tope 28 a propósito: el 29, 30 y 31 no existen todos los meses, y un
  -- recibo que se salta febrero es un agujero que nadie va a notar.
  dia_del_mes  int not null default 1 check (dia_del_mes between 1 and 28),
  activo       boolean not null default true,
  creado_en    timestamptz not null default now()
);

-- ---------- lo que sale ----------
create table gastos (
  id            uuid primary key default gen_random_uuid(),
  fecha         date not null,
  concepto      text not null,
  proveedor     text,
  base          numeric(12,2) not null check (base >= 0),
  iva           numeric(12,2) not null default 0 check (iva >= 0),
  total         numeric(12,2) not null check (total >= 0),
  categoria     text not null,
  cliente_id    uuid references clientes(id)  on delete set null,
  proyecto_id   uuid references proyectos(id) on delete set null,
  -- De qué alta recurrente salió, si salió de alguna. Sirve para no
  -- materializar dos veces el mismo mes.
  recurrente_id uuid references gastos_recurrentes(id) on delete set null,
  notas         text,
  creado_en     timestamptz not null default now()
);
create index gastos_por_fecha on gastos(fecha desc);
create index gastos_por_cliente on gastos(cliente_id) where cliente_id is not null;

-- ---------- lo que entra ----------
create table facturas (
  id                uuid primary key default gen_random_uuid(),
  -- 'externa' = la emitiste tú por otra vía y Atlas solo la registra.
  -- 'atlas'   = la emite Atlas, desde el plan 2E. Solo esas van en la cadena.
  origen            text not null check (origen in ('externa','atlas')),
  serie             text not null,
  -- Nulo mientras es borrador. Se asigna al emitir, bajo bloqueo (plan 2E).
  numero            int,
  -- `restrict` y no `cascade`: borrar un cliente con facturas tiene que fallar
  -- y decirlo. Es un registro fiscal, no un dato de trabajo.
  cliente_id        uuid not null references clientes(id) on delete restrict,
  fecha_emision     date not null,
  fecha_vencimiento date,
  -- Congelados al emitir, nunca derivados al leer: un tipo de IVA que cambie no
  -- puede reescribir el pasado.
  base              numeric(12,2) not null check (base >= 0),
  iva_tipo          numeric(4,2)  not null default 21 check (iva_tipo >= 0),
  iva_cuota         numeric(12,2) not null check (iva_cuota >= 0),
  total             numeric(12,2) not null check (total >= 0),
  estado            text not null default 'borrador'
                    check (estado in ('borrador','emitida','anulada')),
  -- Nulo mientras no se cobra. Es un hecho con fecha, no un estado: el ciclo
  -- fiscal y el cobro son dos dimensiones, y mezclarlas crea preguntas
  -- imposibles («¿una anulada cobrada?»).
  cobrada_en        date,
  -- La cadena del régimen no VERI*FACTU. Se rellena en 2E.
  huella            text,
  huella_anterior   text,
  firma             text,
  rectifica_a       uuid references facturas(id) on delete restrict,
  notas             text,
  creado_en         timestamptz not null default now(),
  unique (serie, numero),
  -- Una factura ajena NUNCA puede llevar cadena. Sin esto, un error de código
  -- en 2E podría encadenar una factura que Atlas no emitió, y eso es
  -- exactamente lo que la cadena existe para impedir.
  constraint solo_atlas_encadena check (
    origen = 'atlas' or (huella is null and huella_anterior is null and firma is null)
  ),
  constraint vencimiento_no_anterior check (
    fecha_vencimiento is null or fecha_vencimiento >= fecha_emision
  )
);
create index facturas_por_fecha on facturas(fecha_emision desc);
-- Las que hay que perseguir, que es la consulta de 2B.
create index facturas_sin_cobrar on facturas(fecha_vencimiento)
  where cobrada_en is null and estado <> 'anulada';

create table factura_lineas (
  id               uuid primary key default gen_random_uuid(),
  factura_id       uuid not null references facturas(id) on delete cascade,
  orden            int not null default 0,
  concepto         text not null,
  descripcion      text,
  cantidad         numeric(10,2) not null default 1 check (cantidad > 0),
  precio_unitario  numeric(12,2) not null check (precio_unitario >= 0),
  importe          numeric(12,2) not null check (importe >= 0),
  -- El proyecto va AQUÍ y no en la factura. El presupuesto real de Biodental
  -- ya tiene dos proyectos en un solo documento —«Sara» y «Kairos»—, así que
  -- con el proyecto en la cabecera la rentabilidad por proyecto sería falsa
  -- desde el primer cliente.
  proyecto_id      uuid references proyectos(id) on delete set null
);
create index factura_lineas_por_factura on factura_lineas(factura_id);

-- ---------- lo que se espera cobrar ----------
--
-- Materializa cada mes de cada contrato activo. Sin esto, «¿qué llevo sin
-- facturar?» habría que deducirlo al vuelo cada vez, y esa deducción es la que
-- falla en silencio: lo que no está registrado no se puede echar de menos.
create table periodos_contrato (
  id                uuid primary key default gen_random_uuid(),
  contrato_id       uuid not null references contratos(id) on delete cascade,
  periodo           date not null,           -- primer día del mes
  importe_esperado  numeric(12,2) not null,  -- congelado al materializar
  factura_id        uuid references facturas(id) on delete set null,
  creado_en         timestamptz not null default now(),
  unique (contrato_id, periodo)
);
create index periodos_sin_facturar on periodos_contrato(periodo)
  where factura_id is null;

-- ---------- permisos ----------
--
-- Los `grant` generales de `20260815100300_rls.sql` solo alcanzaron a las
-- tablas que existían entonces. Una tabla nueva empieza sin permisos.
grant select, insert, update, delete
  on gastos_recurrentes, gastos, facturas, factura_lineas, periodos_contrato
  to authenticated;
grant all privileges
  on gastos_recurrentes, gastos, facturas, factura_lineas, periodos_contrato
  to service_role;

alter table gastos_recurrentes enable row level security;
alter table gastos             enable row level security;
alter table facturas           enable row level security;
alter table factura_lineas     enable row level security;
alter table periodos_contrato  enable row level security;

-- ---------- políticas ----------
--
-- Todo del propietario, lectura y escritura. Un editor gestiona los servicios
-- de sus proyectos, pero no ve lo que se cobra por ellos.
create policy gastos_recurrentes_todo on gastos_recurrentes for all to authenticated
  using (atlas_es_propietario()) with check (atlas_es_propietario());
create policy gastos_todo on gastos for all to authenticated
  using (atlas_es_propietario()) with check (atlas_es_propietario());
create policy facturas_todo on facturas for all to authenticated
  using (atlas_es_propietario()) with check (atlas_es_propietario());
create policy factura_lineas_todo on factura_lineas for all to authenticated
  using (atlas_es_propietario()) with check (atlas_es_propietario());
create policy periodos_todo on periodos_contrato for all to authenticated
  using (atlas_es_propietario()) with check (atlas_es_propietario());
