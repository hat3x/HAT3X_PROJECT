/**
 * `OdontogramChart` — evolutivo "boca en fecha X".
 *
 * Se mockea `@/hooks/use-odontogram` (igual patrón que
 * `customer-loyalty-gate.test.ts`: hooks de datos ajenos al foco del test,
 * sin red ni QueryClientProvider) para inyectar dos findings del MISMO
 * diente (11) con `recorded_at` distintos:
 *   · antiguo (ene 2026) → tooth_state "corona"   → glifo "♛" en el SVG
 *   · reciente (mar 2026) → tooth_state "implante" → glifo "I" en el SVG
 *
 * `currentStates` (lo que ya calculaba `deriveCurrentStates`) representa el
 * estado ACTUAL = el más reciente (implante). El test verifica:
 *   1. Por defecto (asOfDate null) se pinta el estado ACTUAL — comportamiento
 *      idéntico al de antes de este evolutivo.
 *   2. Al elegir una fecha intermedia (feb 2026, entre ambos eventos) se
 *      pinta el estado ANTIGUO vigente en esa fecha (vía `foldFindingsAsOf`),
 *      con aviso de "solo lectura" y sin abrir el `FindingPanel`.
 *   3. "Hoy" recupera el estado actual y el modo editable.
 */
import { createElement } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { CurrentToothState } from "@/lib/queries/odontogram";
import type { OdontogramFinding } from "@/types/database";

const FDI_11 = 11;
const TOOTH_11_LABEL = "Incisivo central superior derecho";

// Fixtures izadas para poder usarlas dentro de la factory de vi.mock.
const fx = vi.hoisted(() => {
  const CLINICAL_RECORD_ID = "clinical-record-1";
  const SALON_ID = "salon-1";

  const OLD_RECORDED_AT = "2026-01-10T10:00:00.000Z";
  const NEW_RECORDED_AT = "2026-03-01T10:00:00.000Z";

  const OLD_FINDING: import("@/types/database").OdontogramFinding = {
    id: "finding-old",
    clinical_record_id: CLINICAL_RECORD_ID,
    salon_id: SALON_ID,
    fdi_tooth: 11,
    surfaces: [],
    finding_type: "corona",
    tooth_state: "corona",
    notes: null,
    recorded_by: null,
    recorded_at: OLD_RECORDED_AT,
    created_at: OLD_RECORDED_AT,
  };

  const NEW_FINDING: import("@/types/database").OdontogramFinding = {
    id: "finding-new",
    clinical_record_id: CLINICAL_RECORD_ID,
    salon_id: SALON_ID,
    fdi_tooth: 11,
    surfaces: [],
    finding_type: "implante",
    tooth_state: "implante",
    notes: null,
    recorded_by: null,
    recorded_at: NEW_RECORDED_AT,
    created_at: NEW_RECORDED_AT,
  };

  return { CLINICAL_RECORD_ID, SALON_ID, OLD_FINDING, NEW_FINDING };
});

const FINDINGS: OdontogramFinding[] = [fx.OLD_FINDING, fx.NEW_FINDING];

// `currentStates` = lo que ya devolvía `deriveCurrentStates` (el más
// reciente por diente): aquí, el implante de marzo.
const CURRENT_STATES: Map<number, CurrentToothState> = new Map([
  [
    FDI_11,
    {
      fdi_tooth: FDI_11,
      tooth_state: fx.NEW_FINDING.tooth_state,
      affected_surfaces: fx.NEW_FINDING.surfaces,
      finding_type: fx.NEW_FINDING.finding_type,
      recorded_at: fx.NEW_FINDING.recorded_at,
    },
  ],
]);

vi.mock("@/hooks/use-odontogram", () => ({
  useOdontogramFindings: () => ({
    data: { findings: FINDINGS, currentStates: CURRENT_STATES },
    isLoading: false,
    isError: false,
  }),
  useAddFinding: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
}));

import { OdontogramChart } from "@/components/dental/odontogram-chart";

afterEach(() => {
  cleanup();
});

function renderChart(): void {
  render(
    createElement(OdontogramChart, {
      salonId: fx.SALON_ID,
      clinicalRecordId: fx.CLINICAL_RECORD_ID,
    }),
  );
}

describe("OdontogramChart · evolutivo boca en fecha X", () => {
  it("por defecto (sin fecha elegida) pinta el estado ACTUAL — comportamiento idéntico al de siempre", () => {
    renderChart();

    const tooth11 = screen.getByLabelText(TOOTH_11_LABEL);
    // Estado actual = implante (más reciente) → glifo "I".
    expect(within(tooth11).getByText("I")).toBeInTheDocument();
    expect(within(tooth11).queryByText("♛")).toBeNull();

    // Sin aviso de modo histórico.
    expect(screen.queryByText(/solo lectura/i)).toBeNull();

    // Editable: seleccionar el diente abre el FindingPanel.
    fireEvent.click(tooth11);
    expect(screen.getByText("Diente 11")).toBeInTheDocument();
  });

  it("al elegir una fecha intermedia, pinta el estado ANTIGUO vigente en esa fecha (solo lectura)", () => {
    renderChart();

    const dateInput = screen.getByLabelText("Boca en fecha:");
    fireEvent.change(dateInput, { target: { value: "2026-02-01" } });

    const tooth11 = screen.getByLabelText(TOOTH_11_LABEL);
    // 1 feb 2026 está entre el finding de corona (ene) y el de implante (mar):
    // debe pintarse el estado antiguo (corona) → glifo "♛".
    expect(within(tooth11).getByText("♛")).toBeInTheDocument();
    expect(within(tooth11).queryByText("I")).toBeNull();

    // Aviso de solo lectura visible.
    expect(screen.getByText(/solo lectura/i)).toBeInTheDocument();

    // Modo histórico: clicar el diente NO abre el FindingPanel de edición.
    fireEvent.click(tooth11);
    expect(screen.queryByText("Diente 11")).toBeNull();
  });

  it("'Hoy' recupera el estado actual y el modo editable", () => {
    renderChart();

    const dateInput = screen.getByLabelText("Boca en fecha:");
    fireEvent.change(dateInput, { target: { value: "2026-02-01" } });
    expect(screen.getByText(/solo lectura/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Hoy" }));

    expect(screen.queryByText(/solo lectura/i)).toBeNull();
    const tooth11 = screen.getByLabelText(TOOTH_11_LABEL);
    expect(within(tooth11).getByText("I")).toBeInTheDocument();

    fireEvent.click(tooth11);
    expect(screen.getByText("Diente 11")).toBeInTheDocument();
  });
});
