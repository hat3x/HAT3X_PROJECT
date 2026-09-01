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

