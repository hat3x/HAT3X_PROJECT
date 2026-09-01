## Task 1: Migración orders + order_items + pos_sales.order_id

**Files:**
- Create: `…/supabase/migrations/20260810100000_restauracion_orders.sql`
- Test: `…/src/tests/unit/restauracion-orders-sql.test.ts`
- Modify: `…/src/types/database.ts`

**Interfaces:**
- Consumes: `app.set_updated_at()`, `app.user_salon_ids()`, `public.salons(id)`, `public.pos_sessions(id, salon_id)`, `public.products(id, salon_id)`, `public.stations(id, salon_id)`, `public.pos_sales(id, salon_id)` (tiene `pos_sales_id_salon_key unique (id, salon_id)`).
- Produces: enums `public.order_status` (`abierta|cobrada|cerrada|anulada`), `public.order_item_status` (`pendiente|enviado|preparando|listo|entregado|anulado`); tablas `public.orders`, `public.order_items`; columna `public.pos_sales.order_id`. Alias TS `Order`, `OrderItem`, `OrderStatus`, `OrderItemStatus`.

- [ ] **Step 1: Write the failing sql-coherence test**

Create `…/src/tests/unit/restauracion-orders-sql.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

const SQL = readFileSync(
  join(process.cwd(), "supabase", "migrations", "20260810100000_restauracion_orders.sql"),
  "utf8",
).toLowerCase();

describe("migración orders", () => {
  it("crea los enums de estado de pedido e ítem", () => {
    expect(SQL).toContain("create type public.order_status as enum");
    expect(SQL).toContain("'abierta'");
    expect(SQL).toContain("create type public.order_item_status as enum");
    expect(SQL).toContain("'enviado'");
    expect(SQL).toContain("'anulado'");
  });

  it("orders con id de cliente, idempotency_key único por salón y clave compuesta", () => {
    expect(SQL).toContain("create table if not exists public.orders");
    expect(SQL).toContain("idempotency_key");
    expect(SQL).toContain("unique (salon_id, idempotency_key)");
    expect(SQL).toContain("orders_id_salon_key unique (id, salon_id)");
  });

  it("order_items append-only: void_of_item_id, unit_price_cents>=0, FKs compuestas", () => {
    expect(SQL).toContain("create table if not exists public.order_items");
    expect(SQL).toContain("void_of_item_id");
    expect(SQL).toContain("check (unit_price_cents >= 0)");
    expect(SQL).toContain("foreign key (order_id, salon_id)");
    expect(SQL).toContain("foreign key (product_id, salon_id)");
    expect(SQL).toContain("foreign key (station_id, salon_id)");
    expect(SQL).toContain("modifiers_snapshot jsonb");
  });

  it("añade pos_sales.order_id con FK compuesta a orders", () => {
    expect(SQL).toContain("alter table public.pos_sales");
    expect(SQL).toContain("add column if not exists order_id uuid");
    expect(SQL).toContain("references public.orders (id, salon_id)");
  });

  it("RLS: miembros crean/leen (operativa) y guardián", () => {
    expect(SQL).toContain("salon_id in (select app.user_salon_ids())");
    expect(SQL).toContain("members_insert_orders");
    expect(SQL).toContain("do $guard$");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd clients/projects/salon-os && npm test -- restauracion-orders-sql`
Expected: FAIL (ENOENT).

- [ ] **Step 3: Write the migration**

Create `…/supabase/migrations/20260810100000_restauracion_orders.sql`:

```sql
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
do $$
declare t text;
begin
  foreach t in array array['orders','order_items'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format($p$create policy "members_select_%1$s" on public.%1$I
      for select to authenticated using (salon_id in (select app.user_salon_ids()))$p$, t);
    execute format($p$create policy "members_insert_%1$s" on public.%1$I
      for insert to authenticated with check (salon_id in (select app.user_salon_ids()))$p$, t);
    execute format($p$create policy "members_update_%1$s" on public.%1$I
      for update to authenticated
      using (salon_id in (select app.user_salon_ids()))
      with check (salon_id in (select app.user_salon_ids()))$p$, t);
  end loop;
end $$;

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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd clients/projects/salon-os && npm test -- restauracion-orders-sql`
Expected: PASS (5 tests).

- [ ] **Step 5: Add types + apply + typecheck**

En `…/src/types/database.ts`: enums union `OrderStatus`/`OrderItemStatus` (+ en `public.Enums`); tablas `orders`/`order_items` (Row/Insert/Update/Relationships — `orders.id` sin default en Insert = requerido; `order_items.id` requerido); amplía `pos_sales.Row/Insert/Update` con `order_id: string | null`; alias `Order`, `OrderItem`. Aplica la migración por Management API (`(201, [])`).
Run: `cd clients/projects/salon-os && npm run typecheck` → exit 0.

- [ ] **Step 6: Commit**

```bash
git add clients/projects/salon-os/supabase/migrations/20260810100000_restauracion_orders.sql \
        clients/projects/salon-os/src/tests/unit/restauracion-orders-sql.test.ts \
        clients/projects/salon-os/src/types/database.ts
git commit -m "feat(restauracion): pedidos de mostrador (orders/order_items, append-only)"
```

---

