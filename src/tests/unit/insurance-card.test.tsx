/**
 * `InsuranceCard` — tarjeta "Seguro / Mutua" de la ficha del paciente
 * (customers/[id]): lista las aseguradoras asignadas y permite añadir/quitar.
 *
 * Mismo patrón que `plan-detail.test.tsx`: hooks de red sustituidos por
 * stubs `vi.hoisted`. `@/components/ui/select` se mockea con un `<select>`
 * nativo — mismo mock que `booking-day-grid-contract.test.tsx` — para evitar
 * los eventos de puntero del Select real de Radix en jsdom.
 */
import { createElement, type ChangeEvent, type ReactNode } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  insurances: { data: [] as unknown[], isPending: false, isError: false, error: null as unknown },
  insurers: { data: [] as unknown[] },
  add: { mutate: vi.fn(), isPending: false },
  remove: { mutate: vi.fn(), isPending: false },
}));

vi.mock("@/hooks/use-insurers", () => ({
  useCustomerInsurances: () => m.insurances,
  useInsurers: () => m.insurers,
  useAddCustomerInsurance: () => m.add,
  useRemoveCustomerInsurance: () => m.remove,
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

import { InsuranceCard } from "@/app/(dashboard)/customers/[id]/insurance-card";

function resetAll(): void {
  m.insurances.data = [];
  m.insurances.isPending = false;
  m.insurances.isError = false;
  m.insurances.error = null;
  m.insurers.data = [];
  m.add.mutate = vi.fn();
  m.add.isPending = false;
  m.remove.mutate = vi.fn();
  m.remove.isPending = false;
}

beforeEach(() => {
  resetAll();
});

afterEach(() => {
  cleanup();
});

describe("InsuranceCard · lista de seguros del paciente", () => {
  it("estado vacío cuando el paciente no tiene aseguradora asignada", () => {
    render(createElement(InsuranceCard, { salonId: "salon-1", customerId: "cust-1" }));

    expect(screen.getByText("Sin aseguradora asignada todavía.")).toBeInTheDocument();
  });

  it("lista las aseguradoras asignadas con su nº de póliza", () => {
    m.insurances.data = [
      {
        id: "cins-1",
        salon_id: "salon-1",
        customer_id: "cust-1",
        insurer_id: "ins-1",
        policy_number: "POL-999",
        notes: null,
        created_at: "2026-01-01T10:00:00.000Z",
        insurer: { name: "Sanitas" },
      },
    ];

    render(createElement(InsuranceCard, { salonId: "salon-1", customerId: "cust-1" }));

    expect(screen.getByText("Sanitas")).toBeInTheDocument();
    expect(screen.getByText("Póliza POL-999")).toBeInTheDocument();
  });

  it("al pulsar quitar, llama a la mutación de borrado con el id de la póliza", () => {
    m.insurances.data = [
      {
        id: "cins-1",
        salon_id: "salon-1",
        customer_id: "cust-1",
        insurer_id: "ins-1",
        policy_number: null,
        notes: null,
        created_at: "2026-01-01T10:00:00.000Z",
        insurer: { name: "Sanitas" },
      },
    ];

    render(createElement(InsuranceCard, { salonId: "salon-1", customerId: "cust-1" }));

    fireEvent.click(screen.getByRole("button", { name: "Quitar Sanitas" }));

    expect(m.remove.mutate).toHaveBeenCalledWith("cins-1");
  });
});

describe("InsuranceCard · añadir seguro", () => {
  it("el selector solo ofrece aseguradoras que el paciente NO tiene ya asignadas", () => {
    m.insurers.data = [
      { id: "ins-1", name: "Sanitas" },
      { id: "ins-2", name: "Adeslas" },
    ];
    m.insurances.data = [
      {
        id: "cins-1",
        salon_id: "salon-1",
        customer_id: "cust-1",
        insurer_id: "ins-1",
        policy_number: null,
        notes: null,
        created_at: "2026-01-01T10:00:00.000Z",
        insurer: { name: "Sanitas" },
      },
    ];

    render(createElement(InsuranceCard, { salonId: "salon-1", customerId: "cust-1" }));

    expect(screen.queryByRole("option", { name: "Sanitas" })).toBeNull();
    expect(screen.getByRole("option", { name: "Adeslas" })).toBeInTheDocument();
  });

  it("no muestra el formulario de alta si no quedan aseguradoras disponibles", () => {
    m.insurers.data = [{ id: "ins-1", name: "Sanitas" }];
    m.insurances.data = [
      {
        id: "cins-1",
        salon_id: "salon-1",
        customer_id: "cust-1",
        insurer_id: "ins-1",
        policy_number: null,
        notes: null,
        created_at: "2026-01-01T10:00:00.000Z",
        insurer: { name: "Sanitas" },
      },
    ];

    render(createElement(InsuranceCard, { salonId: "salon-1", customerId: "cust-1" }));

    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.queryByRole("button", { name: "Añadir" })).toBeNull();
  });

  it("sin seleccionar aseguradora, «Añadir» muestra un error y no llama a la mutación", () => {
    m.insurers.data = [{ id: "ins-1", name: "Sanitas" }];

    render(createElement(InsuranceCard, { salonId: "salon-1", customerId: "cust-1" }));

    fireEvent.click(screen.getByRole("button", { name: "Añadir" }));

    expect(m.add.mutate).not.toHaveBeenCalled();
    expect(screen.getByText("Selecciona una aseguradora.")).toBeInTheDocument();
  });

  it("seleccionar aseguradora + nº póliza y pulsar «Añadir» llama a la mutación con el payload correcto", () => {
    m.insurers.data = [{ id: "ins-1", name: "Sanitas" }];

    render(createElement(InsuranceCard, { salonId: "salon-1", customerId: "cust-1" }));

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "ins-1" } });
    fireEvent.change(screen.getByLabelText("Nº póliza"), { target: { value: "POL-42" } });
    fireEvent.click(screen.getByRole("button", { name: "Añadir" }));

    expect(m.add.mutate).toHaveBeenCalledTimes(1);
    const [input] = m.add.mutate.mock.calls[0] as [Record<string, unknown>];
    expect(input).toMatchObject({
      customerId: "cust-1",
      insurerId: "ins-1",
      policyNumber: "POL-42",
    });
  });
});
