import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SelectorApariencia } from "@/components/ajustes/SelectorApariencia";

// El módulo real es "use server" y hablaría con Supabase. Aquí se prueba el
// selector, no la persistencia: de eso se ocupa apariencia.test.ts.
const guardar = vi.fn(async (_tema: string, _paleta: string) => ({ ok: true }));
vi.mock("@/lib/db/acciones-apariencia", () => ({
  guardarApariencia: (tema: string, paleta: string) => guardar(tema, paleta),
}));

beforeEach(() => {
  guardar.mockClear();
  document.documentElement.removeAttribute("data-tema");
  document.documentElement.removeAttribute("data-paleta");
});

describe("selector de apariencia", () => {
  it("ofrece las cinco paletas", () => {
    render(<SelectorApariencia temaActual="oscuro" paletaActual="zafiro" />);
    for (const nombre of ["Zafiro", "Nebulosa", "Océano", "Grafito", "Crepúsculo"]) {
      expect(screen.getByRole("radio", { name: new RegExp(nombre) })).toBeInTheDocument();
    }
  });

  it("marca como seleccionada la paleta activa", () => {
    render(<SelectorApariencia temaActual="oscuro" paletaActual="oceano" />);
    expect(screen.getByRole("radio", { name: /Océano/ })).toBeChecked();
    expect(screen.getByRole("radio", { name: /Zafiro/ })).not.toBeChecked();
  });

  it("avisa de que las paletas cálidas compiten con las alertas", () => {
    render(<SelectorApariencia temaActual="oscuro" paletaActual="crepusculo" />);
    expect(screen.getByText(/compensa el contraste/i)).toBeInTheDocument();
  });

  it("no muestra el aviso con una paleta fría", () => {
    render(<SelectorApariencia temaActual="oscuro" paletaActual="zafiro" />);
    expect(screen.queryByText(/compensa el contraste/i)).not.toBeInTheDocument();
  });

  it("guarda la combinación elegida", async () => {
    render(<SelectorApariencia temaActual="oscuro" paletaActual="zafiro" />);
    await userEvent.click(screen.getByRole("radio", { name: /Nebulosa/ }));
    expect(guardar).toHaveBeenCalledWith("oscuro", "nebulosa");
  });

  it("pinta el cambio en el acto, sin esperar al servidor", async () => {
    render(<SelectorApariencia temaActual="oscuro" paletaActual="zafiro" />);
    await userEvent.click(screen.getByRole("radio", { name: /Crepúsculo/ }));
    // El layout raíz se revalida después; esto es para que el color cambie ya.
    expect(document.documentElement.getAttribute("data-paleta")).toBe("crepusculo");
    expect(document.documentElement.getAttribute("data-tema")).toBe("oscuro");
  });

  it("cambiar de tema conserva la paleta", async () => {
    render(<SelectorApariencia temaActual="oscuro" paletaActual="oceano" />);
    await userEvent.click(screen.getByRole("radio", { name: /claro/i }));
    expect(guardar).toHaveBeenCalledWith("claro", "oceano");
  });

  it("enseña el error si el guardado falla", async () => {
    guardar.mockResolvedValueOnce({ ok: false, error: "No hay sesión." } as never);
    render(<SelectorApariencia temaActual="oscuro" paletaActual="zafiro" />);
    await userEvent.click(screen.getByRole("radio", { name: /Grafito/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No hay sesión.");
  });
});
