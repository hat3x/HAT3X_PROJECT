/**
 * Indicadores propios de clínica dental (B5).
 *
 * `/analitica` hoy es un panel de comercio: facturación, tickets, ticket medio.
 * Un director de clínica mira otras cosas, y los datos para calcularlas ya
 * están en la base — solo que nadie los cuenta.
 *
 * Aquí vive la parte que decide si esos números valen algo: QUÉ cuenta como
 * aceptado y SOBRE QUÉ se divide. Un KPI con el denominador equivocado no es
 * un KPI impreciso, es uno que hace tomar decisiones al revés.
 */
import { describe, expect, it } from "vitest";

import {
  computeAcceptanceRate,
  computeNoShowRate,
  type TreatmentPlanStatusCounts,
} from "@/lib/metrics/dental";

function counts(p: Partial<TreatmentPlanStatusCounts> = {}): TreatmentPlanStatusCounts {
  return {
    draft: 0,
    proposed: 0,
    accepted: 0,
    in_progress: 0,
    completed: 0,
    cancelled: 0,
    ...p,
  };
}

describe("computeAcceptanceRate", () => {
  it("cuenta como aceptado el plan que ya se está ejecutando o terminó", () => {
    // El error que hundiria este KPI: contar solo `accepted`. Un plan aceptado
    // avanza a `in_progress` y acaba en `completed`, asi que una clinica que
    // TERMINA sus tratamientos apareceria con una aceptacion ridicula — justo
    // al reves de la realidad.
    const r = computeAcceptanceRate(counts({ in_progress: 3, completed: 5, proposed: 2 }));

    expect(r.accepted).toBe(8);
  });

  it("no mete los borradores en el denominador", () => {
    // Un borrador no se ha presentado a nadie. Contarlo como "propuesto y no
    // aceptado" castigaria a quien prepara planes con calma.
    const r = computeAcceptanceRate(counts({ draft: 10, accepted: 1, proposed: 1 }));

    expect(r.presented).toBe(2);
    expect(r.rate).toBeCloseTo(0.5);
  });

  it("un plan cancelado cuenta como presentado y rechazado", () => {
    const r = computeAcceptanceRate(counts({ accepted: 1, cancelled: 1 }));

    expect(r.presented).toBe(2);
    expect(r.rejected).toBe(1);
    expect(r.rate).toBeCloseTo(0.5);
  });

  it("los que siguen en el aire se reportan aparte, no como rechazados", () => {
    // Mezclar "aun no ha contestado" con "dijo que no" borra la unica cifra
    // sobre la que se puede actuar: a quien hay que llamar.
    const r = computeAcceptanceRate(counts({ accepted: 2, proposed: 3 }));

    expect(r.pending).toBe(3);
    expect(r.rejected).toBe(0);
  });

  it("sin planes presentados la tasa es nula, no cero", () => {
    // Cero por ciento significa "los presentamos y nos dijeron que no".
    // Ausencia de datos no es un mal resultado: es ningun resultado.
    const r = computeAcceptanceRate(counts({ draft: 4 }));

    expect(r.presented).toBe(0);
    expect(r.rate).toBeNull();
  });
});

describe("computeNoShowRate", () => {
  it("se mide sobre las citas que ya pasaron, no sobre la agenda futura", () => {
    // Con las citas pendientes dentro, el porcentaje baja solo por tener la
    // agenda llena de aqui a diciembre. Seria un numero que mejora sin que
    // nadie haga nada mejor.
    const r = computeNoShowRate({ noShow: 2, completed: 8, cancelled: 0, pending: 100 });

    expect(r).toBeCloseTo(0.2);
  });

  it("una cancelacion avisada no es una ausencia", () => {
    // Quien avisa libera el hueco; quien no aparece lo quema. Meterlas en el
    // mismo saco castiga al paciente que hizo lo correcto.
    const r = computeNoShowRate({ noShow: 1, completed: 9, cancelled: 50, pending: 0 });

    expect(r).toBeCloseTo(0.1);
  });

  it("sin citas pasadas devuelve nulo", () => {
    expect(computeNoShowRate({ noShow: 0, completed: 0, cancelled: 3, pending: 5 })).toBeNull();
  });
});
