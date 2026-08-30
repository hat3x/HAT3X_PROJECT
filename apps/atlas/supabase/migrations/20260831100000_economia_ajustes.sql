-- apps/atlas/supabase/migrations/20260831100000_economia_ajustes.sql
--
-- Dos valores que el bloque necesita y hoy no existen (§4.8): los datos
-- fiscales del emisor y el coste de la hora. Van en una tabla de UNA fila y no
-- en variables de entorno: son datos del negocio, se editan desde la interfaz,
-- y duplicarlos en el entorno crearía una segunda verdad.
create table ajustes_economia (
  -- El `check (id = 1)` es lo que hace que solo pueda haber una fila.
  id            smallint primary key check (id = 1),
  razon_social  text,
  cif           text,
  direccion     text,
  -- Decisión 8: un número que fija el propietario, no un derivado. Cero hasta
  -- que lo ponga: la rentabilidad con coste cero es solo ingresos menos
  -- gastos, y la pantalla avisa de que falta.
  coste_hora    numeric(8,2) not null default 0 check (coste_hora >= 0),
  actualizado_en timestamptz not null default now()
);
insert into ajustes_economia (id) values (1);

-- El cierre de un mes congela el coste de la hora con el que se calculó. Si no,
-- cambiarlo mañana reescribiría la rentabilidad de todos los meses pasados, y
-- un histórico que se mueve solo no sirve para comparar nada.
create table cierres_mes (
  mes         date primary key check (extract(day from mes) = 1),
  coste_hora  numeric(8,2) not null check (coste_hora >= 0),
  cerrado_en  timestamptz not null default now(),
  cerrado_por uuid references perfiles(id) on delete set null
);

grant select, insert, update, delete on ajustes_economia, cierres_mes to authenticated;
grant all privileges on ajustes_economia, cierres_mes to service_role;

alter table ajustes_economia enable row level security;
alter table cierres_mes      enable row level security;

-- Solo el propietario. Un colaborador no ve el coste de la hora ni los cierres:
-- son la mitad del margen, y el margen es del propietario (§5).
create policy ajustes_economia_propietario on ajustes_economia for all to authenticated
  using (atlas_es_propietario()) with check (atlas_es_propietario());
create policy cierres_propietario on cierres_mes for all to authenticated
  using (atlas_es_propietario()) with check (atlas_es_propietario());
