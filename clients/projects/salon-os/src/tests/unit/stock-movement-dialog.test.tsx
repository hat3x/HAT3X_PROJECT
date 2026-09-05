/**
 * `StockMovementPanel` — formulario de movimiento de stock + historial.
 *
 * Igual patrón que `plan-detail.test.tsx`: componente CLIENTE "smart" que
 * llama directamente a `useRecordMovement`/`useStockMovements`, sustituidas
 * por stubs `vi.hoisted` (sin red ni QueryClientProvider en juego).
 */
import { createElement } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Product, StockMovement } from "@/types/database";

const m = vi.hoisted(() => ({
  record: { mutate: vi.fn(), isPending: false },
  movements: { data: [] as StockMovement[], isPending: false, isError: false, error: null as unknown },
}));

vi.mock("@/hooks/use-stock", () => ({
  useRecordMovement: () => m.record,
  useStockMovements: () => m.movements,
}));

import { StockMovementPanel } from "@/app/(dashboard)/products/stock-movement-dialog";

beforeEach(() => {
  m.record.mutate = vi.fn();
  m.record.isPending = false;
  m.movements.data = [];
  m.movements.isPending = false;
  m.movements.isError = false;
  m.movements.error = null;
});

afterEach(() => {
  cleanup();
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function product(overrides: Partial<Product> = {}): Product {
  return {
    id: "product-1",
    salon_id: "salon-1",
    name: "Champú hidratante 250 ml",
    description: null,
    price_cents: 1200,
    currency: "EUR",
    vat_rate: 21,
    stock: 10,
    min_stock: 5,
    unit: "unidad",
    active: true,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    category_id: null,
    station_id: null,
    is_combo: false,
    image_url: null,
    allergens: [],
    available_channels: ["mostrador"],
    ...overrides,
  };
}

function movement(overrides: Partial<StockMovement> = {}): StockMovement {
  return {
    id: "mov-1",
    salon_id: "salon-1",
    product_id: "product-1",
    kind: "entrada",
    quantity: 5,
    resulting_stock: 15,
    lot: null,
    expiry: null,
    note: null,
    created_by: "user-1",
    created_at: "2026-01-01T10:00:00.000Z",
    ...overrides,
  };
}

describe("StockMovementPanel · cabecera del producto", () => {
  it("muestra existencias, unidad y mínimo", () => {
    render(createElement(StockMovementPanel, { salonId: "salon-1", product: product() }));

    expect(screen.getByText(/Movimiento de stock — Champú hidratante 250 ml/)).toBeInTheDocument();
    expect(screen.getByText("10 unidad")).toBeInTheDocument();
    expect(screen.getByText("Mínimo: 5")).toBeInTheDocument();
  });

  it("muestra el badge 'Bajo mínimo' cuando el stock está en o por debajo del mínimo", () => {
    render(
      createElement(StockMovementPanel, {
        salonId: "salon-1",
        product: product({ stock: 3, min_stock: 5 }),
      }),
    );

    expect(screen.getByText("Bajo mínimo")).toBeInTheDocument();
  });

  it("NO muestra el badge cuando el stock supera el mínimo", () => {
    render(
      createElement(StockMovementPanel, {
        salonId: "salon-1",
        product: product({ stock: 20, min_stock: 5 }),
      }),
    );

    expect(screen.queryByText("Bajo mínimo")).toBeNull();
  });
});

describe("StockMovementPanel · formulario", () => {
  it("solo muestra lote/caducidad cuando el tipo es Entrada (por defecto)", () => {
    render(createElement(StockMovementPanel, { salonId: "salon-1", product: product() }));

    expect(screen.getByLabelText("Lote (opcional)")).toBeInTheDocument();
    expect(screen.getByLabelText("Caducidad (opcional)")).toBeInTheDocument();
  });

  it("rechaza una cantidad vacía/no numérica sin llamar a la mutación", () => {
    render(createElement(StockMovementPanel, { salonId: "salon-1", product: product() }));

    fireEvent.click(screen.getByRole("button", { name: "Registrar movimiento" }));

    expect(m.record.mutate).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain("cantidad válida");
  });

  it("entrada con cantidad 0 se rechaza en cliente (debe ser > 0)", () => {
    render(createElement(StockMovementPanel, { salonId: "salon-1", product: product() }));

    fireEvent.change(screen.getByLabelText("Cantidad"), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Registrar movimiento" }));

    expect(m.record.mutate).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain("mayor que 0");
  });

  it("al enviar una entrada válida, llama a la mutación con productId/kind/quantity/lot/expiry/note", () => {
    render(createElement(StockMovementPanel, { salonId: "salon-1", product: product() }));

    fireEvent.change(screen.getByLabelText("Cantidad"), { target: { value: "5" } });
    fireEvent.change(screen.getByLabelText("Lote (opcional)"), { target: { value: "L-2026-08" } });
    fireEvent.change(screen.getByLabelText("Caducidad (opcional)"), {
      target: { value: "2026-12-01" },
    });
    fireEvent.change(screen.getByLabelText("Nota (opcional)"), { target: { value: "Reposición" } });
    fireEvent.click(screen.getByRole("button", { name: "Registrar movimiento" }));

    expect(m.record.mutate).toHaveBeenCalledTimes(1);
    expect(m.record.mutate).toHaveBeenCalledWith(
      {
        productId: "product-1",
        kind: "entrada",
        quantity: 5,
        lot: "L-2026-08",
        expiry: "2026-12-01",
        note: "Reposición",
      },
      expect.objectContaining({
        onSuccess: expect.any(Function),
        onError: expect.any(Function),
      }),
    );
  });

  it("al cambiar el tipo a Ajuste, la etiqueta de cantidad pasa a 'Nuevo total' y oculta lote/caducidad", () => {
    render(createElement(StockMovementPanel, { salonId: "salon-1", product: product() }));

    fireEvent.click(screen.getByRole("combobox", { name: "Tipo de movimiento" }));
    fireEvent.click(screen.getByRole("option", { name: "Ajuste" }));

    expect(screen.getByLabelText("Nuevo total")).toBeInTheDocument();
    expect(screen.queryByLabelText("Lote (opcional)")).toBeNull();
  });

  it("ajuste con cantidad 0 SÍ se acepta (fija el stock a cero) y llama a la mutación", () => {
    render(createElement(StockMovementPanel, { salonId: "salon-1", product: product() }));

    fireEvent.click(screen.getByRole("combobox", { name: "Tipo de movimiento" }));
    fireEvent.click(screen.getByRole("option", { name: "Ajuste" }));
    fireEvent.change(screen.getByLabelText("Nuevo total"), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Registrar movimiento" }));

    expect(m.record.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "ajuste", quantity: 0 }),
      expect.anything(),
    );
  });
});

describe("StockMovementPanel · historial", () => {
  it("sin movimientos: muestra el estado vacío", () => {
    render(createElement(StockMovementPanel, { salonId: "salon-1", product: product() }));

    expect(screen.getByText("Sin movimientos todavía.")).toBeInTheDocument();
  });

  it("con movimientos: lista tipo, cantidad, stock resultante y fecha", () => {
    m.movements.data = [
      movement({ id: "mov-1", kind: "entrada", quantity: 5, resulting_stock: 15 }),
      movement({ id: "mov-2", kind: "salida", quantity: -2, resulting_stock: 13, lot: "L-1" }),
    ];

    render(createElement(StockMovementPanel, { salonId: "salon-1", product: product() }));

    // Se acota al `<ul>` del historial: "Entrada" también aparece como valor
    // seleccionado del selector de tipo (por defecto "entrada").
    const history = within(screen.getByRole("list"));
    expect(history.getByText("Entrada")).toBeInTheDocument();
    expect(history.getByText("+5")).toBeInTheDocument();
    expect(history.getByText("Salida")).toBeInTheDocument();
    expect(history.getByText("-2")).toBeInTheDocument();
    expect(history.getByText("Stock: 15")).toBeInTheDocument();
    expect(history.getByText("Lote L-1")).toBeInTheDocument();
  });

  it("mientras carga el historial, muestra un estado de carga", () => {
    m.movements.isPending = true;

    render(createElement(StockMovementPanel, { salonId: "salon-1", product: product() }));

    expect(screen.getByText("Cargando…")).toBeInTheDocument();
  });
});
