/**
 * `SalonExceptionsEditor` — abrir un turno suelto o cerrar un día.
 *
 * Nace de un caso real: Nicolás pasa consulta un martes por la tarde, pero solo
 * ese martes. Sin esta pantalla la única forma de conseguirlo era abrir TODOS
 * los martes en el horario semanal — o pedírselo a alguien que lo metiera por
 * API, que es lo que pasó la primera vez.
 *
 * Lo que fijan estos tests es que la pantalla no permita guardar algo que
 * parezca configurado y luego no se aplique. Ese fallo silencioso es justo el
 * que hizo perder una tarde: se puso el turno, se aceptó, y en la agenda no
 * salía.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  lista: [] as unknown[],
  crear: vi.fn(),
  borrar: vi.fn(),
}));

vi.mock("@/hooks/use-schedules", () => ({
  useSalonOpeningExceptions: () => ({ data: h.lista, isPending: false, isError: false }),
  useCreateSalonOpeningException: () => ({ mutate: h.crear, isPending: false }),
  useDeleteSalonOpeningException: () => ({ mutate: h.borrar, isPending: false }),
}));

import { SalonExceptionsEditor } from "@/app/(dashboard)/ajustes/horarios/salon-exceptions-editor";

const SALON = "00000000-0000-0000-0000-000000000000";

function pintar() {
  render(<SalonExceptionsEditor salonId={SALON} today="2026-08-30" />);
}

beforeEach(() => {
  h.lista = [];
  h.crear = vi.fn();
  h.borrar = vi.fn();
});

afterEach(() => {
  cleanup();
});

describe("SalonExceptionsEditor", () => {
  it("distingue un turno extra de un cierre en la lista", () => {
    h.lista = [
      { id: "a", exception_date: "2026-09-01", is_open: true, start_time: "17:00:00", end_time: "20:00:00", reason: null },
      { id: "b", exception_date: "2026-12-25", is_open: false, start_time: null, end_time: null, reason: "Navidad" },
    ];

    pintar();

    expect(screen.getByText(/17:00/)).toBeInTheDocument();
    expect(screen.getByText(/cerrad/i)).toBeInTheDocument();
  });

  it("guarda un turno extra con su fecha y sus horas", () => {
    pintar();

    fireEvent.change(screen.getByLabelText(/fecha/i), { target: { value: "2026-09-01" } });
    fireEvent.change(screen.getByLabelText(/desde/i), { target: { value: "17:00" } });
    fireEvent.change(screen.getByLabelText(/hasta/i), { target: { value: "20:00" } });
    fireEvent.click(screen.getByRole("button", { name: /añadir|anadir/i }));

    expect(h.crear).toHaveBeenCalledTimes(1);
    expect(h.crear.mock.calls[0]?.[0]).toMatchObject({
      exception_date: "2026-09-01",
      is_open: true,
      start_time: "17:00",
      end_time: "20:00",
    });
  });

  it("al marcar «cerrado» no manda horas", () => {
    // Un cierre con horas es incoherente y la base lo rechaza; peor seria que
    // se guardara y el motor tuviera que adivinar.
    pintar();

    fireEvent.change(screen.getByLabelText(/fecha/i), { target: { value: "2026-12-25" } });
    fireEvent.click(screen.getByLabelText(/cerrar/i));
    fireEvent.click(screen.getByRole("button", { name: /añadir|anadir/i }));

    expect(h.crear.mock.calls[0]?.[0]).toMatchObject({
      is_open: false,
      start_time: null,
      end_time: null,
    });
  });

  it("no deja añadir sin fecha", () => {
    pintar();

    fireEvent.click(screen.getByRole("button", { name: /añadir|anadir/i }));

    expect(h.crear).not.toHaveBeenCalled();
  });

  it("explica que el turno extra se suma al horario de siempre", () => {
    // Sin decirlo, alguien esperaria que sustituyera la manana y creeria que
    // ha cerrado por la manana sin querer.
    pintar();

    expect(screen.getByText(/se suma/i)).toBeInTheDocument();
  });

  it("sin excepciones lo dice, en vez de dejar un hueco", () => {
    pintar();

    expect(screen.getByText(/no hay excepciones/i)).toBeInTheDocument();
  });

  it("se puede quitar una excepción", () => {
    h.lista = [
      { id: "a", exception_date: "2026-09-01", is_open: true, start_time: "17:00:00", end_time: "20:00:00", reason: null },
    ];

    pintar();
    fireEvent.click(screen.getByRole("button", { name: /quitar/i }));

    expect(h.borrar).toHaveBeenCalledWith("a", expect.anything());
  });
});
