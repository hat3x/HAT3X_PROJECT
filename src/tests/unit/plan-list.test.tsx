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

// ---------------------------------------------------------------------------
// Borrado de planes
//
// El caso que lo motiva: la accion `deletePlan` existia y estaba probada, pero
// ninguna pantalla la llamaba — no habia forma de borrar un borrador desde la
// aplicacion. Y borrar arrastra fases y lineas en cascada, asi que la lista
// solo ofrece el boton donde `canDeletePlan` dice que es inocuo.
// ---------------------------------------------------------------------------

describe("PlanList · borrado", () => {
  it("ofrece eliminar un borrador y avisa con el id de ESE plan", () => {
    const onDelete = vi.fn();
    const plans: TreatmentPlan[] = [plan({ id: "borrador", status: "draft" })];

    render(createElement(PlanList, { plans, onSelect: vi.fn(), onDelete }));
    fireEvent.click(screen.getByRole("button", { name: /eliminar plan/i }));

    expect(onDelete).toHaveBeenCalledWith("borrador");
  });

  it("tambien deja eliminar un plan anulado", () => {
    const plans: TreatmentPlan[] = [plan({ id: "anulado", status: "cancelled" })];

    render(createElement(PlanList, { plans, onSelect: vi.fn(), onDelete: vi.fn() }));

    expect(screen.getByRole("button", { name: /eliminar plan/i })).toBeInTheDocument();
  });

  it.each(["proposed", "accepted", "in_progress", "completed"] as const)(
    "no ofrece eliminar un plan %s: ya arrastra historia, se anula",
    (status) => {
      const plans: TreatmentPlan[] = [plan({ id: "vivo", status })];

      render(createElement(PlanList, { plans, onSelect: vi.fn(), onDelete: vi.fn() }));

      expect(screen.queryByRole("button", { name: /eliminar plan/i })).toBeNull();
    },
  );

  it("sin onDelete no aparece el boton: quien no puede borrar no lo ve", () => {
    const plans: TreatmentPlan[] = [plan({ id: "borrador", status: "draft" })];

    render(createElement(PlanList, { plans, onSelect: vi.fn() }));

    expect(screen.queryByRole("button", { name: /eliminar plan/i })).toBeNull();
  });

  it("eliminar no selecciona el plan: son dos acciones distintas", () => {
    const onSelect = vi.fn();
    const plans: TreatmentPlan[] = [plan({ id: "borrador", status: "draft" })];

    render(createElement(PlanList, { plans, onSelect, onDelete: vi.fn() }));
    fireEvent.click(screen.getByRole("button", { name: /eliminar plan/i }));

    expect(onSelect).not.toHaveBeenCalled();
  });

  it("mientras borra, el boton queda desactivado para no repetir la peticion", () => {
    const plans: TreatmentPlan[] = [plan({ id: "borrador", status: "draft" })];

    render(
      createElement(PlanList, {
        plans,
        onSelect: vi.fn(),
        onDelete: vi.fn(),
        deletingId: "borrador",
      }),
    );

    expect(screen.getByRole("button", { name: /eliminar plan/i })).toBeDisabled();
  });
});
