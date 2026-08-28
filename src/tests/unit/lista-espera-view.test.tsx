/**
 * `ListaEsperaView` — la pantalla de quién espera un hueco (B3).
 *
 * Se prueba lo que decide si la pantalla sirve en el momento en que se usa: con
 * el teléfono sonando y alguien cancelando al otro lado.
 *
 * · El **teléfono tiene que estar a la vista y ser marcable**. Una lista de
 *   nombres sin número obliga a abrir otra pantalla justo cuando no hay tiempo.
 * · Las entradas ya resueltas (`agendado`, `descartado`) **no aparecen**: si se
 *   mezclaran con las vivas, alguien acabaría llamando a quien ya tiene cita.
 * · El vacío explica qué hacer, en vez de dejar una tabla en blanco.
 *
 * Los hooks se sustituyen por stubs, igual patrón que `consent-list.test.tsx`.
 */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { WaitlistEntryWithCustomer } from "@/lib/queries/waitlist";

const m = vi.hoisted(() => ({
  list: { data: [] as unknown[], isLoading: false },
  status: { mutate: vi.fn(), isPending: false },
  add: { mutate: vi.fn(), isPending: false },
  search: { data: [] as unknown[], isLoading: false },
}));

vi.mock("@/hooks/use-waitlist", () => ({
  useWaitlist: () => m.list,
  useSetWaitlistStatus: () => m.status,
  useAddToWaitlist: () => m.add,
}));

vi.mock("@/hooks/use-customers", () => ({
  useCustomerSearch: () => m.search,
}));

import { ListaEsperaView } from "@/app/(dashboard)/appointments/lista-espera/lista-espera-view";

const SALON_ID = "00000000-0000-0000-0000-000000000000";

function entry(overrides: Partial<WaitlistEntryWithCustomer> = {}): WaitlistEntryWithCustomer {
  return {
    id: "w1",
    salon_id: SALON_ID,
    customer_id: "c1",
    service_id: null,
    professional_id: null,
    weekdays: [1, 3],
    from_time: "09:00:00",
    to_time: "14:00:00",
    priority: 0,
    notes: null,
    status: "esperando",
    expires_at: null,
    notified_at: null,
    created_by: null,
    created_at: new Date(Date.now() - 3 * 86_400_000).toISOString(),
    updated_at: new Date().toISOString(),
    customer: { id: "c1", full_name: "Ana Ruiz", phone: "600111222" },
    ...overrides,
  } as WaitlistEntryWithCustomer;
}

beforeEach(() => {
  m.list = { data: [], isLoading: false };
  m.status = { mutate: vi.fn(), isPending: false };
  m.add = { mutate: vi.fn(), isPending: false };
  m.search = { data: [], isLoading: false };
});

afterEach(() => {
  cleanup();
});

describe("ListaEsperaView", () => {
  it("sin nadie esperando, explica para qué sirve en vez de dejar una tabla vacía", () => {
    render(<ListaEsperaView salonId={SALON_ID} />);

    expect(screen.getByText("No hay nadie esperando")).toBeInTheDocument();
    expect(screen.getByText(/avísame si sale algo antes/i)).toBeInTheDocument();
  });

  it("muestra el teléfono como enlace marcable", () => {
    m.list = { data: [entry()], isLoading: false };

    render(<ListaEsperaView salonId={SALON_ID} />);

    const tel = screen.getByRole("link", { name: /600111222/ });
    expect(tel).toHaveAttribute("href", "tel:600111222");
  });

  it("resume cuándo le viene bien al paciente", () => {
    m.list = { data: [entry()], isLoading: false };

    render(<ListaEsperaView salonId={SALON_ID} />);

    // Lunes y miércoles, de nueve a dos.
    expect(screen.getByText("L X · 09:00–14:00")).toBeInTheDocument();
  });

  it("dice 'cualquier día' cuando no hay preferencia, no una casilla vacía", () => {
    m.list = { data: [entry({ weekdays: [], from_time: null, to_time: null })], isLoading: false };

    render(<ListaEsperaView salonId={SALON_ID} />);

    expect(screen.getByText("cualquier día · a cualquier hora")).toBeInTheDocument();
  });

  it("cuenta cuánto lleva esperando", () => {
    m.list = { data: [entry()], isLoading: false };

    render(<ListaEsperaView salonId={SALON_ID} />);

    expect(screen.getByText("3 días")).toBeInTheDocument();
  });

  it("oculta a quien ya tiene cita o se descartó", () => {
    // Mezclarlos con los vivos llevaría a llamar a alguien que ya está citado.
    m.list = {
      data: [
        entry({ id: "viva", customer: { id: "c1", full_name: "Ana Ruiz", phone: "600111222" } }),
        entry({
          id: "agendada",
          status: "agendado",
          customer: { id: "c2", full_name: "Luis Soto", phone: "600333444" },
        }),
        entry({
          id: "descartada",
          status: "descartado",
          customer: { id: "c3", full_name: "Marta Gil", phone: "600555666" },
        }),
      ],
      isLoading: false,
    };

    render(<ListaEsperaView salonId={SALON_ID} />);

    expect(screen.getByText("Ana Ruiz")).toBeInTheDocument();
    expect(screen.queryByText("Luis Soto")).not.toBeInTheDocument();
    expect(screen.queryByText("Marta Gil")).not.toBeInTheDocument();
  });

  it("marcar como agendado llama a la mutación con ese estado", () => {
    m.list = { data: [entry()], isLoading: false };

    render(<ListaEsperaView salonId={SALON_ID} />);
    fireEvent.click(screen.getByRole("button", { name: /Marcar como agendado a Ana Ruiz/ }));

    expect(m.status.mutate).toHaveBeenCalledTimes(1);
    expect(m.status.mutate).toHaveBeenCalledWith(
      { entryId: "w1", status: "agendado" },
      expect.anything(),
    );
  });

  it("señala a quien lleva prioridad", () => {
    m.list = { data: [entry({ priority: 5 })], isLoading: false };

    render(<ListaEsperaView salonId={SALON_ID} />);

    const celda = screen.getByText("Ana Ruiz").closest("td") as HTMLElement;
    expect(within(celda).getByText("Prioridad")).toBeInTheDocument();
  });

  it("se puede apuntar a alguien sin poner ninguna preferencia", () => {
    // El caso más común en mostrador: «avísame si sale algo». Exigir días u
    // horas produciría listas de gente imposible de encajar.
    const PACIENTE = "99999999-9999-9999-9999-999999999999";
    m.search = {
      data: [{ id: PACIENTE, full_name: "Ana Ruiz", phone: "600111222" }],
      isLoading: false,
    };

    render(<ListaEsperaView salonId={SALON_ID} />);
    fireEvent.click(screen.getByRole("button", { name: /Apuntar a alguien/ }));

    fireEvent.change(screen.getByLabelText("Paciente"), { target: { value: "Ana" } });
    fireEvent.click(screen.getByRole("button", { name: /Ana Ruiz/ }));
    fireEvent.click(screen.getByRole("button", { name: "Apuntar" }));

    expect(m.add.mutate).toHaveBeenCalledTimes(1);
    const [input] = m.add.mutate.mock.calls[0] as [Record<string, unknown>];
    expect(input.customerId).toBe(PACIENTE);
    expect(input.weekdays).toEqual([]);
    expect(input.fromTime).toBeNull();
  });

  it("no deja apuntar sin elegir paciente", () => {
    render(<ListaEsperaView salonId={SALON_ID} />);
    fireEvent.click(screen.getByRole("button", { name: /Apuntar a alguien/ }));

    expect(screen.getByRole("button", { name: "Apuntar" })).toBeDisabled();
  });

  it("sin teléfono no rompe la fila", () => {
    m.list = {
      data: [entry({ customer: { id: "c1", full_name: "Ana Ruiz", phone: null } })],
      isLoading: false,
    };

    render(<ListaEsperaView salonId={SALON_ID} />);

    expect(screen.getByText("Ana Ruiz")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
