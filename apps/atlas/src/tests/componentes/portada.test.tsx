import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Portada } from "@/components/proyectos/Portada";

describe("portada de proyecto", () => {
  it("usa la imagen cuando la hay, con texto alternativo", () => {
    render(<Portada portadaUrl="/p/kairos.png" gradiente={null} nombre="Kairos" />);
    expect(screen.getByRole("img", { name: "Kairos" })).toHaveAttribute(
      "src",
      "/p/kairos.png"
    );
  });

  it("cae al gradiente del proyecto cuando no hay imagen", () => {
    const { container } = render(
      <Portada
        portadaUrl={null}
        gradiente="linear-gradient(135deg,#0071e3,#5ac8fa)"
        nombre="Kairos"
      />
    );
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(container.firstElementChild).toHaveStyle({
      background: "linear-gradient(135deg,#0071e3,#5ac8fa)",
    });
  });

  it("sin imagen ni gradiente cae a las auroras, nunca a un hueco gris", () => {
    const { container } = render(
      <Portada portadaUrl={null} gradiente={null} nombre="X" />
    );
    expect(container.firstElementChild).toHaveStyle({
      background: "linear-gradient(135deg, var(--aurora-1), var(--aurora-2))",
    });
  });
});
