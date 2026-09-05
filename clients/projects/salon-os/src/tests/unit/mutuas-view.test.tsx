/**
 * `MutuasView` — sección "Mutuas y seguros" de /ajustes: catálogo de
 * aseguradoras (CRUD) + baremo de precios por servicio.
 *
 * Mismo patrón que `plan-detail.test.tsx`: los hooks de red se sustituyen por
 * stubs `vi.hoisted` (sin QueryClientProvider en juego). `@/components/ui/dialog`
 * se mockea con un stub controlado por contexto (el `DialogContent` solo
 * renderiza si el `Dialog` padre tiene `open=true`) para evitar la
 * complejidad del Portal de Radix en jsdom — mismo espíritu que el mock de
 * `@/components/ui/select` en `booking-day-grid-contract.test.tsx`.
 */
import { createElement } from "react";
import type { ReactNode } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Insurer } from "@/types/database";

const m = vi.hoisted(() => ({
  insurers: {
    data: [] as unknown[],
    isPending: false,
    isError: false,
    error: null as unknown,
  },
  createInsurer: { mutate: vi.fn(), isPending: false, error: null as unknown },
  updateInsurer: { mutate: vi.fn(), isPending: false, error: null as unknown },
  deleteInsurer: { mutate: vi.fn(), isPending: false, error: null as unknown },
  tariff: { data: [] as unknown[], isPending: false, isError: false },
  setPrice: { mutate: vi.fn(), isPending: false },
  removePrice: { mutate: vi.fn(), isPending: false },
  services: { data: [] as unknown[], isPending: false, isError: false },
}));

vi.mock("@/hooks/use-insurers", () => ({
  useInsurers: () => m.insurers,
  useCreateInsurer: () => m.createInsurer,
  useUpdateInsurer: () => m.updateInsurer,
  useDeleteInsurer: () => m.deleteInsurer,
  useInsurerTariff: () => m.tariff,
  useSetInsurerServicePrice: () => m.setPrice,
  useRemoveInsurerServicePrice: () => m.removePrice,
}));

vi.mock("@/hooks/use-services", () => ({
  useServices: () => m.services,
}));

// Stub de Dialog: `DialogContent` solo se monta si el `Dialog` ancestro tiene
// `open=true` (vía contexto), sin usar el Portal/focus-trap real de Radix.
vi.mock("@/components/ui/dialog", async () => {
  const { createContext, useContext } = await import("react");
  const DialogOpenContext = createContext(false);
  return {
    Dialog: ({ open, children }: { open: boolean; children?: ReactNode }) =>
      createElement(DialogOpenContext.Provider, { value: open }, children),
    DialogContent: ({ children }: { children?: ReactNode }) => {
      const open = useContext(DialogOpenContext);
      return open ? createElement("div", { "data-testid": "dialog-content" }, children) : null;
    },
    DialogHeader: ({ children }: { children?: ReactNode }) => createElement("div", null, children),
    DialogFooter: ({ children }: { children?: ReactNode }) => createElement("div", null, children),
    DialogTitle: ({ children }: { children?: ReactNode }) => createElement("h2", null, children),
    DialogDescription: ({ children }: { children?: ReactNode }) =>
      createElement("p", null, children),
  };
});

import { MutuasView } from "@/app/(dashboard)/ajustes/mutuas/mutuas-view";

function insurer(overrides: Partial<Insurer> & { id: string }): Insurer {
  return {
    salon_id: "salon-1",
    name: "Sanitas",
    phone: null,
    email: null,
    notes: null,
    active: true,
    created_at: "2026-01-01T10:00:00.000Z",
    updated_at: "2026-01-01T10:00:00.000Z",
    ...overrides,
  };
}

function resetAll(): void {
  m.insurers.data = [];
  m.insurers.isPending = false;
  m.insurers.isError = false;
  m.insurers.error = null;
  m.createInsurer.mutate = vi.fn();
  m.createInsurer.isPending = false;
  m.createInsurer.error = null;
  m.updateInsurer.mutate = vi.fn();
  m.deleteInsurer.mutate = vi.fn();
  m.tariff.data = [];
  m.tariff.isPending = false;
  m.tariff.isError = false;
  m.setPrice.mutate = vi.fn();
  m.setPrice.isPending = false;
  m.removePrice.mutate = vi.fn();
  m.removePrice.isPending = false;
  m.services.data = [];
  m.services.isPending = false;
  m.services.isError = false;
}

beforeEach(() => {
  resetAll();
});

afterEach(() => {
  cleanup();
});

const SANITAS = insurer({ id: "ins-1", name: "Sanitas", phone: "900123456" });

describe("MutuasView · catálogo de aseguradoras", () => {
  it("renderiza el catálogo con nombre, contacto y estado", () => {
    m.insurers.data = [SANITAS, insurer({ id: "ins-2", name: "Adeslas", active: false })];

    render(createElement(MutuasView, { salonId: "salon-1" }));

    expect(screen.getByText("Sanitas")).toBeInTheDocument();
    expect(screen.getByText("900123456")).toBeInTheDocument();
    expect(screen.getByText("Adeslas")).toBeInTheDocument();
    expect(screen.getByText("Activa")).toBeInTheDocument();
    expect(screen.getByText("Inactiva")).toBeInTheDocument();
  });

  it("estado vacío cuando no hay aseguradoras", () => {
    render(createElement(MutuasView, { salonId: "salon-1" }));

    expect(screen.getByText("Aún no hay aseguradoras. Crea la primera.")).toBeInTheDocument();
  });

  it("al pulsar «Nueva aseguradora» abre el diálogo; enviar el formulario llama a la mutación de creación", () => {
    render(createElement(MutuasView, { salonId: "salon-1" }));

    expect(screen.queryByTestId("dialog-content")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Nueva aseguradora" }));
    expect(screen.getByTestId("dialog-content")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Nombre *"), { target: { value: "Adeslas" } });
    fireEvent.click(screen.getByRole("button", { name: "Crear aseguradora" }));

    expect(m.createInsurer.mutate).toHaveBeenCalledTimes(1);
    const [input] = m.createInsurer.mutate.mock.calls[0] as [Record<string, unknown>];
    expect(input).toMatchObject({ name: "Adeslas", active: true });
  });
});

describe("MutuasView · baremo de una aseguradora seleccionada", () => {
  it("al pulsar una fila, muestra el baremo con el precio actual (o vacío si no hay línea)", () => {
    m.insurers.data = [SANITAS];
    m.services.data = [
      { id: "svc-1", name: "Limpieza dental", price_cents: 4000 },
      { id: "svc-2", name: "Empaste", price_cents: 6000 },
    ];
    m.tariff.data = [
      {
        id: "price-1",
        salon_id: "salon-1",
        insurer_id: "ins-1",
        service_id: "svc-1",
        price_cents: 2000,
        created_at: "2026-01-01T10:00:00.000Z",
        service: { name: "Limpieza dental" },
      },
    ];

    render(createElement(MutuasView, { salonId: "salon-1" }));

    fireEvent.click(screen.getByText("Sanitas"));

    expect(screen.getByText("Baremo de «Sanitas»")).toBeInTheDocument();

    const priced = screen.getByLabelText(
      "Precio de Limpieza dental para esta aseguradora",
    ) as HTMLInputElement;
    expect(priced.value).toBe("20.00");
    expect(screen.getByRole("button", { name: "Quitar precio de Limpieza dental" })).toBeInTheDocument();

    const unpriced = screen.getByLabelText(
      "Precio de Empaste para esta aseguradora",
    ) as HTMLInputElement;
    expect(unpriced.value).toBe("");
    expect(screen.queryByRole("button", { name: "Quitar precio de Empaste" })).toBeNull();
  });

  it("TariffRow: guardar un precio nuevo llama a setInsurerServicePrice con priceCents redondeado", () => {
    m.insurers.data = [SANITAS];
    m.services.data = [{ id: "svc-2", name: "Empaste", price_cents: 6000 }];
    m.tariff.data = [];

    render(createElement(MutuasView, { salonId: "salon-1" }));
    fireEvent.click(screen.getByText("Sanitas"));

    const input = screen.getByLabelText("Precio de Empaste para esta aseguradora");
    fireEvent.change(input, { target: { value: "35,50" } });

    const row = input.closest("li");
    if (row === null) throw new Error("no se encontró la fila del baremo");
    fireEvent.click(within(row).getByRole("button", { name: "Guardar" }));

    expect(m.setPrice.mutate).toHaveBeenCalledWith({
      insurerId: "ins-1",
      serviceId: "svc-2",
      priceCents: 3550,
    });
  });

  it("TariffRow: precio inválido no llama a la mutación y muestra un error", () => {
    m.insurers.data = [SANITAS];
    m.services.data = [{ id: "svc-2", name: "Empaste", price_cents: 6000 }];
    m.tariff.data = [];

    render(createElement(MutuasView, { salonId: "salon-1" }));
    fireEvent.click(screen.getByText("Sanitas"));

    const input = screen.getByLabelText("Precio de Empaste para esta aseguradora");
    fireEvent.change(input, { target: { value: "-5" } });

    const row = input.closest("li");
    if (row === null) throw new Error("no se encontró la fila del baremo");
    fireEvent.click(within(row).getByRole("button", { name: "Guardar" }));

    expect(m.setPrice.mutate).not.toHaveBeenCalled();
    expect(within(row).getByText("Precio no válido.")).toBeInTheDocument();
  });

  it("TariffRow: quitar un precio llama a removeInsurerServicePrice con el id de la línea", () => {
    m.insurers.data = [SANITAS];
    m.services.data = [{ id: "svc-1", name: "Limpieza dental", price_cents: 4000 }];
    m.tariff.data = [
      {
        id: "price-1",
        salon_id: "salon-1",
        insurer_id: "ins-1",
        service_id: "svc-1",
        price_cents: 2000,
        created_at: "2026-01-01T10:00:00.000Z",
        service: { name: "Limpieza dental" },
      },
    ];

    render(createElement(MutuasView, { salonId: "salon-1" }));
    fireEvent.click(screen.getByText("Sanitas"));

    fireEvent.click(screen.getByRole("button", { name: "Quitar precio de Limpieza dental" }));

    expect(m.removePrice.mutate).toHaveBeenCalledWith("price-1");
  });
});
