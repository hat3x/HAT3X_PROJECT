# Kairos · Restauración — Plan A: Carta + Backoffice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar al sector `restauracion` de Kairos un **backoffice de carta** completo — categorías, estaciones, productos con IVA/alérgenos/foto/estación, grupos de modificadores (min/max + precio), combos con ruteo por pieza, e importador CSV — y activar el sector en la navegación.

**Architecture:** Se reutiliza la tabla `products` existente como ítem vendible atómico y se le montan encima tablas nuevas de restauración (`menu_categories`, `stations`, `modifier_groups`, `modifiers`, `product_modifier_groups`, `combo_components`). La UI sigue el patrón de Kairos: `page.tsx` (auth/servidor) → `*-view.tsx` (`"use client"`) → hooks React Query (`src/hooks/use-menu.ts`) → capa de queries (`src/lib/queries/menu.ts`) para lecturas y server actions (`src/app/(dashboard)/carta/actions.ts`) para escrituras. La lógica de precio (modificadores + combos) vive pura en `src/lib/restauracion/`.

**Tech Stack:** Next.js 14 App Router, TypeScript strict, Supabase (Postgres + RLS), React Query (TanStack v5), shadcn/ui, Tailwind, Vitest + Testing Library, Zod.

## Global Constraints

- **Dinero siempre en céntimos enteros** (`*_cents integer`); modelo **PVP = bruto, IVA incluido**. Reusar `src/lib/payments` (`splitVatFromGross`, `computeSaleTotals`).
- **FKs a entidades de dominio son COMPUESTAS**: `(fk_id, salon_id) → tabla(id, salon_id)`. Cada tabla nueva declara `constraint <t>_id_salon_key unique (id, salon_id)`.
- **RLS por salón** en toda tabla nueva: `SELECT/INSERT/UPDATE` para cualquier miembro (`salon_id in (select app.user_salon_ids())`); gestión sensible y `DELETE` para `owner`/`manager` (`app.has_salon_role(salon_id, array['owner','manager']::public.member_role[])`).
- Cada migración termina con un **bloque guardián** `do $guard$ ... $guard$;` que verifica que RLS quedó habilitada y las políticas creadas; usa `raise exception ... using errcode = 'raise_exception'`.
- Trigger `updated_at`: reusar la función existente **`app.set_updated_at()`** (definida en `20260711100000_initial_schema.sql:215`).
- **Migraciones se aplican por Supabase Management API** (NO hay CLI de migraciones). Endpoint `POST https://api.supabase.com/v1/projects/jztoyekixcziaicrnlce/database/query`, body `{"query": "<SQL>"}`, header `Authorization: Bearer $SUPABASE_API_TOKEN` (leído de `clients/projects/denueveanueve/.env`), **User-Agent de navegador obligatorio**. DDL correcto responde `(201, [])`.
- **Testing sin Postgres** (el harness es jsdom, no hay BD real): (a) lógica pura → tests unitarios en `src/tests/unit/`; (b) server actions → tests de integración con el doble en memoria `makeSupabaseMock` en `src/tests/integration/`; (c) invariantes de migración → tests "sql-coherence" que **leen el `.sql` con `readFileSync` y afirman el contrato**; (d) componentes → mock del hook `use-*` con `vi.hoisted`/`vi.mock`.
- Tests en `src/tests/`, se ejecutan con `npm test` (=`vitest run`). Typecheck con `npm run typecheck` (=`tsc --noEmit`). Ambos deben quedar verdes.
- TDD estricto, commits frecuentes. Identificadores en inglés, comentarios/copy en español.
- El sector `restauracion` **no se activa** (`implemented: true`) hasta la última tarea, para no exponer enlaces a pantallas inexistentes.

---

## File Structure

**Migraciones (crear):**
- `clients/projects/salon-os/supabase/migrations/20260809120000_restauracion_menu_base.sql` — enum `allergen`, `menu_categories`, `stations`, columnas nuevas de `products`, FKs compuestas, RLS, guardián.
- `.../20260809121000_restauracion_modifiers.sql` — `modifier_groups`, `modifiers`, `product_modifier_groups`, RLS, guardián.
- `.../20260809122000_restauracion_combos.sql` — `combo_components`, RLS, guardián.

**Tipos (modificar):**
- `clients/projects/salon-os/src/types/database.ts` — añadir Row/Insert/Update de las 6 tablas + enum `Allergen` + alias de dominio; ampliar `products.Row/Insert/Update` con las columnas nuevas.

**Lógica pura (crear):**
- `clients/projects/salon-os/src/lib/restauracion/menu.ts` — `effectiveUnitPriceCents`, `expandCombo`, tipos.
- `clients/projects/salon-os/src/lib/restauracion/csv-import.ts` — `parseMenuCsv`.

**Datos/servidor (crear):**
- `clients/projects/salon-os/src/lib/queries/menu.ts` — `menuKeys` + fetchers.
- `clients/projects/salon-os/src/hooks/use-menu.ts` — hooks React Query.
- `clients/projects/salon-os/src/lib/validations/menu.ts` — esquemas Zod.
- `clients/projects/salon-os/src/app/(dashboard)/carta/actions.ts` — server actions.

**UI (crear):**
- `clients/projects/salon-os/src/app/(dashboard)/carta/{layout.tsx,page.tsx,carta-view.tsx,category-form.tsx,menu-item-form.tsx,modifier-group-form.tsx,csv-import-dialog.tsx}`.

**Activación (modificar):**
- `clients/projects/salon-os/src/lib/sector/registry.ts` — `restauracion.implemented: true`.
- `clients/projects/salon-os/src/components/dashboard-nav-items.ts` — rama `restauracion` con item `/carta`.

**Tests (crear):** en `clients/projects/salon-os/src/tests/` — ver cada tarea.

> Rutas abreviadas abajo como `…/` = `clients/projects/salon-os/`.

---

## Task 1: Migración catálogo base (categorías, estaciones, extensión de products)

**Files:**
- Create: `…/supabase/migrations/20260809120000_restauracion_menu_base.sql`
- Test: `…/src/tests/unit/restauracion-menu-base-sql.test.ts`
- Modify: `…/src/types/database.ts`

**Interfaces:**
- Consumes: `app.set_updated_at()`, `app.user_salon_ids()`, `app.has_salon_role(uuid, public.member_role[])`, `public.salons(id)`, `public.products(id, salon_id)` (ya tiene `unique (id, salon_id)` → `products_id_salon_key`).
- Produces: tablas `public.menu_categories(id, salon_id, name, sort_order, active, …)`, `public.stations(id, salon_id, name, sort_order, active, …)`; enum `public.allergen`; columnas `products.category_id`, `products.station_id`, `products.is_combo`, `products.image_url`, `products.allergens allergen[]`, `products.available_channels text[]`. Alias TS `MenuCategory`, `Station`, `Allergen`.

- [ ] **Step 1: Write the failing sql-coherence test**

Create `…/src/tests/unit/restauracion-menu-base-sql.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

const SQL = readFileSync(
  join(process.cwd(), "supabase", "migrations", "20260809120000_restauracion_menu_base.sql"),
  "utf8",
).toLowerCase();

describe("migración catálogo base restauración", () => {
  it("crea el enum allergen con los 14 alérgenos UE", () => {
    expect(SQL).toContain("create type public.allergen as enum");
    for (const a of ["gluten", "crustaceos", "huevos", "pescado", "lacteos", "sesamo", "moluscos"]) {
      expect(SQL).toContain(`'${a}'`);
    }
  });

  it("crea menu_categories y stations con clave compuesta (id, salon_id)", () => {
    expect(SQL).toContain("create table if not exists public.menu_categories");
    expect(SQL).toContain("create table if not exists public.stations");
    expect(SQL).toContain("menu_categories_id_salon_key unique (id, salon_id)");
    expect(SQL).toContain("stations_id_salon_key unique (id, salon_id)");
  });

  it("extiende products con category_id/station_id por FK compuesta y campos de carta", () => {
    expect(SQL).toContain("add column if not exists category_id uuid");
    expect(SQL).toContain("add column if not exists station_id  uuid");
    expect(SQL).toContain("add column if not exists is_combo");
    expect(SQL).toContain("allergens    public.allergen[]");
    expect(SQL).toContain("foreign key (category_id, salon_id)");
    expect(SQL).toContain("references public.menu_categories (id, salon_id)");
  });

  it("habilita RLS y separa lectura (miembros) de gestión (owner/manager)", () => {
    expect(SQL).toContain("alter table public.menu_categories enable row level security");
    expect(SQL).toContain("alter table public.stations enable row level security");
    expect(SQL).toContain("salon_id in (select app.user_salon_ids())");
    expect(SQL).toContain("app.has_salon_role(salon_id, array['owner','manager']::public.member_role[])");
  });

  it("incluye un bloque guardián", () => {
    expect(SQL).toContain("do $guard$");
    expect(SQL).toContain("raise exception");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd clients/projects/salon-os && npm test -- restauracion-menu-base-sql`
Expected: FAIL (`ENOENT`: la migración aún no existe).

- [ ] **Step 3: Write the migration**

Create `…/supabase/migrations/20260809120000_restauracion_menu_base.sql`:

```sql
-- =============================================================================
-- Kairos — Restauración · Catálogo base (categorías, estaciones, extensión products)
-- Identificadores en inglés, comentarios en español. Dinero en céntimos.
-- FKs de dominio COMPUESTAS (fk_id, salon_id) → tabla(id, salon_id).
-- =============================================================================
begin;

-- Alérgenos: los 14 del Reglamento UE 1169/2011 (lista cerrada).
do $$ begin
  if not exists (select 1 from pg_type where typname = 'allergen') then
    create type public.allergen as enum (
      'gluten','crustaceos','huevos','pescado','cacahuetes','soja','lacteos',
      'frutos_cascara','apio','mostaza','sesamo','sulfitos','altramuces','moluscos'
    );
  end if;
end $$;

-- Categorías de la carta.
create table if not exists public.menu_categories (
  id          uuid primary key default gen_random_uuid(),
  salon_id    uuid not null references public.salons (id) on delete cascade,
  name        varchar(120) not null,
  sort_order  integer not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (salon_id, name),
  constraint menu_categories_id_salon_key unique (id, salon_id)
);

-- Estaciones de producción (cocina, barra, plancha, ...).
create table if not exists public.stations (
  id          uuid primary key default gen_random_uuid(),
  salon_id    uuid not null references public.salons (id) on delete cascade,
  name        varchar(120) not null,
  sort_order  integer not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (salon_id, name),
  constraint stations_id_salon_key unique (id, salon_id)
);

-- Extensión de products para restauración.
alter table public.products
  add column if not exists category_id uuid,
  add column if not exists station_id  uuid,
  add column if not exists is_combo     boolean not null default false,
  add column if not exists image_url    text,
  add column if not exists allergens    public.allergen[] not null default '{}',
  add column if not exists available_channels text[] not null default array['mostrador'];

alter table public.products
  add constraint products_category_id_fkey
    foreign key (category_id, salon_id)
    references public.menu_categories (id, salon_id) on delete set null (category_id),
  add constraint products_station_id_fkey
    foreign key (station_id, salon_id)
    references public.stations (id, salon_id) on delete set null (station_id);

create trigger trg_menu_categories_updated_at
  before update on public.menu_categories
  for each row execute function app.set_updated_at();
create trigger trg_stations_updated_at
  before update on public.stations
  for each row execute function app.set_updated_at();

-- RLS: lectura miembros / gestión owner-manager.
alter table public.menu_categories enable row level security;
alter table public.stations        enable row level security;

create policy "members_select_menu_categories" on public.menu_categories
  for select to authenticated using (salon_id in (select app.user_salon_ids()));
create policy "managers_insert_menu_categories" on public.menu_categories
  for insert to authenticated
  with check (app.has_salon_role(salon_id, array['owner','manager']::public.member_role[]));
create policy "managers_update_menu_categories" on public.menu_categories
  for update to authenticated
  using (app.has_salon_role(salon_id, array['owner','manager']::public.member_role[]))
  with check (app.has_salon_role(salon_id, array['owner','manager']::public.member_role[]));
create policy "managers_delete_menu_categories" on public.menu_categories
  for delete to authenticated
  using (app.has_salon_role(salon_id, array['owner','manager']::public.member_role[]));

create policy "members_select_stations" on public.stations
  for select to authenticated using (salon_id in (select app.user_salon_ids()));
create policy "managers_insert_stations" on public.stations
  for insert to authenticated
  with check (app.has_salon_role(salon_id, array['owner','manager']::public.member_role[]));
create policy "managers_update_stations" on public.stations
  for update to authenticated
  using (app.has_salon_role(salon_id, array['owner','manager']::public.member_role[]))
  with check (app.has_salon_role(salon_id, array['owner','manager']::public.member_role[]));
create policy "managers_delete_stations" on public.stations
  for delete to authenticated
  using (app.has_salon_role(salon_id, array['owner','manager']::public.member_role[]));

-- Guardián: RLS habilitada + política SELECT de miembros presente.
do $guard$
declare _rls boolean; _cnt integer;
begin
  select relrowsecurity into _rls from pg_class where oid = 'public.menu_categories'::regclass;
  if not coalesce(_rls, false) then
    raise exception 'GUARDIÁN CARTA: RLS no habilitada en menu_categories' using errcode = 'raise_exception';
  end if;
  select count(*) into _cnt from pg_policies
    where schemaname = 'public' and tablename in ('menu_categories','stations')
      and cmd = 'SELECT';
  if _cnt < 2 then
    raise exception 'GUARDIÁN CARTA: faltan políticas SELECT (encontradas %)', _cnt using errcode = 'raise_exception';
  end if;
  raise notice 'GUARDIÁN CARTA: menu_categories/stations verificadas';
end;
$guard$;

commit;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd clients/projects/salon-os && npm test -- restauracion-menu-base-sql`
Expected: PASS (5 tests).

- [ ] **Step 5: Add TypeScript types**

In `…/src/types/database.ts`:
1. Añade el enum union arriba (junto a los demás, p.ej. tras `SalonSector` en la línea ~140):

```ts
export type Allergen =
  | "gluten" | "crustaceos" | "huevos" | "pescado" | "cacahuetes" | "soja" | "lacteos"
  | "frutos_cascara" | "apio" | "mostaza" | "sesamo" | "sulfitos" | "altramuces" | "moluscos";
```

2. Enlázalo en `public.Enums`: `allergen: Allergen;`.
3. Dentro de `public.Tables`, añade `menu_categories` y `stations` con la forma `{ Row; Insert; Update; Relationships }` (Row: `id, salon_id, name, sort_order, active, created_at, updated_at` — `string`/`number`/`boolean`; Insert con opcionales salvo `salon_id`, `name`; Update todo opcional).
4. Amplía `products.Row` con `category_id: string | null; station_id: string | null; is_combo: boolean; image_url: string | null; allergens: Allergen[]; available_channels: string[];` y refleja en `Insert` (todos opcionales) y `Update`.
5. Al final, alias de dominio:

```ts
export type MenuCategory = Tables<"menu_categories">;
export type Station = Tables<"stations">;
```

- [ ] **Step 6: Apply the migration + typecheck**

Aplica la migración por Management API (heredoc del bloque "Global Constraints"; el `print(run(open(...).read()))` debe imprimir `(201, [])`). Luego:
Run: `cd clients/projects/salon-os && npm run typecheck`
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add clients/projects/salon-os/supabase/migrations/20260809120000_restauracion_menu_base.sql \
        clients/projects/salon-os/src/tests/unit/restauracion-menu-base-sql.test.ts \
        clients/projects/salon-os/src/types/database.ts
git commit -m "feat(restauracion): catálogo base — categorías, estaciones, alérgenos"
```

---

## Task 2: Migración modificadores

**Files:**
- Create: `…/supabase/migrations/20260809121000_restauracion_modifiers.sql`
- Test: `…/src/tests/unit/restauracion-modifiers-sql.test.ts`
- Modify: `…/src/types/database.ts`

**Interfaces:**
- Consumes: `public.salons(id)`, `public.products(id, salon_id)`, helpers RLS, `app.set_updated_at()`.
- Produces: `public.modifier_groups(id, salon_id, name, min_select, max_select, required, sort_order, …)`, `public.modifiers(id, salon_id, group_id, name, price_delta_cents, sort_order, active, …)`, `public.product_modifier_groups(id, salon_id, product_id, group_id, sort_order)`. Alias `ModifierGroup`, `Modifier`, `ProductModifierGroup`.

- [ ] **Step 1: Write the failing sql-coherence test**

Create `…/src/tests/unit/restauracion-modifiers-sql.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

const SQL = readFileSync(
  join(process.cwd(), "supabase", "migrations", "20260809121000_restauracion_modifiers.sql"),
  "utf8",
).toLowerCase();

describe("migración modificadores", () => {
  it("crea las tres tablas con clave compuesta (id, salon_id)", () => {
    for (const t of ["modifier_groups", "modifiers", "product_modifier_groups"]) {
      expect(SQL).toContain(`create table if not exists public.${t}`);
      expect(SQL).toContain(`${t}_id_salon_key unique (id, salon_id)`);
    }
  });

  it("modifier_groups valida min<=max y modifiers guarda price_delta_cents (permite negativo)", () => {
    expect(SQL).toContain("min_select");
    expect(SQL).toContain("max_select");
    expect(SQL).toContain("check (min_select <= max_select)");
    expect(SQL).toContain("price_delta_cents integer not null default 0");
  });

  it("product_modifier_groups enlaza product y group por FK compuesta", () => {
    expect(SQL).toContain("foreign key (product_id, salon_id)");
    expect(SQL).toContain("foreign key (group_id, salon_id)");
    expect(SQL).toContain("unique (salon_id, product_id, group_id)");
  });

  it("RLS: lectura miembros, gestión owner/manager, y guardián", () => {
    expect(SQL).toContain("salon_id in (select app.user_salon_ids())");
    expect(SQL).toContain("app.has_salon_role(salon_id, array['owner','manager']::public.member_role[])");
    expect(SQL).toContain("do $guard$");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd clients/projects/salon-os && npm test -- restauracion-modifiers-sql`
Expected: FAIL (ENOENT).

- [ ] **Step 3: Write the migration**

Create `…/supabase/migrations/20260809121000_restauracion_modifiers.sql`:

```sql
-- =============================================================================
-- Kairos — Restauración · Modificadores (grupos, opciones, asignación a producto)
-- =============================================================================
begin;

create table if not exists public.modifier_groups (
  id          uuid primary key default gen_random_uuid(),
  salon_id    uuid not null references public.salons (id) on delete cascade,
  name        varchar(120) not null,
  min_select  integer not null default 0 check (min_select >= 0),
  max_select  integer not null default 1 check (max_select >= 1),
  required    boolean not null default false,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint modifier_groups_min_le_max check (min_select <= max_select),
  constraint modifier_groups_id_salon_key unique (id, salon_id)
);

create table if not exists public.modifiers (
  id                uuid primary key default gen_random_uuid(),
  salon_id          uuid not null references public.salons (id) on delete cascade,
  group_id          uuid not null,
  name              varchar(120) not null,
  price_delta_cents integer not null default 0,   -- puede ser negativo (descuento)
  sort_order        integer not null default 0,
  active            boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint modifiers_group_id_fkey
    foreign key (group_id, salon_id)
    references public.modifier_groups (id, salon_id) on delete cascade,
  constraint modifiers_id_salon_key unique (id, salon_id)
);

create table if not exists public.product_modifier_groups (
  id          uuid primary key default gen_random_uuid(),
  salon_id    uuid not null references public.salons (id) on delete cascade,
  product_id  uuid not null,
  group_id    uuid not null,
  sort_order  integer not null default 0,
  constraint product_modifier_groups_product_fkey
    foreign key (product_id, salon_id)
    references public.products (id, salon_id) on delete cascade,
  constraint product_modifier_groups_group_fkey
    foreign key (group_id, salon_id)
    references public.modifier_groups (id, salon_id) on delete cascade,
  unique (salon_id, product_id, group_id),
  constraint product_modifier_groups_id_salon_key unique (id, salon_id)
);

create trigger trg_modifier_groups_updated_at
  before update on public.modifier_groups
  for each row execute function app.set_updated_at();
create trigger trg_modifiers_updated_at
  before update on public.modifiers
  for each row execute function app.set_updated_at();

-- RLS (patrón: lectura miembros / gestión owner-manager) para las tres tablas.
do $$
declare t text;
begin
  foreach t in array array['modifier_groups','modifiers','product_modifier_groups'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format($p$create policy "members_select_%1$s" on public.%1$I
      for select to authenticated using (salon_id in (select app.user_salon_ids()))$p$, t);
    execute format($p$create policy "managers_insert_%1$s" on public.%1$I
      for insert to authenticated
      with check (app.has_salon_role(salon_id, array['owner','manager']::public.member_role[]))$p$, t);
    execute format($p$create policy "managers_update_%1$s" on public.%1$I
      for update to authenticated
      using (app.has_salon_role(salon_id, array['owner','manager']::public.member_role[]))
      with check (app.has_salon_role(salon_id, array['owner','manager']::public.member_role[]))$p$, t);
    execute format($p$create policy "managers_delete_%1$s" on public.%1$I
      for delete to authenticated
      using (app.has_salon_role(salon_id, array['owner','manager']::public.member_role[]))$p$, t);
  end loop;
end $$;

do $guard$
declare _cnt integer;
begin
  select count(*) into _cnt from pg_policies
    where schemaname = 'public'
      and tablename in ('modifier_groups','modifiers','product_modifier_groups');
  if _cnt < 12 then
    raise exception 'GUARDIÁN MODIFICADORES: faltan políticas (encontradas %)', _cnt using errcode = 'raise_exception';
  end if;
  raise notice 'GUARDIÁN MODIFICADORES: 3 tablas verificadas';
end;
$guard$;

commit;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd clients/projects/salon-os && npm test -- restauracion-modifiers-sql`
Expected: PASS.

- [ ] **Step 5: Add types + apply + typecheck**

En `…/src/types/database.ts` añade `modifier_groups`, `modifiers`, `product_modifier_groups` (Row/Insert/Update/Relationships) y alias `ModifierGroup`, `Modifier`, `ProductModifierGroup`. Aplica la migración por Management API (`(201, [])`).
Run: `cd clients/projects/salon-os && npm run typecheck`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add clients/projects/salon-os/supabase/migrations/20260809121000_restauracion_modifiers.sql \
        clients/projects/salon-os/src/tests/unit/restauracion-modifiers-sql.test.ts \
        clients/projects/salon-os/src/types/database.ts
git commit -m "feat(restauracion): modificadores — grupos, opciones y asignación a producto"
```

---

## Task 3: Migración combos

**Files:**
- Create: `…/supabase/migrations/20260809122000_restauracion_combos.sql`
- Test: `…/src/tests/unit/restauracion-combos-sql.test.ts`
- Modify: `…/src/types/database.ts`

**Interfaces:**
- Consumes: `public.products(id, salon_id)`, `public.stations(id, salon_id)`, helpers RLS.
- Produces: `public.combo_components(id, salon_id, combo_product_id, component_product_id, qty, station_id_override, sort_order)`. Alias `ComboComponent`. Un combo = `products.is_combo = true` con sus piezas aquí; `station_id_override` permite el ruteo por pieza (comida→cocina, bebida→barra).

- [ ] **Step 1: Write the failing sql-coherence test**

Create `…/src/tests/unit/restauracion-combos-sql.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

const SQL = readFileSync(
  join(process.cwd(), "supabase", "migrations", "20260809122000_restauracion_combos.sql"),
  "utf8",
).toLowerCase();

describe("migración combos", () => {
  it("crea combo_components con FKs compuestas a producto combo, pieza y estación", () => {
    expect(SQL).toContain("create table if not exists public.combo_components");
    expect(SQL).toContain("foreign key (combo_product_id, salon_id)");
    expect(SQL).toContain("foreign key (component_product_id, salon_id)");
    expect(SQL).toContain("foreign key (station_id_override, salon_id)");
    expect(SQL).toContain("references public.stations (id, salon_id)");
  });

  it("qty es positivo y hay clave compuesta (id, salon_id)", () => {
    expect(SQL).toContain("qty");
    expect(SQL).toContain("check (qty > 0)");
    expect(SQL).toContain("combo_components_id_salon_key unique (id, salon_id)");
  });

  it("RLS + guardián", () => {
    expect(SQL).toContain("salon_id in (select app.user_salon_ids())");
    expect(SQL).toContain("app.has_salon_role(salon_id, array['owner','manager']::public.member_role[])");
    expect(SQL).toContain("do $guard$");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd clients/projects/salon-os && npm test -- restauracion-combos-sql`
Expected: FAIL (ENOENT).

- [ ] **Step 3: Write the migration**

Create `…/supabase/migrations/20260809122000_restauracion_combos.sql`:

```sql
-- =============================================================================
-- Kairos — Restauración · Combos (piezas de un producto combo + ruteo por pieza)
-- =============================================================================
begin;

create table if not exists public.combo_components (
  id                    uuid primary key default gen_random_uuid(),
  salon_id              uuid not null references public.salons (id) on delete cascade,
  combo_product_id      uuid not null,
  component_product_id  uuid not null,
  qty                   integer not null default 1 check (qty > 0),
  station_id_override   uuid,
  sort_order            integer not null default 0,
  created_at            timestamptz not null default now(),
  constraint combo_components_combo_fkey
    foreign key (combo_product_id, salon_id)
    references public.products (id, salon_id) on delete cascade,
  constraint combo_components_component_fkey
    foreign key (component_product_id, salon_id)
    references public.products (id, salon_id) on delete cascade,
  constraint combo_components_station_fkey
    foreign key (station_id_override, salon_id)
    references public.stations (id, salon_id) on delete set null (station_id_override),
  constraint combo_components_id_salon_key unique (id, salon_id)
);

alter table public.combo_components enable row level security;
create policy "members_select_combo_components" on public.combo_components
  for select to authenticated using (salon_id in (select app.user_salon_ids()));
create policy "managers_insert_combo_components" on public.combo_components
  for insert to authenticated
  with check (app.has_salon_role(salon_id, array['owner','manager']::public.member_role[]));
create policy "managers_update_combo_components" on public.combo_components
  for update to authenticated
  using (app.has_salon_role(salon_id, array['owner','manager']::public.member_role[]))
  with check (app.has_salon_role(salon_id, array['owner','manager']::public.member_role[]));
create policy "managers_delete_combo_components" on public.combo_components
  for delete to authenticated
  using (app.has_salon_role(salon_id, array['owner','manager']::public.member_role[]));

do $guard$
declare _cnt integer;
begin
  select count(*) into _cnt from pg_policies
    where schemaname = 'public' and tablename = 'combo_components';
  if _cnt < 4 then
    raise exception 'GUARDIÁN COMBOS: faltan políticas (encontradas %)', _cnt using errcode = 'raise_exception';
  end if;
  raise notice 'GUARDIÁN COMBOS: combo_components verificada';
end;
$guard$;

commit;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd clients/projects/salon-os && npm test -- restauracion-combos-sql`
Expected: PASS.

- [ ] **Step 5: Add types + apply + typecheck**

Añade `combo_components` (Row/Insert/Update/Relationships) + alias `ComboComponent` en `…/src/types/database.ts`. Aplica por Management API (`(201, [])`).
Run: `cd clients/projects/salon-os && npm run typecheck` → exit 0.

- [ ] **Step 6: Commit**

```bash
git add clients/projects/salon-os/supabase/migrations/20260809122000_restauracion_combos.sql \
        clients/projects/salon-os/src/tests/unit/restauracion-combos-sql.test.ts \
        clients/projects/salon-os/src/types/database.ts
git commit -m "feat(restauracion): combos — piezas con ruteo por estación"
```

---

## Task 4: Lógica pura de carta (precio efectivo + expansión de combo)

**Files:**
- Create: `…/src/lib/restauracion/menu.ts`
- Test: `…/src/tests/unit/restauracion-menu.test.ts`

**Interfaces:**
- Consumes: nada (aritmética entera pura).
- Produces:
  - `type SelectedModifier = { priceDeltaCents: number }`
  - `effectiveUnitPriceCents(basePriceCents: number, mods: readonly SelectedModifier[]): number` — base + suma de deltas, nunca por debajo de 0.
  - `type ComboPiece = { componentProductId: string; qty: number; stationId: string | null; stationOverrideId: string | null }`
  - `type ExpandedLine = { productId: string; qty: number; stationId: string | null; unitPriceCents: number }`
  - `expandCombo(comboQty: number, pieces: readonly ComboPiece[]): ExpandedLine[]` — cada pieza sale como línea con `stationId = stationOverrideId ?? stationId` y `unitPriceCents = 0` (el precio lo lleva la línea del combo; las piezas van a 0 € — respeta el CHECK `>= 0` que se validará en Plan B).

- [ ] **Step 1: Write the failing test**

Create `…/src/tests/unit/restauracion-menu.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { effectiveUnitPriceCents, expandCombo } from "@/lib/restauracion/menu";

describe("effectiveUnitPriceCents", () => {
  it("suma los deltas de los modificadores al precio base", () => {
    expect(effectiveUnitPriceCents(500, [{ priceDeltaCents: 80 }, { priceDeltaCents: 0 }])).toBe(580);
  });
  it("nunca baja de 0 aunque los deltas sean negativos", () => {
    expect(effectiveUnitPriceCents(100, [{ priceDeltaCents: -300 }])).toBe(0);
  });
  it("sin modificadores devuelve el precio base", () => {
    expect(effectiveUnitPriceCents(1250, [])).toBe(1250);
  });
});

describe("expandCombo", () => {
  const pieces = [
    { componentProductId: "food", qty: 1, stationId: "cocina", stationOverrideId: null },
    { componentProductId: "drink", qty: 1, stationId: "cocina", stationOverrideId: "barra" },
  ];
  it("enruta cada pieza a su estación (override gana) y pone precio 0", () => {
    const lines = expandCombo(1, pieces);
    expect(lines).toEqual([
      { productId: "food", qty: 1, stationId: "cocina", unitPriceCents: 0 },
      { productId: "drink", qty: 1, stationId: "barra", unitPriceCents: 0 },
    ]);
  });
  it("multiplica las cantidades por la cantidad de combos", () => {
    const lines = expandCombo(3, pieces);
    expect(lines[0].qty).toBe(3);
    expect(lines[1].qty).toBe(3);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd clients/projects/salon-os && npm test -- restauracion-menu`
Expected: FAIL (módulo no encontrado).

- [ ] **Step 3: Write the implementation**

Create `…/src/lib/restauracion/menu.ts`:

```ts
export interface SelectedModifier {
  priceDeltaCents: number;
}

export function effectiveUnitPriceCents(
  basePriceCents: number,
  mods: readonly SelectedModifier[],
): number {
  const delta = mods.reduce((sum, m) => sum + m.priceDeltaCents, 0);
  return Math.max(0, basePriceCents + delta);
}

export interface ComboPiece {
  componentProductId: string;
  qty: number;
  stationId: string | null;
  stationOverrideId: string | null;
}

export interface ExpandedLine {
  productId: string;
  qty: number;
  stationId: string | null;
  unitPriceCents: number;
}

export function expandCombo(comboQty: number, pieces: readonly ComboPiece[]): ExpandedLine[] {
  return pieces.map((p) => ({
    productId: p.componentProductId,
    qty: p.qty * comboQty,
    stationId: p.stationOverrideId ?? p.stationId,
    unitPriceCents: 0,
  }));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd clients/projects/salon-os && npm test -- restauracion-menu`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add clients/projects/salon-os/src/lib/restauracion/menu.ts \
        clients/projects/salon-os/src/tests/unit/restauracion-menu.test.ts
git commit -m "feat(restauracion): lógica pura de precio efectivo y expansión de combo"
```

---

## Task 5: Capa de queries + hooks de carta

**Files:**
- Create: `…/src/lib/queries/menu.ts`, `…/src/hooks/use-menu.ts`
- Test: `…/src/tests/unit/menu-keys.test.ts`

**Interfaces:**
- Consumes: `createClient` de `@/lib/supabase/client`; tipos `MenuCategory`, `Station`, `Product` de `@/types/database`; server actions de la Task 6 (referenciadas por nombre en los hooks de mutación — ver "Produces" de la Task 6).
- Produces:
  - `menuKeys` (fábrica de keys estilo `productKeys`): `all(salonId)`, `categories(salonId)`, `stations(salonId)`, `products(salonId)`, `modifierGroups(salonId)`.
  - `fetchMenuCategories(salonId)`, `fetchStations(salonId)`, `fetchMenuProducts(salonId)`.
  - Hooks de lectura: `useMenuCategories(salonId)`, `useStations(salonId)`, `useMenuProducts(salonId)`.

- [ ] **Step 1: Write the failing test** (keys estables)

Create `…/src/tests/unit/menu-keys.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { menuKeys } from "@/lib/queries/menu";

describe("menuKeys", () => {
  it("deriva las sub-keys del salón", () => {
    expect(menuKeys.all("s1")).toEqual(["menu", "s1"]);
    expect(menuKeys.categories("s1")).toEqual(["menu", "s1", "categories"]);
    expect(menuKeys.products("s1")).toEqual(["menu", "s1", "products"]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd clients/projects/salon-os && npm test -- menu-keys`
Expected: FAIL (módulo no encontrado).

- [ ] **Step 3: Write the queries layer**

Create `…/src/lib/queries/menu.ts`:

```ts
import { createClient } from "@/lib/supabase/client";
import type { MenuCategory, Product, Station } from "@/types/database";

export const menuKeys = {
  all: (salonId: string) => ["menu", salonId] as const,
  categories: (salonId: string) => [...menuKeys.all(salonId), "categories"] as const,
  stations: (salonId: string) => [...menuKeys.all(salonId), "stations"] as const,
  products: (salonId: string) => [...menuKeys.all(salonId), "products"] as const,
  modifierGroups: (salonId: string) => [...menuKeys.all(salonId), "modifierGroups"] as const,
};

export async function fetchMenuCategories(salonId: string): Promise<MenuCategory[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("menu_categories").select("*")
    .eq("salon_id", salonId).order("sort_order", { ascending: true });
  if (error !== null) throw new Error(error.message);
  return data;
}

export async function fetchStations(salonId: string): Promise<Station[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("stations").select("*")
    .eq("salon_id", salonId).order("sort_order", { ascending: true });
  if (error !== null) throw new Error(error.message);
  return data;
}

export async function fetchMenuProducts(salonId: string): Promise<Product[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("products").select("*")
    .eq("salon_id", salonId).order("name", { ascending: true });
  if (error !== null) throw new Error(error.message);
  return data;
}
```

- [ ] **Step 4: Write the read hooks**

Create `…/src/hooks/use-menu.ts`:

```ts
"use client";
import { useQuery } from "@tanstack/react-query";
import { fetchMenuCategories, fetchMenuProducts, fetchStations, menuKeys } from "@/lib/queries/menu";

export function useMenuCategories(salonId: string) {
  return useQuery({ queryKey: menuKeys.categories(salonId), queryFn: () => fetchMenuCategories(salonId) });
}
export function useStations(salonId: string) {
  return useQuery({ queryKey: menuKeys.stations(salonId), queryFn: () => fetchStations(salonId) });
}
export function useMenuProducts(salonId: string) {
  return useQuery({ queryKey: menuKeys.products(salonId), queryFn: () => fetchMenuProducts(salonId) });
}
```

- [ ] **Step 5: Run the test + typecheck**

Run: `cd clients/projects/salon-os && npm test -- menu-keys && npm run typecheck`
Expected: PASS + exit 0.

- [ ] **Step 6: Commit**

```bash
git add clients/projects/salon-os/src/lib/queries/menu.ts \
        clients/projects/salon-os/src/hooks/use-menu.ts \
        clients/projects/salon-os/src/tests/unit/menu-keys.test.ts
git commit -m "feat(restauracion): queries y hooks de lectura de carta"
```

---

## Task 6: Validaciones Zod + server actions de carta

**Files:**
- Create: `…/src/lib/validations/menu.ts`, `…/src/app/(dashboard)/carta/actions.ts`, `…/src/tests/helpers/supabase-mock.ts`
- Modify: `…/src/hooks/use-menu.ts` (añadir hooks de mutación), `…/src/tests/integration/tenant-isolation.test.ts` (importar el helper extraído)
- Test: `…/src/tests/integration/restauracion-carta-actions.test.ts`

**Interfaces:**
- Consumes: `getActiveSalonId`, `getActiveMembership`, `canManageSettings` de `@/lib/salon`; `createClient` de `@/lib/supabase/server`; `revalidatePath`; tipos de `@/types/database`.
- Produces (server actions, todas `Promise<ActionResult<T>>` con `ActionResult<T> = { ok: true; data: T } | { ok: false; error: string }`):
  - `createCategory(input)`, `updateCategory(id, input)`, `deleteCategory(id)`
  - `createStation(input)`, `updateStation(id, input)`, `deleteStation(id)`
  - `createMenuProduct(input)`, `updateMenuProduct(id, input)`, `deleteMenuProduct(id)`
  - `saveModifierGroup(input)`, `setProductModifierGroups(productId, groupIds)`, `saveCombo(comboProductId, pieces)`
- Produces (hooks de mutación en `use-menu.ts`): `useCreateCategory`, `useUpdateCategory`, `useDeleteCategory`, `useCreateStation`, `useSaveMenuProduct`, `useDeleteMenuProduct`, `useSaveModifierGroup`, `useSaveCombo`, `useSetProductModifierGroups` — desempaquetan `ActionResult` e invalidan `menuKeys.all(salonId)`.

- [ ] **Step 1: Extract the shared Supabase mock helper**

Copia el builder `makeSupabaseMock` (y sus tipos) desde `…/src/tests/integration/tenant-isolation.test.ts` (líneas ~84-137) a un módulo nuevo `…/src/tests/helpers/supabase-mock.ts` y expórtalo. Sustituye en `tenant-isolation.test.ts` la definición local por `import { makeSupabaseMock } from "@/tests/helpers/supabase-mock";`.
Run: `cd clients/projects/salon-os && npm test -- tenant-isolation`
Expected: PASS (sin cambios de comportamiento).

- [ ] **Step 2: Write the failing integration test**

Create `…/src/tests/integration/restauracion-carta-actions.test.ts`:

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
import { createCategory, createMenuProduct } from "@/app/(dashboard)/carta/actions";

beforeEach(() => { holder.membership = { salonId: "SALON", role: "owner" }; holder.supabase = null; });

describe("carta actions", () => {
  it("owner crea categoría", async () => {
    holder.supabase = makeSupabaseMock({
      onWrite: (op: string, table: string) =>
        op === "insert" && table === "menu_categories"
          ? { data: [{ id: "C1", salon_id: "SALON", name: "Bebidas", sort_order: 0, active: true }] }
          : {},
    });
    const r = await createCategory({ name: "Bebidas", sortOrder: 0 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.id).toBe("C1");
  });

  it("staff NO puede crear categoría (gate de rol)", async () => {
    holder.membership = { salonId: "SALON", role: "staff" };
    holder.supabase = makeSupabaseMock({});
    const r = await createCategory({ name: "Bebidas", sortOrder: 0 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("permiso");
  });

  it("rechaza precio negativo en producto (Zod)", async () => {
    holder.supabase = makeSupabaseMock({});
    const r = await createMenuProduct({
      name: "Café", priceCents: -1, vatRate: 10, categoryId: null, stationId: null,
      allergens: [], isCombo: false, imageUrl: null,
    });
    expect(r.ok).toBe(false);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd clients/projects/salon-os && npm test -- restauracion-carta-actions`
Expected: FAIL (actions no existen).

- [ ] **Step 4: Write the Zod schemas**

Create `…/src/lib/validations/menu.ts`:

```ts
import { z } from "zod";

const ALLERGENS = [
  "gluten","crustaceos","huevos","pescado","cacahuetes","soja","lacteos",
  "frutos_cascara","apio","mostaza","sesamo","sulfitos","altramuces","moluscos",
] as const;

export const categorySchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio").max(120),
  sortOrder: z.number().int().min(0).default(0),
});
export type CategoryInput = z.infer<typeof categorySchema>;

export const stationSchema = categorySchema; // misma forma
export type StationInput = z.infer<typeof stationSchema>;

export const menuProductSchema = z.object({
  name: z.string().trim().min(1).max(200),
  priceCents: z.number().int().min(0, "El precio no puede ser negativo"),
  vatRate: z.number().min(0).max(100).default(10),
  categoryId: z.string().uuid().nullable(),
  stationId: z.string().uuid().nullable(),
  allergens: z.array(z.enum(ALLERGENS)).default([]),
  isCombo: z.boolean().default(false),
  imageUrl: z.string().url().nullable().default(null),
});
export type MenuProductInput = z.infer<typeof menuProductSchema>;

export const modifierGroupSchema = z.object({
  name: z.string().trim().min(1).max(120),
  minSelect: z.number().int().min(0).default(0),
  maxSelect: z.number().int().min(1).default(1),
  required: z.boolean().default(false),
  modifiers: z.array(z.object({
    name: z.string().trim().min(1).max(120),
    priceDeltaCents: z.number().int().default(0),
  })).default([]),
}).refine((g) => g.minSelect <= g.maxSelect, { message: "min no puede superar a max", path: ["minSelect"] });
export type ModifierGroupInput = z.infer<typeof modifierGroupSchema>;
```

- [ ] **Step 5: Write the server actions**

Create `…/src/app/(dashboard)/carta/actions.ts`. Cabecera `"use server"`, `ActionResult<T>`, y para CADA escritura: gate de rol con `assertManager()`, `safeParse`, insert/update acotado por `salon_id`, `revalidatePath("/carta")`. Ejemplo representativo (categoría + producto); replica EXACTAMENTE el patrón para estación (`createStation`/`updateStation`/`deleteStation`), `updateCategory`/`deleteCategory`, `updateMenuProduct`/`deleteMenuProduct`, `saveModifierGroup`, `setProductModifierGroups`, `saveCombo`:

```ts
"use server";
import { revalidatePath } from "next/cache";
import { canManageSettings, getActiveMembership, getActiveSalonId } from "@/lib/salon";
import { createClient } from "@/lib/supabase/server";
import { categorySchema, menuProductSchema, type CategoryInput, type MenuProductInput } from "@/lib/validations/menu";
import type { MenuCategory, Product } from "@/types/database";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

async function assertManager(): Promise<string | null> {
  const membership = await getActiveMembership();
  if (!canManageSettings(membership?.role)) return null;
  return getActiveSalonId();
}

export async function createCategory(input: CategoryInput): Promise<ActionResult<MenuCategory>> {
  const parsed = categorySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  const salonId = await assertManager();
  if (salonId === null) return { ok: false, error: "No tienes permiso para gestionar la carta" };

  const supabase = createClient();
  const { data, error } = await supabase
    .from("menu_categories")
    .insert({ salon_id: salonId, name: parsed.data.name, sort_order: parsed.data.sortOrder })
    .select("*").single();
  if (error !== null) return { ok: false, error: error.message };
  revalidatePath("/carta");
  return { ok: true, data };
}

export async function createMenuProduct(input: MenuProductInput): Promise<ActionResult<Product>> {
  const parsed = menuProductSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  const salonId = await assertManager();
  if (salonId === null) return { ok: false, error: "No tienes permiso para gestionar la carta" };

  const supabase = createClient();
  const { data, error } = await supabase
    .from("products")
    .insert({
      salon_id: salonId, name: parsed.data.name, price_cents: parsed.data.priceCents,
      vat_rate: parsed.data.vatRate, category_id: parsed.data.categoryId,
      station_id: parsed.data.stationId, allergens: parsed.data.allergens,
      is_combo: parsed.data.isCombo, image_url: parsed.data.imageUrl,
    })
    .select("*").single();
  if (error !== null) return { ok: false, error: error.message };
  revalidatePath("/carta");
  return { ok: true, data };
}

// updateCategory/deleteCategory/createStation/updateStation/deleteStation/
// updateMenuProduct/deleteMenuProduct: mismo patrón — assertManager(), safeParse,
// escritura acotada con .eq("id", id).eq("salon_id", salonId).
//
// saveModifierGroup(input): inserta/actualiza el grupo y reemplaza sus `modifiers`.
// setProductModifierGroups(productId, groupIds): reemplaza filas de product_modifier_groups del producto.
// saveCombo(comboProductId, pieces): borra e inserta combo_components de ese combo (acotado por salon_id).
```

- [ ] **Step 6: Add mutation hooks**

En `…/src/hooks/use-menu.ts` añade los hooks de mutación (patrón `useCreateProduct` del módulo productos): desempaquetan `ActionResult` (`if (!result.ok) throw new Error(result.error)`) e invalidan `menuKeys.all(salonId)` en `onSuccess`. Mínimo: `useCreateCategory`, `useUpdateCategory`, `useDeleteCategory`, `useCreateStation`, `useSaveMenuProduct`, `useDeleteMenuProduct`, `useSaveModifierGroup`, `useSaveCombo`, `useSetProductModifierGroups`.

- [ ] **Step 7: Run tests + typecheck**

Run: `cd clients/projects/salon-os && npm test -- restauracion-carta-actions tenant-isolation && npm run typecheck`
Expected: PASS + exit 0.

- [ ] **Step 8: Commit**

```bash
git add clients/projects/salon-os/src/lib/validations/menu.ts \
        clients/projects/salon-os/src/app/\(dashboard\)/carta/actions.ts \
        clients/projects/salon-os/src/hooks/use-menu.ts \
        clients/projects/salon-os/src/tests/helpers/supabase-mock.ts \
        clients/projects/salon-os/src/tests/integration/restauracion-carta-actions.test.ts \
        clients/projects/salon-os/src/tests/integration/tenant-isolation.test.ts
git commit -m "feat(restauracion): server actions y validaciones de carta"
```

---

## Task 7: Importador CSV de carta

**Files:**
- Create: `…/src/lib/restauracion/csv-import.ts`
- Test: `…/src/tests/unit/restauracion-csv-import.test.ts`
- Modify: `…/src/app/(dashboard)/carta/actions.ts` (añadir `importMenuCsv`)

**Interfaces:**
- Produces:
  - `type ParsedMenuProduct = { name; categoryName; priceCents; vatRate; stationName; allergens: string[]; isCombo: boolean }`
  - `type ParsedMenu = { categories: string[]; stations: string[]; products: ParsedMenuProduct[]; errors: string[] }`
  - `parseMenuCsv(csv: string): ParsedMenu` — puro; formato de columnas fijas `categoria,producto,entero,decimales,iva,estacion,alergenos,es_combo`; convierte a céntimos, valida IVA ∈ {0,4,10,21}, alérgenos separados por `;`, recolecta errores por fila sin abortar.
  - Action `importMenuCsv(csv: string): Promise<ActionResult<{ created: number }>>`.

- [ ] **Step 1: Write the failing test** (validar contra filas estilo 100M)

Create `…/src/tests/unit/restauracion-csv-import.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseMenuCsv } from "@/lib/restauracion/csv-import";

const CSV = [
  "categoria,producto,entero,decimales,iva,estacion,alergenos,es_combo",
  "Montaditos,Montadito de lomo,1,50,10,Cocina,gluten;lacteos,no",
  "Bebidas,Caña,1,80,10,Barra,,no",
  "Combos,Combo desayuno,3,50,10,Cocina,gluten,si",
].join("\n");

describe("parseMenuCsv", () => {
  it("convierte euros (entero,decimales) a céntimos", () => {
    const r = parseMenuCsv(CSV);
    expect(r.products.find((p) => p.name === "Montadito de lomo")?.priceCents).toBe(150);
    expect(r.products.find((p) => p.name === "Caña")?.priceCents).toBe(180);
  });
  it("deduplica categorías y estaciones", () => {
    const r = parseMenuCsv(CSV);
    expect(r.categories.sort()).toEqual(["Bebidas", "Combos", "Montaditos"]);
    expect(r.stations.sort()).toEqual(["Barra", "Cocina"]);
  });
  it("separa alérgenos por ; y marca combos", () => {
    const r = parseMenuCsv(CSV);
    expect(r.products.find((p) => p.name === "Montadito de lomo")?.allergens).toEqual(["gluten", "lacteos"]);
    expect(r.products.find((p) => p.name === "Combo desayuno")?.isCombo).toBe(true);
  });
  it("recoge error de IVA inválido sin abortar", () => {
    const bad = "categoria,producto,entero,decimales,iva,estacion,alergenos,es_combo\nX,Y,1,00,7,Cocina,,no";
    const r = parseMenuCsv(bad);
    expect(r.errors.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd clients/projects/salon-os && npm test -- restauracion-csv-import`
Expected: FAIL (módulo no encontrado).

- [ ] **Step 3: Write the parser**

Create `…/src/lib/restauracion/csv-import.ts`:

```ts
export interface ParsedMenuProduct {
  name: string; categoryName: string; priceCents: number; vatRate: number;
  stationName: string; allergens: string[]; isCombo: boolean;
}
export interface ParsedMenu {
  categories: string[]; stations: string[]; products: ParsedMenuProduct[]; errors: string[];
}

const VALID_VAT = new Set([0, 4, 10, 21]);
const ALLERGENS = new Set([
  "gluten","crustaceos","huevos","pescado","cacahuetes","soja","lacteos",
  "frutos_cascara","apio","mostaza","sesamo","sulfitos","altramuces","moluscos",
]);

function eurosToCents(value: string): number | null {
  const norm = value.trim().replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(norm)) return null;
  return Math.round(Number.parseFloat(norm) * 100);
}

// Formato de columnas FIJAS: el precio va partido en entero/decimales para no chocar con la coma.
// categoria,producto,entero,decimales,iva,estacion,alergenos(;),es_combo
export function parseMenuCsv(csv: string): ParsedMenu {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const errors: string[] = [];
  const products: ParsedMenuProduct[] = [];
  const categories = new Set<string>();
  const stations = new Set<string>();
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",");
    if (cols.length < 8) { errors.push(`Fila ${i + 1}: faltan columnas`); continue; }
    const [categoria, producto, ent, dec, ivaRaw, estacion, alergenosRaw, comboRaw] = cols;
    const priceCents = eurosToCents(`${ent},${dec}`);
    const vatRate = Number.parseInt(ivaRaw, 10);
    if (priceCents === null) { errors.push(`Fila ${i + 1}: precio inválido`); continue; }
    if (!VALID_VAT.has(vatRate)) { errors.push(`Fila ${i + 1}: IVA inválido (${ivaRaw})`); continue; }
    const allergens = alergenosRaw.split(";").map((a) => a.trim()).filter((a) => a.length > 0);
    const bad = allergens.filter((a) => !ALLERGENS.has(a));
    if (bad.length > 0) errors.push(`Fila ${i + 1}: alérgeno desconocido (${bad.join(", ")})`);
    categories.add(categoria.trim());
    stations.add(estacion.trim());
    products.push({
      name: producto.trim(), categoryName: categoria.trim(), priceCents, vatRate,
      stationName: estacion.trim(), allergens: allergens.filter((a) => ALLERGENS.has(a)),
      isCombo: comboRaw.trim().toLowerCase() === "si",
    });
  }
  return { categories: [...categories], stations: [...stations], products, errors };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd clients/projects/salon-os && npm test -- restauracion-csv-import`
Expected: PASS (4 tests).

- [ ] **Step 5: Add the import action**

En `…/src/app/(dashboard)/carta/actions.ts` añade `importMenuCsv(csv: string): Promise<ActionResult<{ created: number }>>`: `assertManager()`, `parseMenuCsv`, crea las categorías/estaciones/productos que no existan (mapeando `categoryName`/`stationName` a sus `id` tras crearlos), devuelve el recuento. Si `parsed.errors.length > 0`, inclúyelos en el mensaje pero procesa las filas válidas. `revalidatePath("/carta")`.

- [ ] **Step 6: Commit**

```bash
git add clients/projects/salon-os/src/lib/restauracion/csv-import.ts \
        clients/projects/salon-os/src/tests/unit/restauracion-csv-import.test.ts \
        clients/projects/salon-os/src/app/\(dashboard\)/carta/actions.ts
git commit -m "feat(restauracion): importador CSV de carta"
```

---

## Task 8: Backoffice UI de la carta (`/carta`)

**Files:**
- Create: `…/src/app/(dashboard)/carta/{layout.tsx,page.tsx,carta-view.tsx,category-form.tsx,menu-item-form.tsx,modifier-group-form.tsx,csv-import-dialog.tsx}`
- Test: `…/src/tests/unit/menu-item-form.test.tsx`

**Interfaces:**
- Consumes: hooks de `@/hooks/use-menu`; `getActiveSalonId`/`getActiveMembership`/`canManageSettings`; `SectorGate`.
- Produces: la ruta `/carta` protegida por sector (`SectorGate required="restauracion"`) y por rol (redirige si no es owner/manager), con pestañas Categorías · Productos · Modificadores · Combos e importador CSV.

- [ ] **Step 1: Write the failing component test** (patrón: mock del hook con `vi.hoisted`)

Create `…/src/tests/unit/menu-item-form.test.tsx`:

```ts
import { createElement } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  save: { mutate: vi.fn(), isPending: false, isError: false, error: null as Error | null },
  categories: { data: [{ id: "C1", name: "Bebidas" }], isPending: false },
  stations: { data: [{ id: "S1", name: "Barra" }], isPending: false },
}));
vi.mock("@/hooks/use-menu", () => ({
  useSaveMenuProduct: () => m.save,
  useMenuCategories: () => m.categories,
  useStations: () => m.stations,
}));
import { MenuItemForm } from "@/app/(dashboard)/carta/menu-item-form";

beforeEach(() => { m.save.mutate = vi.fn(); });
afterEach(() => cleanup());

describe("MenuItemForm", () => {
  it("no envía si el nombre está vacío y sí envía un producto válido", async () => {
    const user = userEvent.setup();
    render(createElement(MenuItemForm, { salonId: "SALON" }));
    await user.type(screen.getByRole("textbox", { name: /nombre/i }), "Caña");
    await user.type(screen.getByRole("spinbutton", { name: /precio/i }), "1.80");
    await user.click(screen.getByRole("button", { name: /guardar/i }));
    expect(m.save.mutate).toHaveBeenCalledTimes(1);
    expect(m.save.mutate.mock.calls[0][0]).toMatchObject({ name: "Caña", priceCents: 180 });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd clients/projects/salon-os && npm test -- menu-item-form`
Expected: FAIL (componente no existe).

- [ ] **Step 3: Write `layout.tsx` (guard de sector + rol)**

Create `…/src/app/(dashboard)/carta/layout.tsx`:

```tsx
import { redirect } from "next/navigation";
import { SectorGate } from "@/components/guards/sector-gate";
import { canManageSettings, getActiveMembership } from "@/lib/salon";

export default async function CartaLayout({ children }: { children: React.ReactNode }): Promise<React.ReactElement> {
  const membership = await getActiveMembership();
  if (!canManageSettings(membership?.role)) redirect("/dashboard");
  return <SectorGate required="restauracion">{children}</SectorGate>;
}
```

- [ ] **Step 4: Write `page.tsx` + `carta-view.tsx` + forms**

`page.tsx` (server): resuelve `salonId` (patrón de `products/page.tsx`) y renderiza `<CartaView salonId={salonId} />`.
`carta-view.tsx` (`"use client"`): pestañas (shadcn `Tabs`) Categorías/Productos/Modificadores/Combos + botón "Importar CSV" que abre `CsvImportDialog`. Cada pestaña lista con su hook (`useMenuCategories`, `useMenuProducts`, …) y abre el form correspondiente.
`menu-item-form.tsx`: campos nombre (`textbox` name=/nombre/i), precio en € (`spinbutton` name=/precio/i; se convierte a céntimos con `Math.round(Number(value.replace(",", ".")) * 100)`), IVA (select 10/21/4/0), categoría (select de `useMenuCategories`), estación (select de `useStations`), alérgenos (checkboxes de los 14), interruptor "es combo", botón Guardar (`name=/guardar/i`) que llama `useSaveMenuProduct().mutate(payload, { onSuccess })`.
`category-form.tsx`, `modifier-group-form.tsx` (lista dinámica de opciones + min/max + required), `csv-import-dialog.tsx` (textarea + `importMenuCsv`) siguen el patrón de forms de Kairos (`src/app/(dashboard)/ajustes/marca/salon-marca-form.tsx` como referencia de estilo/localización por rol accesible).

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd clients/projects/salon-os && npm test -- menu-item-form && npm run typecheck`
Expected: PASS + exit 0.

- [ ] **Step 6: Commit**

```bash
git add clients/projects/salon-os/src/app/\(dashboard\)/carta/ \
        clients/projects/salon-os/src/tests/unit/menu-item-form.test.tsx
git commit -m "feat(restauracion): backoffice de carta (/carta) con importador CSV"
```

---

## Task 9: Activar el sector restauración en la navegación

**Files:**
- Modify: `…/src/lib/sector/registry.ts`, `…/src/components/dashboard-nav-items.ts`
- Test: `…/src/tests/unit/dashboard-nav-items.test.ts` (ampliar el existente)

**Interfaces:**
- Consumes: `SECTOR_REGISTRY`, `buildDashboardNavItems`.
- Produces: con `sector: "restauracion"` la nav deja de mostrar "Próximamente" y muestra el item **Carta** (`/carta`) para owner/manager.

- [ ] **Step 1: Write the failing nav test**

Añade a `…/src/tests/unit/dashboard-nav-items.test.ts`:

```ts
it("restauración: owner ve el item Carta y NO 'Próximamente'", () => {
  const items = buildDashboardNavItems({ showSettings: true, hasPos: true, sector: "restauracion" });
  const hrefs = items.map((i) => i.href);
  expect(hrefs).toContain("/carta");
  expect(hrefs).not.toContain("/proximamente");
});
it("restauración: staff (sin settings) no cae en 'Próximamente'", () => {
  const items = buildDashboardNavItems({ showSettings: false, hasPos: false, sector: "restauracion" });
  expect(items.map((i) => i.href)).not.toContain("/proximamente");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd clients/projects/salon-os && npm test -- dashboard-nav-items`
Expected: FAIL (hoy `restauracion.implemented === false` → devuelve "Próximamente").

- [ ] **Step 3: Activate the sector**

En `…/src/lib/sector/registry.ts`, en la entrada `restauracion`, cambia `implemented: false` → `implemented: true`.

- [ ] **Step 4: Add the Carta nav item for restauración**

En `…/src/components/dashboard-nav-items.ts`:
1. Importa un icono de `lucide-react` (p.ej. `UtensilsCrossed`) en el bloque de imports.
2. Declara la constante: `export const CARTA_ITEM: NavItem = { href: "/carta", label: "Carta", icon: UtensilsCrossed };`.
3. En `buildDashboardNavItems`, añade la rama de sector justo antes del `return withSectorLabels` genérico:

```ts
if (sector === "restauracion") {
  // "Carta" es gestión (owner/manager): solo si showSettings.
  return showSettings
    ? [...withSectorLabels.slice(0, 1), CARTA_ITEM, ...withSectorLabels.slice(1)]
    : withSectorLabels;
}
```

- [ ] **Step 5: Run the test + full suite + typecheck**

Run: `cd clients/projects/salon-os && npm test && npm run typecheck`
Expected: toda la suite verde + exit 0. (Verifica que no rompes los tests de nav de peluquería/odontología.)

- [ ] **Step 6: Commit**

```bash
git add clients/projects/salon-os/src/lib/sector/registry.ts \
        clients/projects/salon-os/src/components/dashboard-nav-items.ts \
        clients/projects/salon-os/src/tests/unit/dashboard-nav-items.test.ts
git commit -m "feat(restauracion): activar sector y navegación de carta"
```

---

## Criterios de aceptación (Puerta de control Plan A)

- [ ] `npm test` y `npm run typecheck` verdes.
- [ ] Las 3 migraciones aplicadas en `jztoyekixcziaicrnlce` (cada `run()` devolvió `(201, [])`, guardianes con `raise notice`, sin excepción).
- [ ] Un usuario owner de un salón con `sector = restauracion` entra en `/carta`, crea categorías/estaciones, da de alta un producto con IVA/alérgenos/estación, define un grupo de modificadores y un combo con ruteo por pieza.
- [ ] Se importa por CSV una porción de la carta de 100M (montaditos + bebidas + un combo) y las filas válidas quedan creadas; los errores de fila se informan sin abortar.
- [ ] Un usuario `staff` no ve el item "Carta" y `/carta` le redirige a `/dashboard`.
- [ ] El sector restauración ya no muestra "Próximamente".

---

## Planes siguientes (contexto, no alcance de este plan)

- **Plan B — Venta de mostrador:** migración `orders`/`order_items` (append-only, UUID cliente, idempotencia) + `alter table pos_sales add column order_id` (FK compuesta) + RPCs `create_order`/`send_order_to_stations`/`settle_order` (SECURITY DEFINER, `search_path=''`, gate por rol, tests sql-coherence) + rejilla táctil `/mostrador` + dos flujos (pagar-primero / cuenta abierta) + comanda impresa (reusar `buildTicketDocumentHtml`) + CHECK `unit_price_cents >= 0`.
- **Plan C — KDS:** pantalla `/cocina` por estación + hook Realtime (patrón `useDayPanelRealtime`) + `alter publication supabase_realtime add table public.order_items` (sin precedente en el repo — crear en migración) + transiciones de estado concurrentes-seguras.
