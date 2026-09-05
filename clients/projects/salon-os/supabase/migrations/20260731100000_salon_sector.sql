-- Multi-sector: cada tenant tiene un sector fijo (peluqueria por defecto = back-compat).
begin;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'salon_sector') then
    create type public.salon_sector as enum ('peluqueria', 'odontologia', 'restauracion');
  end if;
end $$;

alter table public.salons
  add column if not exists sector public.salon_sector not null default 'peluqueria';

comment on column public.salons.sector is
  'Sector del tenant (peluqueria|odontologia|restauracion). Lo fija HAT3X al alta; determina nav/terminologia/modulos.';

commit;
