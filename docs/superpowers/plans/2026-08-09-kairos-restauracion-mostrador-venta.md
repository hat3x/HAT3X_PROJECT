# Kairos · Restauración — Plan B: Venta de mostrador (pedidos + cobro + comanda) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar al sector `restauracion` una **venta de mostrador**: pedidos append-only (`orders`/`order_items`) que se enrutan a estaciones y se materializan en un `pos_sale` al cobrar, con **dos flujos** (pagar-primero y cuenta abierta), rejilla táctil `/mostrador`, y comanda impresa por estación.

**Architecture:** Se separa el modelo OPERATIVO (`orders`/`order_items`, nuevo, append-only, IDs de cliente) del FISCAL (`pos_*`, existente, intacto). El cobro se materializa con la server action `settleOrder`, que **replica el patrón de `createSale`** (`src/app/(dashboard)/tpv/actions.ts`): inserts secuenciales con el cliente Supabase del usuario (RLS) + rollback manual + totales server-side con `computeSaleTotals` + `awardVisit` best-effort. La UI reusa el catálogo de Plan A (`use-menu`) y el diálogo de pago del TPV.

**Tech Stack:** Next.js 14 App Router, TypeScript strict, Supabase (Postgres + RLS), React Query v5, shadcn/ui, Vitest + Testing Library, Zod.

## Decisión de diseño (desviación consciente del spec)

El spec (`2026-08-09-kairos-restauracion-mostrador-kds-design.md`) proponía RPCs `SECURITY DEFINER` (`create_order`/`settle_order`). **Este plan usa server actions** (patrón `createSale`) en su lugar, porque TODO el cobro del repo funciona así (inserts con cliente de usuario + RLS + rollback manual), no con RPCs. Mismo comportamiento, mismo modelo de datos, consistencia con el código. El offline-ready se conserva vía **IDs generados en cliente + `idempotency_key`** (comprobación select-antes-de-insert en la action). La atomicidad de `settleOrder` usa la misma compensación manual que `createSale` (borrar la venta en cascada si un paso falla).

## Global Constraints

- **Dinero en céntimos**; PVP = bruto, IVA incluido. Totales SIEMPRE recalculados en servidor con `computeSaleTotals`/`computeLineTotals` de `@/lib/payments` (nunca fiarse del cliente).
- **FKs de dominio COMPUESTAS** `(fk_id, salon_id) → tabla(id, salon_id)`; cada tabla nueva `constraint <t>_id_salon_key unique (id, salon_id)`.
- **RLS por salón**: SELECT miembros `salon_id in (select app.user_salon_ids())`. Crear pedidos / mover estados / anular ítems: **cualquier miembro** (`staff` incluido) — es operativa. Guardián `do $guard$` por migración.
- **Append-only**: `order_items` nunca cambia `qty`; anular = insertar fila con `void_of_item_id` + `void_reason`. La ÚNICA mutación permitida de una fila es su `status` (transición de estado).
- **IDs de cliente**: `orders.id` y `order_items.id` los genera el CLIENTE (uuid), no la BD, y se pasan a las actions. `idempotency_key` único por salón evita duplicar en reintentos.
- Trigger `updated_at`: reusar `app.set_updated_at()`.
- **Migraciones por Management API** (no CLI): `POST https://api.supabase.com/v1/projects/jztoyekixcziaicrnlce/database/query`, `Authorization: Bearer $SUPABASE_API_TOKEN` (de `clients/projects/denueveanueve/.env`), **User-Agent de navegador**. DDL correcto → `(201, [])`.
- **Testing sin Postgres** (jsdom): lógica pura → `src/tests/unit/`; server actions → doble `makeSupabaseMock` (`@/tests/helpers/supabase-mock`) en `src/tests/integration/`; migraciones → "sql-coherence" (leer el `.sql` con `readFileSync` y afirmar invariantes); componentes → mock de hooks `use-*` con `vi.hoisted`. `npm test` (=`vitest run`) y `npm run typecheck` verdes.
- **Repo anidado**: `clients/projects/salon-os` tiene su propio `.git` (rama `hat3x/HAT3X-038`, sin remoto). Commit SOLO los ficheros de cada tarea por **pathspec** (`git add <paths> && git commit`); **NUNCA `git add -A`**; dejar `.claude/` untracked intacto.
- `noUncheckedIndexedAccess: true`: usar `!`/guardas donde el compilador lo exija.
- TDD estricto, commits frecuentes. Identificadores en inglés, copy en español.

---

## File Structure

**Migraciones (crear):**
- `.../supabase/migrations/20260810100000_restauracion_orders.sql` — enums `order_status`/`order_item_status`, tablas `orders`/`order_items`, `pos_sales.order_id` (ALTER + FK compuesta), RLS, guardián.

**Tipos (modificar):** `.../src/types/database.ts` — `orders`/`order_items` (Row/Insert/Update/Relationships), enums `OrderStatus`/`OrderItemStatus`, alias `Order`/`OrderItem`; ampliar `pos_sales` con `order_id`.

**Lógica pura (crear):**
- `.../src/lib/restauracion/order.ts` — `buildOrderItemDrafts`, `buildSettleLines`, tipos.

**Datos/servidor (crear):**
- `.../src/lib/queries/orders.ts` — `orderKeys` + fetchers (open orders, order+items).
- `.../src/hooks/use-orders.ts` — hooks React Query (lectura + mutación).
- `.../src/lib/validations/order.ts` — esquemas Zod.
- `.../src/app/(dashboard)/mostrador/actions.ts` — server actions (`createOrder`, `addOrderItems`, `voidOrderItem`, `sendOrderToStations`, `setOrderItemStatus`, `settleOrder`).

**Impresión (crear):** `.../src/lib/restauracion/kitchen-comanda.ts` — `buildKitchenComandaHtml` (puro) + `printKitchenComanda`.

**UI (crear):** `.../src/app/(dashboard)/mostrador/{layout.tsx,page.tsx,mostrador-view.tsx,order-panel.tsx,product-grid.tsx,modifier-picker-dialog.tsx,open-orders-bar.tsx,payment-sheet.tsx}`.

**Activación (modificar):** `.../src/components/dashboard-nav-items.ts` — item `/mostrador` para restauración (visible a staff).

> Rutas abreviadas `…/` = `clients/projects/salon-os/`.

---

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

## Task 2: Lógica pura de pedido (drafts de ítems + líneas de cobro)

**Files:**
- Create: `…/src/lib/restauracion/order.ts`
- Test: `…/src/tests/unit/restauracion-order.test.ts`

**Interfaces:**
- Consumes: `effectiveUnitPriceCents`, `expandCombo`, `type ComboPiece` de `@/lib/restauracion/menu`; `computeSaleTotals`, `type SaleTotals` de `@/lib/payments`.
- Produces:
  - `interface MenuSelection { productId; name; basePriceCents; vatRate; stationId: string|null; isCombo: boolean; qty: number; modifiers: Array<{ name: string; priceDeltaCents: number }>; comboPieces: ComboPiece[]; }`
  - `interface OrderItemDraft { id: string; productId: string; qty: number; unitPriceCents: number; vatRate: number; stationId: string|null; comboGroup: string|null; modifiersSnapshot: Array<{ name: string; priceDeltaCents: number }>; }`
  - `buildOrderItemDrafts(sel: MenuSelection, newId: () => string): OrderItemDraft[]` — producto normal → 1 draft con `unitPriceCents = effectiveUnitPriceCents(base, modifiers)`; combo → draft "cabecera" con el precio del combo + un draft por pieza (`unitPriceCents: 0`, `comboGroup` compartido, estación de la pieza vía `expandCombo`).
  - `interface SettleLineInput { description: string; qty: number; unitPriceCents: number; vatRate: number; }`
  - `buildSettleLines(items): SettleLineInput[]` — descripción = nombre + modificadores; una línea por ítem no anulado.
  - `settleTotals(lines: SettleLineInput[]): SaleTotals` — envuelve `computeSaleTotals`.

- [ ] **Step 1: Write the failing test**

Create `…/src/tests/unit/restauracion-order.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildOrderItemDrafts, buildSettleLines, settleTotals } from "@/lib/restauracion/order";

let n = 0;
const newId = () => `id-${++n}`;

describe("buildOrderItemDrafts", () => {
  it("producto simple con modificadores → 1 draft con precio efectivo", () => {
    n = 0;
    const drafts = buildOrderItemDrafts({
      productId: "p1", name: "Hamburguesa", basePriceCents: 800, vatRate: 10,
      stationId: "cocina", isCombo: false, qty: 2,
      modifiers: [{ name: "Extra bacon", priceDeltaCents: 80 }], comboPieces: [],
    }, newId);
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({ productId: "p1", qty: 2, unitPriceCents: 880, stationId: "cocina", comboGroup: null });
  });

  it("combo → cabecera con precio + piezas a 0 con su estación y comboGroup común", () => {
    n = 0;
    const drafts = buildOrderItemDrafts({
      productId: "combo1", name: "Menú", basePriceCents: 1000, vatRate: 10,
      stationId: "cocina", isCombo: true, qty: 1, modifiers: [],
      comboPieces: [
        { componentProductId: "food", qty: 1, stationId: "cocina", stationOverrideId: null },
        { componentProductId: "drink", qty: 1, stationId: "cocina", stationOverrideId: "barra" },
      ],
    }, newId);
    expect(drafts).toHaveLength(3);
    expect(drafts[0].unitPriceCents).toBe(1000);
    const group = drafts[0].comboGroup;
    expect(group).not.toBeNull();
    expect(drafts.every((d) => d.comboGroup === group)).toBe(true);
    expect(drafts[1].unitPriceCents).toBe(0);
    expect(drafts[2].stationId).toBe("barra");
  });
});

describe("buildSettleLines + settleTotals", () => {
  it("una línea por ítem con nombre+modificadores; base+IVA==bruto", () => {
    const lines = buildSettleLines([
      { productName: "Hamburguesa", qty: 2, unitPriceCents: 880, vatRate: 10,
        modifiersSnapshot: [{ name: "Extra bacon" }] },
    ]);
    expect(lines[0].description).toContain("Hamburguesa");
    expect(lines[0].description).toContain("Extra bacon");
    const totals = settleTotals(lines);
    expect(totals.subtotalCents + totals.taxCents).toBe(totals.totalCents);
    expect(totals.totalCents).toBe(1760);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd clients/projects/salon-os && npm test -- restauracion-order`
Expected: FAIL (módulo no encontrado).

- [ ] **Step 3: Write the implementation**

Create `…/src/lib/restauracion/order.ts`:

```ts
import { computeSaleTotals, type SaleTotals } from "@/lib/payments";
import { effectiveUnitPriceCents, expandCombo, type ComboPiece } from "@/lib/restauracion/menu";

export interface MenuSelection {
  productId: string;
  name: string;
  basePriceCents: number;
  vatRate: number;
  stationId: string | null;
  isCombo: boolean;
  qty: number;
  modifiers: Array<{ name: string; priceDeltaCents: number }>;
  comboPieces: ComboPiece[];
}

export interface OrderItemDraft {
  id: string;
  productId: string;
  qty: number;
  unitPriceCents: number;
  vatRate: number;
  stationId: string | null;
  comboGroup: string | null;
  modifiersSnapshot: Array<{ name: string; priceDeltaCents: number }>;
}

export function buildOrderItemDrafts(sel: MenuSelection, newId: () => string): OrderItemDraft[] {
  const headPrice = effectiveUnitPriceCents(sel.basePriceCents, sel.modifiers);
  if (!sel.isCombo || sel.comboPieces.length === 0) {
    return [{
      id: newId(), productId: sel.productId, qty: sel.qty, unitPriceCents: headPrice,
      vatRate: sel.vatRate, stationId: sel.stationId, comboGroup: null, modifiersSnapshot: sel.modifiers,
    }];
  }
  const comboGroup = newId();
  const head: OrderItemDraft = {
    id: newId(), productId: sel.productId, qty: sel.qty, unitPriceCents: headPrice,
    vatRate: sel.vatRate, stationId: sel.stationId, comboGroup, modifiersSnapshot: sel.modifiers,
  };
  const pieces = expandCombo(sel.qty, sel.comboPieces).map((line): OrderItemDraft => ({
    id: newId(), productId: line.productId, qty: line.qty, unitPriceCents: 0,
    vatRate: sel.vatRate, stationId: line.stationId, comboGroup, modifiersSnapshot: [],
  }));
  return [head, ...pieces];
}

export interface SettleLineInput {
  description: string;
  qty: number;
  unitPriceCents: number;
  vatRate: number;
}

export function buildSettleLines(
  items: Array<{ productName: string; qty: number; unitPriceCents: number; vatRate: number;
                 modifiersSnapshot: Array<{ name: string }> }>,
): SettleLineInput[] {
  return items.map((it) => {
    const mods = it.modifiersSnapshot.map((m) => m.name).join(", ");
    return {
      description: mods.length > 0 ? `${it.productName} (${mods})` : it.productName,
      qty: it.qty, unitPriceCents: it.unitPriceCents, vatRate: it.vatRate,
    };
  });
}

export function settleTotals(lines: SettleLineInput[]): SaleTotals {
  return computeSaleTotals(lines.map((l) => ({
    quantity: l.qty, unitPriceCents: l.unitPriceCents, vatRate: l.vatRate,
  })));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd clients/projects/salon-os && npm test -- restauracion-order`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add clients/projects/salon-os/src/lib/restauracion/order.ts \
        clients/projects/salon-os/src/tests/unit/restauracion-order.test.ts
git commit -m "feat(restauracion): lógica pura de pedido (drafts de ítems + líneas de cobro)"
```

---

## Task 3: Queries + hooks de pedidos

**Files:**
- Create: `…/src/lib/queries/orders.ts`, `…/src/hooks/use-orders.ts`
- Test: `…/src/tests/unit/order-keys.test.ts`

**Interfaces:**
- Consumes: `createClient` de `@/lib/supabase/client`; tipos `Order`, `OrderItem`.
- Produces: `orderKeys` (`all`/`open`/`detail`); `fetchOpenOrders(salonId)`; `fetchOrderItems(salonId, orderId)`; hooks `useOpenOrders(salonId)`, `useOrderItems(salonId, orderId)`.

- [ ] **Step 1: Write the failing test**

Create `…/src/tests/unit/order-keys.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { orderKeys } from "@/lib/queries/orders";

describe("orderKeys", () => {
  it("deriva sub-keys del salón", () => {
    expect(orderKeys.all("s1")).toEqual(["orders", "s1"]);
    expect(orderKeys.open("s1")).toEqual(["orders", "s1", "open"]);
    expect(orderKeys.detail("s1", "o1")).toEqual(["orders", "s1", "detail", "o1"]);
  });
});
```

- [ ] **Step 2: Run to verify it fails.** `npm test -- order-keys` → FAIL.

- [ ] **Step 3: Write queries** — Create `…/src/lib/queries/orders.ts`:

```ts
import { createClient } from "@/lib/supabase/client";
import type { Order, OrderItem } from "@/types/database";

export const orderKeys = {
  all: (salonId: string) => ["orders", salonId] as const,
  open: (salonId: string) => [...orderKeys.all(salonId), "open"] as const,
  detail: (salonId: string, orderId: string) => [...orderKeys.all(salonId), "detail", orderId] as const,
};

export async function fetchOpenOrders(salonId: string): Promise<Order[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("orders").select("*")
    .eq("salon_id", salonId).eq("status", "abierta")
    .order("created_at", { ascending: true });
  if (error !== null) throw new Error(error.message);
  return data;
}

export async function fetchOrderItems(salonId: string, orderId: string): Promise<OrderItem[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("order_items").select("*")
    .eq("salon_id", salonId).eq("order_id", orderId)
    .order("created_at", { ascending: true });
  if (error !== null) throw new Error(error.message);
  return data;
}
```

- [ ] **Step 4: Write hooks** — Create `…/src/hooks/use-orders.ts`:

```ts
"use client";
import { useQuery } from "@tanstack/react-query";
import { fetchOpenOrders, fetchOrderItems, orderKeys } from "@/lib/queries/orders";

export function useOpenOrders(salonId: string) {
  return useQuery({ queryKey: orderKeys.open(salonId), queryFn: () => fetchOpenOrders(salonId) });
}
export function useOrderItems(salonId: string, orderId: string | null) {
  return useQuery({
    queryKey: orderKeys.detail(salonId, orderId ?? "none"),
    queryFn: () => fetchOrderItems(salonId, orderId as string),
    enabled: orderId !== null,
  });
}
```

- [ ] **Step 5: Run + typecheck.** `npm test -- order-keys && npm run typecheck` → PASS + exit 0.

- [ ] **Step 6: Commit**

```bash
git add clients/projects/salon-os/src/lib/queries/orders.ts \
        clients/projects/salon-os/src/hooks/use-orders.ts \
        clients/projects/salon-os/src/tests/unit/order-keys.test.ts
git commit -m "feat(restauracion): queries y hooks de pedidos"
```

---

## Task 4: Server actions createOrder / addOrderItems / voidOrderItem

**Files:**
- Create: `…/src/lib/validations/order.ts`, `…/src/app/(dashboard)/mostrador/actions.ts`
- Modify: `…/src/hooks/use-orders.ts` (mutaciones)
- Test: `…/src/tests/integration/restauracion-order-actions.test.ts`

**Interfaces:**
- Consumes: `getActiveSalonId`, `createClient` de `@/lib/supabase/server`, `revalidatePath`, `makeSupabaseMock`.
- Produces (todas `ActionResult<T>`):
  - `createOrder(input: { id; label; idempotencyKey }): Promise<ActionResult<Order>>` — inserta con `id` de cliente; si `idempotencyKey` ya existe en el salón, devuelve el existente.
  - `addOrderItems(input: { orderId; items }): Promise<ActionResult<{ added: number }>>` — verifica que `orderId` pertenece al salón y está `abierta`; inserta `order_items` con ids de cliente acotados por salón.
  - `voidOrderItem(input: { orderId; itemId; reason }): Promise<ActionResult<OrderItem>>` — inserta fila de anulación (`void_of_item_id`, `status:"anulado"`, `void_reason`) copiando datos del ítem original; NO borra.
- Produces (hooks): `useCreateOrder`, `useAddOrderItems`, `useVoidOrderItem`.

- [ ] **Step 1: Write the failing integration test**

Create `…/src/tests/integration/restauracion-order-actions.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
const holder = vi.hoisted(() => ({ supabase: null as unknown }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: () => holder.supabase }));
vi.mock("@/lib/salon", () => ({ getActiveSalonId: () => Promise.resolve("SALON") }));
import { makeSupabaseMock } from "@/tests/helpers/supabase-mock";
import { createOrder, addOrderItems } from "@/app/(dashboard)/mostrador/actions";

beforeEach(() => { holder.supabase = null; });

describe("order actions", () => {
  it("createOrder inserta con id de cliente", async () => {
    holder.supabase = makeSupabaseMock({
      tables: { orders: { data: [] } },
      onWrite: (op: string, table: string) =>
        op === "insert" && table === "orders"
          ? { data: [{ id: "O1", salon_id: "SALON", status: "abierta" }] } : {},
    });
    const r = await createOrder({ id: "O1", label: null, idempotencyKey: "k1" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.id).toBe("O1");
  });

  it("createOrder es idempotente por idempotencyKey", async () => {
    holder.supabase = makeSupabaseMock({
      tables: { orders: { data: [{ id: "O1", salon_id: "SALON", idempotency_key: "k1", status: "abierta" }] } },
    });
    const r = await createOrder({ id: "O2", label: null, idempotencyKey: "k1" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.id).toBe("O1");
  });

  it("addOrderItems rechaza pedido de otro salón / inexistente", async () => {
    holder.supabase = makeSupabaseMock({ tables: { orders: { data: [] } } });
    const r = await addOrderItems({ orderId: "OX", items: [
      { id: "i1", productId: "p1", qty: 1, unitPriceCents: 500, vatRate: 10, stationId: null, comboGroup: null, modifiersSnapshot: [] },
    ]});
    expect(r.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails.** `npm test -- restauracion-order-actions` → FAIL.

- [ ] **Step 3: Write validations** — Create `…/src/lib/validations/order.ts`:

```ts
import { z } from "zod";

export const orderItemDraftSchema = z.object({
  id: z.string().uuid(),
  productId: z.string().uuid(),
  qty: z.number().int().positive(),
  unitPriceCents: z.number().int().min(0),
  vatRate: z.number().min(0).max(100).default(10),
  stationId: z.string().uuid().nullable(),
  comboGroup: z.string().nullable(),
  modifiersSnapshot: z.array(z.object({ name: z.string(), priceDeltaCents: z.number().int() })).default([]),
});
export type OrderItemDraftInput = z.infer<typeof orderItemDraftSchema>;

export const createOrderSchema = z.object({
  id: z.string().uuid(),
  label: z.string().trim().max(120).nullable(),
  idempotencyKey: z.string().max(200).nullable(),
});
export const addOrderItemsSchema = z.object({
  orderId: z.string().uuid(),
  items: z.array(orderItemDraftSchema).min(1),
});
export const voidOrderItemSchema = z.object({
  orderId: z.string().uuid(),
  itemId: z.string().uuid(),
  reason: z.string().trim().min(1).max(200),
});
```

- [ ] **Step 4: Write the actions** — Create `…/src/app/(dashboard)/mostrador/actions.ts` (cabecera `"use server"`). `createOrder`:

```ts
"use server";
import { revalidatePath } from "next/cache";
import { getActiveSalonId } from "@/lib/salon";
import { createClient } from "@/lib/supabase/server";
import { addOrderItemsSchema, createOrderSchema, voidOrderItemSchema } from "@/lib/validations/order";
import type { Order, OrderItem } from "@/types/database";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

export async function createOrder(input: unknown): Promise<ActionResult<Order>> {
  const parsed = createOrderSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  const salonId = await getActiveSalonId();
  if (salonId === null) return { ok: false, error: "No tienes un salón asignado" };
  const supabase = createClient();

  if (parsed.data.idempotencyKey !== null) {
    const { data: existing } = await supabase.from("orders").select("*")
      .eq("salon_id", salonId).eq("idempotency_key", parsed.data.idempotencyKey).maybeSingle();
    if (existing) return { ok: true, data: existing };
  }
  const { data, error } = await supabase.from("orders").insert({
    id: parsed.data.id, salon_id: salonId, label: parsed.data.label,
    idempotency_key: parsed.data.idempotencyKey, channel: "mostrador", status: "abierta",
  }).select("*").single();
  if (error !== null) return { ok: false, error: error.message };
  revalidatePath("/mostrador");
  return { ok: true, data };
}
```

`addOrderItems`: `safeParse` → `getActiveSalonId` → verifica `orderId` en el salón y `status='abierta'` (`.from("orders").select("id,status").eq("id").eq("salon_id").maybeSingle()`; si no existe o no abierta → error) → inserta `items` mapeados a `TablesInsert<"order_items">[]` (con `salon_id`, `order_id`, ids de cliente, `modifiers_snapshot`) → `revalidatePath`. `voidOrderItem`: lee el ítem original (acotado por salón), inserta fila de anulación (`void_of_item_id: itemId`, `status:"anulado"`, `void_reason`, copiando `product_id/qty/station_id/order_id/salon_id`); nunca DELETE.

- [ ] **Step 5: Add mutation hooks** en `…/src/hooks/use-orders.ts`: `useCreateOrder`/`useAddOrderItems`/`useVoidOrderItem` (desempaqueta `ActionResult` + `invalidateQueries(orderKeys.all(salonId))`).

- [ ] **Step 6: Run + typecheck.** `npm test -- restauracion-order-actions && npm run typecheck` → PASS + exit 0.

- [ ] **Step 7: Commit**

```bash
git add clients/projects/salon-os/src/lib/validations/order.ts \
        "clients/projects/salon-os/src/app/(dashboard)/mostrador/actions.ts" \
        clients/projects/salon-os/src/hooks/use-orders.ts \
        clients/projects/salon-os/src/tests/integration/restauracion-order-actions.test.ts
git commit -m "feat(restauracion): actions de pedido (crear/añadir/anular, append-only + idempotencia)"
```

---

## Task 5: Server actions sendOrderToStations / setOrderItemStatus

**Files:**
- Modify: `…/src/app/(dashboard)/mostrador/actions.ts`, `…/src/lib/validations/order.ts`, `…/src/hooks/use-orders.ts`
- Test: `…/src/tests/integration/restauracion-order-status.test.ts`

**Interfaces:**
- Produces:
  - `sendOrderToStations(input: { orderId }): Promise<ActionResult<{ sent: number }>>` — UPDATE ítems `pendiente`→`enviado` acotado por `salon_id`+`order_id`+`status='pendiente'`. El pedido sigue `abierta`.
  - `setOrderItemStatus(input: { itemId; from; to }): Promise<ActionResult<OrderItem>>` — transición segura: UPDATE `.eq("id").eq("salon_id").eq("status", from)`; si no afecta filas → error `CONFLICTO`.
- Produces (hooks): `useSendOrderToStations`, `useSetOrderItemStatus`.

- [ ] **Step 1: Write the failing test**

Create `…/src/tests/integration/restauracion-order-status.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
const holder = vi.hoisted(() => ({ supabase: null as unknown }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: () => holder.supabase }));
vi.mock("@/lib/salon", () => ({ getActiveSalonId: () => Promise.resolve("SALON") }));
import { makeSupabaseMock } from "@/tests/helpers/supabase-mock";
import { setOrderItemStatus } from "@/app/(dashboard)/mostrador/actions";
beforeEach(() => { holder.supabase = null; });

it("setOrderItemStatus da CONFLICTO si el estado esperado ya cambió", async () => {
  holder.supabase = makeSupabaseMock({ onWrite: (op: string) => op === "update" ? { data: [] } : {} });
  const r = await setOrderItemStatus({ itemId: "i1", from: "enviado", to: "listo" });
  expect(r.ok).toBe(false);
  if (!r.ok) expect(r.error.toLowerCase()).toContain("conflicto");
});
```

- [ ] **Step 2: Run to verify it fails.** `npm test -- restauracion-order-status` → FAIL.

- [ ] **Step 3: Implement** las 2 actions en `mostrador/actions.ts` (+ esquemas `sendOrderToStationsSchema`/`setOrderItemStatusSchema` en `validations/order.ts`). `setOrderItemStatus`: `.update({ status: to }).eq("id", itemId).eq("salon_id", salonId).eq("status", from).select("*")`; si `data.length === 0` → `{ ok:false, error:"CONFLICTO: el estado ya cambió" }`. `sendOrderToStations`: `.update({ status:"enviado" }).eq("salon_id", salonId).eq("order_id", orderId).eq("status","pendiente").select("id")` → cuenta.

- [ ] **Step 4: Add hooks + run + typecheck.** `npm test -- restauracion-order-status && npm run typecheck` → PASS + exit 0.

- [ ] **Step 5: Commit**

```bash
git add "clients/projects/salon-os/src/app/(dashboard)/mostrador/actions.ts" \
        clients/projects/salon-os/src/lib/validations/order.ts \
        clients/projects/salon-os/src/hooks/use-orders.ts \
        clients/projects/salon-os/src/tests/integration/restauracion-order-status.test.ts
git commit -m "feat(restauracion): mandar a estaciones + transición de estado segura"
```

---

## Task 6: Server action settleOrder (materializa pos_sale)

**Files:**
- Modify: `…/src/app/(dashboard)/mostrador/actions.ts`, `…/src/lib/validations/order.ts`, `…/src/hooks/use-orders.ts`
- Test: `…/src/tests/integration/restauracion-settle.test.ts`

**Interfaces:**
- Consumes: `computeSaleTotals`/`computeLineTotals` de `@/lib/payments`; `buildSettleLines`/`settleTotals` de `@/lib/restauracion/order`; patrón de `createSale` (`src/app/(dashboard)/tpv/actions.ts`) para insertar `pos_sales`/`pos_sale_lines`/`pos_payments` + `session_id` + rollback.
- Produces: `settleOrder(input: { orderId; tenders: Array<{ method; amountCents; paymentMethodId; reference? }>; sendPending: boolean }): Promise<ActionResult<{ saleId: string; totalCents: number }>>`.
  - **Idempotencia**: si el pedido ya está `cobrada` o ya existe `pos_sales` con `order_id = orderId`, devuelve ese sale sin cobrar de nuevo.
  - Carga `order_items` no anulados (`.eq("order_id").is("void_of_item_id", null).neq("status","anulado")`, join `products(name)`); `buildSettleLines` + `settleTotals`.
  - Si `sendPending`, transiciona `pendiente`→`enviado` (pagar-primero).
  - Inserta `pos_sales` (`status:"completed"`, `order_id`, `session_id` de la caja abierta, totales) → `pos_sale_lines` → `pos_payments` (patrón `createSale`, rollback manual) → `orders.status='cobrada'`.

- [ ] **Step 1: Write the failing integration test**

Create `…/src/tests/integration/restauracion-settle.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
const holder = vi.hoisted(() => ({ supabase: null as unknown }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: () => holder.supabase }));
vi.mock("@/lib/salon", () => ({ getActiveSalonId: () => Promise.resolve("SALON") }));
import { makeSupabaseMock } from "@/tests/helpers/supabase-mock";
import { settleOrder } from "@/app/(dashboard)/mostrador/actions";
beforeEach(() => { holder.supabase = null; });

it("settleOrder materializa un pos_sale desde el pedido", async () => {
  holder.supabase = makeSupabaseMock({
    tables: {
      orders: { data: [{ id: "O1", salon_id: "SALON", status: "abierta" }] },
      order_items: { data: [
        { id:"i1", salon_id:"SALON", order_id:"O1", product_id:"p1", qty:2, unit_price_cents:880, vat_rate:10, status:"enviado", void_of_item_id:null, modifiers_snapshot:[], products:{ name:"Hamburguesa" } },
      ] },
      pos_sessions: { data: [{ id: "SESS1" }] },
      pos_sales: { data: [] },
    },
    onWrite: (op: string, table: string) => op==="insert" && table==="pos_sales" ? { data:[{ id:"S1" }] } : {},
  });
  const r = await settleOrder({ orderId:"O1", tenders:[{ method:"efectivo", amountCents:1760, paymentMethodId:null }], sendPending:true });
  expect(r.ok).toBe(true);
  if (r.ok) { expect(r.data.saleId).toBe("S1"); expect(r.data.totalCents).toBe(1760); }
});
```

- [ ] **Step 2: Run to verify it fails.** `npm test -- restauracion-settle` → FAIL.

- [ ] **Step 3: Implement `settleOrder`** en `mostrador/actions.ts`, replicando la estructura de `createSale` (léela: `src/app/(dashboard)/tpv/actions.ts`). Pasos: cargar pedido (guard salón + estado); si idempotente, retornar el sale existente; cargar ítems no anulados (join `products(name)`); `buildSettleLines`+`settleTotals`; buscar `pos_session` abierta (patrón `createSale`); insertar `pos_sales` (con `order_id`, `session_id`, totales, `status:"completed"`, `sold_by:user.id`); insertar `pos_sale_lines` (rollback: borrar la venta si falla); insertar `pos_payments` (rollback); `update orders set status='cobrada'`; si `sendPending` mandar pendientes; `revalidatePath("/mostrador")`; devolver `{ saleId, totalCents }`.

- [ ] **Step 4: Add hook + run + full suite + typecheck.** `useSettleOrder`. `npm test -- restauracion-settle && npm test && npm run typecheck` → verde + exit 0.

- [ ] **Step 5: Commit**

```bash
git add "clients/projects/salon-os/src/app/(dashboard)/mostrador/actions.ts" \
        clients/projects/salon-os/src/lib/validations/order.ts \
        clients/projects/salon-os/src/hooks/use-orders.ts \
        clients/projects/salon-os/src/tests/integration/restauracion-settle.test.ts
git commit -m "feat(restauracion): settleOrder — materializa pos_sale desde el pedido (patrón createSale)"
```

---

## Task 7: Comanda de cocina (builder puro + impresión)

**Files:**
- Create: `…/src/lib/restauracion/kitchen-comanda.ts`
- Test: `…/src/tests/unit/kitchen-comanda.test.ts`

**Interfaces:**
- Produces:
  - `interface KitchenComandaData { orderNumber: number; stationName: string; label: string | null; issuedAt: Date; lines: Array<{ qty: number; name: string; modifiers: string[] }>; }`
  - `buildKitchenComandaHtml(data, options?: { rollWidthMm?: 58|80; timezone?: string }): string` — HTML térmico autónomo, SIN precios: número de pedido grande, estación, etiqueta, líneas `qty × nombre` con modificadores debajo. Puro (fecha entra como `Date`).
  - `printKitchenComanda(data, options?): void` — iframe oculto + `window.print()` (patrón `printTicketDocument`); no-op en servidor.

- [ ] **Step 1: Write the failing test** — Create `…/src/tests/unit/kitchen-comanda.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildKitchenComandaHtml } from "@/lib/restauracion/kitchen-comanda";

it("incluye número de pedido, estación, líneas y modificadores; SIN precios", () => {
  const html = buildKitchenComandaHtml({
    orderNumber: 42, stationName: "Cocina", label: "Barra 3",
    issuedAt: new Date("2026-08-10T12:00:00Z"),
    lines: [{ qty: 2, name: "Hamburguesa", modifiers: ["Extra bacon", "Sin cebolla"] }],
  });
  expect(html).toContain("42");
  expect(html).toContain("Cocina");
  expect(html).toContain("Hamburguesa");
  expect(html).toContain("Extra bacon");
  expect(html).not.toMatch(/€|\d+,\d{2}/);
});
```

- [ ] **Step 2: Run to verify it fails.** `npm test -- kitchen-comanda` → FAIL.

- [ ] **Step 3: Implement** `…/src/lib/restauracion/kitchen-comanda.ts` — función pura que genera el HTML (mira `src/lib/tpv/ticket-document.ts` para el patrón de documento térmico autónomo con estilos inline y `@media print`), y `printKitchenComanda` copiando la estructura de iframe de `src/app/(dashboard)/tpv/print-ticket.ts`. Sin importes en el HTML.

- [ ] **Step 4: Run + typecheck.** `npm test -- kitchen-comanda && npm run typecheck` → PASS + exit 0.

- [ ] **Step 5: Commit**

```bash
git add clients/projects/salon-os/src/lib/restauracion/kitchen-comanda.ts \
        clients/projects/salon-os/src/tests/unit/kitchen-comanda.test.ts
git commit -m "feat(restauracion): comanda de cocina (builder térmico sin precios + impresión)"
```

---

## Task 8: UI de mostrador (`/mostrador`)

**Files:**
- Create: `…/src/app/(dashboard)/mostrador/{layout.tsx,page.tsx,mostrador-view.tsx,product-grid.tsx,order-panel.tsx,modifier-picker-dialog.tsx,open-orders-bar.tsx,payment-sheet.tsx}`
- Test: `…/src/tests/unit/order-panel.test.tsx`

**Interfaces:**
- Consumes: `useMenuCategories`/`useMenuProducts`/`useStations` (`@/hooks/use-menu`), `useOpenOrders`/`useCreateOrder`/`useAddOrderItems`/`useSendOrderToStations`/`useSettleOrder` (`@/hooks/use-orders`), `buildOrderItemDrafts`/`settleTotals` (`@/lib/restauracion/order`), `printKitchenComanda` + `printTicketDocument`.
- Produces: ruta `/mostrador` (sector restauración; visible a **staff**). Flujo: `product-grid` (categoría→producto→`modifier-picker-dialog`→`buildOrderItemDrafts`→estado local), `order-panel` (líneas + total con `settleTotals` + **Mandar**/**Cobrar**), `payment-sheet` (tenders + cambio, patrón `tpv/payment-dialog.tsx`), `open-orders-bar` (reabrir cuentas).

- [ ] **Step 1: Write the failing component test** — Create `…/src/tests/unit/order-panel.test.tsx`. Mockea `@/hooks/use-orders` con `vi.hoisted`. Contrato mínimo de `OrderPanel`: dadas unas líneas, renderiza cada línea + el total (`settleTotals`) + botones `getByRole("button", {name:/mandar/i})` y `getByRole("button", {name:/cobrar/i})`; al pulsar Cobrar dispara el flujo de pago (mock).

- [ ] **Step 2: Run to verify it fails.** `npm test -- order-panel` → FAIL.

- [ ] **Step 3: Implement.** `layout.tsx` = `SectorGate required="restauracion"` (SIN gate de rol — staff vende). `page.tsx` resuelve `salonId`. `mostrador-view.tsx` (`"use client"`): estado local del pedido (drafts con `crypto.randomUUID()`), `product-grid` (categorías `Tabs`/botones grandes + productos; producto con grupos de modificadores → `modifier-picker-dialog` respetando min/max → `buildOrderItemDrafts`), `order-panel` (líneas + `settleTotals` + **Mandar** [crea pedido si no existe con uuid cliente + `addOrderItems` + `sendOrderToStations` + `printKitchenComanda` por estación] y **Cobrar** [`payment-sheet` → `settleOrder` → `printTicketDocument` + comanda si pagar-primero]), `open-orders-bar` (`useOpenOrders` → reabrir). Reusa `formatMoney`; sigue el patrón de estado de `tpv-view.tsx`.

- [ ] **Step 4: Run test + full suite + typecheck.** `npm test -- order-panel && npm test && npm run typecheck` → verde + exit 0.

- [ ] **Step 5: Commit**

```bash
git add "clients/projects/salon-os/src/app/(dashboard)/mostrador/" \
        clients/projects/salon-os/src/tests/unit/order-panel.test.tsx
git commit -m "feat(restauracion): rejilla de mostrador (/mostrador) con dos flujos y comanda"
```

---

## Task 9: Nav item /mostrador (visible a staff)

**Files:**
- Modify: `…/src/components/dashboard-nav-items.ts`
- Test: `…/src/tests/unit/dashboard-nav-items.test.ts`

**Interfaces:**
- Produces: en la rama `sector === "restauracion"` de `buildDashboardNavItems`, `MOSTRADOR_ITEM = { href: "/mostrador", label: "Mostrador", icon: <lucide, p.ej. ConciergeBell> }` para TODOS los miembros; `CARTA_ITEM` sigue solo con `showSettings`.

- [ ] **Step 1: Write the failing test** — añade a `…/src/tests/unit/dashboard-nav-items.test.ts`:

```ts
it("restauración: staff ve Mostrador pero NO Carta", () => {
  const items = buildDashboardNavItems({ showSettings: false, hasPos: true, sector: "restauracion" });
  const hrefs = items.map((i) => i.href);
  expect(hrefs).toContain("/mostrador");
  expect(hrefs).not.toContain("/carta");
});
it("restauración: owner ve Mostrador y Carta", () => {
  const items = buildDashboardNavItems({ showSettings: true, hasPos: true, sector: "restauracion" });
  const hrefs = items.map((i) => i.href);
  expect(hrefs).toContain("/mostrador");
  expect(hrefs).toContain("/carta");
});
```

- [ ] **Step 2: Run to verify it fails.** `npm test -- dashboard-nav-items` → FAIL.

- [ ] **Step 3: Implement.** Importa el icono, declara `MOSTRADOR_ITEM`, y en la rama de restauración:

```ts
if (sector === "restauracion") {
  const base = withSectorLabels.slice(0, 1);
  const rest = withSectorLabels.slice(1);
  const extras = showSettings ? [MOSTRADOR_ITEM, CARTA_ITEM] : [MOSTRADOR_ITEM];
  return [...base, ...extras, ...rest];
}
```

- [ ] **Step 4: Run full suite + typecheck.** `npm test && npm run typecheck` → verde + exit 0.

- [ ] **Step 5: Commit**

```bash
git add clients/projects/salon-os/src/components/dashboard-nav-items.ts \
        clients/projects/salon-os/src/tests/unit/dashboard-nav-items.test.ts
git commit -m "feat(restauracion): item de navegación Mostrador (visible a staff)"
```

---

## Criterios de aceptación (Puerta de control Plan B)

- [ ] `npm test` y `npm run typecheck` verdes.
- [ ] Migración `orders` aplicada en `jztoyekixcziaicrnlce` (`(201, [])`, guardián OK).
- [ ] **Pagar-primero**: en `/mostrador` se arma un pedido con un producto con modificadores y un combo, se pulsa Cobrar, se materializa un `pos_sale` que **cuadra en el arqueo**, y salen ticket + comanda(s) por estación (comida→cocina, bebida→barra).
- [ ] **Cuenta abierta**: se arma un pedido, se pulsa Mandar (comanda impresa, pedido sigue abierto y aparece en cuentas abiertas), se añaden más líneas en otra tanda, y se cobra al final; el `pos_sale` cuadra.
- [ ] Anular una línea deja rastro (fila de anulación con motivo), nunca la borra.
- [ ] Reintentar Cobrar el mismo pedido no crea un segundo `pos_sale` (idempotencia).
- [ ] Un `staff` puede vender en `/mostrador` (no requiere owner/manager).

## Planes siguientes

- **Plan C — KDS**: pantalla `/cocina` por estación en tiempo real (patrón `useDayPanelRealtime`) + `alter publication supabase_realtime add table public.order_items` + `setOrderItemStatus` desde la pantalla (Entregar/Entregado).

## Notas / riesgos

- `order_number` por trigger `max+1` por salón: race teórica en alta concurrencia; aceptable en mostrador. Si molesta, migrar a secuencia por salón.
- `settleOrder` no es transaccional (como `createSale`): rollback manual por compensación. Si en producción hay descuadre, candidato a RPC transaccional (junto al minor diferido de Plan A sobre las replace-all).
- Loyalty en `settleOrder`: v1 puede omitir `awardVisit` (mostrador sin escaneo); dejar el hueco documentado para cuando se conecte fidelización a restauración.
