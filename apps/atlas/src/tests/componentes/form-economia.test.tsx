import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { FormEconomia } from "@/components/ajustes/FormEconomia";

const acciones = vi.hoisted(() => ({ guardarAjustesEconomia: vi.fn() }));
vi.mock("@/lib/db/acciones-economia", () => acciones);

const ACTUAL = { razonSocial: null, cif: null, direccion: null, costeHoraCentimos: 3000, validadoGestoria: false };

beforeEach(() => acciones.guardarAjustesEconomia.mockReset().mockResolvedValue({ ok: true }));

describe("FormEconomia", () => {
  it("enseña el coste actual en euros", () => {
    render(<FormEconomia actual={ACTUAL} />);
    expect(screen.getByLabelText(/coste de la hora/i)).toHaveValue("30,00");
  });

  it("manda céntimos, no euros, y los textos vacíos como null", async () => {
    render(<FormEconomia actual={ACTUAL} />);
    fireEvent.change(screen.getByLabelText(/coste de la hora/i), { target: { value: "32,5" } });
    fireEvent.click(screen.getByRole("button", { name: /guardar/i }));
    await waitFor(() =>
      expect(acciones.guardarAjustesEconomia).toHaveBeenCalledWith({ razonSocial: null, cif: null, direccion: null, costeHoraCentimos: 3250 })
    );
  });

  it("un coste que no es un importe no llega a la acción", async () => {
    render(<FormEconomia actual={ACTUAL} />);
    fireEvent.change(screen.getByLabelText(/coste de la hora/i), { target: { value: "treinta" } });
    fireEvent.click(screen.getByRole("button", { name: /guardar/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/importe/i);
    expect(acciones.guardarAjustesEconomia).not.toHaveBeenCalled();
  });
});
