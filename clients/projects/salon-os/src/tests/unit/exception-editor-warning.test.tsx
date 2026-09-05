/**
 * El aviso de que un "horario especial" SUSTITUYE el día del profesional.
 *
 * Caso real, y caro: se le puso a Nicolás un horario especial de 17:00 a 20:00
 * para un martes concreto, esperando AÑADIR esa tarde. Lo que hizo el sistema
 * fue reemplazar su día entero — ese martes dejó de trabajar por la mañana— y
 * nada lo dijo.
 *
 * Es el mismo fallo de siempre: configuras algo esperando una cosa, el sistema
 * hace otra, y no se nota hasta que alguien se queda sin cita. Este test fija
 * que la pantalla lo advierta ANTES de guardar.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/use-schedules", () => ({
  useScheduleExceptions: () => ({ data: [], isPending: false, isError: false }),
  useCreateException: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteException: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { ExceptionsEditor } from "@/app/(dashboard)/ajustes/horarios/exceptions-editor";

const SALON = "00000000-0000-0000-0000-000000000000";
const PRO = "cccccccc-cccc-cccc-cccc-cccccccccccc";

afterEach(() => {
  cleanup();
});

/** El aviso vive donde se toma la decision: dentro del dialogo de alta. */
function abrirAlta(): void {
  render(<ExceptionsEditor salonId={SALON} professionalId={PRO} />);
  fireEvent.click(screen.getByRole("button", { name: /nueva excepción|nueva excepcion/i }));
}

describe("ExceptionsEditor — aviso de sustitución", () => {
  it("advierte de que el horario especial reemplaza el día entero", () => {
    abrirAlta();

    expect(screen.getByText(/sustituye/i)).toBeInTheDocument();
  });

  it("dice dónde se añade un turno sin quitar el resto", () => {
    // Sin esta pista, la salida correcta —Dias sueltos, en el horario de la
    // clinica— es invisible justo cuando hace falta.
    abrirAlta();

    expect(screen.getByText(/días sueltos|dias sueltos/i)).toBeInTheDocument();
  });
});
