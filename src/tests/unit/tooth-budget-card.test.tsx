/**
 * `ToothBudgetCard` — lo presupuestado en UN diente, desde el odontograma.
 *
 * Lo que importa aquí es el cruce: la tarjeta responde "en este diente, qué le
 * habíamos presupuestado", y la respuesta tiene que juntar líneas de planes
 * distintos. Un molar arrastra la endodoncia de marzo y la corona de
 * septiembre, y en la boca es el mismo diente.
 *
 * Stubs de los hooks, mismo patrón que `plan-detail.test.tsx`: sin red ni
 * QueryClientProvider, solo el cableado de la UI.
 */
import { createElement } from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PlanItem } from "@/types/database";

const m = vi.hoisted(() => ({
  budget: {
    data: undefined as unknown,
    isPending: false,
    isError: false,
  },
}));

vi.mock("@/hooks/use-treatment", () => ({
  useToothBudget: () => m.budget,
}));

vi.mock("@/hooks/use-services", () => ({
  useServices: () => ({
    data: [{ id: "svc-1", name: "Endodoncia", price_cents: 20000 }],
    isPending: false,
    isError: false,
  }),
}));

import { ToothBudgetCard } from "@/components/dental/tooth-budget-card";

beforeEach(() => {
  m.budget.data = { items: [], sales: {} };
  m.budget.isPending = false;
  m.budget.isError = false;
});

afterEach(() => {
  cleanup();
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function planItem(overrides: Partial<PlanItem> & { id: string }): PlanItem {
  return {
    salon_id: "salon-1",
    plan_id: "plan-1",
    phase_id: null,
    position: 0,
    service_id: null,
    description: null,
    fdi_code: null,
    surfaces: [],
    quantity: 1,
    unit_price_cents: 0,
    discount_cents: 0,
    tax_rate: 0,
    line_total_cents: 0,
    state: "propuesto",
    scheduled_appointment_id: null,
    executed_at: null,
    executed_by: null,
    finding_id: null,
    pos_sale_id: null,
    created_at: "2026-01-01T10:00:00.000Z",
    updated_at: "2026-01-01T10:00:00.000Z",
    ...overrides,
  };
}

/** Endodoncia del 26, plan de marzo. */
const ENDODONCIA_26 = planItem({
  id: "item-1",
  plan_id: "plan-marzo",
  service_id: "svc-1",
  fdi_code: 26,
  quantity: 1,
  unit_price_cents: 20000,
  line_total_cents: 20000,
  state: "realizado",
});

/** Corona del MISMO diente, plan distinto. */
const CORONA_26 = planItem({
  id: "item-2",
  plan_id: "plan-septiembre",
  description: "Corona de zirconio",
  fdi_code: 26,
  quantity: 1,
  unit_price_cents: 45000,
  line_total_cents: 45000,
  state: "aceptado",
});

/** Otro diente: no debe aparecer al mirar el 26. */
const EMPASTE_11 = planItem({
  id: "item-3",
  description: "Empaste",
  fdi_code: 11,
  quantity: 1,
  unit_price_cents: 6000,
  line_total_cents: 6000,
});

function renderCard(fdi = 26) {
  return render(
    createElement(ToothBudgetCard, {
      salonId: "salon-1",
      clinicalRecordId: "customer-1",
      fdi,
    }),
  );
}

describe("ToothBudgetCard", () => {
  it("no pinta nada si el diente no tiene nada presupuestado", () => {
    m.budget.data = { items: [EMPASTE_11], sales: {} };
    const { container } = renderCard(26);

    expect(container).toBeEmptyDOMElement();
  });

  it("junta en un diente las líneas de planes distintos", () => {
    m.budget.data = { items: [ENDODONCIA_26, CORONA_26, EMPASTE_11], sales: {} };
    renderCard(26);

    // El título del servicio viene del catálogo; el otro, de la descripción.
    expect(screen.getByText("Endodoncia")).toBeInTheDocument();
    expect(screen.getByText("Corona de zirconio")).toBeInTheDocument();
    // Y lo de otro diente no se cuela.
    expect(screen.queryByText("Empaste")).not.toBeInTheDocument();
  });

  it("suma el total presupuestado en ese diente", () => {
    m.budget.data = { items: [ENDODONCIA_26, CORONA_26], sales: {} };
    renderCard(26);

    // 200,00 + 450,00 = 650,00, en la cabecera. Se acota ahí porque el aviso
    // del pie repite el importe cuando nada ha pasado por caja todavía.
    const cabecera = screen.getByText(/Presupuestado en el 26/).parentElement;
    expect(cabecera).not.toBeNull();
    expect(within(cabecera as HTMLElement).getByText(/650,00/)).toBeInTheDocument();
  });

  it("marca el estado de cobro de la línea que ya pasó por caja", () => {
    m.budget.data = {
      items: [planItem({ ...ENDODONCIA_26, id: "item-1", pos_sale_id: "sale-1" })],
      sales: { "sale-1": { status: "completed", hasInvoice: true } },
    };
    renderCard(26);

    expect(screen.getByText("Cobrado con factura")).toBeInTheDocument();
  });

  it("una venta anulada devuelve la línea a 'sin pasar', y no se etiqueta", () => {
    m.budget.data = {
      items: [planItem({ ...ENDODONCIA_26, id: "item-1", pos_sale_id: "sale-1" })],
      sales: { "sale-1": { status: "voided", hasInvoice: false } },
    };
    renderCard(26);

    // "Sin pasar a caja" es el caso por defecto: no lleva badge propio.
    expect(screen.queryByText("Cobrado con factura")).not.toBeInTheDocument();
    expect(screen.queryByText("Pendiente de cobrar")).not.toBeInTheDocument();
    // Y el aviso del pie lo cuenta como pendiente de pasar.
    expect(screen.getByText(/sin pasar a caja/i)).toBeInTheDocument();
  });

  it("mantiene el estado del tratamiento junto al del cobro", () => {
    m.budget.data = { items: [ENDODONCIA_26, CORONA_26], sales: {} };
    renderCard(26);

    const fila = screen.getByText("Endodoncia").closest("li");
    expect(fila).not.toBeNull();
    expect(within(fila as HTMLElement).getByText("Realizado")).toBeInTheDocument();
  });
});
