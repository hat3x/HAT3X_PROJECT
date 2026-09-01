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

