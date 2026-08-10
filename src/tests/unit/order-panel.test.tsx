import { createElement } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { formatMoney } from "@/lib/format";
import { buildSettleLines, settleTotals } from "@/lib/restauracion/order";

/**
 * Mock de `@/hooks/use-orders` (patrón `menu-item-form.test.tsx`, vi.hoisted +
 * createElement + getByRole): `OrderPanel` orquesta Mandar/Cobrar llamando a
 * estos hooks directamente, así que el test no necesita un `QueryClientProvider`
 * — igual que `MenuItemForm` no lo necesita al mockear `@/hooks/use-menu`.
 */
const m = vi.hoisted(() => ({
  createOrder: { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false, reset: vi.fn() },
  addOrderItems: { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false, reset: vi.fn() },
  sendOrderToStations: { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false, reset: vi.fn() },
  settleOrder: { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false, reset: vi.fn() },
}));
vi.mock("@/hooks/use-orders", () => ({
  useCreateOrder: () => m.createOrder,
  useAddOrderItems: () => m.addOrderItems,
  useSendOrderToStations: () => m.sendOrderToStations,
  useSettleOrder: () => m.settleOrder,
}));

import { OrderPanel, type OrderPanelItem } from "@/app/(dashboard)/mostrador/order-panel";

beforeEach(() => {
  m.createOrder.mutateAsync = vi.fn();
  m.addOrderItems.mutateAsync = vi.fn();
  m.sendOrderToStations.mutateAsync = vi.fn();
  m.settleOrder.mutateAsync = vi.fn();
});
afterEach(() => cleanup());

/**
 * `formatMoney` (Intl.NumberFormat es-ES) separa el importe del símbolo con un
 * espacio non-breaking (U+00A0). El normalizador por defecto de
 * testing-library colapsa el TEXTO DEL DOM (NBSP → espacio normal) pero NO el
 * string que se le pasa como matcher (`matches()` compara
 * `normalizedText === String(matcher)` sin normalizar `matcher`) — así que
 * hay que normalizar aquí a mano o `getByText` nunca encuentra el importe.
 */
const NBSP = " ";
function moneyText(cents: number): string {
  return formatMoney(cents).replaceAll(NBSP, " ");
}

/** Dos líneas del pedido: un producto simple y una bebida, sin modificadores. */
const ITEMS: OrderPanelItem[] = [
  {
    id: "item-1",
    productId: "p1",
    name: "Hamburguesa",
    qty: 2,
    unitPriceCents: 880,
    vatRate: 10,
    stationId: "cocina",
    comboGroup: null,
    modifiersSnapshot: [],
  },
  {
    id: "item-2",
    productId: "p2",
    name: "Coca-Cola",
    qty: 1,
    unitPriceCents: 250,
    vatRate: 10,
    stationId: "barra",
    comboGroup: null,
    modifiersSnapshot: [],
  },
];

function renderPanel(
  overrides: Partial<React.ComponentProps<typeof OrderPanel>> = {},
): ReturnType<typeof render> {
  return render(
    createElement(OrderPanel, {
      salonId: "SALON",
      salonName: "Mi Bar",
      order: null,
      items: ITEMS,
      pendingIds: new Set(ITEMS.map((i) => i.id)),
      stations: [],
      paymentMethods: [],
      onOrderPersisted: vi.fn(),
      onItemsSent: vi.fn(),
      onSettled: vi.fn(),
      ...overrides,
    }),
  );
}

describe("OrderPanel", () => {
  it("renderiza cada línea del pedido y el total calculado con settleTotals", () => {
    renderPanel();

    expect(screen.getByText(/hamburguesa/i)).toBeInTheDocument();
    expect(screen.getByText(/coca-cola/i)).toBeInTheDocument();

    const lines = buildSettleLines(
      ITEMS.map((it) => ({
        productName: it.name,
        qty: it.qty,
        unitPriceCents: it.unitPriceCents,
        vatRate: it.vatRate,
        modifiersSnapshot: it.modifiersSnapshot,
      })),
    );
    const totals = settleTotals(lines);

    expect(screen.getByText(moneyText(totals.totalCents))).toBeInTheDocument();
  });

  it("muestra los botones Mandar y Cobrar", () => {
    renderPanel();

    expect(screen.getByRole("button", { name: /mandar/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cobrar/i })).toBeInTheDocument();
  });

  it("al pulsar Cobrar dispara el flujo de pago", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole("button", { name: /cobrar/i }));

    expect(screen.getByRole("button", { name: /confirmar cobro/i })).toBeInTheDocument();
  });

  it("con el pedido vacío, Mandar y Cobrar están deshabilitados", () => {
    renderPanel({ items: [], pendingIds: new Set() });

    expect(screen.getByRole("button", { name: /mandar/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /cobrar/i })).toBeDisabled();
  });
});
