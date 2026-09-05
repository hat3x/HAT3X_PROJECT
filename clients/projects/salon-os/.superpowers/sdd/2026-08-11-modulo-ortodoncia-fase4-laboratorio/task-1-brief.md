### Task 1: Lógica pura (estado de pedido + progreso de alineadores) + tipo alignerTotal

**Files:**
- Create: `src/lib/dental/lab-orders.ts`
- Modify: `src/lib/dental/ortho.ts` (añadir `alignerTotal` a `OrthoTreatment` y a `EMPTY_ORTHO_TREATMENT`)
- Modify: `src/lib/dental/index.ts` (`export * from "./lab-orders";` — si existe el barrel; si no, omitir este archivo)
- Test: `src/tests/unit/lab-orders-logic.test.ts`

**Interfaces:**
- Produces: tipos `LabOrderKind`, `LabOrderStatus`; label maps `LAB_ORDER_KIND_LABELS`, `LAB_ORDER_STATUS_LABELS`; `labOrderStatus(order)`; `AlignerProgress`, `computeAlignerProgress(alignerTotal, deliveredNumbers)`. Extiende `OrthoTreatment` con `alignerTotal: number | null`.

- [ ] **Step 1: Write the failing test**

```ts
// src/tests/unit/lab-orders-logic.test.ts
import { describe, it, expect } from "vitest";

import {
  computeAlignerProgress,
  labOrderStatus,
  LAB_ORDER_KIND_LABELS,
} from "@/lib/dental/lab-orders";

describe("labOrderStatus", () => {
  it("enviado cuando solo hay sentAt", () => {
    expect(labOrderStatus({ sentAt: "2026-08-01", receivedAt: null, deliveredAt: null })).toBe("enviado");
  });
  it("recibido cuando hay receivedAt pero no deliveredAt", () => {
    expect(labOrderStatus({ sentAt: "2026-08-01", receivedAt: "2026-08-05", deliveredAt: null })).toBe("recibido");
  });
  it("entregado cuando hay deliveredAt", () => {
    expect(labOrderStatus({ sentAt: "2026-08-01", receivedAt: "2026-08-05", deliveredAt: "2026-08-06" })).toBe("entregado");
  });
});

describe("computeAlignerProgress", () => {
  it("entregados = mayor alignerDelivered; pendientes = total - entregados", () => {
    const p = computeAlignerProgress(24, [3, 7, null, 5]);
    expect(p).toEqual({ total: 24, delivered: 7, pending: 17 });
  });
  it("sin total → todo 0, pendientes no negativo", () => {
    expect(computeAlignerProgress(null, [2])).toEqual({ total: 0, delivered: 2, pending: 0 });
  });
  it("sin entregas → delivered 0", () => {
    expect(computeAlignerProgress(10, [])).toEqual({ total: 10, delivered: 0, pending: 10 });
  });
});

describe("LAB_ORDER_KIND_LABELS", () => {
  it("cubre las 5 clases", () => {
    expect(Object.keys(LAB_ORDER_KIND_LABELS)).toHaveLength(5);
    expect(LAB_ORDER_KIND_LABELS.alineadores).toBe("Alineadores");
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — Run: `npx vitest run src/tests/unit/lab-orders-logic.test.ts` → FAIL (module not found).

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/dental/lab-orders.ts
/** Pedidos a laboratorio + progreso de alineadores (Fase 4). Puro, sin IO. */

export type LabOrderKind = "modelo" | "retenedor" | "alineadores" | "ortopedia" | "otro";
export type LabOrderStatus = "enviado" | "recibido" | "entregado";

export const LAB_ORDER_KIND_LABELS: Record<LabOrderKind, string> = {
  modelo: "Modelo",
  retenedor: "Retenedor",
  alineadores: "Alineadores",
  ortopedia: "Ortopedia",
  otro: "Otro",
};

export const LAB_ORDER_STATUS_LABELS: Record<LabOrderStatus, string> = {
  enviado: "Enviado",
  recibido: "Recibido",
  entregado: "Entregado",
};

/** Estado derivado de las fechas del pedido (no se almacena). */
export function labOrderStatus(order: {
  sentAt: string;
  receivedAt: string | null;
  deliveredAt: string | null;
}): LabOrderStatus {
  if (order.deliveredAt !== null) return "entregado";
  if (order.receivedAt !== null) return "recibido";
  return "enviado";
}

export interface AlignerProgress {
  total: number;
  delivered: number;
  pending: number;
}

/**
 * Progreso de alineadores. `deliveredNumbers` = el `alignerDelivered` de cada visita
 * (nº del alineador entregado en esa visita; null si no se entregó). Entregados = el mayor
 * de esos números; pendientes = total − entregados (nunca negativo).
 */
export function computeAlignerProgress(
  alignerTotal: number | null,
  deliveredNumbers: readonly (number | null)[],
): AlignerProgress {
  const total = alignerTotal ?? 0;
  const delivered = deliveredNumbers.reduce<number>(
    (max, n) => (n !== null && n > max ? n : max),
    0,
  );
  const pending = Math.max(0, total - delivered);
  return { total, delivered, pending };
}
```

En `src/lib/dental/ortho.ts`, añadir el campo a `OrthoTreatment` (tras `objectives`) y a
`EMPTY_ORTHO_TREATMENT`:
```ts
// en interface OrthoTreatment:
  alignerTotal: number | null;
```
```ts
// en EMPTY_ORTHO_TREATMENT:
  alignerTotal: null,
```
Si existe un barrel `src/lib/dental/index.ts` que re-exporta los módulos dentales, añadir `export * from "./lab-orders";`. Si no existe barrel (los consumidores importan por ruta directa), **omitir** este archivo y este paso.

- [ ] **Step 4: Run test to verify it passes** — Run: `npx vitest run src/tests/unit/lab-orders-logic.test.ts` → PASS. Luego `npx tsc --noEmit` → 0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/dental/lab-orders.ts src/lib/dental/ortho.ts src/tests/unit/lab-orders-logic.test.ts
git commit -m "feat(ortodoncia): logica laboratorio + progreso alineadores + alignerTotal"
```

---

