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

