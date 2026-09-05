import { createElement } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Order } from "@/types/database";

/**
 * Mock de los hooks que `MostradorView` llama DIRECTAMENTE (`@/hooks/use-menu`,
 * `@/hooks/use-orders`, `@/hooks/use-tpv`) — patrón `table-panel.test.tsx`/
 * `order-panel.test.tsx` (`vi.hoisted` + `createElement`, sin
 * `QueryClientProvider`). Los subcomponentes pesados (`ProductGrid`,
 * `ModifierPickerDialog`, `OrderPanel`) se sustituyen por stubs — no son el
 * objeto de esta prueba, y montarlos de verdad exigiría mockear TODOS sus
 * hooks internos (`useMenuCategories`, `useComboComponents`,
 * `useCreateOrder`... — Task 6/Task 5) sin aportar nada a lo que se quiere
 * probar aquí: que `initialOrderId` (fix revisión Task 7, Important — llega
 * desde `/sala` vía `/mostrador?order=<id>`) reanuda la cuenta correcta.
 * `OpenOrdersBar` SÍ se deja real: solo depende de `useOpenOrders` (ya
 * mockeado) y da una señal visual independiente (`aria-pressed`) de que la
 * cuenta quedó seleccionada.
 */
const m = vi.hoisted(() => ({
  menuProducts: { data: [] as unknown[], isPending: false },
  stations: { data: [] as unknown[], isPending: false },
  modifierGroups: { data: [] as unknown[], isPending: false },
  productModifierGroups: { data: [] as unknown[], isPending: false },
  orderItems: { data: [] as unknown[], isPending: false },
  openOrders: { data: [] as Order[], isPending: false },
  paymentMethods: { data: [] as unknown[], isPending: false },
  orderPanelProps: null as { order: Order | null } | null,
}));

vi.mock("@/hooks/use-menu", () => ({
  useMenuProducts: () => m.menuProducts,
  useStations: () => m.stations,
  useModifierGroups: () => m.modifierGroups,
  useAllProductModifierGroups: () => m.productModifierGroups,
}));
vi.mock("@/hooks/use-orders", () => ({
  useOrderItems: () => m.orderItems,
  useOpenOrders: () => m.openOrders,
}));
vi.mock("@/hooks/use-tpv", () => ({
  useSalePaymentMethods: () => m.paymentMethods,
}));
vi.mock("@/app/(dashboard)/mostrador/product-grid", () => ({
  ProductGrid: () => null,
}));
vi.mock("@/app/(dashboard)/mostrador/modifier-picker-dialog", () => ({
  ModifierPickerDialog: () => null,
}));
vi.mock("@/app/(dashboard)/mostrador/order-panel", () => ({
  OrderPanel: (props: { order: Order | null }) => {
    m.orderPanelProps = props;
    return null;
  },
}));

import { MostradorView } from "@/app/(dashboard)/mostrador/mostrador-view";

beforeEach(() => {
  m.orderPanelProps = null;
  m.openOrders.data = [];
});
afterEach(() => cleanup());

const OPEN_ORDER: Order = {
  id: "order-77",
  salon_id: "SALON",
  session_id: null,
  order_number: 7,
  channel: "mesa",
  status: "abierta",
  label: "Mesa 4",
  idempotency_key: null,
  dining_table_id: "table-1",
  covers: 3,
  created_by: null,
  created_at: "2026-08-10T09:00:00.000Z",
  updated_at: "2026-08-10T09:00:00.000Z",
};

describe("MostradorView — initialOrderId (fix revisión Task 7)", () => {
  it("con initialOrderId que coincide con una cuenta abierta, la reanuda automáticamente", () => {
    m.openOrders.data = [OPEN_ORDER];

    render(
      createElement(MostradorView, {
        salonId: "SALON",
        salonName: "Mi Bar",
        initialOrderId: OPEN_ORDER.id,
      }),
    );

    // `OrderPanel` (stub) recibió la cuenta encontrada como `order` — los
    // productos que se añadan a partir de ahora viajan a ESE pedido.
    expect(m.orderPanelProps?.order).toEqual(OPEN_ORDER);
    // Señal independiente: el chip de esa cuenta en `OpenOrdersBar` (real,
    // no stub) queda marcado como activo.
    expect(screen.getByRole("button", { name: /mesa 4/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("sin initialOrderId, arranca en blanco (comportamiento normal)", () => {
    m.openOrders.data = [OPEN_ORDER];

    render(createElement(MostradorView, { salonId: "SALON", salonName: "Mi Bar" }));

    expect(m.orderPanelProps?.order).toBeNull();
    expect(screen.getByRole("button", { name: /cuenta nueva/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("con initialOrderId que no coincide con ninguna cuenta abierta (p.ej. ya cobrada), cae al comportamiento normal", () => {
    m.openOrders.data = [OPEN_ORDER];

    render(
      createElement(MostradorView, {
        salonId: "SALON",
        salonName: "Mi Bar",
        initialOrderId: "no-existe",
      }),
    );

    expect(m.orderPanelProps?.order).toBeNull();
  });
});
