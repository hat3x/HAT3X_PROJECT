/**
 * Provider CLIENTE de entitlements — `SalonFeaturesProvider` + hooks (sub-3).
 *
 * El reductor puro (`toSalonFeatureFlags`) y el cableado DB→snapshot (`salonFeatureFlags`)
 * ya se fijan en `salon-feature-flags.test.ts` / `salon-features.test.ts`. Aquí se prueba
 * lo que ve el ÁRBOL CLIENTE del panel al leer el snapshot con los hooks:
 *
 *   · con `pos` activo  ⇒ los módulos de pago (Facturación, gráficas de ingresos) SE
 *     MUESTRAN; con `pos` inactivo, se OCULTAN.
 *   · la analítica de gestión (citas, clientes, ocupación) NO depende de `pos` y
 *     permanece SIEMPRE visible — es el criterio explícito del gating.
 *   · deny-by-default: sin provider, los hooks NO lanzan (a diferencia de `useTheme`) y
 *     resuelven `false` — un gate debe fallar CERRADO, nunca romper el panel.
 *
 * Un componente-sonda (`Probe`) consume los tres hooks y pinta marcadores; los tests
 * varían el snapshot inyectado y comprueban qué queda visible.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  SalonFeaturesProvider,
  useHasFeature,
  useHasPos,
  useSalonFeatures,
} from "@/components/providers/salon-features-provider";
import {
  EMPTY_SALON_FEATURE_FLAGS,
  type SalonFeatureFlags,
} from "@/lib/salon-feature-flags";

afterEach(() => {
  cleanup();
});

/** Sonda: refleja el gating de módulos de pago y la analítica de gestión (siempre visible). */
function Probe(): React.ReactElement {
  const flags = useSalonFeatures();
  const hasPos = useHasPos();
  const hasLoyalty = useHasFeature("loyalty");

  return (
    <div>
      {/* Módulos de pago: gated por `pos`. */}
      {hasPos ? <span>Facturación</span> : null}
      {hasPos ? <span>Gráficas de ingresos</span> : null}

      {/* Analítica de gestión: NO depende de `pos`, siempre presente. */}
      <span>Citas</span>
      <span>Clientes</span>
      <span>Ocupación</span>

      <span data-testid="loyalty">{hasLoyalty ? "loyalty-on" : "loyalty-off"}</span>
      <span data-testid="snapshot-pos">{String(flags.pos)}</span>
    </div>
  );
}

/** Snapshot completo a partir del vacío + overrides (todas las claves presentes). */
function flagsWith(overrides: Partial<SalonFeatureFlags>): SalonFeatureFlags {
  return { ...EMPTY_SALON_FEATURE_FLAGS, ...overrides };
}

function renderWithFlags(flags: SalonFeatureFlags): void {
  render(
    <SalonFeaturesProvider flags={flags}>
      <Probe />
    </SalonFeaturesProvider>,
  );
}

describe("SalonFeaturesProvider · gating de los módulos de pago por `pos`", () => {
  it("con `pos` activo ⇒ Facturación y gráficas de ingresos VISIBLES", () => {
    renderWithFlags(flagsWith({ pos: true }));

    expect(screen.getByText("Facturación")).toBeInTheDocument();
    expect(screen.getByText("Gráficas de ingresos")).toBeInTheDocument();
    expect(screen.getByTestId("snapshot-pos")).toHaveTextContent("true");
  });

  it("con `pos` inactivo ⇒ Facturación y gráficas de ingresos OCULTAS", () => {
    renderWithFlags(flagsWith({ pos: false }));

    expect(screen.queryByText("Facturación")).toBeNull();
    expect(screen.queryByText("Gráficas de ingresos")).toBeNull();
    expect(screen.getByTestId("snapshot-pos")).toHaveTextContent("false");
  });

  it("la analítica de gestión NO depende de `pos`: visible con o sin TPV", () => {
    renderWithFlags(flagsWith({ pos: false }));
    for (const label of ["Citas", "Clientes", "Ocupación"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });
});

describe("SalonFeaturesProvider · hooks de features individuales", () => {
  it("useHasFeature refleja un add-on distinto de `pos` (loyalty)", () => {
    renderWithFlags(flagsWith({ loyalty: true }));
    expect(screen.getByTestId("loyalty")).toHaveTextContent("loyalty-on");
  });

  it("un add-on ausente/false ⇒ su hook devuelve false", () => {
    renderWithFlags(flagsWith({})); // todo en false
    expect(screen.getByTestId("loyalty")).toHaveTextContent("loyalty-off");
  });
});

describe("SalonFeaturesProvider · deny-by-default sin provider", () => {
  it("sin provider, los hooks NO lanzan y resuelven false (fallo CERRADO)", () => {
    // A diferencia de `useTheme`, montar la sonda fuera del provider no debe romper: el
    // gate se cierra (oculta el módulo de pago) en vez de reventar el panel.
    expect(() => render(<Probe />)).not.toThrow();

    expect(screen.queryByText("Facturación")).toBeNull();
    expect(screen.getByTestId("snapshot-pos")).toHaveTextContent("false");
    // …y la analítica de gestión sigue visible.
    expect(screen.getByText("Citas")).toBeInTheDocument();
  });
});
