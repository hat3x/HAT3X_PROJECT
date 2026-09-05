/**
 * `PlanWorkspace` — borrado de planes.
 *
 * El caso real: Nadia (Biodental) no podía eliminar borradores de planes. La
 * server action `deletePlan` existía y estaba probada desde el primer día, pero
 * NINGUNA pantalla la llamaba — no había hook ni botón. No era un problema de
 * permisos ni de RLS: era un cable que faltaba.
 *
 * Lo que fija este test:
 *  · el borrado pide confirmación, porque arrastra fases y líneas en cascada;
 *  · confirmar llama a la mutación con el id de ESE plan;
 *  · cancelar no borra nada;
 *  · sin permiso (no owner/manager) el botón ni se ofrece.
 */
import { createElement } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { TreatmentPlan } from "@/types/database";

const PLAN_BORRADOR = "11111111-1111-1111-1111-111111111111";

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
  } as TreatmentPlan;
}

const m = vi.hoisted(() => ({
  planes: [] as unknown[],
  borrar: { mutate: vi.fn(), isPending: false },
  vacia: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("@/hooks/use-treatment", () => ({
  usePlans: () => ({ data: m.planes, isLoading: false, isError: false }),
  usePlan: () => ({ data: undefined, isLoading: false, isError: false }),
  useCreatePlan: m.vacia,
  useAddPlanItem: m.vacia,
  useTransitionPlanItem: m.vacia,
  useDeletePlanItem: m.vacia,
  useDeletePlan: () => m.borrar,
}));

vi.mock("@/hooks/use-services", () => ({
  useServices: () => ({ data: [], isLoading: false, isError: false }),
}));

import { PlanWorkspace } from "@/components/dental/plan-workspace";

function pintar(canDeletePlans = true) {
  return render(
    createElement(PlanWorkspace, {
      salonId: "salon-1",
      customerId: "customer-1",
      hideChangePatient: true,
      canDeletePlans,
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  m.borrar.isPending = false;
  m.planes = [plan({ id: PLAN_BORRADOR, status: "draft" })];
});

afterEach(() => {
  cleanup();
});

describe("PlanWorkspace · borrar un plan", () => {
  it("pulsar eliminar NO borra todavía: primero pregunta", () => {
    pintar();

    fireEvent.click(screen.getByRole("button", { name: /eliminar plan/i }));

    expect(m.borrar.mutate).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("la confirmación avisa de que arrastra el presupuesto entero", () => {
    pintar();
    fireEvent.click(screen.getByRole("button", { name: /eliminar plan/i }));

    expect(screen.getByRole("dialog")).toHaveTextContent(/no se puede deshacer/i);
  });

  it("al confirmar, borra ESE plan", () => {
    pintar();
    fireEvent.click(screen.getByRole("button", { name: /eliminar plan/i }));
    const dialogo = screen.getByRole("dialog");
    fireEvent.click(within(dialogo).getByRole("button", { name: /^eliminar$/i }));

    expect(m.borrar.mutate).toHaveBeenCalledTimes(1);
    expect(m.borrar.mutate.mock.calls[0]?.[0]).toBe(PLAN_BORRADOR);
  });

  it("al cancelar, no borra nada", () => {
    pintar();
    fireEvent.click(screen.getByRole("button", { name: /eliminar plan/i }));
    const dialogo = screen.getByRole("dialog");
    fireEvent.click(within(dialogo).getByRole("button", { name: /cancelar/i }));

    expect(m.borrar.mutate).not.toHaveBeenCalled();
  });

  it("sin permiso, el botón de eliminar no existe", () => {
    pintar(false);

    expect(screen.queryByRole("button", { name: /eliminar plan/i })).toBeNull();
  });
});
