/**
 * `GabinetesView` — dar de alta los sillones de la clínica (B2).
 *
 * Sin esta pantalla, la disponibilidad por gabinete no sirve de nada: la lógica
 * está y el motor la usa, pero nadie puede crear un gabinete. Y hasta que
 * exista al menos uno, el sistema se comporta exactamente como antes.
 *
 * Lo que fijan estos tests es sobre todo lo que NO debe pasar:
 *
 *  · un gabinete NO se borra, se desactiva. Borrarlo dejaría sin explicación
 *    las citas que se atendieron en él;
 *  · la pantalla avisa de que activar el primero cambia cómo se calculan los
 *    huecos, porque es un cambio de comportamiento que nadie espera de una
 *    pantalla de ajustes.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  lista: [] as unknown[],
  crear: vi.fn(),
  cambiar: vi.fn(),
}));

vi.mock("@/hooks/use-operatories", () => ({
  useOperatories: () => ({ data: h.lista, isPending: false, isError: false }),
  useCreateOperatory: () => ({ mutate: h.crear, isPending: false }),
  useSetOperatoryActive: () => ({ mutate: h.cambiar, isPending: false }),
}));

import { GabinetesView } from "@/app/(dashboard)/ajustes/gabinetes/gabinetes-view";

const SALON = "00000000-0000-0000-0000-000000000000";

function pintar() {
  render(<GabinetesView salonId={SALON} />);
}

beforeEach(() => {
  h.lista = [];
  h.crear = vi.fn();
  h.cambiar = vi.fn();
});

afterEach(() => {
  cleanup();
});

describe("GabinetesView", () => {
  it("da de alta un gabinete por su nombre", () => {
    pintar();

    fireEvent.change(screen.getByLabelText(/nombre/i), { target: { value: "Gabinete 1" } });
    fireEvent.click(screen.getByRole("button", { name: /añadir|anadir/i }));

    expect(h.crear).toHaveBeenCalledTimes(1);
    expect(h.crear.mock.calls[0]?.[0]).toMatchObject({ name: "Gabinete 1" });
  });

  it("no deja añadir un gabinete sin nombre", () => {
    pintar();

    fireEvent.click(screen.getByRole("button", { name: /añadir|anadir/i }));

    expect(h.crear).not.toHaveBeenCalled();
  });

  it("desactiva en vez de borrar", () => {
    // Borrarlo dejaria sin explicacion las citas que se atendieron en el.
    h.lista = [{ id: "g1", name: "Gabinete 1", active: true }];

    pintar();
    fireEvent.click(screen.getByRole("button", { name: /desactivar/i }));

    expect(h.cambiar).toHaveBeenCalledWith({ id: "g1", active: false }, expect.anything());
  });

  it("un gabinete desactivado se puede volver a activar", () => {
    h.lista = [{ id: "g1", name: "Gabinete 1", active: false }];

    pintar();
    fireEvent.click(screen.getByRole("button", { name: /activar/i }));

    expect(h.cambiar).toHaveBeenCalledWith({ id: "g1", active: true }, expect.anything());
  });

  it("distingue a la vista los desactivados de los activos", () => {
    h.lista = [
      { id: "g1", name: "Gabinete 1", active: true },
      { id: "g2", name: "Gabinete 2", active: false },
    ];

    pintar();

    expect(screen.getByText(/desactivado/i)).toBeInTheDocument();
  });

  it("avisa de que el primer gabinete cambia el cálculo de huecos", () => {
    // Es un cambio de comportamiento que nadie espera de una pantalla de
    // ajustes: a partir del primero, una cita sin sillon libre deja de
    // ofrecerse.
    pintar();

    expect(screen.getByText(/sin gabinetes/i)).toBeInTheDocument();
  });

  it("sin gabinetes lo dice en vez de dejar la lista vacía", () => {
    pintar();

    expect(screen.getByText(/no hay gabinetes/i)).toBeInTheDocument();
  });
});
