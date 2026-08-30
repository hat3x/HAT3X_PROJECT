-- apps/atlas/supabase/migrations/20260901101000_emision_cierres.sql
--
-- Ronda de arreglo 1 sobre la emisión (20260901100000_emision.sql). La revisión
-- encontró agujeros que en una cadena fiscal no se pueden dejar: un borrador
-- que se «emite» sin pasar por la RPC, una serie compartida entre externas y
-- Atlas que rompe el correlativo, una línea que se muda de una emitida a un
-- borrador, y un colaborador que se hace propietario. La migración anterior no
-- se toca: aquí se reemplazan las funciones y se añade lo que falta.

-- ---------- I1 + M1: el disparador de facturas, cerrado ----------
-- En un borrador de Atlas, TODO lo que forma parte del sello (estado, número,
-- huellas, firma, instante de generación) lo pone `atlas_emitir_factura` y
-- nadie más: sin `atlas.emitiendo = 'si'` en la transacción, se rechaza.
-- En una emitida o anulada, además de lo de antes, `fecha_vencimiento` es
-- inmutable (viaja en el PDF), y `cobrada_en` solo se mueve en una emitida:
-- una anulada no se cobra. `notas` sigue siendo editable en cualquier estado:
-- es un apunte interno, no un dato fiscal, y no entra en la huella.
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
    if (new.numero is distinct from old.numero
        or new.estado is distinct from old.estado
        or new.huella is distinct from old.huella
        or new.huella_anterior is distinct from old.huella_anterior
        or new.firma is distinct from old.firma
        or new.huella_gen_en is distinct from old.huella_gen_en)
       and current_setting('atlas.emitiendo', true) is distinct from 'si' then
      raise exception 'el numero, el estado y el sello los asigna atlas_emitir_factura';
    end if;
    return new;
  end if;
  -- Emitida o anulada: solo cobrada_en (y solo en emitida), notas, y emitida → anulada.
  if new.serie <> old.serie or new.numero <> old.numero or new.cliente_id <> old.cliente_id
     or new.fecha_emision <> old.fecha_emision
     or new.fecha_vencimiento is distinct from old.fecha_vencimiento
     or new.base <> old.base
     or new.iva_tipo <> old.iva_tipo or new.iva_cuota <> old.iva_cuota
     or new.total <> old.total or new.huella is distinct from old.huella
     or new.huella_anterior is distinct from old.huella_anterior
     or new.firma is distinct from old.firma or new.huella_gen_en is distinct from old.huella_gen_en
     or new.tipo_factura <> old.tipo_factura or new.rectifica_a is distinct from old.rectifica_a
     or new.origen <> old.origen
     or (new.estado <> old.estado and not (old.estado = 'emitida' and new.estado = 'anulada'))
     or (old.estado = 'anulada' and new.cobrada_en is distinct from old.cobrada_en) then
    raise exception 'factura emitida: inmutable (serie %, numero %)', old.serie, old.numero;
  end if;
  return new;
end $$;

-- ---------- I3: las líneas no se mudan ----------
-- Antes solo se miraba la factura de destino: una línea de una emitida podía
-- pasar a un borrador con un `update … set factura_id`. Ahora se miran las dos
-- puntas, y cambiar `factura_id` se prohíbe siempre: una línea nace y muere en
-- su factura, sea del origen que sea.
create or replace function atlas_lineas_inmutables() returns trigger
language plpgsql as $$
declare f record;
begin
  if tg_op = 'UPDATE' and new.factura_id is distinct from old.factura_id then
    raise exception 'una linea no cambia de factura';
  end if;
  select origen, estado, serie, numero into f from facturas
   where id = coalesce(new.factura_id, old.factura_id);
  if f.origen = 'atlas' and f.estado <> 'borrador' then
    raise exception 'lineas de factura emitida: inmutables (serie %, numero %)', f.serie, f.numero;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

-- ---------- I2: cada serie tiene un origen ----------
-- `atlas_siguiente_emision` calcula el correlativo con las facturas de Atlas de
-- la serie. Si en esa serie conviven externas con número puesto a mano, el
-- correlativo choca con `unique (serie, numero)` y la emisión se bloquea. Así
-- que una serie es de externas o de Atlas, y lo decide la primera factura.
create table series_facturas (
  serie      text primary key,
  origen     text not null check (origen in ('externa','atlas')),
  creado_en  timestamptz not null default now()
);

-- Siembra con lo que ya hay. Si una serie ya mezcla orígenes, mejor parar aquí
-- con un mensaje claro que sembrar mal: eso lo arregla una persona, no un script.
do $$
declare mezcladas text;
begin
  select string_agg(serie, ', ' order by serie) into mezcladas
    from (select serie from facturas group by serie having count(distinct origen) > 1) s;
  if mezcladas is not null then
    raise exception 'series con facturas externas y de Atlas a la vez: %. Separa las series antes de migrar.', mezcladas;
  end if;
end $$;
insert into series_facturas (serie, origen)
select serie, min(origen) from facturas group by serie;

-- Corre con los permisos de quien inserta la factura (el propietario, por RLS
-- de `facturas`): no hace falta definer. `on conflict do nothing` + lectura
-- resuelve la carrera de dos primeras facturas a la vez con orígenes distintos:
-- la segunda espera a la primera y lee lo que ganó.
create or replace function atlas_serie_origen() returns trigger
language plpgsql as $$
declare o text;
begin
  insert into series_facturas (serie, origen) values (new.serie, new.origen)
  on conflict (serie) do nothing;
  select origen into o from series_facturas where serie = new.serie;
  if o <> new.origen then
    raise exception 'la serie % es de facturas %; usa otra serie', new.serie,
      case o when 'externa' then 'externas' else 'de Atlas' end;
  end if;
  return new;
end $$;
-- También al cambiar serie u origen de un borrador: la regla es de la fila, no
-- solo del alta.
create trigger facturas_serie_origen
  before insert or update of serie, origen on facturas
  for each row execute function atlas_serie_origen();

grant select, insert on series_facturas to authenticated;
grant all privileges on series_facturas to service_role;
alter table series_facturas enable row level security;
create policy series_ver on series_facturas for select to authenticated using (true);
create policy series_alta on series_facturas for insert to authenticated
  with check (atlas_es_propietario());

-- ---------- M4: sellar exige firma e instante ----------
-- Mismos parámetros y mismo JSON que antes; solo se añade que `p_firma` y
-- `p_gen_en` no pueden venir vacíos: un registro sin firma o sin instante no
-- es un registro de alta.
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
  if p_firma is null or p_firma = '' or p_gen_en is null then
    return jsonb_build_object('ok', false, 'error', 'La emision necesita firma e instante de generacion.');
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

-- ---------- M5: qué eventos escribe la aplicación ----------
-- `emision`, `anulacion`, `rectificacion`, `anomalia` y `verificacion` los
-- escriben las RPC (definer: no pasan por esta política). Desde PostgREST el
-- propietario solo apunta exportaciones y cambios de configuración fiscal.
drop policy factura_eventos_propietario on factura_eventos;
create policy factura_eventos_ver on factura_eventos for select to authenticated
  using (atlas_es_propietario());
create policy factura_eventos_apuntar on factura_eventos for insert to authenticated
  with check (atlas_es_propietario() and tipo in ('exportacion','config_fiscal'));

-- ---------- M7: nadie se hace propietario solo ----------
-- `perfiles_propio` deja a cada uno editar su fila (nombre, tema, paleta): con
-- eso un colaborador podía ponerse `es_propietario = true` por PostgREST.
-- Cambiar esa columna exige ser ya propietario. Sin sesión (psql, scripts con
-- service_role) `auth.uid()` es null: ese es el camino de administración y se
-- deja pasar, porque es el único por el que se da de alta al primer propietario.
create or replace function atlas_propietario_protegido() returns trigger
language plpgsql as $$
begin
  if new.es_propietario is distinct from old.es_propietario
     and auth.uid() is not null and not atlas_es_propietario() then
    raise exception 'solo el propietario cambia es_propietario';
  end if;
  return new;
end $$;
create trigger perfiles_propietario_protegido
  before update on perfiles
  for each row execute function atlas_propietario_protegido();
