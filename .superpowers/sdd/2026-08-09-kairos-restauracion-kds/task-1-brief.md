## Task 1: Migración — order_items a la publicación Realtime

**Files:**
- Create: `…/supabase/migrations/20260810120000_realtime_order_items.sql`
- Test: `…/src/tests/unit/realtime-order-items-sql.test.ts`

**Interfaces:**
- Consumes: `public.order_items` (Plan B), publicación `supabase_realtime`.
- Produces: `order_items` presente en `supabase_realtime` → los cambios emiten a los clientes suscritos.

- [ ] **Step 1: Write the failing sql-coherence test**

Create `…/src/tests/unit/realtime-order-items-sql.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

const SQL = readFileSync(
  join(process.cwd(), "supabase", "migrations", "20260810120000_realtime_order_items.sql"),
  "utf8",
).toLowerCase();

describe("migración realtime order_items", () => {
  it("añade order_items a la publicación supabase_realtime de forma idempotente", () => {
    expect(SQL).toContain("alter publication supabase_realtime add table public.order_items");
    expect(SQL).toContain("pg_publication_tables");
    expect(SQL).toContain("'order_items'");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd clients/projects/salon-os && npm test -- realtime-order-items-sql`
Expected: FAIL (ENOENT).

- [ ] **Step 3: Write the migration**

Create `…/supabase/migrations/20260810120000_realtime_order_items.sql`:

```sql
-- =============================================================================
-- Kairos — Restauración · Realtime para order_items (KDS)
-- La publicación supabase_realtime debe incluir order_items o el KDS no refresca.
-- Idempotente: no falla si la tabla ya está publicada.
-- =============================================================================
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'order_items'
  ) then
    alter publication supabase_realtime add table public.order_items;
  end if;
end $$;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd clients/projects/salon-os && npm test -- realtime-order-items-sql`
Expected: PASS.

- [ ] **Step 5: Apply the migration**

Aplica por Management API (heredoc del bloque "Global Constraints"; debe imprimir `(201, [])`). Verifica (opcional) con `select * from pg_publication_tables where pubname='supabase_realtime' and tablename='order_items'` → 1 fila.

- [ ] **Step 6: Commit**

```bash
git add clients/projects/salon-os/supabase/migrations/20260810120000_realtime_order_items.sql \
        clients/projects/salon-os/src/tests/unit/realtime-order-items-sql.test.ts
git commit -m "feat(restauracion): order_items en la publicación Realtime (KDS)"
```

---

