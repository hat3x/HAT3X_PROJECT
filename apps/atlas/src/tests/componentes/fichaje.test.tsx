import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Fichaje } from "@/components/marco/Fichaje";

const acciones = vi.hoisted(() => ({
  empezarFichaje: vi.fn(),
  pararFichaje: vi.fn(),
}));
vi.mock("@/lib/db/acciones-fichajes", () => acciones);

const PROYECTOS = [{ id: "p1", nombre: "Kairos" }];
const CLIENTES = [{ id: "c1", nombre: "Biodental" }];

beforeEach(() => {
  acciones.empezarFichaje.mockReset().mockResolvedValue({ ok: true });
  acciones.pararFichaje.mockReset().mockResolvedValue({ ok: true });
});

describe("Fichaje", () => {
  it("sin nada en curso, ofrece empezar", () => {
    render(<Fichaje enCurso={null} proyectos={PROYECTOS} clientes={CLIENTES} />);
    expect(screen.getByRole("button", { name: /empezar/i })).toBeInTheDocument();
  });

  it("empezar manda lo elegido; vacío es null, no cadena vacía", async () => {
    render(<Fichaje enCurso={null} proyectos={PROYECTOS} clientes={CLIENTES} />);
    fireEvent.change(screen.getByLabelText(/proyecto/i), { target: { value: "p1" } });
    fireEvent.click(screen.getByRole("button", { name: /empezar/i }));
    await waitFor(() =>
      expect(acciones.empezarFichaje).toHaveBeenCalledWith({ proyectoId: "p1", clienteId: null, nota: null })
    );
  });

  it("con uno en curso, dice qué y desde cuándo, y ofrece parar", () => {
    render(
      <Fichaje
        enCurso={{ id: "f1", etiqueta: "Kairos · Biodental", inicio: new Date(Date.now() - 125 * 60_000).toISOString() }}
        proyectos={PROYECTOS}
        clientes={CLIENTES}
      />
    );
    expect(screen.getByText("Kairos · Biodental")).toBeInTheDocument();
    expect(screen.getByText(/2 h 5 min/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /parar/i })).toBeInTheDocument();
  });

  it("si la acción falla, enseña el error y el botón vuelve a estar vivo", async () => {
    acciones.pararFichaje.mockResolvedValue({ ok: false, error: "No hay ningún fichaje en curso." });
    render(
      <Fichaje
        enCurso={{ id: "f1", etiqueta: "Sin asignar", inicio: new Date().toISOString() }}
        proyectos={PROYECTOS}
        clientes={CLIENTES}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /parar/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No hay ningún fichaje en curso.");
    expect(screen.getByRole("button", { name: /parar/i })).not.toBeDisabled();
  });
});
