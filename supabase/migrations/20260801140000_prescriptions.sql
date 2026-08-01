-- =============================================================================
-- salon-os — Migración: recetas / prescripciones (odontología)
-- public.prescription (cabecera) + public.prescription_item (medicamentos).
--
-- Una receta se crea en borrador, se EMITE (firma) y a partir de ahí es INMUTABLE
-- (revocar = nuevo estado, nunca editar). Mismo patrón que consents. Multi-tenant + RLS.
-- =============================================================================

begin;

create type public.prescription_status as enum ('draft','issued','revoked');

create table public.prescription (
  id             uuid primary key default gen_random_uuid(),
  salon_id       uuid not null references public.salons(id) on delete cascade,
  customer_id    uuid not null,
  prescriber_id  uuid,          -- profesional/usuario que prescribe
  prescriber_name text,         -- foto del nombre del prescriptor
  diagnosis      text,
  notes          text,
  status         public.prescription_status not null default 'draft',
  issued_at      timestamptz,
  signed_by      uuid,
  revoked_at     timestamptz,
  created_by     uuid,
  created_at     timestamptz not null default now(),
  constraint prescription_customer_fk
    foreign key (customer_id, salon_id)
    references public.clinical_records (customer_id, salon_id) on delete cascade,
  unique (id, salon_id)
);
create index prescription_customer_idx on public.prescription (salon_id, customer_id, created_at desc);

create table public.prescription_item (
  id              uuid primary key default gen_random_uuid(),
  salon_id        uuid not null references public.salons(id) on delete cascade,
  prescription_id uuid not null,
  position        int not null default 0,
  medication      text not null,   -- p.ej. "Amoxicilina 500 mg"
  dose            text,            -- "1 comprimido"
  frequency       text,            -- "cada 8 h"
  duration        text,            -- "7 días"
  quantity        text,            -- "1 caja de 24"
  instructions    text,
  constraint prescription_item_fk
    foreign key (prescription_id, salon_id)
    references public.prescription (id, salon_id) on delete cascade
);
create index prescription_item_idx on public.prescription_item (salon_id, prescription_id, position);

-- Inmutabilidad de la cabecera tras emitir (solo se puede revocar).
create or replace function public.prescription_guard_issued()
returns trigger language plpgsql as $$
begin
  if (tg_op = 'DELETE') then
    if old.status <> 'draft' then raise exception 'una receta emitida o revocada no se puede borrar'; end if;
    return old;
  end if;
  if old.status = 'revoked' then raise exception 'una receta revocada es inmutable'; end if;
  if old.status = 'issued' then
    if new.status not in ('issued','revoked') then raise exception 'una receta emitida solo puede pasar a revocada'; end if;
    if new.diagnosis is distinct from old.diagnosis
       or new.notes is distinct from old.notes
       or new.prescriber_name is distinct from old.prescriber_name
       or new.customer_id is distinct from old.customer_id
       or new.issued_at is distinct from old.issued_at then
      raise exception 'una receta emitida es inmutable (solo se puede revocar)';
    end if;
  end if;
  return new;
end $$;
create trigger prescription_guard before update or delete on public.prescription
  for each row execute function public.prescription_guard_issued();

-- Inmutabilidad transitiva de los renglones cuando la receta ya no es borrador.
create or replace function public.prescription_item_guard()
returns trigger language plpgsql as $$
declare _st public.prescription_status;
begin
  select status into _st from public.prescription
   where id = coalesce(old.prescription_id, new.prescription_id);
  if _st is not null and _st <> 'draft' then
    raise exception 'los renglones de una receta emitida son inmutables';
  end if;
  return coalesce(new, old);
end $$;
create trigger prescription_item_guard before insert or update or delete on public.prescription_item
  for each row execute function public.prescription_item_guard();

alter table public.prescription enable row level security;
alter table public.prescription_item enable row level security;
create policy prescription_rw on public.prescription
  for all using (salon_id in (select app.user_salon_ids()))
  with check (salon_id in (select app.user_salon_ids()));
create policy prescription_item_rw on public.prescription_item
  for all using (salon_id in (select app.user_salon_ids()))
  with check (salon_id in (select app.user_salon_ids()));

commit;
