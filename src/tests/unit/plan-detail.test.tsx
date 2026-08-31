/**
 * `PlanDetail` — presupuesto + fases + items con controles de estado.
 *
 * A diferencia de `PerioSummary`/`PerioHistory` (presentacionales puros), este
 * componente llama directamente a `useTransitionPlanItem`/`useDeletePlanItem`
 * (cada fila necesita su propio botón) y a `useServices` (nombre del servicio
 * por item). Se sustituyen por stubs, igual patrón que
 * `salon-marca-form.test.tsx` y `odontogram-chart.test.tsx`: sin red ni
 * QueryClientProvider en juego, solo el cableado de la UI.
 */
import { createElement } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PlanItem, PlanPhase, TreatmentPlan } from "@/types/database";

// Mutaciones (hoisted): objetos ESTABLES cuyos campos se reinician en cada
// test, igual patrón que `salon-marca-form.test.tsx`.
const m = vi.hoisted(() => ({
  transition: { mutate: vi.fn(), isPending: false },
  del: { mutate: vi.fn(), isPending: false },
}));

vi.mock("@/hooks/use-treatment", () => ({
  useTransitionPlanItem: () => m.transition,
  useDeletePlanItem: () => m.del,
}));

vi.mock("@/hooks/use-services", () => ({
  useServices: () => ({
    data: [{ id: "svc-1", name: "Empaste composite", price_cents: 1500 }],
    isPending: false,
    isError: false,
  }),
}));

import { PlanDetail } from "@/components/dental/plan-detail";

beforeEach(() => {
  m.transition.mutate = vi.fn();
  m.transition.isPending = false;
  m.del.mutate = vi.fn();
  m.del.isPending = false;
});

afterEach(() => {
  cleanup();
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function treatmentPlan(overrides: Partial<TreatmentPlan> = {}): TreatmentPlan {
  return {
    id: "plan-1",
    salon_id: "salon-1",
    customer_id: "customer-1",
    status: "draft",
    currency: "EUR",
    notes: null,
    insurer_id: null,
    created_by: null,
    created_at: "2026-01-01T10:00:00.000Z",
    updated_at: "2026-01-01T10:00:00.000Z",
    ...overrides,
  };
}

function planPhase(overrides: Partial<PlanPhase> & { id: string }): PlanPhase {
  return {
    salon_id: "salon-1",
    plan_id: "plan-1",
    position: 0,
    name: "Fase 1",
    priority: 0,
    created_at: "2026-01-01T10:00:00.000Z",
    ...overrides,
  };
}

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

/** Localiza el `<li>` de un item a partir de un texto único que contiene. */
function itemRow(text: string): HTMLElement {
  const node = screen.getByText(text);
  const li = node.closest("li");
  if (li === null) throw new Error(`no se encontró la fila del item para "${text}"`);
  return li;
}

/** Localiza el bloque de una estadística del presupuesto a partir de su etiqueta (dt). */
function statBlock(label: string): HTMLElement {
  const dt = screen.getByText(label);
  const wrapper = dt.closest("div");
  if (wrapper === null) throw new Error(`no se encontró el bloque de estadística "${label}"`);
  return wrapper;
}

const PHASE_1 = planPhase({ id: "phase-1", name: "Fase 1" });

// item en 'propuesto' con servicio → título = nombre del servicio.
const ITEM_PROPUESTO = planItem({
  id: "item-1",
  phase_id: "phase-1",
  service_id: "svc-1",
  quantity: 1,
  unit_price_cents: 1500,
  line_total_cents: 1500,
  state: "propuesto",
});

// item en 'en_curso' sin servicio, con diente → título = description.
const ITEM_EN_CURSO = planItem({
  id: "item-2",
  phase_id: "phase-1",
  service_id: null,
  description: "Revisión general",
  fdi_code: 11,
  quantity: 2,
  unit_price_cents: 2000,
  line_total_cents: 4000,
  state: "en_curso",
});

describe("PlanDetail · fases, items y presupuesto", () => {
  it("agrupa los items por su fase y muestra el nombre de la fase", () => {
    render(
      createElement(PlanDetail, {
        salonId: "salon-1",
        plan: treatmentPlan(),
        phases: [PHASE_1],
        items: [ITEM_PROPUESTO, ITEM_EN_CURSO],
      }),
    );

    expect(screen.getByText("Fase 1")).toBeInTheDocument();
  });

  it("calcula y muestra los totales del presupuesto vía computePlanTotals", () => {
    render(
      createElement(PlanDetail, {
        salonId: "salon-1",
        plan: treatmentPlan(),
        phases: [PHASE_1],
        items: [ITEM_PROPUESTO, ITEM_EN_CURSO],
      }),
    );

    // activeCents = 1500 + 4000 = 5500 (ambos items no están rechazados/anulados)
    expect(statBlock("Presupuesto total").textContent).toContain("55,00");
    // acceptedCents = solo el item en_curso (4000)
    expect(statBlock("Aceptado").textContent).toContain("40,00");
    // doneCents = 0 (ningún item 'realizado')
    expect(statBlock("Realizado").textContent).toContain("0,00");
  });

  it("por item: nombre del servicio (o descripción), diente, cantidad y totales de línea", () => {
    render(
      createElement(PlanDetail, {
        salonId: "salon-1",
        plan: treatmentPlan(),
        phases: [PHASE_1],
        items: [ITEM_PROPUESTO, ITEM_EN_CURSO],
      }),
    );

    // item-1: título viene del SERVICIO (svc-1 → "Empaste composite"), sin diente.
    const row1 = itemRow("Empaste composite");
    expect(row1.textContent).toContain("x1");
    expect(row1.textContent).toContain("15,00");
    expect(within(row1).getByText("Propuesto")).toBeInTheDocument();

    // item-2: sin servicio → título viene de `description`; SÍ tiene diente.
    const row2 = itemRow("Revisión general");
    expect(row2.textContent).toContain("Diente 11");
    expect(row2.textContent).toContain("x2");
    expect(row2.textContent).toContain("40,00");
    expect(within(row2).getByText("En curso")).toBeInTheDocument();
  });

  it("los botones de transición respetan canTransitionItem según el estado del item", () => {
    render(
      createElement(PlanDetail, {
        salonId: "salon-1",
        plan: treatmentPlan(),
        phases: [PHASE_1],
        items: [ITEM_PROPUESTO, ITEM_EN_CURSO],
      }),
    );

    // propuesto → aceptado | rechazado | anulado
    const row1 = itemRow("Empaste composite");
    expect(within(row1).getByRole("button", { name: "Aceptar" })).toBeInTheDocument();
    expect(within(row1).getByRole("button", { name: "Rechazar" })).toBeInTheDocument();
    expect(within(row1).getByRole("button", { name: "Anular" })).toBeInTheDocument();
    expect(within(row1).queryByRole("button", { name: "Iniciar" })).toBeNull();
    expect(within(row1).queryByRole("button", { name: "Marcar realizado" })).toBeNull();

    // en_curso → realizado | anulado (NO rechazado, NO aceptado)
    const row2 = itemRow("Revisión general");
    expect(within(row2).getByRole("button", { name: "Marcar realizado" })).toBeInTheDocument();
    expect(within(row2).getByRole("button", { name: "Anular" })).toBeInTheDocument();
    expect(within(row2).queryByRole("button", { name: "Aceptar" })).toBeNull();
    expect(within(row2).queryByRole("button", { name: "Rechazar" })).toBeNull();
  });

  it("un estado terminal (realizado) no muestra ningún botón de transición", () => {
    const doneItem = planItem({
      id: "item-3",
      phase_id: "phase-1",
      description: "Limpieza",
      state: "realizado",
    });

    render(
      createElement(PlanDetail, {
        salonId: "salon-1",
        plan: treatmentPlan(),
        phases: [PHASE_1],
        items: [doneItem],
      }),
    );

    const row = itemRow("Limpieza");
    expect(within(row).queryAllByRole("button", { name: /^(Aceptar|Iniciar|Marcar realizado|Rechazar|Anular)$/ })).toHaveLength(0);
  });

  it("al pulsar un botón de transición, llama a la mutación con {itemId, toState}", () => {
    render(
      createElement(PlanDetail, {
        salonId: "salon-1",
        plan: treatmentPlan(),
        phases: [PHASE_1],
        items: [ITEM_PROPUESTO, ITEM_EN_CURSO],
      }),
    );

    const row2 = itemRow("Revisión general");
    fireEvent.click(within(row2).getByRole("button", { name: "Marcar realizado" }));

    expect(m.transition.mutate).toHaveBeenCalledTimes(1);
    expect(m.transition.mutate).toHaveBeenCalledWith(
      { itemId: "item-2", toState: "realizado" },
      expect.objectContaining({ onError: expect.any(Function) }),
    );
  });

  it("al pulsar eliminar, llama a la mutación de borrado con el id del item", () => {
    render(
      createElement(PlanDetail, {
        salonId: "salon-1",
        plan: treatmentPlan(),
        phases: [PHASE_1],
        items: [ITEM_PROPUESTO, ITEM_EN_CURSO],
      }),
    );

    const row1 = itemRow("Empaste composite");
    fireEvent.click(within(row1).getByRole("button", { name: "Eliminar línea" }));

    expect(m.del.mutate).toHaveBeenCalledTimes(1);
    expect(m.del.mutate).toHaveBeenCalledWith(
      "item-1",
      expect.objectContaining({ onError: expect.any(Function) }),
    );
  });
});
