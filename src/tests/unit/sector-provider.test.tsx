import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SectorProvider, useSector, useTerms } from "@/components/providers/sector-provider";

function Probe(): React.ReactElement {
  return <span>{`${useSector()}:${useTerms().customerPlural}`}</span>;
}

describe("SectorProvider", () => {
  it("propaga el sector y su terminologia", () => {
    render(<SectorProvider sector="odontologia"><Probe /></SectorProvider>);
    expect(screen.getByText("odontologia:Pacientes")).toBeInTheDocument();
  });
  it("sin provider cae a peluqueria (back-compat)", () => {
    render(<Probe />);
    expect(screen.getByText("peluqueria:Clientes")).toBeInTheDocument();
  });
});
