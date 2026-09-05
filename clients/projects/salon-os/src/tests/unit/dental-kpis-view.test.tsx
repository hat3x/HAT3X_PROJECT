/**
 * `DentalKpis` — la vista de clínica de `/analitica` (B5).
 *
 * El panel actual cuenta como un comercio: facturación, tickets, ticket medio.
 * Esta sección responde lo que pregunta un director de clínica, y su valor
 * depende de una cosa: que los números signifiquen lo que parece que
 * significan.
 *
 * De ahí que estos tests insistan en el caso sin datos. Un "0 %" de aceptación
 * dice "los presentamos y nos dijeron que no" — una conclusión falsa y cara si
 * en realidad no se presentó ninguno.
 *
 * Las cifras de ejemplo son los recuentos reales que devolvieron los RPC al
 * verificarlos: agregados, sin ningún dato de paciente.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { DentalKpis } from "@/app/(dashboard)/analitica/dental-kpis";

function pintar(props: Partial<React.ComponentProps<typeof DentalKpis>> = {}) {
  render(
    <DentalKpis
      planCounts={{
        draft: 1,
        proposed: 296,
        accepted: 0,
        in_progress: 38,
        completed: 24,
        cancelled: 0,
      }}
      outcomes={{ noShow: 5, completed: 17, cancelled: 0, pending: 86 }}
      unscheduled={{ items: 6304, patients: 754, valueCents: 123897709 }}
      currency="EUR"
      {...props}
    />,
  );
}

afterEach(() => {
  cleanup();
});

describe("DentalKpis", () => {
  it("cuenta como aceptado lo que ya se está ejecutando", () => {
    // Caso real: 0 en `accepted`, pero 38 en curso y 24 terminados. Con el
    // criterio ingenuo saldria 0 % — y son 62 planes que evidentemente
    // salieron adelante. 62/358 = 17 %.
    pintar();

    expect(screen.getByText("17 %")).toBeInTheDocument();
  });

  it("saca aparte los presupuestos sin respuesta, que son la lista de llamadas", () => {
    pintar();

    expect(screen.getByText("296")).toBeInTheDocument();
  });

  it("pone precio al trabajo vendido y sin agendar", () => {
    // Un recuento de items no mueve a nadie; una cifra en euros, si.
    pintar();

    expect(screen.getByText(/1\.238\.977/)).toBeInTheDocument();
  });

  it("dice a cuántos pacientes afecta esa cartera", () => {
    pintar();

    expect(screen.getByText(/754 pacientes/)).toBeInTheDocument();
  });

  it("mide las ausencias sobre las citas que ya pasaron", () => {
    // 5 de 22 atendidas = 23 %. Las 86 pendientes NO diluyen el dato.
    pintar();

    expect(screen.getByText("23 %")).toBeInTheDocument();
  });

  it("sin presupuestos presentados dice «sin datos», no cero por ciento", () => {
    pintar({
      planCounts: {
        draft: 4,
        proposed: 0,
        accepted: 0,
        in_progress: 0,
        completed: 0,
        cancelled: 0,
      },
    });

    expect(screen.getAllByText(/sin datos/i).length).toBeGreaterThan(0);
    expect(screen.queryByText("0 %")).not.toBeInTheDocument();
  });

  it("sin citas pasadas tampoco inventa una tasa de ausencias", () => {
    pintar({ outcomes: { noShow: 0, completed: 0, cancelled: 3, pending: 9 } });

    expect(screen.getAllByText(/sin datos/i).length).toBeGreaterThan(0);
  });
});
