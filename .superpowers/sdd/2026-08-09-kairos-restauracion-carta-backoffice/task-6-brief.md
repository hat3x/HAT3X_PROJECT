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

