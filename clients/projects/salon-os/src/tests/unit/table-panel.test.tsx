import { createElement } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { formatMoney } from "@/lib/format";
import { settleTotals } from "@/lib/restauracion/order";
import type { DiningTable, Order, OrderItem } from "@/types/database";

/**
 * Mock de `@/hooks/use-orders` y `@/hooks/use-tables` (patrón
 * `order-panel.test.tsx`, vi.hoisted + createElement + getByRole):
 * `TablePanel` orquesta comanda/cobro/estado llamando a estos hooks
 * directamente, así que el test no necesita un `QueryClientProvider`.
 */
const m = vi.hoisted(() => ({
  orderItems: { data: [] as OrderItem[], isPending: false },
  settleOrder: { mutate: vi.fn(), isPending: false, reset: vi.fn() },
  setTableStatus: { mutate: vi.fn(), isPending: false },
}));
vi.mock("@/hooks/use-orders", () => ({
  useOrderItems: () => m.orderItems,
  useSettleOrder: () => m.settleOrder,
}));
vi.mock("@/hooks/use-tables", () => ({
  useSetTableStatus: () => m.setTableStatus,
}));

import { TablePanel } from "@/app/(dashboard)/sala/table-panel";

beforeEach(() => {
  m.settleOrder.mutate = vi.fn();
  m.settleOrder.reset = vi.fn();
  m.setTableStatus.mutate = vi.fn();
});
afterEach(() => cleanup());

/**
 * `formatMoney` (Intl.NumberFormat es-ES) separa el importe del símbolo con
 * un espacio non-breaking (U+00A0); ver la misma nota en `order-panel.test.tsx`.
 */
const NBSP = " ";
function moneyText(cents: number): string {
  return formatMoney(cents).replaceAll(NBSP, " ");
}

const TABLE: DiningTable = {
  id: "table-1",
  salon_id: "SALON",
  zone_id: "zone-1",
  name: "Mesa 4",
  capacity_min: 2,
  capacity_max: 4,
  pos_x: 10,
  pos_y: 10,
  shape: "round",
  status: "ocupada",
  sort_order: 0,
  active: true,
  created_at: "2026-08-10T09:00:00.000Z",
  updated_at: "2026-08-10T09:00:00.000Z",
};

const ORDER: Order = {
  id: "order-1",
  salon_id: "SALON",
  session_id: null,
  order_number: 12,
  channel: "mesa",
  status: "abierta",
  label: "Mesa 4",
  idempotency_key: null,
  dining_table_id: "table-1",
  covers: 3,
  created_by: null,
  created_at: "2026-08-10T09:35:00.000Z",
  updated_at: "2026-08-10T09:35:00.000Z",
};

function orderItem(overrides: Partial<OrderItem> = {}): OrderItem {
  return {
    id: "item-1",
    salon_id: "SALON",
    order_id: "order-1",
    product_id: "prod-1",
    qty: 2,
    unit_price_cents: 880,
    vat_rate: 10,
    station_id: "cocina",
    status: "enviado",
    combo_group: null,
    modifiers_snapshot: [],
    void_of_item_id: null,
    void_reason: null,
    created_by: null,
    created_at: "2026-08-10T09:36:00.000Z",
    updated_at: "2026-08-10T09:36:00.000Z",
    ...overrides,
  };
}

/**
 * Dos líneas activas con precio distinto (para que el total agregado no
 * coincida por casualidad con el importe de ninguna línea suelta) + una
 * anulada, para comprobar que el total EXCLUYE la anulada.
 */
const ITEMS: OrderItem[] = [
  orderItem({ id: "item-1", qty: 2, unit_price_cents: 880 }),
  orderItem({ id: "item-3", qty: 1, unit_price_cents: 425, product_id: "prod-3" }),
  orderItem({ id: "item-2", qty: 1, unit_price_cents: 250, status: "anulado", void_reason: "error" }),
];

function renderPanel(
  overrides: Partial<React.ComponentProps<typeof TablePanel>> = {},
): ReturnType<typeof render> {
  return render(
    createElement(TablePanel, {
      table: TABLE,
      order: ORDER,
      salonId: "SALON",
      now: new Date("2026-08-10T10:00:00.000Z"),
      onClose: vi.fn(),
      onAdd: vi.fn(),
      ...overrides,
    }),
  );
}

describe("TablePanel", () => {
  beforeEach(() => {
    m.orderItems.data = ITEMS;
  });

  it("renderiza el total (excluyendo líneas anuladas) y los comensales", () => {
    renderPanel();

    const totals = settleTotals([
      { description: "Producto", qty: 2, unitPriceCents: 880, vatRate: 10 },
      { description: "Producto", qty: 1, unitPriceCents: 425, vatRate: 10 },
    ]);

    expect(screen.getByText(moneyText(totals.totalCents))).toBeInTheDocument();
    expect(screen.getByText(/3 comensales/i)).toBeInTheDocument();
  });

  it("muestra los botones Añadir y Cobrar", () => {
    renderPanel();

    expect(screen.getByRole("button", { name: /añadir/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cobrar/i })).toBeInTheDocument();
  });

  it("muestra el cronómetro de tiempo sentados a partir de `now`", () => {
    renderPanel();

    // order.created_at = 09:35, now = 10:00 → 25 min.
    expect(screen.getByText(/hace 25 min/i)).toBeInTheDocument();
  });

  it("con la mesa 'ocupada' muestra Pedir cuenta pero no Limpiar", () => {
    renderPanel();

    expect(screen.getByRole("button", { name: /pedir cuenta/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /limpiar/i })).not.toBeInTheDocument();
  });

  it("con la mesa 'por_limpiar' muestra Limpiar pero no Pedir cuenta ni Cobrar", () => {
    renderPanel({ table: { ...TABLE, status: "por_limpiar" } });

    expect(screen.getByRole("button", { name: /limpiar/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /pedir cuenta/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /cobrar/i })).not.toBeInTheDocument();
  });

  it("sin pedido (mesa sin cuenta abierta), muestra un estado vacío mínimo sin acciones de comanda", () => {
    renderPanel({ order: null });

    expect(screen.getByText(/no tiene una cuenta abierta/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /añadir/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /cobrar/i })).not.toBeInTheDocument();
  });

  /**
   * Fix revisión Task 6 (Important): tras cobrar, `settleOrder` marca el
   * pedido como cobrado → `order` pasa a `null` en el siguiente refetch,
   * pero la mesa queda en `por_limpiar`. Sin ruta de recuperación en el
   * estado vacío, "Limpiar" era inalcanzable justo cuando más se necesita.
   */
  it("sin pedido y mesa 'por_limpiar' (caso normal tras cobrar), ofrece el botón Limpiar", () => {
    renderPanel({ order: null, table: { ...TABLE, status: "por_limpiar" } });

    expect(screen.getByRole("button", { name: /limpiar/i })).toBeInTheDocument();
  });

  it("sin pedido y mesa 'ocupada' (caso de recuperación), ofrece 'Marcar para limpiar' pero no 'Limpiar'", () => {
    renderPanel({ order: null, table: { ...TABLE, status: "ocupada" } });

    expect(screen.getByRole("button", { name: /marcar para limpiar/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^limpiar$/i })).not.toBeInTheDocument();
  });

  it("sin pedido y mesa 'libre', no ofrece ningún botón de limpieza", () => {
    renderPanel({ order: null, table: { ...TABLE, status: "libre" } });

    expect(screen.queryByRole("button", { name: /limpiar/i })).not.toBeInTheDocument();
  });
});
