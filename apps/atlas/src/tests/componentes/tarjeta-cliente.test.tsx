import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TarjetaCliente } from "@/components/clientes/TarjetaCliente";
import type { ClienteResumen } from "@/lib/db/clientes";

const base: ClienteResumen = {
  id: "1",
  nombre: "Dental Demo",
  slug: "dental-demo",
  sector: "Odontología",
  estado: "activo",
  cuotaTotal: 350,
  numProyectos: 2,
};

describe("tarjeta de cliente", () => {
  it("muestra nombre, sector y número de proyectos", () => {
    render(<TarjetaCliente cliente={base} verImportes />);
    expect(screen.getByText("Dental Demo")).toBeInTheDocument();
    expect(screen.getByText(/Odontología/)).toBeInTheDocument();
    expect(screen.getByText(/2 proyectos/)).toBeInTheDocument();
  });

  it("muestra la cuota cuando se pueden ver importes", () => {
    render(<TarjetaCliente cliente={base} verImportes />);
    expect(screen.getByText(/350/)).toBeInTheDocument();
  });

  it("NO muestra ninguna cifra cuando no se pueden ver importes", () => {
    render(<TarjetaCliente cliente={{ ...base, cuotaTotal: null }} verImportes={false} />);
    expect(screen.queryByText(/€/)).not.toBeInTheDocument();
    expect(screen.queryByText(/350/)).not.toBeInTheDocument();
  });

  it("dice «1 proyecto» en singular", () => {
    render(<TarjetaCliente cliente={{ ...base, numProyectos: 1 }} verImportes />);
    expect(screen.getByText(/1 proyecto(?!s)/)).toBeInTheDocument();
  });

  it("enlaza a la ficha por su slug", () => {
    render(<TarjetaCliente cliente={base} verImportes />);
    expect(screen.getByRole("link", { name: /Dental Demo/ })).toHaveAttribute(
      "href",
      "/clientes/dental-demo"
    );
  });
});
