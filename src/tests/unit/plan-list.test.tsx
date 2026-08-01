/**
 * `PlanList` — lista de planes de tratamiento de un paciente.
 *
 * Componente presentacional puro (sin hooks de red): recibe `TreatmentPlan[]`
 * ya cargado (por `usePlans` en el caller) y solo ordena/renderiza. Espejo de
 * `perio-history.test.tsx`.
 */
import { createElement } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PlanList } from "@/components/dental/plan-list";
import type { TreatmentPlan } from "@/types/database";

afterEach(() => {
  cleanup();
});

/** Plan de tratamiento de ejemplo (treatment_plan) con overrides. */
function plan(overrides: Partial<TreatmentPlan> & { id: string }): TreatmentPlan {
  return {
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

describe("PlanList · lista y selección", () => {
  it("renderiza una fila por plan, más recientes primero", () => {
    const plans: TreatmentPlan[] = [
      plan({ id: "old", created_at: "2026-01-01T10:00:00.000Z" }),
      plan({ id: "new", created_at: "2026-06-15T09:00:00.000Z" }),
    ];

    render(createElement(PlanList, { plans, onSelect: vi.fn() }));

    const rows = screen.getAllByRole("button");
    expect(rows).toHaveLength(2);
    // La más reciente (junio) aparece primero.
    expect(rows[0]).toHaveTextContent(/jun/i);
    expect(rows[1]).toHaveTextContent(/ene/i);
  });

  it("muestra el badge de estado según PLAN_STATUS_LABELS", () => {
    const plans: TreatmentPlan[] = [
      plan({ id: "draft-plan", status: "draft" }),
      plan({ id: "accepted-plan", created_at: "2026-02-01T10:00:00.000Z", status: "accepted" }),
    ];

    render(createElement(PlanList, { plans, onSelect: vi.fn() }));

    expect(screen.getByText("Borrador")).toBeInTheDocument();
    expect(screen.getByText("Aceptado")).toBeInTheDocument();
  });

  it("muestra las notas del plan cuando las hay", () => {
    const plans: TreatmentPlan[] = [
      plan({ id: "with-notes", notes: "Paciente prefiere sesiones cortas" }),
    ];

    render(createElement(PlanList, { plans, onSelect: vi.fn() }));

    expect(screen.getByText("Paciente prefiere sesiones cortas")).toBeInTheDocument();
  });

  it("sin notas, no renderiza ningún párrafo de notas", () => {
    const plans: TreatmentPlan[] = [plan({ id: "no-notes", notes: null })];

    render(createElement(PlanList, { plans, onSelect: vi.fn() }));

    // Solo debe existir el texto de la fecha, no un segundo párrafo de notas.
    expect(screen.queryByText(/prefiere/i)).toBeNull();
  });

  it("al hacer click en una fila, llama onSelect con el id de ese plan", () => {
    const onSelect = vi.fn();
    const plans: TreatmentPlan[] = [
      plan({ id: "plan-a", created_at: "2026-01-01T10:00:00.000Z" }),
      plan({ id: "plan-b", created_at: "2026-03-01T10:00:00.000Z" }),
    ];

    render(createElement(PlanList, { plans, onSelect }));

    const rows = screen.getAllByRole("button");
    fireEvent.click(rows[0] as HTMLElement); // la más reciente (plan-b) va primera

    expect(onSelect).toHaveBeenCalledWith("plan-b");
  });

  it("sin planes, muestra un estado vacío y ningún botón", () => {
    render(createElement(PlanList, { plans: [], onSelect: vi.fn() }));

    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.getByText("Sin planes de tratamiento")).toBeInTheDocument();
  });
});
