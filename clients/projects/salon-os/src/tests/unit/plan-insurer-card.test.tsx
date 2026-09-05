/**
 * `PlanInsurerCard` — cabecera del plan de tratamiento: nombre de la mutua
 * asignada (si hay) + selector para marcar/desmarcar el plan con una de las
 * aseguradoras DEL PACIENTE.
 *
 * Mismo patrón que `plan-detail.test.tsx`: hooks de red sustituidos por
 * stubs `vi.hoisted`. `@/components/ui/select` se mockea con un `<select>`
 * nativo (mismo mock que `booking-day-grid-contract.test.tsx`) para evitar
 * los eventos de puntero del Select real de Radix en jsdom.
 */
import { createElement, type ChangeEvent, type ReactNode } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  customerInsurances: { data: [] as unknown[], isPending: false },
  setPlanInsurer: { mutate: vi.fn(), isPending: false },
}));

vi.mock("@/hooks/use-insurers", () => ({
  useCustomerInsurances: () => m.customerInsurances,
  useSetPlanInsurer: () => m.setPlanInsurer,
}));

// `<select>` nativo equivalente al Select de Radix (evita sus eventos de puntero).
vi.mock("@/components/ui/select", async () => {
  const { createElement: h } = await import("react");
  return {
    Select: ({
      value,
      onValueChange,
      children,
    }: {
      value: string;
      onValueChange: (v: string) => void;
      children?: ReactNode;
    }) =>
      h(
        "select",
        {
          value,
          onChange: (e: ChangeEvent<HTMLSelectElement>) => onValueChange(e.target.value),
        },
        children,
      ),
    SelectTrigger: ({ children }: { children?: ReactNode }) => children,
    SelectValue: () => null,
    SelectContent: ({ children }: { children?: ReactNode }) => children,
    SelectItem: ({ value, children }: { value: string; children?: ReactNode }) =>
      h("option", { value }, children),
  };
});

import { PlanInsurerCard } from "@/components/dental/plan-insurer-card";

function resetAll(): void {
  m.customerInsurances.data = [];
  m.customerInsurances.isPending = false;
  m.setPlanInsurer.mutate = vi.fn();
  m.setPlanInsurer.isPending = false;
}

beforeEach(() => {
  resetAll();
});

afterEach(() => {
  cleanup();
});

const SANITAS_INSURANCE = {
  id: "cins-1",
  salon_id: "salon-1",
  customer_id: "cust-1",
  insurer_id: "ins-1",
  policy_number: null,
  notes: null,
  created_at: "2026-01-01T10:00:00.000Z",
  insurer: { name: "Sanitas" },
};

describe("PlanInsurerCard · cabecera del plan", () => {
  it("muestra «Sin mutua» cuando el plan no tiene aseguradora", () => {
    m.customerInsurances.data = [SANITAS_INSURANCE];

    render(
      createElement(PlanInsurerCard, {
        salonId: "salon-1",
        customerId: "cust-1",
        planId: "plan-1",
        insurerId: null,
      }),
    );

    // "Sin mutua" también aparece como <option> del selector nativo mockeado
    // (ver mock de `@/components/ui/select` arriba) — se acota al <span> de
    // la cabecera con `selector`.
    expect(screen.getByText("Sin mutua", { selector: "span" })).toBeInTheDocument();
  });

  it("muestra el nombre de la mutua cuando el plan tiene insurer_id asignado", () => {
    m.customerInsurances.data = [SANITAS_INSURANCE];

    render(
      createElement(PlanInsurerCard, {
        salonId: "salon-1",
        customerId: "cust-1",
        planId: "plan-1",
        insurerId: "ins-1",
      }),
    );

    expect(screen.getByText("Mutua del plan:")).toBeInTheDocument();
    // "Sanitas" también aparece como <option> del selector — se acota al <span>.
    expect(screen.getByText("Sanitas", { selector: "span" })).toBeInTheDocument();
  });

  it("sin aseguradoras asignadas al paciente, oculta el selector y avisa", () => {
    m.customerInsurances.data = [];

    render(
      createElement(PlanInsurerCard, {
        salonId: "salon-1",
        customerId: "cust-1",
        planId: "plan-1",
        insurerId: null,
      }),
    );

    expect(screen.queryByRole("combobox")).toBeNull();
    expect(
      screen.getByText("El paciente no tiene ninguna aseguradora asignada."),
    ).toBeInTheDocument();
  });

  it("cambiar el selector a una aseguradora llama a setPlanInsurer con su id", () => {
    m.customerInsurances.data = [SANITAS_INSURANCE];

    render(
      createElement(PlanInsurerCard, {
        salonId: "salon-1",
        customerId: "cust-1",
        planId: "plan-1",
        insurerId: null,
      }),
    );

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "ins-1" } });

    expect(m.setPlanInsurer.mutate).toHaveBeenCalledWith(
      "ins-1",
      expect.objectContaining({ onError: expect.any(Function) }),
    );
  });

  it("cambiar el selector a «Sin mutua» llama a setPlanInsurer con null", () => {
    m.customerInsurances.data = [SANITAS_INSURANCE];

    render(
      createElement(PlanInsurerCard, {
        salonId: "salon-1",
        customerId: "cust-1",
        planId: "plan-1",
        insurerId: "ins-1",
      }),
    );

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "__none__" } });

    expect(m.setPlanInsurer.mutate).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ onError: expect.any(Function) }),
    );
  });
});
