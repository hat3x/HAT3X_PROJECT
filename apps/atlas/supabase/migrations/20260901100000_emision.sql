-- apps/atlas/supabase/migrations/20260901100000_emision.sql
--
-- La emisión fiscal (§7). La aplicación calcula la huella y la firma; esta
-- migración es lo que GARANTIZA: inmutabilidad, número correlativo bajo
-- bloqueo, y una punta de cadena que nadie puede adelantar.

-- ---------- columnas nuevas ----------
-- F1 = factura normal; R1 = rectificativa por diferencias. Es el TipoFactura
-- que entra en la huella (lista L2 de la orden).
alter table facturas add column tipo_factura text not null default 'F1'
  check (tipo_factura in ('F1','R1'));
-- FechaHoraHusoGenRegistro: el instante en que se selló, con su huso. Entra
-- en la huella, así que se guarda tal cual se usó.
alter table facturas add column huella_gen_en timestamptz;

-- El aviso de «la gestoría aún no ha validado esto». No bloquea: es una
-- decisión del propietario. Pero no se puede olvidar.
alter table ajustes_economia add column validado_gestoria boolean not null default false;

-- ---------- eventos: solo de inserción (§4.7) ----------
create table factura_eventos (
  id          uuid primary key default gen_random_uuid(),
  factura_id  uuid references facturas(id) on delete restrict,
  tipo        text not null check (tipo in
               ('emision','anulacion','rectificacion','exportacion',
                'config_fiscal','anomalia','verificacion')),
  detalle     jsonb not null default '{}'::jsonb,
  usuario_id  uuid references perfiles(id) on delete set null,
  creado_en   timestamptz not null default now()
);
create index factura_eventos_factura on factura_eventos(factura_id, creado_en desc);
create index factura_eventos_tipo on factura_eventos(tipo, creado_en desc);

create or replace function atlas_solo_insercion() returns trigger
language plpgsql as $$
begin
  raise exception 'factura_eventos es solo de insercion';
end $$;
create trigger factura_eventos_inmutables
  before update or delete on factura_eventos
  for each row execute function atlas_solo_insercion();

-- ---------- la punta de la cadena ----------
-- Una fila. Leerla y adelantarla solo pasa dentro de `atlas_emitir_factura`,
-- bajo bloqueo: por eso dos emisiones a la vez no pueden bifurcar (§7.2).
create table cadena_facturas (
  id          smallint primary key check (id = 1),
  punta       text,                                   -- null = cadena vacía
  factura_id  uuid references facturas(id) on delete restrict,
  sellada_en  timestamptz
);
insert into cadena_facturas (id) values (1);

-- ---------- inmutabilidad (§7.1) ----------
-- Una factura emitida por Atlas no cambia. Lo único que puede moverse es el
-- cobro (una fecha, no un dato fiscal) y el paso a 'anulada'. Todo lo demás,
-- desde Studio, desde un script o desde la propia aplicación, se estrella aquí.
-- El número de un borrador solo lo pone `atlas_emitir_factura`, que lo marca
-- con `set_config('atlas.emitiendo', 'si', true)` dentro de su transacción.
create or replace function atlas_factura_inmutable() returns trigger
language plpgsql as $$
begin
  if old.origen <> 'atlas' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'DELETE' then
    if old.estado <> 'borrador' then
      raise exception 'factura emitida: no se borra (serie %, numero %)', old.serie, old.numero;
    end if;
    return old;
  end if;
  if old.estado = 'borrador' then
    if new.numero is distinct from old.numero
       and current_setting('atlas.emitiendo', true) is distinct from 'si' then
      raise exception 'el numero lo asigna atlas_emitir_factura';
    end if;
    return new;
  end if;
  -- Emitida o anulada: solo cobrada_en, y emitida → anulada.
  if new.serie <> old.serie or new.numero <> old.numero or new.cliente_id <> old.cliente_id
     or new.fecha_emision <> old.fecha_emision or new.base <> old.base
     or new.iva_tipo <> old.iva_tipo or new.iva_cuota <> old.iva_cuota
     or new.total <> old.total or new.huella is distinct from old.huella
     or new.huella_anterior is distinct from old.huella_anterior
     or new.firma is distinct from old.firma or new.huella_gen_en is distinct from old.huella_gen_en
     or new.tipo_factura <> old.tipo_factura or new.rectifica_a is distinct from old.rectifica_a
     or new.origen <> old.origen
     or (new.estado <> old.estado and not (old.estado = 'emitida' and new.estado = 'anulada')) then
    raise exception 'factura emitida: inmutable (serie %, numero %)', old.serie, old.numero;
  end if;
  return new;
end $$;
create trigger facturas_inmutables
  before update or delete on facturas
  for each row execute function atlas_factura_inmutable();

-- Las líneas de una emitida tampoco cambian.
create or replace function atlas_lineas_inmutables() returns trigger
language plpgsql as $$
declare f record;
begin
  select origen, estado, serie, numero into f from facturas
   where id = coalesce(new.factura_id, old.factura_id);
  if f.origen = 'atlas' and f.estado <> 'borrador' then
    raise exception 'lineas de factura emitida: inmutables (serie %, numero %)', f.serie, f.numero;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
create trigger factura_lineas_inmutables
  before insert or update or delete on factura_lineas
  for each row execute function atlas_lineas_inmutables();

-- ---------- lo que la aplicación necesita saber antes de calcular ----------
-- Sin bloqueo: es una lectura. Si cambia entre esta llamada y el sellado, la
-- RPC de abajo lo dirá y la aplicación recalculará.
create or replace function atlas_siguiente_emision(p_serie text)
returns table (numero int, punta text)
language sql stable security definer set search_path = public as $$
  select coalesce((select max(f.numero) from facturas f
                    where f.serie = p_serie and f.origen = 'atlas' and f.estado <> 'borrador'), 0) + 1,
         (select c.punta from cadena_facturas c where c.id = 1)
  where atlas_es_propietario();
$$;
revoke all on function atlas_siguiente_emision(text) from public;
revoke all on function atlas_siguiente_emision(text) from anon;
grant execute on function atlas_siguiente_emision(text) to authenticated;

-- ---------- sellar bajo bloqueo (§7.2) ----------
-- La aplicación trae número, huella anterior, huella y firma YA calculados
-- para ese número y esa punta. Aquí, con el bloqueo cogido, se comprueba que
-- siguen siendo el siguiente número y la punta actual; si no, se devuelve
-- «reintenta» con los reales y no se escribe nada. Si sí, se escribe todo de
-- una vez y se adelanta la punta. La base no calcula ningún hash: verifica
-- que lo calculado encaja con el estado que ella conoce.
create or replace function atlas_emitir_factura(
  p_factura uuid, p_numero int, p_huella_anterior text,
  p_huella text, p_firma text, p_gen_en timestamptz
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  f record; sig int; punta_actual text;
begin
  if not atlas_es_propietario() then
    return jsonb_build_object('ok', false, 'error', 'Solo el propietario emite facturas.');
  end if;
  perform pg_advisory_xact_lock(hashtext('atlas_emision'));

  select * into f from facturas where id = p_factura for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'La factura no existe.'); end if;
  if f.origen <> 'atlas' or f.estado <> 'borrador' then
    return jsonb_build_object('ok', false, 'error', 'Solo se emite un borrador de Atlas.');
  end if;
  if not exists (select 1 from factura_lineas where factura_id = p_factura) then
    return jsonb_build_object('ok', false, 'error', 'Una factura necesita al menos una linea.');
  end if;
  if p_huella !~ '^[0-9A-F]{64}$' then
    return jsonb_build_object('ok', false, 'error', 'La huella no tiene la forma esperada.');
  end if;

  select numero, punta into sig, punta_actual from atlas_siguiente_emision(f.serie);
  if sig is distinct from p_numero or punta_actual is distinct from p_huella_anterior then
    return jsonb_build_object('ok', false, 'reintentar', true,
                              'numero', sig, 'punta', punta_actual);
  end if;

  perform set_config('atlas.emitiendo', 'si', true);
  update facturas
     set numero = p_numero, huella_anterior = p_huella_anterior, huella = p_huella,
         firma = p_firma, huella_gen_en = p_gen_en, estado = 'emitida'
   where id = p_factura;
  update cadena_facturas set punta = p_huella, factura_id = p_factura, sellada_en = p_gen_en where id = 1;
  insert into factura_eventos (factura_id, tipo, detalle, usuario_id)
  values (p_factura, 'emision',
          jsonb_build_object('serie', f.serie, 'numero', p_numero, 'huella', p_huella),
          auth.uid());
  return jsonb_build_object('ok', true, 'numero', p_numero);
end $$;
revoke all on function atlas_emitir_factura(uuid,int,text,text,text,timestamptz) from public;
revoke all on function atlas_emitir_factura(uuid,int,text,text,text,timestamptz) from anon;
grant execute on function atlas_emitir_factura(uuid,int,text,text,text,timestamptz) to authenticated;

-- ---------- anular ----------
create or replace function atlas_anular_factura(p_factura uuid, p_motivo text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare f record;
begin
  if not atlas_es_propietario() then
    return jsonb_build_object('ok', false, 'error', 'Solo el propietario anula facturas.');
  end if;
  select * into f from facturas where id = p_factura for update;
  if not found or f.origen <> 'atlas' then
    return jsonb_build_object('ok', false, 'error', 'Solo se anula una factura emitida por Atlas.');
  end if;
  if f.estado <> 'emitida' then
    return jsonb_build_object('ok', false, 'error', 'Solo se anula una factura emitida.');
  end if;
  update facturas set estado = 'anulada' where id = p_factura;
  insert into factura_eventos (factura_id, tipo, detalle, usuario_id)
  values (p_factura, 'anulacion', jsonb_build_object('motivo', coalesce(p_motivo, '')), auth.uid());
  return jsonb_build_object('ok', true);
end $$;
revoke all on function atlas_anular_factura(uuid,text) from public;
revoke all on function atlas_anular_factura(uuid,text) from anon;
grant execute on function atlas_anular_factura(uuid,text) to authenticated;

-- ---------- permisos ----------
grant select, insert on factura_eventos to authenticated;
grant select on cadena_facturas to authenticated;
grant all privileges on factura_eventos, cadena_facturas to service_role;
alter table factura_eventos enable row level security;
alter table cadena_facturas enable row level security;
create policy factura_eventos_propietario on factura_eventos for all to authenticated
  using (atlas_es_propietario()) with check (atlas_es_propietario());
create policy cadena_propietario on cadena_facturas for select to authenticated
  using (atlas_es_propietario());

-- El aviso de cadena rota viaja por el canal de siempre.
alter table notificaciones drop constraint notificaciones_tipo_check;
alter table notificaciones add constraint notificaciones_tipo_check
  check (tipo in ('incidencia','cobro','fichaje','cadena'));
