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

