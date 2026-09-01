## Task 5: Sector-aware nav items

**Files:**
- Modify: `src/components/dashboard-nav-items.ts`
- Test: `src/tests/unit/dashboard-nav-items-sector.test.ts`

**Interfaces:**
- Consumes: existing `buildDashboardNavItems({ showSettings, hasPos })`, `SECTOR_REGISTRY`, `SalonSector`, existing `NavItem`/`SETTINGS_ITEM`.
- Produces: `buildDashboardNavItems({ showSettings, hasPos, sector? })` (default `sector="peluqueria"`). odontologia relabels the `/customers` item to `terms.customerPlural`; a non-implemented sector returns `[Panel, {href:"/proximamente", label:"Próximamente"}, SETTINGS_ITEM?]`. Peluquería output is byte-identical to today.

- [ ] **Step 1: Read the module**

Read `src/components/dashboard-nav-items.ts`: `NavItem` shape, `PRIMARY_NAV_ITEMS`, `SETTINGS_ITEM`, the `/customers` item, current icon imports, and `buildDashboardNavItems` signature.

- [ ] **Step 2: Write the failing test**

Create `src/tests/unit/dashboard-nav-items-sector.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { buildDashboardNavItems } from "@/components/dashboard-nav-items";

describe("buildDashboardNavItems — por sector", () => {
  it("peluqueria: 'Clientes' sin cambios", () => {
    const items = buildDashboardNavItems({ showSettings: true, hasPos: true, sector: "peluqueria" });
    expect(items.some((i) => i.label === "Clientes")).toBe(true);
    expect(items.some((i) => i.label === "Pacientes")).toBe(false);
  });
  it("odontologia: 'Clientes' → 'Pacientes'", () => {
    const items = buildDashboardNavItems({ showSettings: true, hasPos: true, sector: "odontologia" });
    expect(items.some((i) => i.label === "Pacientes")).toBe(true);
    expect(items.some((i) => i.label === "Clientes")).toBe(false);
  });
  it("restauracion (cascaron): item 'Próximamente'", () => {
    const items = buildDashboardNavItems({ showSettings: true, hasPos: true, sector: "restauracion" });
    expect(items.some((i) => i.label === "Próximamente")).toBe(true);
    expect(items.some((i) => i.href === "/proximamente")).toBe(true);
  });
  it("sin sector = peluqueria", () => {
    const items = buildDashboardNavItems({ showSettings: true, hasPos: true });
    expect(items.some((i) => i.label === "Clientes")).toBe(true);
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run src/tests/unit/dashboard-nav-items-sector.test.ts`
Expected: FAIL.

- [ ] **Step 4: Extend `buildDashboardNavItems`**

Import `Clock` from `lucide-react`, `SECTOR_REGISTRY` from `@/lib/sector/registry`, `SalonSector` from `@/types/database`. Change the param type to `{ showSettings: boolean; hasPos: boolean; sector?: SalonSector }` with `sector = "peluqueria"` default. Keep the existing list building. Then, before returning:
```ts
const config = SECTOR_REGISTRY[sector];
if (!config.implemented) {
  const panel = items[0]; // the "Panel" item (first) — keep it
  return [
    panel,
    { href: "/proximamente", label: "Próximamente", icon: Clock },
    ...(showSettings ? [SETTINGS_ITEM] : []),
  ];
}
if (sector === "peluqueria") return items; // byte-identical
return items.map((item) =>
  item.href === "/customers"
    ? { ...item, label: config.terms.customerPlural }
    : item,
);
```
(Adjust `panel` selection to the actual "Panel" item if it isn't index 0.)

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run src/tests/unit/dashboard-nav-items-sector.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add clients/projects/salon-os/src/components/dashboard-nav-items.ts clients/projects/salon-os/src/tests/unit/dashboard-nav-items-sector.test.ts
git commit -m "feat(salon-os): sector-aware dashboard nav (relabel + shell)"
```

---

