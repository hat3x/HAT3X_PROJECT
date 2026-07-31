/**
 * `PerioSummary` — tarjeta de roll-ups agregados del periodontograma.
 *
 * Componente presentacional PURO: no llama hooks de red, solo aplica
 * `computePerioRollups`/`deriveCal`/`perioStage` (ya probados en
 * `perio.test.ts`) sobre las mediciones recibidas por prop y las muestra.
 */
import { createElement } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { PerioSummary } from "@/components/dental/perio-summary";
import type { PerioSiteMeasurement } from "@/lib/dental/perio";

afterEach(() => {
  cleanup();
});

describe("PerioSummary · muestra los roll-ups agregados", () => {
  it("con dos sitios (1 BoP de 2, CAL medio 4.5, peor CAL 6mm) → 50% · 5 mm · 4.5 · III", () => {
    const sites: PerioSiteMeasurement[] = [
      { fdi_tooth: 11, site: 1, pd_mm: 3, gingival_margin_mm: 0, bop: true },
      { fdi_tooth: 11, site: 2, pd_mm: 5, gingival_margin_mm: -1, bop: false },
    ];

    render(createElement(PerioSummary, { sites }));

    expect(screen.getByText("50%")).toBeInTheDocument();
    expect(screen.getByText("5 mm")).toBeInTheDocument();
    expect(screen.getByText("4.5")).toBeInTheDocument();
    expect(screen.getByText("III")).toBeInTheDocument();
  });

  it("sin sitios → 0%, 0 mm, 0.0 CAL medio y estadio I (sin dividir por cero)", () => {
    render(createElement(PerioSummary, { sites: [] }));

    expect(screen.getByText("0%")).toBeInTheDocument();
    expect(screen.getByText("0 mm")).toBeInTheDocument();
    expect(screen.getByText("0.0")).toBeInTheDocument();
    expect(screen.getByText("I")).toBeInTheDocument();
  });

  it("con CAL bajo (≤2mm) el estadio es I; con CAL 3-4mm el estadio es II", () => {
    const stageI: PerioSiteMeasurement[] = [
      { fdi_tooth: 11, site: 1, pd_mm: 2, gingival_margin_mm: 0, bop: false },
    ];
    const { unmount } = render(createElement(PerioSummary, { sites: stageI }));
    expect(screen.getByText("I")).toBeInTheDocument();
    unmount();

    const stageII: PerioSiteMeasurement[] = [
      { fdi_tooth: 11, site: 1, pd_mm: 4, gingival_margin_mm: 0, bop: false },
    ];
    render(createElement(PerioSummary, { sites: stageII }));
    expect(screen.getByText("II")).toBeInTheDocument();
  });
});
