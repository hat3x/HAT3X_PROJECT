/**
 * El eje de COBRO de una línea de presupuesto.
 *
 * ── POR QUÉ ESTO ES UN EJE APARTE ───────────────────────────────────────────
 * En el primer diseño propuse un modelo binario: la línea está facturada o no.
 * Las capturas del programa que usa Biodental lo desmintieron. Ahí se ve una
 * endodoncia en estado "Previsto" —o sea, sin hacer— y a la vez "Cobrado Sin
 * Factura" por 200 €.
 *
 * O sea que en una clínica de verdad se cobra antes de hacer, y se hace antes
 * de cobrar. Tratamiento y cobro son DOS EJES INDEPENDIENTES, y mezclarlos
 * obligaría a mentir en uno de los dos.
 *
 * Este módulo solo modela el de cobro. El del tratamiento
 * (`propuesto → realizado`) ya vive en `treatment.ts` y no se toca.
 *
 * ── SE DERIVA, NO SE GUARDA ─────────────────────────────────────────────────
 * El estado no es una columna que alguien pueda dejar desactualizada: sale de
 * la venta a la que la línea está enganchada y del estado real de esa venta.
 * Si la venta se anula, la línea vuelve sola a estar por cobrar.
 */
import { describe, it, expect } from "vitest";

import {
  BILLING_STATE_LABELS,
  derivePlanItemBilling,
  isChargeable,
  summarizeBilling,
  type PlanItemBillingInput,
} from "@/lib/dental/billing";

function linea(overrides: Partial<PlanItemBillingInput> = {}): PlanItemBillingInput {
  return {
    posSaleId: null,
    saleStatus: null,
    hasInvoice: false,
    lineTotalCents: 9000,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Los estados
// ---------------------------------------------------------------------------

describe("derivePlanItemBilling", () => {
  it("sin venta enganchada, esta sin pasar por caja", () => {
    expect(derivePlanItemBilling(linea())).toBe("sin_pasar");
  });

  it("en una venta abierta, esta pendiente de cobrar", () => {
    // Es el ticket que espera en la caja: ya se ha decidido cobrarlo, todavía
    // no se ha cobrado.
    expect(derivePlanItemBilling(linea({ posSaleId: "v1", saleStatus: "open" }))).toBe(
      "pendiente_cobro",
    );
  });

  it("en una venta cobrada sin factura, esta cobrado sin factura", () => {
    expect(
      derivePlanItemBilling(linea({ posSaleId: "v1", saleStatus: "completed", hasInvoice: false })),
    ).toBe("cobrado_sin_factura");
  });

  it("en una venta cobrada con factura, esta cobrado con factura", () => {
    expect(
      derivePlanItemBilling(linea({ posSaleId: "v1", saleStatus: "completed", hasInvoice: true })),
    ).toBe("cobrado_con_factura");
  });

  it("si la venta se anula, la linea VUELVE a estar sin pasar por caja", () => {
    // Lo importante de derivarlo en vez de guardarlo: anular el ticket libera
    // la línea sin que nadie tenga que acordarse de tocarla.
    expect(derivePlanItemBilling(linea({ posSaleId: "v1", saleStatus: "voided" }))).toBe(
      "sin_pasar",
    );
  });

  it("una venta devuelta se marca como devuelta, no como cobrada", () => {
    expect(derivePlanItemBilling(linea({ posSaleId: "v1", saleStatus: "refunded" }))).toBe(
      "devuelto",
    );
  });

  it("una linea a cero euros ya cobrada sigue siendo cobrada", () => {
    // Un tratamiento de cortesía o cubierto por mutua: importe 0, pero pasó por
    // caja. No es lo mismo que no haberlo pasado.
    expect(
      derivePlanItemBilling(linea({ posSaleId: "v1", saleStatus: "completed", lineTotalCents: 0 })),
    ).toBe("cobrado_sin_factura");
  });

  it("un id de venta sin estado no se da por cobrado", () => {
    // Defensa: si la consulta no trajo el estado de la venta, no se puede
    // afirmar que esté cobrada. Ante la duda, por cobrar.
    expect(derivePlanItemBilling(linea({ posSaleId: "v1", saleStatus: null }))).toBe(
      "pendiente_cobro",
    );
  });

  it("todos los estados tienen etiqueta para la pantalla", () => {
    const estados = [
      "sin_pasar",
      "pendiente_cobro",
      "cobrado_sin_factura",
      "cobrado_con_factura",
      "devuelto",
    ] as const;
    for (const e of estados) {
      expect(BILLING_STATE_LABELS[e]).toBeTruthy();
    }
  });
});

// ---------------------------------------------------------------------------
// Qué se puede mandar a caja
// ---------------------------------------------------------------------------

describe("isChargeable", () => {
  it("una linea sin pasar por caja se puede mandar", () => {
    expect(isChargeable(linea())).toBe(true);
  });

  it("una linea ya en un ticket abierto NO se manda otra vez", () => {
    // Sin esto, dos clics seguidos crearian dos tickets con la misma linea y se
    // le cobraria dos veces al paciente.
    expect(isChargeable(linea({ posSaleId: "v1", saleStatus: "open" }))).toBe(false);
  });

  it("una linea ya cobrada NO se vuelve a cobrar", () => {
    expect(isChargeable(linea({ posSaleId: "v1", saleStatus: "completed" }))).toBe(false);
  });

  it("si la venta se anulo, la linea se puede volver a mandar", () => {
    expect(isChargeable(linea({ posSaleId: "v1", saleStatus: "voided" }))).toBe(true);
  });

  it("una linea devuelta no se recobra sola: hay que decidirlo a mano", () => {
    expect(isChargeable(linea({ posSaleId: "v1", saleStatus: "refunded" }))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// El resumen del plan, que es lo que se lee de un vistazo
// ---------------------------------------------------------------------------

describe("summarizeBilling", () => {
  it("suma lo pendiente, lo cobrado y lo que ni ha pasado por caja", () => {
    const r = summarizeBilling([
      linea({ lineTotalCents: 9000 }), // sin pasar
      linea({ posSaleId: "v1", saleStatus: "open", lineTotalCents: 20000 }), // pendiente
      linea({ posSaleId: "v2", saleStatus: "completed", lineTotalCents: 6000 }), // cobrado
      linea({ posSaleId: "v3", saleStatus: "completed", hasInvoice: true, lineTotalCents: 29000 }),
    ]);

    expect(r.sinPasarCents).toBe(9000);
    expect(r.pendienteCents).toBe(20000);
    expect(r.cobradoCents).toBe(35000);
    expect(r.totalCents).toBe(64000);
  });

  it("lo anulado cuenta como sin pasar, no como cobrado", () => {
    const r = summarizeBilling([
      linea({ posSaleId: "v1", saleStatus: "voided", lineTotalCents: 5000 }),
    ]);
    expect(r.sinPasarCents).toBe(5000);
    expect(r.cobradoCents).toBe(0);
  });

  it("lo devuelto no suma como cobrado", () => {
    const r = summarizeBilling([
      linea({ posSaleId: "v1", saleStatus: "refunded", lineTotalCents: 5000 }),
    ]);
    expect(r.cobradoCents).toBe(0);
    expect(r.devueltoCents).toBe(5000);
  });

  it("un plan vacio suma cero y no revienta", () => {
    const r = summarizeBilling([]);
    expect(r.totalCents).toBe(0);
    expect(r.cobradoCents).toBe(0);
  });

  it("el total es siempre la suma de las partes", () => {
    const lineas = [
      linea({ lineTotalCents: 100 }),
      linea({ posSaleId: "a", saleStatus: "open", lineTotalCents: 200 }),
      linea({ posSaleId: "b", saleStatus: "completed", lineTotalCents: 400 }),
      linea({ posSaleId: "c", saleStatus: "refunded", lineTotalCents: 800 }),
      linea({ posSaleId: "d", saleStatus: "voided", lineTotalCents: 1600 }),
    ];
    const r = summarizeBilling(lineas);
    expect(r.sinPasarCents + r.pendienteCents + r.cobradoCents + r.devueltoCents).toBe(r.totalCents);
    expect(r.totalCents).toBe(3100);
  });
});
