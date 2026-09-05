/**
 * `AppointmentForm` — solapar una cita a propósito.
 *
 * Viene de una petición real de recepción: «necesito poder agendar a los
 * pacientes aunque se solapen los tiempos; tengo que mandar el recordatorio y
 * al agendar ya no me deja ponerle en la hora prevista».
 *
 * Lo que hay que demostrar no es que se pueda solapar, sino que:
 *   · no se solapa NUNCA sin confirmarlo expresamente;
 *   · a quien no tiene el permiso ni se le ofrece la salida;
 *   · el aviso se ve, y dice con qué está chocando.
 *
 * Hooks stubbeados, mismo patrón que el resto de tests de formulario: sin red
 * ni QueryClientProvider, solo el cableado de la interfaz.
 */
import { createElement, type ChangeEvent, type ReactNode } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const TZ = "Europe/Madrid";
const SALON_ID = "11111111-1111-1111-1111-111111111111";
const SERVICE_ID = "22222222-2222-2222-2222-222222222222";
const PROF_ID = "33333333-3333-3333-3333-333333333333";

const m = vi.hoisted(() => ({
  create: {
    mutate: vi.fn(),
    isPending: false,
    isError: false,
    error: null as unknown,
    data: undefined as unknown,
    reset: vi.fn(),
  },
}));

vi.mock("@/hooks/use-appointments", () => ({
  useCreateAppointment: () => m.create,
  useServices: () => ({
    data: [
      {
        id: SERVICE_ID,
        name: "Revisión",
        duration_minutes: 30,
        price_cents: 3000,
        currency: "EUR",
        category: null,
        description: null,
      },
    ],
    isPending: false,
    isError: false,
  }),
  useProfessionals: () => ({
    data: [{ id: PROF_ID, full_name: "Nicolás Zunino", color: "#e11d48" }],
    isPending: false,
    isError: false,
  }),
  useServiceProfessionalsMap: () => ({
    data: { [SERVICE_ID]: [PROF_ID] },
    isPending: false,
    isError: false,
  }),
  useAvailabilityDaySlots: () => ({ data: [], isPending: false, isError: false }),
}));

vi.mock("@/hooks/use-customers", () => ({
  useCustomerSearch: () => ({ data: [], isPending: false, isError: false }),
}));

// El Select de Radix no funciona en jsdom (eventos de puntero). Mismo apaño que
// `booking-day-grid-contract.test.tsx`: un <select> nativo con la misma API.
vi.mock("@/components/ui/select", async () => {
  const { createElement: h } = await import("react");
  return {
    Select: ({
      value,
      onValueChange,
      disabled,
      children,
    }: {
      value: string;
      onValueChange: (v: string) => void;
      disabled?: boolean;
      children?: ReactNode;
    }) =>
      h(
        "select",
        {
          value,
          disabled,
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

import { AppointmentForm } from "@/app/(dashboard)/appointments/appointment-form";

beforeEach(() => {
  m.create.mutate = vi.fn();
  m.create.isPending = false;
  m.create.isError = false;
  m.create.error = null;
  m.create.data = undefined;
  m.create.reset = vi.fn();
});

afterEach(() => {
  cleanup();
});

function renderForm(canOverlapAppointments: boolean) {
  const onSuccess = vi.fn();
  render(
    createElement(AppointmentForm, {
      salonId: SALON_ID,
      salonSlug: "biodental",
      timezone: TZ,
      canOverlapAppointments,
      onSuccess,
      onCancel: vi.fn(),
    }),
  );
  return { onSuccess };
}

/** Rellena lo mínimo para poder enviar: cliente y una hora escrita a mano. */
async function rellenarYEnviar(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.selectOptions(screen.getAllByRole("combobox")[0]!, SERVICE_ID);
  // Con hora a mano hace falta un profesional concreto: sin él no hay contra
  // quién comprobar el solape.
  await user.selectOptions(screen.getAllByRole("combobox")[1]!, PROF_ID);
  await user.click(screen.getByRole("button", { name: /Poner hora y duración a mano/ }));
  await user.type(screen.getByLabelText("Hora"), "19:00");
  await user.type(screen.getByLabelText(/Nombre y apellidos/), "Jesús Melchor");
  await user.type(screen.getByLabelText("Teléfono"), "652076372");
  await user.click(screen.getByRole("button", { name: /Crear cita/ }));
}

describe("AppointmentForm · solape deliberado", () => {
  it("el primer intento NUNCA pide solapar", async () => {
    const user = userEvent.setup();
    renderForm(true);
    await rellenarYEnviar(user);

    await waitFor(() => expect(m.create.mutate).toHaveBeenCalledTimes(1));
    const enviado = m.create.mutate.mock.calls[0]![0] as Record<string, unknown>;
    // Ni siquiera viaja la clave: solapar es una decisión, no un valor por defecto.
    expect(enviado).not.toHaveProperty("allowOverlap");
  });

  it("si el hueco está ocupado y tiene permiso, avisa en grande y ofrece seguir", async () => {
    const user = userEvent.setup();
    // El servidor contesta que el hueco está ocupado.
    m.create.data = { ok: false, code: "overlap", error: "Ese horario ya está ocupado." };
    renderForm(true);
    await rellenarYEnviar(user);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /Vas a solapar esta cita con otra/,
    );
    expect(screen.getByRole("button", { name: /Solapar de todas formas/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Elegir otra hora/ })).toBeInTheDocument();
  });

  it("al confirmar, reintenta el MISMO hueco marcando el solape", async () => {
    const user = userEvent.setup();
    m.create.data = { ok: false, code: "overlap", error: "Ese horario ya está ocupado." };
    renderForm(true);
    await rellenarYEnviar(user);

    const primerIntento = m.create.mutate.mock.calls[0]![0] as { startsAt: string };
    await user.click(screen.getByRole("button", { name: /Solapar de todas formas/ }));

    await waitFor(() => expect(m.create.mutate).toHaveBeenCalledTimes(2));
    const segundo = m.create.mutate.mock.calls[1]![0] as Record<string, unknown>;
    expect(segundo.allowOverlap).toBe(true);
    // Y es el mismo hueco: no se recalcula ni se desplaza.
    expect(segundo.startsAt).toBe(primerIntento.startsAt);
  });

  it("sin permiso no se ofrece la salida: solo el error de siempre", async () => {
    const user = userEvent.setup();
    m.create.data = { ok: false, code: "overlap", error: "Ese horario ya está ocupado. Elige otro." };
    renderForm(false);
    await rellenarYEnviar(user);

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Solapar de todas formas/ })).not.toBeInTheDocument();
    expect(screen.getByText(/Ese horario ya está ocupado\. Elige otro\./)).toBeInTheDocument();
  });

  it("un error que no es de solape no ofrece solapar, aunque tenga permiso", async () => {
    const user = userEvent.setup();
    m.create.data = { ok: false, error: "Servicio no disponible" };
    renderForm(true);
    await rellenarYEnviar(user);

    expect(screen.queryByRole("button", { name: /Solapar de todas formas/ })).not.toBeInTheDocument();
    expect(screen.getByText("Servicio no disponible")).toBeInTheDocument();
  });
});
