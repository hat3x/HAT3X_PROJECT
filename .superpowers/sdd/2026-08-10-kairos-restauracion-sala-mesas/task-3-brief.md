## Task 3: Lógica pura de sala (transiciones + validaciones)

**Files:**
- Create: `…/src/lib/restauracion/tables.ts`
- Test: `…/src/tests/unit/restauracion-tables.test.ts`

**Interfaces:**
- Produces:
  - `type TableStatusValue = "libre" | "ocupada" | "cuenta_pedida" | "por_limpiar"`
  - `canTransition(from: TableStatusValue, to: TableStatusValue): boolean` — válidas: `libre→ocupada`, `ocupada→cuenta_pedida`, `ocupada→por_limpiar`, `cuenta_pedida→por_limpiar`, `por_limpiar→libre`. Todo lo demás false.
  - `validCapacity(min: number, max: number): boolean` — `min >= 1 && max >= min`.
  - `clampPosition(v: number): number` — acota a `[0, 100]`.
  - `tableTone(status: TableStatusValue): "free" | "busy" | "bill" | "cleaning"` — mapa de color.

- [ ] **Step 1: Write the failing test**

Create `…/src/tests/unit/restauracion-tables.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { canTransition, clampPosition, tableTone, validCapacity } from "@/lib/restauracion/tables";

describe("canTransition", () => {
  it("acepta las transiciones válidas del ciclo de mesa", () => {
    expect(canTransition("libre", "ocupada")).toBe(true);
    expect(canTransition("ocupada", "cuenta_pedida")).toBe(true);
    expect(canTransition("ocupada", "por_limpiar")).toBe(true);
    expect(canTransition("cuenta_pedida", "por_limpiar")).toBe(true);
    expect(canTransition("por_limpiar", "libre")).toBe(true);
  });
  it("rechaza saltos inválidos", () => {
    expect(canTransition("libre", "por_limpiar")).toBe(false);
    expect(canTransition("por_limpiar", "ocupada")).toBe(false);
    expect(canTransition("ocupada", "libre")).toBe(false);
  });
});

describe("validCapacity / clampPosition / tableTone", () => {
  it("capacidad válida", () => {
    expect(validCapacity(2, 4)).toBe(true);
    expect(validCapacity(0, 4)).toBe(false);
    expect(validCapacity(4, 2)).toBe(false);
  });
  it("acota posición a 0..100", () => {
    expect(clampPosition(-5)).toBe(0);
    expect(clampPosition(140)).toBe(100);
    expect(clampPosition(37.5)).toBe(37.5);
  });
  it("color por estado", () => {
    expect(tableTone("libre")).toBe("free");
    expect(tableTone("ocupada")).toBe("busy");
    expect(tableTone("cuenta_pedida")).toBe("bill");
    expect(tableTone("por_limpiar")).toBe("cleaning");
  });
});
```

- [ ] **Step 2: Run to verify it fails.** `npm test -- restauracion-tables` → FAIL.

- [ ] **Step 3: Write the implementation**

Create `…/src/lib/restauracion/tables.ts`:

```ts
export type TableStatusValue = "libre" | "ocupada" | "cuenta_pedida" | "por_limpiar";

const TRANSITIONS: Record<TableStatusValue, readonly TableStatusValue[]> = {
  libre: ["ocupada"],
  ocupada: ["cuenta_pedida", "por_limpiar"],
  cuenta_pedida: ["por_limpiar"],
  por_limpiar: ["libre"],
};

export function canTransition(from: TableStatusValue, to: TableStatusValue): boolean {
  return TRANSITIONS[from].includes(to);
}

export function validCapacity(min: number, max: number): boolean {
  return Number.isInteger(min) && Number.isInteger(max) && min >= 1 && max >= min;
}

export function clampPosition(v: number): number {
  return Math.min(100, Math.max(0, v));
}

export function tableTone(status: TableStatusValue): "free" | "busy" | "bill" | "cleaning" {
  switch (status) {
    case "libre": return "free";
    case "ocupada": return "busy";
    case "cuenta_pedida": return "bill";
    case "por_limpiar": return "cleaning";
  }
}
```

- [ ] **Step 4: Run to verify it passes.** `npm test -- restauracion-tables` → PASS.

- [ ] **Step 5: Commit**

```bash
git add clients/projects/salon-os/src/lib/restauracion/tables.ts \
        clients/projects/salon-os/src/tests/unit/restauracion-tables.test.ts
git commit -m "feat(restauracion): lógica pura de sala (transiciones + validaciones de mesa)"
```

---

