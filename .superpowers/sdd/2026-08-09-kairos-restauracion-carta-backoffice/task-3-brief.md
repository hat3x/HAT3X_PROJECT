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

