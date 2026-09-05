-- =============================================================================
-- salon-os — Migración: histórico de facturación (public.billing_history)
--
-- Facturas históricas importadas del software dental de origen (tabla facturas).
-- NO reemplaza a pos_invoices (VeriFactu, emisión desde Kairos): esta tabla es
-- solo un registro histórico de solo-lectura de la facturación previa a Kairos,
-- para consultarla en el expediente del paciente.
--
-- customer_id NULLABLE: algunas facturas antiguas no resuelven a un paciente
-- concreto (sin NIF ni nombre único). Se conservan con customer_id = NULL como
-- registro de la clínica. La FK compuesta (customer_id, salon_id) → customers
-- usa MATCH SIMPLE (por defecto): si customer_id es NULL la FK no se comprueba,
-- permitiendo la fila; si no es NULL, garantiza el mismo tenant.
--
-- IDEMPOTENCIA: (salon_id, source_ref) UNIQUE (source_ref = facturas.id).
--
-- RLS: lectura para miembros del salón; escritura owner/manager. Guardián de
-- aislamiento verifica el invariante al aplicar.
-- =============================================================================

begin;

create table public.billing_history (
  id              uuid         not null default gen_random_uuid(),
  salon_id        uuid         not null,
  -- Paciente titular de la factura. NULLABLE (ver cabecera).
  customer_id     uuid,

  issued_on       date         not null,          -- fecha de la factura
  series          text,                            -- serie de facturación
  number          integer,                         -- número de factura
  full_number     text,                            -- serie + número (para mostrar)

  total_cents     integer      not null default 0, -- importe total (céntimos)
  tax_cents       integer,                          -- IVA (céntimos)

  paid            boolean      not null default false,
  paid_on         date,
  payment_method  text,
  status          text,                             -- estado de la factura en origen
  concept         text,                             -- concepto / notas de la factura

  source_ref      text,                             -- facturas.id (idempotencia)
  created_at      timestamptz  not null default now(),

  primary key (id),

  constraint billing_history_customer_salon_fkey
    foreign key (customer_id, salon_id)
    references public.customers (id, salon_id)
    on delete set null
);

create unique index billing_history_source_uniq
  on public.billing_history (salon_id, source_ref)
  where source_ref is not null;

create index idx_billing_history_customer
  on public.billing_history (salon_id, customer_id, issued_on desc);

comment on table public.billing_history is
  'Histórico de facturación importado del software dental de origen (tabla facturas). '
  'Solo lectura; no sustituye a pos_invoices (VeriFactu). customer_id nullable para '
  'facturas antiguas sin paciente resoluble. Aplicada en 20260806130000_billing_history.sql.';

alter table public.billing_history enable row level security;

create policy "members_select_billing_history"
  on public.billing_history for select to authenticated
  using (salon_id in (select app.user_salon_ids()));

create policy "managers_insert_billing_history"
  on public.billing_history for insert to authenticated
  with check (app.has_salon_role(salon_id, array['owner','manager']::public.member_role[]));

create policy "managers_update_billing_history"
  on public.billing_history for update to authenticated
  using  (app.has_salon_role(salon_id, array['owner','manager']::public.member_role[]))
  with check (app.has_salon_role(salon_id, array['owner','manager']::public.member_role[]));

create policy "managers_delete_billing_history"
  on public.billing_history for delete to authenticated
  using (app.has_salon_role(salon_id, array['owner','manager']::public.member_role[]));

-- ------------------------------------------------------------------------------
-- Guardián de aislamiento
-- ------------------------------------------------------------------------------
do $guard$
declare
  _t   constant text := 'billing_history';
  _cnt integer;
  _pol record;
begin
  select count(*) into _cnt from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = _t and c.relrowsecurity;
  if _cnt = 0 then raise exception 'GUARDIÁN RLS: public.% sin RLS', _t using errcode = 'raise_exception'; end if;

  select count(*) into _cnt from pg_policies
  where schemaname = 'public' and tablename = _t and cmd in ('SELECT','ALL')
    and qual is not null and qual like '%user_salon_ids%';
  if _cnt = 0 then raise exception 'GUARDIÁN RLS: public.% sin SELECT acotado', _t using errcode = 'raise_exception'; end if;

  select count(*) into _cnt from pg_policies
  where schemaname = 'public' and tablename = _t and (roles && array['anon','public']::name[]);
  if _cnt > 0 then raise exception 'GUARDIÁN RLS: public.% expuesta a anon/public', _t using errcode = 'raise_exception'; end if;

  for _pol in
    select policyname, cmd, qual, with_check from pg_policies
    where schemaname = 'public' and tablename = _t and cmd in ('INSERT','UPDATE','DELETE')
  loop
    if coalesce(_pol.qual,'') || coalesce(_pol.with_check,'') not like '%has_salon_role%' then
      raise exception 'GUARDIÁN RLS: escritura %.% (%) sin has_salon_role', _t, _pol.policyname, _pol.cmd using errcode = 'raise_exception';
    end if;
  end loop;

  raise notice 'GUARDIÁN: RLS y políticas verificadas en public.%.', _t;
end;
$guard$;

commit;
