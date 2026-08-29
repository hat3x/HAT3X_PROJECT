import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FormFacturaExterna } from "@/components/dinero/FormFacturaExterna";

// Los parámetros se declaran aunque no se usen: sin ellos `vi.fn` infiere una
// función de cero argumentos y `toHaveBeenCalledWith` deja de compilar.
const guardar = vi.fn(async (_e: unknown) => ({ ok: true }) as const);
vi.mock("@/lib/db/acciones-facturas", () => ({
  guardarFacturaExterna: (e: unknown) => guardar(e),
}));

const CLIENTES = [{ id: "c1", nombre: "Biodental" }];
const PROYECTOS = [{ id: "p1", nombre: "Kairos" }];

beforeEach(() => guardar.mockClear());

describe("formulario de factura externa", () => {
  // Hallazgo 1: una línea con importe (o proyecto) pero sin concepto no se
  // descarta en silencio, porque el usuario sí escribió algo ahí.
  it("una línea con importe pero sin concepto da error y no llama a la acción", async () => {
    render(<FormFacturaExterna clientes={CLIENTES} proyectos={PROYECTOS} />);
    const u = userEvent.setup();

    await u.type(screen.getByLabelText("Importe de la línea 1"), "10");
    await u.click(screen.getByRole("button", { name: "Registrar factura" }));

    expect(guardar).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "La línea 1 tiene importe o proyecto pero le falta el concepto."
    );
  });

  it("un importe de línea ilegible da error nombrando el concepto de esa línea", async () => {
    render(<FormFacturaExterna clientes={CLIENTES} proyectos={PROYECTOS} />);
    const u = userEvent.setup();

    await u.type(screen.getByLabelText("Concepto de la línea 1"), "Diseño web");
    await u.type(screen.getByLabelText("Importe de la línea 1"), "pepe");
    await u.click(screen.getByRole("button", { name: "Registrar factura" }));

    expect(guardar).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "El importe de «Diseño web» no se entiende."
    );
  });

  it("un número de factura que no es entero positivo da error", async () => {
    render(<FormFacturaExterna clientes={CLIENTES} proyectos={PROYECTOS} />);
    const u = userEvent.setup();

    await u.type(screen.getByLabelText("Concepto de la línea 1"), "Diseño web");
    await u.type(screen.getByLabelText("Importe de la línea 1"), "20");
    await u.type(screen.getByLabelText("Número"), "1.5");
    await u.click(screen.getByRole("button", { name: "Registrar factura" }));

    expect(guardar).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "El número de factura tiene que ser un entero positivo."
    );
  });

  it("el camino bueno manda las líneas en céntimos, con el proyecto de cada una", async () => {
    render(<FormFacturaExterna clientes={CLIENTES} proyectos={PROYECTOS} />);
    const u = userEvent.setup();

    await u.type(screen.getByLabelText("Concepto de la línea 1"), "Diseño web");
    await u.type(screen.getByLabelText("Importe de la línea 1"), "100,50");
    await u.selectOptions(screen.getByLabelText("Proyecto de la línea 1"), "p1");
    await u.type(screen.getByLabelText("Número"), "7");
    await u.click(screen.getByRole("button", { name: "Registrar factura" }));

    expect(guardar).toHaveBeenCalledWith(
      expect.objectContaining({
        clienteId: "c1",
        serie: "A",
        numero: 7,
        lineas: [
          expect.objectContaining({
            concepto: "Diseño web",
            cantidad: 1,
            precioUnitarioCentimos: 10050,
            proyectoId: "p1",
          }),
        ],
      })
    );
  });

  // Hallazgo 3: sin esto la siguiente factura sale con el mismo número y
  // choca contra `unique(serie, numero)` sin que se entienda por qué.
  it("tras guardar bien, el número queda limpio", async () => {
    render(<FormFacturaExterna clientes={CLIENTES} proyectos={PROYECTOS} />);
    const u = userEvent.setup();

    await u.type(screen.getByLabelText("Concepto de la línea 1"), "Diseño web");
    await u.type(screen.getByLabelText("Importe de la línea 1"), "20");
    const numero = screen.getByLabelText("Número") as HTMLInputElement;
    await u.type(numero, "7");
    await u.click(screen.getByRole("button", { name: "Registrar factura" }));

    expect(guardar).toHaveBeenCalled();
    expect(numero.value).toBe("");
  });
});
