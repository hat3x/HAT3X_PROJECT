## Task 7: Comanda de cocina (builder puro + impresión)

**Files:**
- Create: `…/src/lib/restauracion/kitchen-comanda.ts`
- Test: `…/src/tests/unit/kitchen-comanda.test.ts`

**Interfaces:**
- Produces:
  - `interface KitchenComandaData { orderNumber: number; stationName: string; label: string | null; issuedAt: Date; lines: Array<{ qty: number; name: string; modifiers: string[] }>; }`
  - `buildKitchenComandaHtml(data, options?: { rollWidthMm?: 58|80; timezone?: string }): string` — HTML térmico autónomo, SIN precios: número de pedido grande, estación, etiqueta, líneas `qty × nombre` con modificadores debajo. Puro (fecha entra como `Date`).
  - `printKitchenComanda(data, options?): void` — iframe oculto + `window.print()` (patrón `printTicketDocument`); no-op en servidor.

- [ ] **Step 1: Write the failing test** — Create `…/src/tests/unit/kitchen-comanda.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildKitchenComandaHtml } from "@/lib/restauracion/kitchen-comanda";

it("incluye número de pedido, estación, líneas y modificadores; SIN precios", () => {
  const html = buildKitchenComandaHtml({
    orderNumber: 42, stationName: "Cocina", label: "Barra 3",
    issuedAt: new Date("2026-08-10T12:00:00Z"),
    lines: [{ qty: 2, name: "Hamburguesa", modifiers: ["Extra bacon", "Sin cebolla"] }],
  });
  expect(html).toContain("42");
  expect(html).toContain("Cocina");
  expect(html).toContain("Hamburguesa");
  expect(html).toContain("Extra bacon");
  expect(html).not.toMatch(/€|\d+,\d{2}/);
});
```

- [ ] **Step 2: Run to verify it fails.** `npm test -- kitchen-comanda` → FAIL.

- [ ] **Step 3: Implement** `…/src/lib/restauracion/kitchen-comanda.ts` — función pura que genera el HTML (mira `src/lib/tpv/ticket-document.ts` para el patrón de documento térmico autónomo con estilos inline y `@media print`), y `printKitchenComanda` copiando la estructura de iframe de `src/app/(dashboard)/tpv/print-ticket.ts`. Sin importes en el HTML.

- [ ] **Step 4: Run + typecheck.** `npm test -- kitchen-comanda && npm run typecheck` → PASS + exit 0.

- [ ] **Step 5: Commit**

```bash
git add clients/projects/salon-os/src/lib/restauracion/kitchen-comanda.ts \
        clients/projects/salon-os/src/tests/unit/kitchen-comanda.test.ts
git commit -m "feat(restauracion): comanda de cocina (builder térmico sin precios + impresión)"
```

---

