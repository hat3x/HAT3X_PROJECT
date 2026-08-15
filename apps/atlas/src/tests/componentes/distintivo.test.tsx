import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Distintivo } from "@/components/ui/Distintivo";

describe("distintivo de estado", () => {
  it("nunca comunica el estado solo con color: siempre lleva texto", () => {
    render(<Distintivo estado="caido" texto="Caído" />);
    expect(screen.getByText("Caído")).toBeInTheDocument();
  });

  it("expone el estado a lectores de pantalla", () => {
    render(<Distintivo estado="caido" texto="Caído" />);
    expect(screen.getByRole("status")).toHaveAttribute("aria-label", "Estado: Caído");
  });

  it("usa el token de color correspondiente a cada estado", () => {
    const { rerender } = render(<Distintivo estado="ok" texto="Operativo" />);
    expect(screen.getByRole("status")).toHaveStyle({ color: "var(--estado-ok)" });
    rerender(<Distintivo estado="aviso" texto="Degradado" />);
    expect(screen.getByRole("status")).toHaveStyle({ color: "var(--estado-aviso)" });
    rerender(<Distintivo estado="desconocido" texto="Sin datos" />);
    expect(screen.getByRole("status")).toHaveStyle({ color: "var(--estado-desconocido)" });
  });
});
