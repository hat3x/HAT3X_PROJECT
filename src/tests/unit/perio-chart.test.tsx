/**
 * `PerioChart` — carta de sondaje periodontal (6 sitios/diente).
 *
 * Dos modos, un componente:
 *   · readOnly  → muestra una exploración ya guardada/firmada. Cruza
 *     `sites.tooth_id` con `teeth[].id` (perio_site no tiene fdi_tooth),
 *     igual que documenta `groupSitesByToothId` en `lib/queries/perio.ts`.
 *   · edición   → arranca en blanco (28 dientes permanentes sin terceros
 *     molares) cuando `teeth`/`sites` vienen vacíos (exploración nueva) y
 *     propaga cada cambio por `onChange` con el shape listo para
 *     `savePerioMeasurements` (PerioToothInput[]/PerioSiteInput[]).
 */
import { createElement } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PerioChart, type PerioChartDraft } from "@/components/dental/perio-chart";
import type { PerioSite, PerioTooth } from "@/types/database";

afterEach(() => {
  cleanup();
});

const CREATED_AT = "2026-07-31T10:00:00.000Z";

/** Diente de ejemplo (perio_tooth) para el modo readOnly. */
const TOOTH_11: PerioTooth = {
  id: "tooth-11",
  exam_id: "exam-1",
  salon_id: "salon-1",
  fdi_tooth: 11,
  mobility: 1,
  furcation: 0,
  plaque: true,
  created_at: CREATED_AT,
};

/** 6 sitios de sondaje (perio_site) del diente 11, PD 1..6mm (margen 0 ⇒ CAL = PD, sin colisión de texto). */
const SITES_TOOTH_11: PerioSite[] = [1, 2, 3, 4, 5, 6].map((site) => ({
  id: `site-11-${site}`,
  tooth_id: "tooth-11",
  salon_id: "salon-1",
  site,
  pd_mm: site,
  gingival_margin_mm: 0,
  cal_mm: site,
  bop: site === 1,
  suppuration: false,
  plaque: false,
  created_at: CREATED_AT,
}));

describe("PerioChart · readOnly", () => {
  it("con un diente y sus 6 sitios, renderiza las 6 lecturas de PD (1mm..6mm)", () => {
    render(createElement(PerioChart, { teeth: [TOOTH_11], sites: SITES_TOOTH_11, readOnly: true }));

    for (const pd of [1, 2, 3, 4, 5, 6]) {
      expect(screen.getByText(`${pd} mm`)).toBeInTheDocument();
    }
  });

  it("muestra movilidad, furcación y BoP del sitio marcado", () => {
    render(createElement(PerioChart, { teeth: [TOOTH_11], sites: SITES_TOOTH_11, readOnly: true }));

    expect(screen.getByText("Movilidad 1")).toBeInTheDocument();
    expect(screen.getByText("Furca 0")).toBeInTheDocument();
    expect(screen.getByText("BoP")).toBeInTheDocument(); // solo el sitio 1 tiene bop=true
  });
});

describe("PerioChart · edición", () => {
  it("teclear PD en un sitio dispara onChange con el valor actualizado", () => {
    const onChange = vi.fn();
    render(createElement(PerioChart, { teeth: [], sites: [], onChange }));

    // Primer diente del set por defecto (28 permanentes sin terceros molares) es 17.
    const pdInput = screen.getByLabelText("PD (mm) diente 17 sitio MB");
    fireEvent.change(pdInput, { target: { value: "4" } });

    expect(onChange).toHaveBeenCalled();
    const lastDraft = onChange.mock.calls.at(-1)?.[0] as PerioChartDraft;
    const changedSite = lastDraft.sites.find((s) => s.fdi_tooth === 17 && s.site === 1);
    expect(changedSite?.pd_mm).toBe(4);
  });

  it("alternar el toggle de BoP de un sitio dispara onChange con bop=true", () => {
    const onChange = vi.fn();
    render(createElement(PerioChart, { teeth: [], sites: [], onChange }));

    const bopButton = screen.getByLabelText("BoP diente 17 sitio MB");
    fireEvent.click(bopButton);

    const lastDraft = onChange.mock.calls.at(-1)?.[0] as PerioChartDraft;
    const changedSite = lastDraft.sites.find((s) => s.fdi_tooth === 17 && s.site === 1);
    expect(changedSite?.bop).toBe(true);
  });

  it("cambiar movilidad de un diente dispara onChange con el diente actualizado", () => {
    const onChange = vi.fn();
    render(createElement(PerioChart, { teeth: [], sites: [], onChange }));

    const mobilitySelect = screen.getByLabelText("Movilidad diente 17");
    fireEvent.change(mobilitySelect, { target: { value: "2" } });

    const lastDraft = onChange.mock.calls.at(-1)?.[0] as PerioChartDraft;
    const changedTooth = lastDraft.teeth.find((t) => t.fdi_tooth === 17);
    expect(changedTooth?.mobility).toBe(2);
  });
});
