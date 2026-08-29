import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FormGasto } from "@/components/dinero/FormGasto";

// Los parámetros se declaran aunque no se usen: sin ellos `vi.fn` infiere una
// función de cero argumentos y `toHaveBeenCalledWith` deja de compilar.
const guardar = vi.fn(async (_e: unknown) => ({ ok: true }) as const);
vi.mock("@/lib/db/acciones-gastos", () => ({
  guardarGasto: (e: unknown) => guardar(e),
}));

const CLIENTES = [{ id: "c1", nombre: "Biodental" }];

beforeEach(() => guardar.mockClear());

describe("formulario de gasto", () => {
  it("manda los importes en céntimos, no en euros", async () => {
    render(<FormGasto clientes={CLIENTES} />);
    const u = userEvent.setup();

    await u.type(screen.getByLabelText("Concepto"), "Vercel Pro");
    await u.type(screen.getByLabelText("Base"), "20,00");
    await u.type(screen.getByLabelText("IVA"), "4,20");
    await u.click(screen.getByRole("button", { name: "Guardar gasto" }));

    expect(guardar).toHaveBeenCalledWith(
      expect.objectContaining({ baseCentimos: 2000, ivaCentimos: 420 })
    );
  });

  it("sin concepto no llama a guardar", async () => {
    render(<FormGasto clientes={CLIENTES} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Guardar gasto" }));

    expect(guardar).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("El gasto necesita un concepto.");
  });

  it("un importe que no se entiende se explica", async () => {
    render(<FormGasto clientes={CLIENTES} />);
    const u = userEvent.setup();

    await u.type(screen.getByLabelText("Concepto"), "Algo");
    await u.type(screen.getByLabelText("Base"), "pepe");
    await u.click(screen.getByRole("button", { name: "Guardar gasto" }));

    expect(guardar).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("La base no es un importe.");
  });

  // Sin cliente es estructura, y eso NO es un error: es el caso más común.
  it("sin cliente se guarda igual, como estructura", async () => {
    render(<FormGasto clientes={CLIENTES} />);
    const u = userEvent.setup();

    await u.type(screen.getByLabelText("Concepto"), "Vercel");
    await u.type(screen.getByLabelText("Base"), "20");
    await u.click(screen.getByRole("button", { name: "Guardar gasto" }));

    expect(guardar).toHaveBeenCalledWith(expect.objectContaining({ clienteId: null }));
  });
});
