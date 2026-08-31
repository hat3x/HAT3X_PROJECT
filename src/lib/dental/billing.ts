/**
 * El eje de COBRO de una línea de presupuesto.
 *
 * ── POR QUÉ ES UN EJE APARTE Y NO UNA CASILLA ───────────────────────────────
 * El primer diseño que planteé era binario: la línea está facturada o no. Las
 * capturas del programa que usa Biodental lo desmintieron de un vistazo — se ve
 * una endodoncia en estado "Previsto", o sea sin hacer, y a la vez "Cobrado Sin
 * Factura" por 200 €.
 *
 * En una clínica se cobra antes de hacer y se hace antes de cobrar, según el
 * caso. Tratamiento y cobro son dos ejes INDEPENDIENTES; juntarlos en un solo
 * estado obligaría a mentir en uno de los dos.
 *
 * Aquí solo vive el de cobro. El del tratamiento (`propuesto → realizado`) está
 * en `treatment.ts` y no se toca.
 *
 * ── SE DERIVA, NO SE GUARDA ─────────────────────────────────────────────────
 * No hay columna "estado de cobro" que alguien pueda dejar desfasada. El estado
 * sale de la venta a la que la línea está enganchada y del estado real de esa
 * venta, así que anular un ticket libera sus líneas solo, sin que nadie tenga
 * que acordarse.
 */

/** Estado de la venta en el TPV (`pos_sale_status`). */
export type SaleStatus = "open" | "completed" | "voided" | "refunded";

export type BillingState =
  /** Ni siquiera se ha mandado a caja. */
  | "sin_pasar"
  /** En un ticket abierto, esperando cobro. */
  | "pendiente_cobro"
  /** Cobrado, sin documento fiscal. */
  | "cobrado_sin_factura"
  /** Cobrado y con factura emitida. */
  | "cobrado_con_factura"
  /** Se cobró y luego se devolvió. */
  | "devuelto";

export const BILLING_STATE_LABELS: Record<BillingState, string> = {
  sin_pasar: "Sin pasar a caja",
  pendiente_cobro: "Pendiente de cobrar",
  cobrado_sin_factura: "Cobrado sin factura",
  cobrado_con_factura: "Cobrado con factura",
  devuelto: "Devuelto",
};

/** Lo que hace falta saber de una línea para situarla en el eje de cobro. */
export interface PlanItemBillingInput {
  /** Venta del TPV que arrastra esta línea, o `null` si no ha pasado por caja. */
  posSaleId: string | null;
  /** Estado de esa venta. `null` si no hay venta o no se pudo leer. */
  saleStatus: SaleStatus | null;
  /** Si esa venta tiene factura emitida. */
  hasInvoice: boolean;
  /** Importe de la línea, en céntimos. */
  lineTotalCents: number;
}

/**
 * Sitúa una línea en el eje de cobro.
 *
 * El caso de `posSaleId` con `saleStatus` nulo se trata como pendiente y no
 * como cobrado: si la consulta no trajo el estado de la venta, no podemos
 * afirmar que esté cobrada. Equivocarse hacia "pendiente" hace que alguien
 * mire; equivocarse hacia "cobrado" hace que nadie cobre.
 */
export function derivePlanItemBilling(input: PlanItemBillingInput): BillingState {
  if (input.posSaleId === null) return "sin_pasar";

  switch (input.saleStatus) {
    case "completed":
      return input.hasInvoice ? "cobrado_con_factura" : "cobrado_sin_factura";
    case "refunded":
      return "devuelto";
    // Una venta anulada es una venta que no existió: la línea queda libre otra
    // vez, y se puede volver a mandar a caja sin tener que desenganchar nada.
    case "voided":
      return "sin_pasar";
    case "open":
    default:
      return "pendiente_cobro";
  }
}

/**
 * `true` si la línea se puede mandar a caja ahora mismo.
 *
 * Es la guarda contra el doble cobro: sin ella, dos clics seguidos crearían dos
 * tickets con la misma línea y el paciente pagaría dos veces. Una línea
 * devuelta tampoco se recobra sola — eso es una decisión de la clínica, no un
 * automatismo.
 */
export function isChargeable(input: PlanItemBillingInput): boolean {
  return derivePlanItemBilling(input) === "sin_pasar";
}

/** Importes del plan repartidos por estado de cobro. Todo en céntimos. */
export interface BillingSummary {
  sinPasarCents: number;
  pendienteCents: number;
  cobradoCents: number;
  devueltoCents: number;
  totalCents: number;
}

/**
 * Reparte el importe del plan según en qué punto del cobro está cada línea.
 *
 * Es lo que se lee de un vistazo en la ficha: cuánto se le ha cobrado ya a este
 * paciente, cuánto espera en caja y cuánto ni siquiera se ha mandado. Las
 * cuatro partes suman siempre el total, para que el resumen no pueda contar dos
 * veces ni perderse un euro por el camino.
 */
export function summarizeBilling(items: readonly PlanItemBillingInput[]): BillingSummary {
  const resumen: BillingSummary = {
    sinPasarCents: 0,
    pendienteCents: 0,
    cobradoCents: 0,
    devueltoCents: 0,
    totalCents: 0,
  };

  for (const item of items) {
    const importe = item.lineTotalCents;
    resumen.totalCents += importe;

    switch (derivePlanItemBilling(item)) {
      case "sin_pasar":
        resumen.sinPasarCents += importe;
        break;
      case "pendiente_cobro":
        resumen.pendienteCents += importe;
        break;
      case "cobrado_sin_factura":
      case "cobrado_con_factura":
        resumen.cobradoCents += importe;
        break;
      case "devuelto":
        resumen.devueltoCents += importe;
        break;
    }
  }

  return resumen;
}
