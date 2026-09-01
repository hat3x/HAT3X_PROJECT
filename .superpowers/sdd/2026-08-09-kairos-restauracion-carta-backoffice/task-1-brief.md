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

