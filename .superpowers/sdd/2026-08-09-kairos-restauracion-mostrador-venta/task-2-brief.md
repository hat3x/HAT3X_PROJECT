## Task 2: Lógica pura de pedido (drafts de ítems + líneas de cobro)

**Files:**
- Create: `…/src/lib/restauracion/order.ts`
- Test: `…/src/tests/unit/restauracion-order.test.ts`

**Interfaces:**
- Consumes: `effectiveUnitPriceCents`, `expandCombo`, `type ComboPiece` de `@/lib/restauracion/menu`; `computeSaleTotals`, `type SaleTotals` de `@/lib/payments`.
- Produces:
  - `interface MenuSelection { productId; name; basePriceCents; vatRate; stationId: string|null; isCombo: boolean; qty: number; modifiers: Array<{ name: string; priceDeltaCents: number }>; comboPieces: ComboPiece[]; }`
  - `interface OrderItemDraft { id: string; productId: string; qty: number; unitPriceCents: number; vatRate: number; stationId: string|null; comboGroup: string|null; modifiersSnapshot: Array<{ name: string; priceDeltaCents: number }>; }`
  - `buildOrderItemDrafts(sel: MenuSelection, newId: () => string): OrderItemDraft[]` — producto normal → 1 draft con `unitPriceCents = effectiveUnitPriceCents(base, modifiers)`; combo → draft "cabecera" con el precio del combo + un draft por pieza (`unitPriceCents: 0`, `comboGroup` compartido, estación de la pieza vía `expandCombo`).
  - `interface SettleLineInput { description: string; qty: number; unitPriceCents: number; vatRate: number; }`
  - `buildSettleLines(items): SettleLineInput[]` — descripción = nombre + modificadores; una línea por ítem no anulado.
  - `settleTotals(lines: SettleLineInput[]): SaleTotals` — envuelve `computeSaleTotals`.

- [ ] **Step 1: Write the failing test**

Create `…/src/tests/unit/restauracion-order.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildOrderItemDrafts, buildSettleLines, settleTotals } from "@/lib/restauracion/order";

let n = 0;
const newId = () => `id-${++n}`;

describe("buildOrderItemDrafts", () => {
  it("producto simple con modificadores → 1 draft con precio efectivo", () => {
    n = 0;
    const drafts = buildOrderItemDrafts({
      productId: "p1", name: "Hamburguesa", basePriceCents: 800, vatRate: 10,
      stationId: "cocina", isCombo: false, qty: 2,
      modifiers: [{ name: "Extra bacon", priceDeltaCents: 80 }], comboPieces: [],
    }, newId);
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({ productId: "p1", qty: 2, unitPriceCents: 880, stationId: "cocina", comboGroup: null });
  });

  it("combo → cabecera con precio + piezas a 0 con su estación y comboGroup común", () => {
    n = 0;
    const drafts = buildOrderItemDrafts({
      productId: "combo1", name: "Menú", basePriceCents: 1000, vatRate: 10,
      stationId: "cocina", isCombo: true, qty: 1, modifiers: [],
      comboPieces: [
        { componentProductId: "food", qty: 1, stationId: "cocina", stationOverrideId: null },
        { componentProductId: "drink", qty: 1, stationId: "cocina", stationOverrideId: "barra" },
      ],
    }, newId);
    expect(drafts).toHaveLength(3);
    expect(drafts[0].unitPriceCents).toBe(1000);
    const group = drafts[0].comboGroup;
    expect(group).not.toBeNull();
    expect(drafts.every((d) => d.comboGroup === group)).toBe(true);
    expect(drafts[1].unitPriceCents).toBe(0);
    expect(drafts[2].stationId).toBe("barra");
  });
});

describe("buildSettleLines + settleTotals", () => {
  it("una línea por ítem con nombre+modificadores; base+IVA==bruto", () => {
    const lines = buildSettleLines([
      { productName: "Hamburguesa", qty: 2, unitPriceCents: 880, vatRate: 10,
        modifiersSnapshot: [{ name: "Extra bacon" }] },
    ]);
    expect(lines[0].description).toContain("Hamburguesa");
    expect(lines[0].description).toContain("Extra bacon");
    const totals = settleTotals(lines);
    expect(totals.subtotalCents + totals.taxCents).toBe(totals.totalCents);
    expect(totals.totalCents).toBe(1760);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd clients/projects/salon-os && npm test -- restauracion-order`
Expected: FAIL (módulo no encontrado).

- [ ] **Step 3: Write the implementation**

Create `…/src/lib/restauracion/order.ts`:

```ts
import { computeSaleTotals, type SaleTotals } from "@/lib/payments";
import { effectiveUnitPriceCents, expandCombo, type ComboPiece } from "@/lib/restauracion/menu";

export interface MenuSelection {
  productId: string;
  name: string;
  basePriceCents: number;
  vatRate: number;
  stationId: string | null;
  isCombo: boolean;
  qty: number;
  modifiers: Array<{ name: string; priceDeltaCents: number }>;
  comboPieces: ComboPiece[];
}

export interface OrderItemDraft {
  id: string;
  productId: string;
  qty: number;
  unitPriceCents: number;
  vatRate: number;
  stationId: string | null;
  comboGroup: string | null;
  modifiersSnapshot: Array<{ name: string; priceDeltaCents: number }>;
}

export function buildOrderItemDrafts(sel: MenuSelection, newId: () => string): OrderItemDraft[] {
  const headPrice = effectiveUnitPriceCents(sel.basePriceCents, sel.modifiers);
  if (!sel.isCombo || sel.comboPieces.length === 0) {
    return [{
      id: newId(), productId: sel.productId, qty: sel.qty, unitPriceCents: headPrice,
      vatRate: sel.vatRate, stationId: sel.stationId, comboGroup: null, modifiersSnapshot: sel.modifiers,
    }];
  }
  const comboGroup = newId();
  const head: OrderItemDraft = {
    id: newId(), productId: sel.productId, qty: sel.qty, unitPriceCents: headPrice,
    vatRate: sel.vatRate, stationId: sel.stationId, comboGroup, modifiersSnapshot: sel.modifiers,
  };
  const pieces = expandCombo(sel.qty, sel.comboPieces).map((line): OrderItemDraft => ({
    id: newId(), productId: line.productId, qty: line.qty, unitPriceCents: 0,
    vatRate: sel.vatRate, stationId: line.stationId, comboGroup, modifiersSnapshot: [],
  }));
  return [head, ...pieces];
}

export interface SettleLineInput {
  description: string;
  qty: number;
  unitPriceCents: number;
  vatRate: number;
}

export function buildSettleLines(
  items: Array<{ productName: string; qty: number; unitPriceCents: number; vatRate: number;
                 modifiersSnapshot: Array<{ name: string }> }>,
): SettleLineInput[] {
  return items.map((it) => {
    const mods = it.modifiersSnapshot.map((m) => m.name).join(", ");
    return {
      description: mods.length > 0 ? `${it.productName} (${mods})` : it.productName,
      qty: it.qty, unitPriceCents: it.unitPriceCents, vatRate: it.vatRate,
    };
  });
}

export function settleTotals(lines: SettleLineInput[]): SaleTotals {
  return computeSaleTotals(lines.map((l) => ({
    quantity: l.qty, unitPriceCents: l.unitPriceCents, vatRate: l.vatRate,
  })));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd clients/projects/salon-os && npm test -- restauracion-order`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add clients/projects/salon-os/src/lib/restauracion/order.ts \
        clients/projects/salon-os/src/tests/unit/restauracion-order.test.ts
git commit -m "feat(restauracion): lógica pura de pedido (drafts de ítems + líneas de cobro)"
```

---

