import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FormCliente } from "@/components/clientes/FormCliente";

// Los parámetros se declaran aunque no se usen: sin ellos `vi.fn` infiere una
// función de cero argumentos y `toHaveBeenCalledWith` deja de compilar.
const guardarCliente = vi.fn(async (_entrada: unknown) => ({ ok: true, slug: "x" }));
vi.mock("@/lib/db/acciones-clientes", () => ({
  guardarCliente: (entrada: unknown) => guardarCliente(entrada),
}));

beforeEach(() => guardarCliente.mockClear());

async function abrir() {
  render(<FormCliente />);
  await userEvent.click(screen.getByRole("button", { name: /nuevo cliente/i }));
}

describe("alta de cliente", () => {
  it("está plegado hasta que lo pides", () => {
    render(<FormCliente />);
    expect(screen.queryByLabelText(/nombre/i)).not.toBeInTheDocument();
  });

  it("propone el identificador a partir del nombre", async () => {
    await abrir();
    await userEvent.type(screen.getByLabelText(/nombre/i), "Clínica Dental Biodental");
    expect(screen.getByLabelText(/identificador/i)).toHaveValue(
      "clinica-dental-biodental"
    );
  });

  it("deja de seguir al nombre en cuanto tocas el identificador", async () => {
    await abrir();
    await userEvent.type(screen.getByLabelText(/nombre/i), "Biodental");
    await userEvent.clear(screen.getByLabelText(/identificador/i));
    await userEvent.type(screen.getByLabelText(/identificador/i), "bio");
    await userEvent.type(screen.getByLabelText(/nombre/i), " Clinica");

    expect(screen.getByLabelText(/identificador/i)).toHaveValue("bio");
  });

  it("no deja guardar sin nombre", async () => {
    await abrir();
    await userEvent.click(screen.getByRole("button", { name: /guardar cliente/i }));
    expect(guardarCliente).not.toHaveBeenCalled();
    expect(await screen.findByRole("alert")).toHaveTextContent(/nombre/i);
  });

  it("manda los campos opcionales vacíos como null", async () => {
    await abrir();
    await userEvent.type(screen.getByLabelText(/nombre/i), "Club BioSpa");
    await userEvent.click(screen.getByRole("button", { name: /guardar cliente/i }));

    expect(guardarCliente).toHaveBeenCalledWith({
      nombre: "Club BioSpa",
      slug: "club-biospa",
      sector: null,
      estado: "activo",
      razonSocial: null,
      cif: null,
      direccion: null,
    });
  });

  it("manda la ficha completa cuando la rellenas", async () => {
    await abrir();
    await userEvent.type(screen.getByLabelText(/nombre/i), "Biodental");
    await userEvent.type(screen.getByLabelText(/sector/i), "odontologia");
    await userEvent.selectOptions(screen.getByLabelText(/estado/i), "potencial");
    await userEvent.type(screen.getByLabelText(/social/i), "Biodental SL");
    await userEvent.type(screen.getByLabelText(/^cif$/i), "B12345678");
    await userEvent.type(screen.getByLabelText(/direcci/i), "Calle Falsa 1");
    await userEvent.click(screen.getByRole("button", { name: /guardar cliente/i }));

    expect(guardarCliente).toHaveBeenCalledWith({
      nombre: "Biodental",
      slug: "biodental",
      sector: "odontologia",
      estado: "potencial",
      razonSocial: "Biodental SL",
      cif: "B12345678",
      direccion: "Calle Falsa 1",
    });
  });

  it("enseña el error y conserva lo escrito", async () => {
    guardarCliente.mockResolvedValueOnce({
      ok: false,
      error: "Ya existe un cliente con el identificador «biodental».",
    } as never);
    await abrir();
    await userEvent.type(screen.getByLabelText(/nombre/i), "Biodental");
    await userEvent.click(screen.getByRole("button", { name: /guardar cliente/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Ya existe un cliente");
    expect(screen.getByLabelText(/nombre/i)).toHaveValue("Biodental");
  });
});
