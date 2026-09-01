## Task 2: Lógica pura del KDS (agrupar + cronómetro)

**Files:**
- Create: `…/src/lib/restauracion/kds.ts`
- Test: `…/src/tests/unit/restauracion-kds.test.ts`

**Interfaces:**
- Produces:
  - `interface KdsItem { id: string; orderId: string; orderNumber: number; orderLabel: string | null; stationId: string | null; stationName: string | null; productName: string; qty: number; status: string; modifiers: string[]; createdAt: string; }`
  - `interface KdsOrderGroup { orderId: string; orderNumber: number; orderLabel: string | null; createdAt: string; items: KdsItem[]; }`
  - `groupKdsItemsByOrder(items: readonly KdsItem[]): KdsOrderGroup[]` — agrupa por `orderId`, ordena los grupos por `createdAt` ascendente (más antiguo primero); dentro de cada grupo, los ítems en su orden de llegada.
  - `elapsedMinutes(createdAtIso: string, now: Date): number` — minutos enteros transcurridos (>= 0) entre `createdAt` y `now`.

- [ ] **Step 1: Write the failing test**

Create `…/src/tests/unit/restauracion-kds.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { elapsedMinutes, groupKdsItemsByOrder, type KdsItem } from "@/lib/restauracion/kds";

function item(over: Partial<KdsItem>): KdsItem {
  return {
    id: "i", orderId: "o", orderNumber: 1, orderLabel: null, stationId: "s", stationName: "Cocina",
    productName: "X", qty: 1, status: "enviado", modifiers: [], createdAt: "2026-08-10T12:00:00Z", ...over,
  };
}

describe("groupKdsItemsByOrder", () => {
  it("agrupa por pedido y ordena los grupos por createdAt ascendente", () => {
    const groups = groupKdsItemsByOrder([
      item({ id: "a", orderId: "o2", orderNumber: 2, createdAt: "2026-08-10T12:05:00Z" }),
      item({ id: "b", orderId: "o1", orderNumber: 1, createdAt: "2026-08-10T12:00:00Z" }),
      item({ id: "c", orderId: "o1", orderNumber: 1, createdAt: "2026-08-10T12:00:00Z" }),
    ]);
    expect(groups.map((g) => g.orderId)).toEqual(["o1", "o2"]);
    expect(groups[0]!.items.map((i) => i.id)).toEqual(["b", "c"]);
  });
});

describe("elapsedMinutes", () => {
  it("cuenta minutos enteros transcurridos, nunca negativo", () => {
    expect(elapsedMinutes("2026-08-10T12:00:00Z", new Date("2026-08-10T12:07:30Z"))).toBe(7);
    expect(elapsedMinutes("2026-08-10T12:00:00Z", new Date("2026-08-10T11:59:00Z"))).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails.** `npm test -- restauracion-kds` → FAIL.

- [ ] **Step 3: Write the implementation**

Create `…/src/lib/restauracion/kds.ts`:

```ts
export interface KdsItem {
  id: string;
  orderId: string;
  orderNumber: number;
  orderLabel: string | null;
  stationId: string | null;
  stationName: string | null;
  productName: string;
  qty: number;
  status: string;
  modifiers: string[];
  createdAt: string;
}

export interface KdsOrderGroup {
  orderId: string;
  orderNumber: number;
  orderLabel: string | null;
  createdAt: string;
  items: KdsItem[];
}

export function groupKdsItemsByOrder(items: readonly KdsItem[]): KdsOrderGroup[] {
  const byOrder = new Map<string, KdsOrderGroup>();
  for (const it of items) {
    const existing = byOrder.get(it.orderId);
    if (existing === undefined) {
      byOrder.set(it.orderId, {
        orderId: it.orderId, orderNumber: it.orderNumber, orderLabel: it.orderLabel,
        createdAt: it.createdAt, items: [it],
      });
    } else {
      existing.items.push(it);
    }
  }
  return [...byOrder.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function elapsedMinutes(createdAtIso: string, now: Date): number {
  const ms = now.getTime() - new Date(createdAtIso).getTime();
  return Math.max(0, Math.floor(ms / 60000));
}
```

- [ ] **Step 4: Run to verify it passes.** `npm test -- restauracion-kds` → PASS.

- [ ] **Step 5: Commit**

```bash
git add clients/projects/salon-os/src/lib/restauracion/kds.ts \
        clients/projects/salon-os/src/tests/unit/restauracion-kds.test.ts
git commit -m "feat(restauracion): lógica pura del KDS (agrupar por pedido + cronómetro)"
```

---

