/**
 * Punto de entrada público de la capa de pagos (`@/lib/payments`).
 *
 * Reúne el cálculo de totales/IVA (reutilizable por caja y facturación) y la
 * abstracción de pasarela de pago con su implementación manual. Los consumidores
 * (TPV, facturación) importan SIEMPRE desde aquí, no de los submódulos.
 */

// ── Cálculo de totales e IVA (fuente única para caja y facturación) ───────────
export {
  computeLineTotals,
  computeSaleTotals,
  type SaleLineInput,
  type SaleLineTotals,
  type SaleTotals,
  type VatBreakdownEntry,
} from "./totals";

// ── Primitivas de dinero (por si el consumidor necesita operar céntimos) ──────
export {
  assertIntegerCents,
  multiplyCents,
  roundHalfAwayFromZero,
  splitVatFromGross,
} from "./money";

// ── Abstracción de pasarela ───────────────────────────────────────────────────
export {
  assertTendersCoverSale,
  assertTendersCoverTotal,
  isMixedPayment,
  PaymentValidationError,
  sumTenders,
  type PaymentGateway,
  type PaymentInsert,
  type PaymentResult,
  type PaymentTender,
  type RegisterPaymentInput,
} from "./gateway";

export { ManualPaymentGateway, manualPaymentGateway } from "./manual-gateway";

import type { PaymentGateway } from "./gateway";
import { manualPaymentGateway } from "./manual-gateway";

/**
 * Identificadores de pasarela soportables. Hoy solo 'manual' está implementada;
 * el resto son objetivos del roadmap (ver README.md).
 */
export type PaymentGatewayId = "manual" | "sumup" | "stripe" | "redsys";

/**
 * Selector de pasarela. Devuelve la implementación activa según el identificador.
 *
 * Hoy siempre devuelve la pasarela manual (registro sin cobro). Este es el ÚNICO
 * punto que habrá que tocar para enchufar un proveedor real: cada `case` nuevo
 * construirá su gateway (con su config/credenciales) y lo devolverá; el TPV, que
 * depende de la interfaz `PaymentGateway`, no se entera del cambio.
 *
 * TODO(pagos): implementar las integraciones reales tras esta abstracción.
 *   · 'sumup'  → SumUp — datáfono/lector Bluetooth para salones (SumUp API + SDK).
 *   · 'stripe' → Stripe Terminal / Payment Intents (cobro online o presencial).
 *   · 'redsys' → Redsys/TPV bancario español (redirección + firma HMAC).
 * Cada una: autorizar el cargo ANTES de devolver las filas y mapear su respuesta
 * (id de operación, autorización) a `pos_payments.reference`.
 */
export function getPaymentGateway(id: PaymentGatewayId = "manual"): PaymentGateway {
  switch (id) {
    case "manual":
      return manualPaymentGateway;
    // TODO(pagos): case "sumup":  return new SumUpGateway(config);
    // TODO(pagos): case "stripe": return new StripeGateway(config);
    // TODO(pagos): case "redsys": return new RedsysGateway(config);
    default:
      throw new Error(
        `Pasarela de pago no implementada: "${id}". Solo 'manual' está disponible (ver README).`,
      );
  }
}
