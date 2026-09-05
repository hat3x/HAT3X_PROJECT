-- =============================================================================
-- Kairos — Restauración · Pedidos de mostrador (orders/order_items, append-only)
-- IDs generados en cliente. RLS operativa (cualquier miembro). Dinero en céntimos.
-- =============================================================================
begin;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'order_status') then
    create type public.order_status as enum ('abierta','cobrada','cerrada','anulada');
  end if;
  if not exists (select 1 from pg_type where typname = 'order_item_status') then
    create type public.order_item_status as enum
      ('pendiente','enviado','preparando','listo','entregado','anulado');
  end if;
end $$;

create table if not exists public.orders (
  id            uuid primary key,                    -- generado en cliente (offline-ready)
  salon_id      uuid not null references public.salons (id) on delete cascade,
  session_id    uuid,
  order_number  bigint,                              -- corto para cocina (trigger)
  channel       text not null default 'mostrador',
  status        public.order_status not null default 'abierta',
  label         text,                                -- etiqueta de cuenta abierta
  idempotency_key text,
  created_by    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint orders_session_id_fkey
    foreign key (session_id, salon_id)
    references public.pos_sessions (id, salon_id) on delete set null (session_id),
  constraint orders_idempotency_key unique (salon_id, idempotency_key),
  constraint orders_id_salon_key unique (id, salon_id)
);

create table if not exists public.order_items (
  id                 uuid primary key,               -- generado en cliente
  salon_id           uuid not null references public.salons (id) on delete cascade,
  order_id           uuid not null,
  product_id         uuid not null,
  qty                integer not null default 1 check (qty > 0),
  unit_price_cents   integer not null default 0 check (unit_price_cents >= 0),
  vat_rate           numeric(5,2) not null default 10.00 check (vat_rate >= 0 and vat_rate <= 100),
  station_id         uuid,
  status             public.order_item_status not null default 'pendiente',
  combo_group        text,                           -- agrupa piezas de un combo
  modifiers_snapshot jsonb not null default '[]'::jsonb,
  void_of_item_id    uuid,                           -- si !=null, es una anulación append-only
  void_reason        text,
  created_by         uuid references auth.users (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint order_items_order_id_fkey
    foreign key (order_id, salon_id)
    references public.orders (id, salon_id) on delete cascade,
  constraint order_items_product_id_fkey
    foreign key (product_id, salon_id)
    references public.products (id, salon_id) on delete restrict,
  constraint order_items_station_id_fkey
    foreign key (station_id, salon_id)
    references public.stations (id, salon_id) on delete set null (station_id),
  constraint order_items_id_salon_key unique (id, salon_id)
);

-- Enlace fiscal: la venta apunta al pedido que la originó.
alter table public.pos_sales
  add column if not exists order_id uuid;
alter table public.pos_sales
  add constraint pos_sales_order_id_fkey
    foreign key (order_id, salon_id)
    references public.orders (id, salon_id) on delete set null (order_id);

-- order_number correlativo por salón (trigger; concurrencia baja en mostrador).
create or replace function app.set_order_number()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.order_number is null then
    select coalesce(max(order_number), 0) + 1 into new.order_number
    from public.orders where salon_id = new.salon_id;
  end if;
  return new;
end;
$$;

create trigger trg_orders_set_number
  before insert on public.orders
  for each row execute function app.set_order_number();
create trigger trg_orders_updated_at
  before update on public.orders
  for each row execute function app.set_updated_at();
create trigger trg_order_items_updated_at
  before update on public.order_items
  for each row execute function app.set_updated_at();

create index if not exists idx_order_items_order_id on public.order_items (order_id);
create index if not exists idx_order_items_station_status on public.order_items (station_id, status);
create index if not exists idx_orders_salon_status on public.orders (salon_id, status);

-- RLS: operativa = cualquier miembro (SELECT/INSERT/UPDATE); sin DELETE (append-only).
alter table public.orders enable row level security;
create policy "members_select_orders" on public.orders
  for select to authenticated using (salon_id in (select app.user_salon_ids()));
create policy "members_insert_orders" on public.orders
  for insert to authenticated with check (salon_id in (select app.user_salon_ids()));
create policy "members_update_orders" on public.orders
  for update to authenticated
  using (salon_id in (select app.user_salon_ids()))
  with check (salon_id in (select app.user_salon_ids()));

alter table public.order_items enable row level security;
create policy "members_select_order_items" on public.order_items
  for select to authenticated using (salon_id in (select app.user_salon_ids()));
create policy "members_insert_order_items" on public.order_items
  for insert to authenticated with check (salon_id in (select app.user_salon_ids()));
create policy "members_update_order_items" on public.order_items
  for update to authenticated
  using (salon_id in (select app.user_salon_ids()))
  with check (salon_id in (select app.user_salon_ids()));

do $guard$
declare _cnt integer;
begin
  select count(*) into _cnt from pg_policies
    where schemaname = 'public' and tablename in ('orders','order_items');
  if _cnt < 6 then
    raise exception 'GUARDIÁN ORDERS: faltan políticas (encontradas %)', _cnt using errcode = 'raise_exception';
  end if;
  raise notice 'GUARDIÁN ORDERS: orders/order_items verificadas';
end;
$guard$;

commit;
