# Kairos · Restauración — Sala: Mesas + Plano Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar al sector `restauracion` un **servicio de sala**: un **plano de mesas arrastrable** por zonas con estados en tiempo real; abrir mesa → cuenta; **panel de mesa** (comanda + tiempo sentados + total + comensales) con Añadir/Pedir cuenta/Cobrar/Limpiar reusando pedido + KDS + `settleOrder`. Además, **coherencia de caja**: en restauración se vende en Mostrador/Sala, así que se retira "Caja" (`/tpv`, pantalla de vender) del menú; "Arqueo" (`/arqueo`, abrir/cerrar turno + Z) se mantiene.

**Architecture:** Reutiliza `orders`/`order_items` (Plan B), la rejilla de mostrador, el KDS (Plan C) y `settleOrder`. Añade `dining_zones`/`dining_tables` + `orders.dining_table_id`/`covers`. La UI sigue el patrón Kairos (`page.tsx` servidor → `*-view.tsx` cliente → hooks React Query + server actions). El plano se refresca por Realtime (patrón `useDayPanelRealtime`). Los cobros de sala caen en la `pos_session` abierta desde `/arqueo`, igual que los del mostrador.

**Tech Stack:** Next.js 14 App Router, TS strict, Supabase (Postgres + Realtime + RLS), React Query v5, shadcn/ui, Vitest + Testing Library, Zod.

## Global Constraints

- **FKs de dominio COMPUESTAS** `(fk_id, salon_id) → tabla(id, salon_id)`; cada tabla nueva `constraint <t>_id_salon_key unique (id, salon_id)`.
- **RLS por salón**: SELECT miembros `salon_id in (select app.user_salon_ids())`. **Gestión de layout** (crear/borrar zonas/mesas) = `owner`/`manager` (`app.has_salon_role(salon_id, array['owner','manager']::public.member_role[])`). **Operativa** (`dining_tables` UPDATE: cambiar estado) = cualquier miembro. Guardián `do $guard$` por migración.
- **Transiciones de estado seguras por concurrencia**: UPDATE condicionado `.eq("status", from)` (patrón `setOrderItemStatus`); 0 filas → `CONFLICTO`.
- **Dinero en céntimos**; totales server-side (reuso `settleTotals`/`settleOrder`).
- Trigger `updated_at`: reusar `app.set_updated_at()`.
- **Migraciones por Management API**: `POST https://api.supabase.com/v1/projects/jztoyekixcziaicrnlce/database/query`, `Authorization: Bearer $SUPABASE_API_TOKEN` (de `clients/projects/denueveanueve/.env`), **User-Agent de navegador**. DDL OK → `(201, [])`.
- **Testing sin Postgres** (jsdom): lógica pura → `src/tests/unit/`; server actions → `makeSupabaseMock` (`@/tests/helpers/supabase-mock`); migraciones → "sql-coherence"; componentes → mock de hooks con `vi.hoisted`. `npm test` y `npm run typecheck` verdes.
- **Repo anidado**: `clients/projects/salon-os` tiene su `.git` (rama `hat3x/HAT3X-038`). Commit SOLO por **pathspec**; **NUNCA `git add -A`**; dejar `.claude/` untracked.
- `noUncheckedIndexedAccess: true`: usar `!`/guardas donde el compilador lo exija.
- TDD estricto, commits frecuentes. Identificadores en inglés, copy en español.

---

## File Structure

- **Migraciones (crear):** `…/supabase/migrations/20260810130000_restauracion_sala.sql` (zonas/mesas + orders.dining_table_id/covers), `…/supabase/migrations/20260810140000_realtime_dining.sql` (publicación).
- **Tipos (modificar):** `…/src/types/database.ts` (dining_zones, dining_tables, enums TableShape/TableStatus, orders.dining_table_id/covers, alias).
- **Lógica pura (crear):** `…/src/lib/restauracion/tables.ts`.
- **Datos/servidor (crear):** `…/src/lib/queries/tables.ts`, `…/src/hooks/use-tables.ts`, `…/src/lib/validations/table.ts`, `…/src/app/(dashboard)/sala/actions.ts`.
- **UI (crear):** `…/src/app/(dashboard)/sala/{layout,page,sala-view,table-node,table-panel,floor-editor}.tsx`.
- **Activación (modificar):** `…/src/components/dashboard-nav-items.ts` (añadir Sala + retirar Caja en restauración).

> Rutas abreviadas `…/` = `clients/projects/salon-os/`.

---

## Task 1: Migración mesas + zonas + enlace con orders

**Files:**
- Create: `…/supabase/migrations/20260810130000_restauracion_sala.sql`
- Test: `…/src/tests/unit/restauracion-sala-sql.test.ts`
- Modify: `…/src/types/database.ts`

**Interfaces:**
- Consumes: `app.set_updated_at()`, `app.user_salon_ids()`, `app.has_salon_role(...)`, `public.salons(id)`, `public.orders(id, salon_id)` (tiene `orders_id_salon_key`).
- Produces: enums `public.table_shape` (`round|square`), `public.table_status` (`libre|ocupada|cuenta_pedida|por_limpiar`); tablas `public.dining_zones`, `public.dining_tables`; columnas `orders.dining_table_id`, `orders.covers`. Alias TS `DiningZone`, `DiningTable`, `TableShape`, `TableStatus`.

- [ ] **Step 1: Write the failing sql-coherence test**

Create `…/src/tests/unit/restauracion-sala-sql.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

const SQL = readFileSync(
  join(process.cwd(), "supabase", "migrations", "20260810130000_restauracion_sala.sql"),
  "utf8",
).toLowerCase();

describe("migración sala", () => {
  it("crea los enums de forma y estado de mesa", () => {
    expect(SQL).toContain("create type public.table_shape as enum");
    expect(SQL).toContain("create type public.table_status as enum");
    expect(SQL).toContain("'ocupada'");
    expect(SQL).toContain("'por_limpiar'");
  });
  it("crea dining_zones y dining_tables con clave compuesta", () => {
    expect(SQL).toContain("create table if not exists public.dining_zones");
    expect(SQL).toContain("create table if not exists public.dining_tables");
    expect(SQL).toContain("dining_zones_id_salon_key unique (id, salon_id)");
    expect(SQL).toContain("dining_tables_id_salon_key unique (id, salon_id)");
    expect(SQL).toContain("check (capacity_max >= capacity_min)");
    expect(SQL).toContain("foreign key (zone_id, salon_id)");
  });
  it("enlaza orders con la mesa (dining_table_id + covers)", () => {
    expect(SQL).toContain("add column if not exists dining_table_id uuid");
    expect(SQL).toContain("add column if not exists covers integer");
    expect(SQL).toContain("references public.dining_tables (id, salon_id)");
  });
  it("RLS: select miembros, gestion managers, update miembros en tables; guardián", () => {
    expect(SQL).toContain("salon_id in (select app.user_salon_ids())");
    expect(SQL).toContain("app.has_salon_role(salon_id, array['owner','manager']::public.member_role[])");
    expect(SQL).toContain("members_update_dining_tables");
    expect(SQL).toContain("do $guard$");
  });
});
```

- [ ] **Step 2: Run to verify it fails.** `cd clients/projects/salon-os && npm test -- restauracion-sala-sql` → FAIL (ENOENT).

- [ ] **Step 3: Write the migration**

Create `…/supabase/migrations/20260810130000_restauracion_sala.sql`:

```sql
-- =============================================================================
-- Kairos — Restauración · Sala (zonas + mesas + enlace con la cuenta)
-- =============================================================================
begin;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'table_shape') then
    create type public.table_shape as enum ('round','square');
  end if;
  if not exists (select 1 from pg_type where typname = 'table_status') then
    create type public.table_status as enum ('libre','ocupada','cuenta_pedida','por_limpiar');
  end if;
end $$;

create table if not exists public.dining_zones (
  id          uuid primary key default gen_random_uuid(),
  salon_id    uuid not null references public.salons (id) on delete cascade,
  name        varchar(120) not null,
  sort_order  integer not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (salon_id, name),
  constraint dining_zones_id_salon_key unique (id, salon_id)
);

create table if not exists public.dining_tables (
  id            uuid primary key default gen_random_uuid(),
  salon_id      uuid not null references public.salons (id) on delete cascade,
  zone_id       uuid not null,
  name          varchar(60) not null,
  capacity_min  integer not null default 1 check (capacity_min >= 1),
  capacity_max  integer not null default 4 check (capacity_max >= 1),
  pos_x         numeric not null default 50,
  pos_y         numeric not null default 50,
  shape         public.table_shape not null default 'square',
  status        public.table_status not null default 'libre',
  sort_order    integer not null default 0,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint dining_tables_capacity_order check (capacity_max >= capacity_min),
  constraint dining_tables_zone_fkey
    foreign key (zone_id, salon_id) references public.dining_zones (id, salon_id) on delete cascade,
  unique (salon_id, name),
  constraint dining_tables_id_salon_key unique (id, salon_id)
);

alter table public.orders
  add column if not exists dining_table_id uuid,
  add column if not exists covers integer;
alter table public.orders
  add constraint orders_dining_table_id_fkey
    foreign key (dining_table_id, salon_id)
    references public.dining_tables (id, salon_id) on delete set null (dining_table_id);

create trigger trg_dining_zones_updated_at
  before update on public.dining_zones for each row execute function app.set_updated_at();
create trigger trg_dining_tables_updated_at
  before update on public.dining_tables for each row execute function app.set_updated_at();

create index if not exists idx_dining_tables_zone on public.dining_tables (zone_id);
create index if not exists idx_orders_dining_table on public.orders (dining_table_id);

alter table public.dining_zones  enable row level security;
alter table public.dining_tables enable row level security;

-- zonas: lectura miembros, gestión owner/manager
create policy "members_select_dining_zones" on public.dining_zones
  for select to authenticated using (salon_id in (select app.user_salon_ids()));
create policy "managers_insert_dining_zones" on public.dining_zones
  for insert to authenticated
  with check (app.has_salon_role(salon_id, array['owner','manager']::public.member_role[]));
create policy "managers_update_dining_zones" on public.dining_zones
  for update to authenticated
  using (app.has_salon_role(salon_id, array['owner','manager']::public.member_role[]))
  with check (app.has_salon_role(salon_id, array['owner','manager']::public.member_role[]));
create policy "managers_delete_dining_zones" on public.dining_zones
  for delete to authenticated
  using (app.has_salon_role(salon_id, array['owner','manager']::public.member_role[]));

-- mesas: lectura + UPDATE miembros (cambiar estado); INSERT/DELETE owner/manager (crear/quitar mesas)
create policy "members_select_dining_tables" on public.dining_tables
  for select to authenticated using (salon_id in (select app.user_salon_ids()));
create policy "managers_insert_dining_tables" on public.dining_tables
  for insert to authenticated
  with check (app.has_salon_role(salon_id, array['owner','manager']::public.member_role[]));
create policy "members_update_dining_tables" on public.dining_tables
  for update to authenticated
  using (salon_id in (select app.user_salon_ids()))
  with check (salon_id in (select app.user_salon_ids()));
create policy "managers_delete_dining_tables" on public.dining_tables
  for delete to authenticated
  using (app.has_salon_role(salon_id, array['owner','manager']::public.member_role[]));

do $guard$
declare _cnt integer;
begin
  select count(*) into _cnt from pg_policies
    where schemaname = 'public' and tablename in ('dining_zones','dining_tables');
  if _cnt < 8 then
    raise exception 'GUARDIÁN SALA: faltan políticas (encontradas %)', _cnt using errcode = 'raise_exception';
  end if;
  raise notice 'GUARDIÁN SALA: dining_zones/dining_tables verificadas';
end;
$guard$;

commit;
```

- [ ] **Step 4: Run to verify it passes.** `npm test -- restauracion-sala-sql` → PASS.

- [ ] **Step 5: Add types + apply + typecheck.** En `…/src/types/database.ts`: enums `TableShape`/`TableStatus` (+ en `public.Enums`); tablas `dining_zones`/`dining_tables` (Row/Insert/Update/Relationships); amplía `orders.Row/Insert/Update` con `dining_table_id: string|null` y `covers: number|null`; alias `DiningZone`/`DiningTable`. Aplica por Management API (`(201, [])`). `npm run typecheck` → exit 0.

- [ ] **Step 6: Commit**

```bash
git add clients/projects/salon-os/supabase/migrations/20260810130000_restauracion_sala.sql \
        clients/projects/salon-os/src/tests/unit/restauracion-sala-sql.test.ts \
        clients/projects/salon-os/src/types/database.ts
git commit -m "feat(restauracion): sala — zonas, mesas y enlace de la cuenta con la mesa"
```

---

## Task 2: Migración Realtime (dining_tables + orders a la publicación)

**Files:**
- Create: `…/supabase/migrations/20260810140000_realtime_dining.sql`
- Test: `…/src/tests/unit/realtime-dining-sql.test.ts`

**Interfaces:** Consumes `public.dining_tables`, `public.orders`, publicación `supabase_realtime`. Produces ambas tablas emitiendo por Realtime (el plano se refresca solo). (`order_items` ya se añadió en Plan C.)

- [ ] **Step 1: Write the failing sql-coherence test**

Create `…/src/tests/unit/realtime-dining-sql.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

const SQL = readFileSync(
  join(process.cwd(), "supabase", "migrations", "20260810140000_realtime_dining.sql"),
  "utf8",
).toLowerCase();

describe("migración realtime sala", () => {
  it("añade dining_tables y orders a supabase_realtime, idempotente", () => {
    expect(SQL).toContain("alter publication supabase_realtime add table public.dining_tables");
    expect(SQL).toContain("alter publication supabase_realtime add table public.orders");
    expect(SQL).toContain("pg_publication_tables");
  });
});
```

- [ ] **Step 2: Run to verify it fails.** `npm test -- realtime-dining-sql` → FAIL.

- [ ] **Step 3: Write the migration**

Create `…/supabase/migrations/20260810140000_realtime_dining.sql`:

```sql
-- Kairos — Restauración · Realtime para el plano de sala (dining_tables + orders).
do $$
begin
  if not exists (select 1 from pg_publication_tables
      where pubname='supabase_realtime' and schemaname='public' and tablename='dining_tables') then
    alter publication supabase_realtime add table public.dining_tables;
  end if;
  if not exists (select 1 from pg_publication_tables
      where pubname='supabase_realtime' and schemaname='public' and tablename='orders') then
    alter publication supabase_realtime add table public.orders;
  end if;
end $$;
```

- [ ] **Step 4: Run to verify it passes.** `npm test -- realtime-dining-sql` → PASS.

- [ ] **Step 5: Apply.** Management API → `(201, [])`.

- [ ] **Step 6: Commit**

```bash
git add clients/projects/salon-os/supabase/migrations/20260810140000_realtime_dining.sql \
        clients/projects/salon-os/src/tests/unit/realtime-dining-sql.test.ts
git commit -m "feat(restauracion): dining_tables + orders en la publicación Realtime (plano)"
```

---

## Task 3: Lógica pura de sala (transiciones + validaciones)

**Files:**
- Create: `…/src/lib/restauracion/tables.ts`
- Test: `…/src/tests/unit/restauracion-tables.test.ts`

**Interfaces:**
- Produces:
  - `type TableStatusValue = "libre" | "ocupada" | "cuenta_pedida" | "por_limpiar"`
  - `canTransition(from: TableStatusValue, to: TableStatusValue): boolean` — válidas: `libre→ocupada`, `ocupada→cuenta_pedida`, `ocupada→por_limpiar`, `cuenta_pedida→por_limpiar`, `por_limpiar→libre`. Todo lo demás false.
  - `validCapacity(min: number, max: number): boolean` — `min >= 1 && max >= min`.
  - `clampPosition(v: number): number` — acota a `[0, 100]`.
  - `tableTone(status: TableStatusValue): "free" | "busy" | "bill" | "cleaning"` — mapa de color.

- [ ] **Step 1: Write the failing test**

Create `…/src/tests/unit/restauracion-tables.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { canTransition, clampPosition, tableTone, validCapacity } from "@/lib/restauracion/tables";

describe("canTransition", () => {
  it("acepta las transiciones válidas del ciclo de mesa", () => {
    expect(canTransition("libre", "ocupada")).toBe(true);
    expect(canTransition("ocupada", "cuenta_pedida")).toBe(true);
    expect(canTransition("ocupada", "por_limpiar")).toBe(true);
    expect(canTransition("cuenta_pedida", "por_limpiar")).toBe(true);
    expect(canTransition("por_limpiar", "libre")).toBe(true);
  });
  it("rechaza saltos inválidos", () => {
    expect(canTransition("libre", "por_limpiar")).toBe(false);
    expect(canTransition("por_limpiar", "ocupada")).toBe(false);
    expect(canTransition("ocupada", "libre")).toBe(false);
  });
});

describe("validCapacity / clampPosition / tableTone", () => {
  it("capacidad válida", () => {
    expect(validCapacity(2, 4)).toBe(true);
    expect(validCapacity(0, 4)).toBe(false);
    expect(validCapacity(4, 2)).toBe(false);
  });
  it("acota posición a 0..100", () => {
    expect(clampPosition(-5)).toBe(0);
    expect(clampPosition(140)).toBe(100);
    expect(clampPosition(37.5)).toBe(37.5);
  });
  it("color por estado", () => {
    expect(tableTone("libre")).toBe("free");
    expect(tableTone("ocupada")).toBe("busy");
    expect(tableTone("cuenta_pedida")).toBe("bill");
    expect(tableTone("por_limpiar")).toBe("cleaning");
  });
});
```

- [ ] **Step 2: Run to verify it fails.** `npm test -- restauracion-tables` → FAIL.

- [ ] **Step 3: Write the implementation**

Create `…/src/lib/restauracion/tables.ts`:

```ts
export type TableStatusValue = "libre" | "ocupada" | "cuenta_pedida" | "por_limpiar";

const TRANSITIONS: Record<TableStatusValue, readonly TableStatusValue[]> = {
  libre: ["ocupada"],
  ocupada: ["cuenta_pedida", "por_limpiar"],
  cuenta_pedida: ["por_limpiar"],
  por_limpiar: ["libre"],
};

export function canTransition(from: TableStatusValue, to: TableStatusValue): boolean {
  return TRANSITIONS[from].includes(to);
}

export function validCapacity(min: number, max: number): boolean {
  return Number.isInteger(min) && Number.isInteger(max) && min >= 1 && max >= min;
}

export function clampPosition(v: number): number {
  return Math.min(100, Math.max(0, v));
}

export function tableTone(status: TableStatusValue): "free" | "busy" | "bill" | "cleaning" {
  switch (status) {
    case "libre": return "free";
    case "ocupada": return "busy";
    case "cuenta_pedida": return "bill";
    case "por_limpiar": return "cleaning";
  }
}
```

- [ ] **Step 4: Run to verify it passes.** `npm test -- restauracion-tables` → PASS.

- [ ] **Step 5: Commit**

```bash
git add clients/projects/salon-os/src/lib/restauracion/tables.ts \
        clients/projects/salon-os/src/tests/unit/restauracion-tables.test.ts
git commit -m "feat(restauracion): lógica pura de sala (transiciones + validaciones de mesa)"
```

---

## Task 4: Queries + hooks de sala (con Realtime)

**Files:**
- Create: `…/src/lib/queries/tables.ts`, `…/src/hooks/use-tables.ts`
- Test: `…/src/tests/unit/table-keys.test.ts`

**Interfaces:**
- Consumes: `createClient` de `@/lib/supabase/client`; tipos `DiningZone`, `DiningTable`, `Order`; `useQuery`/`useQueryClient`.
- Produces:
  - `tableKeys`: `all(salonId)`, `zones(salonId)`, `tables(salonId)`, `openOrders(salonId)`.
  - `fetchZones(salonId)`, `fetchTables(salonId)` (todas las mesas activas del salón, con `zone_id`, `status`, `pos_x/y`, etc.).
  - `fetchTableOrders(salonId)` — pedidos abiertos con `dining_table_id` no nulo (para mapear mesa→cuenta en la vista): `orders` `status='abierta'` `dining_table_id is not null`.
  - Hooks: `useZones(salonId)`, `useTables(salonId)`, `useTableOrders(salonId)`, `useTablesRealtime(salonId)` (patrón `use-day-panel-realtime.ts`: canal `sala-${salonId}`, suscrito a `dining_tables` filtrado por `salon_id`, invalida `tableKeys.all(salonId)`; una segunda suscripción a `orders` en el mismo canal). Los hooks de mutación se añaden en la Task 5.

- [ ] **Step 1: Write the failing test**

Create `…/src/tests/unit/table-keys.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { tableKeys } from "@/lib/queries/tables";

describe("tableKeys", () => {
  it("deriva sub-keys del salón", () => {
    expect(tableKeys.all("s1")).toEqual(["tables", "s1"]);
    expect(tableKeys.tables("s1")).toEqual(["tables", "s1", "tables"]);
    expect(tableKeys.openOrders("s1")).toEqual(["tables", "s1", "openOrders"]);
  });
});
```

- [ ] **Step 2: Run to verify it fails.** `npm test -- table-keys` → FAIL.

- [ ] **Step 3: Write queries** — Create `…/src/lib/queries/tables.ts` con `tableKeys` + `fetchZones`/`fetchTables`/`fetchTableOrders` (todos `.eq("salon_id", salonId)`, `throw` en error), patrón idéntico a `queries/orders.ts`.

- [ ] **Step 4: Write hooks** — Create `…/src/hooks/use-tables.ts` (`"use client"`): `useZones`/`useTables`/`useTableOrders` (useQuery), y `useTablesRealtime` copiando `use-day-panel-realtime.ts` (tabla `dining_tables`, filter `salon_id=eq.${salonId}`, invalida `tableKeys.all(salonId)`; añade un segundo `.on("postgres_changes", { table:"orders", filter... })` en el mismo canal para reaccionar también a aperturas/cobros).

- [ ] **Step 5: Run + typecheck.** `npm test -- table-keys && npm run typecheck` → PASS + exit 0.

- [ ] **Step 6: Commit**

```bash
git add clients/projects/salon-os/src/lib/queries/tables.ts \
        clients/projects/salon-os/src/hooks/use-tables.ts \
        clients/projects/salon-os/src/tests/unit/table-keys.test.ts
git commit -m "feat(restauracion): queries y hooks de sala (lectura + Realtime)"
```

---

## Task 5: Server actions de sala

**Files:**
- Create: `…/src/lib/validations/table.ts`, `…/src/app/(dashboard)/sala/actions.ts`
- Modify: `…/src/hooks/use-tables.ts` (mutaciones)
- Test: `…/src/tests/integration/restauracion-sala-actions.test.ts`

**Interfaces:**
- Consumes: `getActiveSalonId`, `getActiveMembership`, `canManageSettings` (`@/lib/salon`); `createClient` de `@/lib/supabase/server`; `revalidatePath`; `canTransition` de `@/lib/restauracion/tables`; `makeSupabaseMock`.
- Produces (todas `ActionResult<T>`):
  - `openTable(input: { tableId, covers })` — **operativa** (miembro). `UPDATE dining_tables set status='ocupada' where id=tableId and salon_id and status='libre'` (0 filas → `{ok:false,"La mesa no está libre"}`); si 1 fila, crea `orders` (`randomUUID`, channel `'mesa'`, `dining_table_id`, `covers`, `label`=nombre mesa, status `'abierta'`); **si el insert de order falla → revierte la mesa a `libre`** y error. Devuelve el `order`.
  - `setTableStatus(input: { tableId, from, to })` — **operativa**. Rechaza si `!canTransition(from,to)` **antes** de tocar BD. `UPDATE ... .eq("status", from)`; 0 filas → `CONFLICTO`.
  - `saveTablePosition(input: { tableId, posX, posY })` — **gestión** (managers; es edición de layout). Acota con `clampPosition`. UPDATE `pos_x`/`pos_y`.
  - `createZone`/`updateZone`/`deleteZone`, `createTable`/`updateTable`/`deleteTable` — **gestión** (managers): patrón de las actions de carta (`assertManager` vía `canManageSettings(getActiveMembership().role)`, `safeParse`, escritura acotada por `salon_id`, `revalidatePath("/sala")`).
- Produces (hooks): `useOpenTable`, `useSetTableStatus`, `useSaveTablePosition`, `useCreateZone`/`useCreateTable`/`useUpdateTable`/`useDeleteTable` — invalidan `tableKeys.all(salonId)`.

- [ ] **Step 1: Write the failing integration test**

Create `…/src/tests/integration/restauracion-sala-actions.test.ts` (usa `makeSupabaseMock`, fixtures UUID). Cubre: `openTable` rechaza si la mesa NO está libre (UPDATE 0 filas → `ok:false`); `openTable` abre + crea la cuenta cuando está libre; `setTableStatus` da CONFLICTO cuando el UPDATE condicionado afecta 0 filas; `setTableStatus` rechaza transición inválida sin tocar BD:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
const holder = vi.hoisted(() => ({ supabase: null as unknown, membership: null as unknown }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: () => holder.supabase }));
vi.mock("@/lib/salon", () => ({
  getActiveSalonId: () => Promise.resolve("SALON"),
  getActiveMembership: () => Promise.resolve(holder.membership),
  canManageSettings: (r: string | null | undefined) => r === "owner" || r === "manager",
}));
import { makeSupabaseMock } from "@/tests/helpers/supabase-mock";
import { setTableStatus } from "@/app/(dashboard)/sala/actions";
beforeEach(() => { holder.membership = { salonId: "SALON", role: "staff" }; holder.supabase = null; });

it("setTableStatus rechaza transición inválida sin tocar BD", async () => {
  const onWrite = vi.fn(() => ({}));
  holder.supabase = makeSupabaseMock({ onWrite });
  const r = await setTableStatus({ tableId: "11111111-1111-4111-8111-111111111111", from: "libre", to: "por_limpiar" });
  expect(r.ok).toBe(false);
  expect(onWrite).not.toHaveBeenCalledWith("update", expect.anything(), expect.anything());
});
```

- [ ] **Step 2: Run to verify it fails.** `npm test -- restauracion-sala-actions` → FAIL.

- [ ] **Step 3: Write validations** (`…/src/lib/validations/table.ts`): Zod `openTableSchema` (tableId uuid, covers int 1..99), `setTableStatusSchema` (tableId uuid, from/to = enum de `table_status`), `saveTablePositionSchema` (tableId uuid, posX/posY number), `zoneSchema` (name), `tableSchema` (name, zoneId uuid, capacityMin/Max int, shape enum).

- [ ] **Step 4: Write the actions** (`…/src/app/(dashboard)/sala/actions.ts`, `"use server"`, `ActionResult<T>`). Implementa según "Produces". `openTable`: orden **UPDATE-mesa-condicionado → insert-order → (si falla) revertir mesa**. `setTableStatus`: `canTransition` antes del UPDATE condicionado. CRUD zonas/mesas: patrón `assertManager()` de las actions de carta.

- [ ] **Step 5: Add mutation hooks** en `…/src/hooks/use-tables.ts` (desempaqueta `ActionResult` + invalida `tableKeys.all(salonId)`).

- [ ] **Step 6: Run + typecheck.** `npm test -- restauracion-sala-actions && npm run typecheck` → PASS + exit 0.

- [ ] **Step 7: Commit**

```bash
git add clients/projects/salon-os/src/lib/validations/table.ts \
        "clients/projects/salon-os/src/app/(dashboard)/sala/actions.ts" \
        clients/projects/salon-os/src/hooks/use-tables.ts \
        clients/projects/salon-os/src/tests/integration/restauracion-sala-actions.test.ts
git commit -m "feat(restauracion): server actions de sala (abrir mesa, estado, layout)"
```

---

## Task 6: Panel de mesa (`table-panel.tsx`)

**Files:**
- Create: `…/src/app/(dashboard)/sala/table-panel.tsx`
- Test: `…/src/tests/unit/table-panel.test.tsx`

**Interfaces:**
- Consumes: `useOrderItems` (`@/hooks/use-orders`), `useSetTableStatus` (`@/hooks/use-tables`), `useSettleOrder` (`@/hooks/use-orders`), `settleTotals` (`@/lib/restauracion/order`), `elapsedMinutes` (`@/lib/restauracion/kds`), `formatMoney` (`@/lib/format`).
- Produces: `TablePanel` — dado `{ table: DiningTable; order: Order | null; salonId: string; now: Date; onClose; onAdd }`: muestra la comanda (líneas de `useOrderItems(salonId, order?.id)`), el **cronómetro** `elapsedMinutes(order.created_at, now)`, el **total** (`settleTotals` sobre las líneas no anuladas), los **comensales** (`order.covers`), el **estado**, y botones **Añadir** (`onAdd`), **Pedir cuenta** (`useSetTableStatus` → cuenta_pedida), **Cobrar** (reusa `useSettleOrder`; al ok, `setTableStatus` → por_limpiar), **Limpiar** (`setTableStatus` → libre).

- [ ] **Step 1: Write the failing component test** — Create `…/src/tests/unit/table-panel.test.tsx`. Mockea `@/hooks/use-orders` y `@/hooks/use-tables` con `vi.hoisted`. Contrato mínimo: dado un pedido con líneas, renderiza el total y los comensales, y muestra `getByRole("button", {name:/añadir/i})` y `/cobrar/i`.

- [ ] **Step 2: Run to verify it fails.** `npm test -- table-panel` → FAIL.

- [ ] **Step 3: Implement** `table-panel.tsx` según "Produces". El cobro orquesta `useSettleOrder(...).mutate(..., { onSuccess: () => setTableStatus({ tableId, from: table.status, to:'por_limpiar' }) })`. `elapsedMinutes` recibe `now` (del padre).

- [ ] **Step 4: Run + full suite + typecheck.** `npm test -- table-panel && npm test && npm run typecheck` → verde + exit 0.

- [ ] **Step 5: Commit**

```bash
git add "clients/projects/salon-os/src/app/(dashboard)/sala/table-panel.tsx" \
        clients/projects/salon-os/src/tests/unit/table-panel.test.tsx
git commit -m "feat(restauracion): panel de mesa (comanda + tiempo + total + acciones)"
```

---

## Task 7: Plano de sala arrastrable (`/sala`)

**Files:**
- Create: `…/src/app/(dashboard)/sala/{layout.tsx,page.tsx,sala-view.tsx,table-node.tsx,floor-editor.tsx}`
- Test: `…/src/tests/unit/table-node.test.tsx`

**Interfaces:**
- Consumes: `useZones`/`useTables`/`useTableOrders`/`useTablesRealtime`/`useOpenTable`/`useSaveTablePosition`/`useCreateZone`/`useCreateTable` (`@/hooks/use-tables`), `TablePanel`, `tableTone` (`@/lib/restauracion/tables`), `getActiveMembership`/`canManageSettings` (`@/lib/salon`), `SectorGate` (patrón de `carta/layout.tsx`).
- Produces: ruta `/sala` (sector restauración, staff). `layout.tsx` = `SectorGate required="restauracion"` (sin gate de rol). `page.tsx` resuelve `salonId` + `role`. `sala-view.tsx`: `useTablesRealtime` + indicador "En directo"; selector de zona; lienzo con las mesas en `pos_x`/`pos_y` (`table-node.tsx`), color por `tableTone(status)`; tocar mesa libre → diálogo "Abrir mesa" (comensales) → `useOpenTable`; tocar mesa ocupada → `TablePanel`; **Añadir** desde el panel navega a `/mostrador?order=<id>` (reusa el flujo de pedido con la cuenta de la mesa). **Modo edición** (solo si `canManageSettings(role)`): arrastrar `table-node` actualiza `pos_x`/`pos_y` (con `clampPosition`) y al soltar llama `useSaveTablePosition`; botones para crear zona/mesa.

- [ ] **Step 1: Write the failing component test** — Create `…/src/tests/unit/table-node.test.tsx`. `TableNode` con `{ table, tone, editable, onSelect, onDragEnd }` renderiza el nombre de la mesa y aplica clase/atributo según `tone`; al hacer click (no editable) llama `onSelect`. Arrastre real → verificación manual.

- [ ] **Step 2: Run to verify it fails.** `npm test -- table-node` → FAIL.

- [ ] **Step 3: Implement** `layout.tsx`, `page.tsx`, `table-node.tsx`, `sala-view.tsx`, `floor-editor.tsx`. Arrastre con **eventos de puntero nativos** (`onPointerDown/Move/Up`) sobre contenedor `position:relative`; mesas `position:absolute` en `%` de `pos_x`/`pos_y`. Cronómetro: `useState(() => new Date())` + `setInterval(30s)` para `now`, pasado a `TablePanel`. Reusa el patrón de estado de `mostrador-view.tsx`.

- [ ] **Step 4: Run test + full suite + typecheck.** `npm test -- table-node && npm test && npm run typecheck` → verde + exit 0.

- [ ] **Step 5: Commit**

```bash
git add "clients/projects/salon-os/src/app/(dashboard)/sala/" \
        clients/projects/salon-os/src/tests/unit/table-node.test.tsx
git commit -m "feat(restauracion): plano de sala arrastrable (/sala) en tiempo real"
```

---

## Task 8: Nav restauración — añadir Sala y retirar Caja (vender)

**Files:**
- Modify: `…/src/components/dashboard-nav-items.ts`
- Test: `…/src/tests/unit/dashboard-nav-items.test.ts`

**Contexto:** hoy la rama `sector === "restauracion"` de `buildDashboardNavItems` inserta `[MOSTRADOR_ITEM, COCINA_ITEM, (CARTA_ITEM si showSettings)]` tras "Panel", y `rest` arrastra la operativa común, que incluye **"Caja" (`/tpv`)** de `PRIMARY_NAV_ITEMS`. Decisión de producto: en restauración se **vende** en Mostrador/Sala, así que "Caja" (pantalla de vender) sobra; **"Arqueo" (`/arqueo`)** se mantiene (abrir/cerrar turno + Z, solo managers, ya vive en su propia sección).

**Interfaces:** Produces `SALA_ITEM = { href: "/sala", label: "Sala", icon: <lucide, p.ej. Armchair o LayoutPanelTop> }`. En la rama de restauración: (a) añadir `SALA_ITEM` tras `MOSTRADOR_ITEM`; (b) **filtrar** `/tpv` de `rest`.

- [ ] **Step 1: Write the failing test** — en `…/src/tests/unit/dashboard-nav-items.test.ts`:

```ts
it("restauración: staff ve Mostrador, Sala y Cocina; NO Caja ni Carta", () => {
  const items = buildDashboardNavItems({ showSettings: false, hasPos: true, sector: "restauracion" });
  const hrefs = items.map((i) => i.href);
  expect(hrefs).toContain("/mostrador");
  expect(hrefs).toContain("/sala");
  expect(hrefs).toContain("/cocina");
  expect(hrefs).not.toContain("/tpv"); // "Caja" (vender) se retira: se vende en Mostrador/Sala
  expect(hrefs).not.toContain("/carta");
});
it("restauración: manager ve Sala y conserva Arqueo; sigue sin Caja", () => {
  const items = buildDashboardNavItems({ showSettings: true, hasPos: true, sector: "restauracion" });
  const hrefs = items.map((i) => i.href);
  expect(hrefs).toContain("/sala");
  expect(hrefs).toContain("/arqueo");
  expect(hrefs).not.toContain("/tpv");
});
```

- [ ] **Step 2: Run to verify it fails.** `npm test -- dashboard-nav-items` → FAIL.

- [ ] **Step 3: Implement.** Importa el icono y declara `SALA_ITEM`. Reescribe la rama de restauración:

```ts
if (sector === "restauracion") {
  // Se vende en Mostrador/Sala → "Caja" (/tpv, pantalla de vender) se retira del menú.
  // "Arqueo" (/arqueo) se mantiene: abrir/cerrar turno + cierre Z, donde caen los cobros.
  const base = withSectorLabels.slice(0, 1); // Panel
  const rest = withSectorLabels.slice(1).filter((item) => item.href !== "/tpv");
  const extras = showSettings
    ? [MOSTRADOR_ITEM, SALA_ITEM, COCINA_ITEM, CARTA_ITEM]
    : [MOSTRADOR_ITEM, SALA_ITEM, COCINA_ITEM];
  return [...base, ...extras, ...rest];
}
```

Actualiza el comentario JSDoc de la rama de restauración para reflejar Sala + la retirada de Caja.

- [ ] **Step 4: Run full suite + typecheck.** `npm test && npm run typecheck` → verde + exit 0.

- [ ] **Step 5: Commit**

```bash
git add clients/projects/salon-os/src/components/dashboard-nav-items.ts \
        clients/projects/salon-os/src/tests/unit/dashboard-nav-items.test.ts
git commit -m "feat(restauracion): nav Sala + retirar Caja de vender (se vende en Mostrador/Sala)"
```

---

## Criterios de aceptación (Puerta de control)

- [ ] `npm test` y `npm run typecheck` verdes.
- [ ] Migraciones aplicadas en `jztoyekixcziaicrnlce` (`(201, [])`, guardián OK; `dining_tables`/`orders` en `pg_publication_tables`).
- [ ] En `/sala`: se ve el plano por zona; abrir una mesa libre (comensales) la pone ocupada; **Añadir** productos → aparecen en `/cocina`.
- [ ] Tocar una mesa ocupada muestra **comanda + tiempo sentados + total + comensales**.
- [ ] **Cobrar** la mesa materializa un `pos_sale` (cuadra en arqueo) y la mesa pasa a `por_limpiar`; **Limpiar** → `libre`.
- [ ] El plano se **actualiza en tiempo real** entre dos pantallas.
- [ ] `staff` no ve el modo edición; owner/manager arrastra una mesa y su posición **persiste**.
- [ ] En el sector restauración, el menú **ya no muestra "Caja"** (`/tpv`) y sí **"Arqueo"** (managers).

## Notas / riesgos

- `openTable` no es transaccional (como `createSale`/`settleOrder`): compensación manual (revertir mesa a `libre` si falla el insert del pedido).
- `saveTablePosition` gateada a managers (edición de layout), aunque la RLS de `dining_tables` UPDATE es de miembro (para el cambio de estado operativo). El split se refuerza a nivel de action.
- Cobro de mesa = orquestación en la UI: `settleOrder` (reuso) + `setTableStatus`. No se duplica lógica fiscal. Cae en la `pos_session` abierta desde `/arqueo`.
- Tras construir: sembrar unas mesas demo en `demoresto` (zona Salón con 4-5 mesas) para ver `/sala` en el local ya abierto.
