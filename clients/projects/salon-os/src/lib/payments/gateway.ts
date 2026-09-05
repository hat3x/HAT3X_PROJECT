/**
 * Abstracción de la pasarela de pago (PaymentGateway).
 *
 * ── Qué resuelve ─────────────────────────────────────────────────────────────
 * El TPV necesita liquidar una venta con uno o varios "tenders" (medios de pago).
 * Un `PaymentGateway` convierte esa intención en las filas que se insertarán en
 * `pos_payments`. La abstracción NO asume nada sobre CÓMO se cobra: la primera
 * implementación (ver manual-gateway.ts) solo REGISTRA el método elegido, sin
 * hablar con ningún datáfono ni API. Mañana, un `SumUpGateway`/`StripeGateway`/
 * `RedsysGateway` implementará la misma interfaz añadiendo la llamada real al
 * proveedor antes de devolver las filas confirmadas (ver README.md → Roadmap).
 *
 * ── "Pago mixto" ─────────────────────────────────────────────────────────────
 * El enum `pos_payment_method` NO tiene valor 'mixto'. Un pago mixto es
 * simplemente `tenders.length > 1` (p. ej. parte en 'efectivo' y parte en
 * 'tarjeta'): cada tender produce una fila propia en `pos_payments`. El helper
 * `isMixedPayment` lo detecta a partir de los tenders.
 */
import type { Database, PosPaymentMethod } from "@/types/database";

import { assertIntegerCents } from "./money";
import type { SaleTotals } from "./totals";

/** Fila lista para insertar en `pos_payments` (espejo del tipo Insert de la BD). */
export type PaymentInsert = Database["public"]["Tables"]["pos_payments"]["Insert"];

/**
 * Un medio de pago aplicado a la venta. Varios tenders = pago mixto.
 * `method` es el tipo base (autoridad de reconciliación, enum). `paymentMethodId`
 * es opcional y apunta al catálogo del salón (`pos_payment_methods`) para informes.
 */
export interface PaymentTender {
  /** Tipo base del medio de pago (enum de la BD). */
  method: PosPaymentMethod;
  /** Importe aplicado en céntimos enteros. Debe ser > 0. */
  amountCents: number;
  /** Método concreto del catálogo del salón (opcional, para informes). */
  paymentMethodId?: string | null;
  /** Referencia externa: nº autorización tarjeta, id de operación Bizum, etc. */
  reference?: string | null;
}

/** Datos de la venta a liquidar y sus tenders. */
export interface RegisterPaymentInput {
  /** Salón (multi-tenant): se propaga a cada fila de `pos_payments`. */
  salonId: string;
  /** Venta que se está liquidando. */
  saleId: string;
  /** Caja donde se cobra (opcional: venta sin sesión abierta). */
  sessionId?: string | null;
  /** Total a cobrar en céntimos (normalmente `SaleTotals.totalCents`). */
  totalCents: number;
  /** Uno o varios medios de pago. Su suma debe cubrir `totalCents`. */
  tenders: PaymentTender[];
  /** Momento del cobro en ISO. Por defecto lo pone la BD (`now()`). */
  paidAt?: string;
}

/** Resultado de registrar un cobro: filas a insertar + metadatos. */
export interface PaymentResult {
  /** 'registered' para la pasarela manual (no procesa cobro real). */
  status: "registered";
  /** Filas listas para `insert` en `pos_payments` (una por tender). */
  payments: PaymentInsert[];
  /** Suma de los importes registrados (debe igualar `input.totalCents`). */
  registeredCents: number;
}

/**
 * Contrato común a todas las pasarelas. `id` identifica la implementación
 * ('manual', 'sumup', 'stripe', 'redsys'…). `registerPayment` es asíncrono
 * aunque la manual resuelva de inmediato: las pasarelas reales harán E/S aquí.
 */
export interface PaymentGateway {
  /** Identificador estable de la pasarela. */
  readonly id: string;
  /** Registra el cobro de una venta y devuelve las filas de `pos_payments`. */
  registerPayment(input: RegisterPaymentInput): Promise<PaymentResult>;
}

/** Error de dominio de la capa de pagos (entrada inválida, cobro incompleto…). */
export class PaymentValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaymentValidationError";
  }
}

/** Suma los importes de un conjunto de tenders (céntimos enteros). */
export function sumTenders(tenders: readonly PaymentTender[]): number {
  return tenders.reduce((acc, t) => acc + t.amountCents, 0);
}

/** true si el cobro usa más de un medio de pago (pago mixto). */
export function isMixedPayment(tenders: readonly PaymentTender[]): boolean {
  return tenders.length > 1;
}

/**
 * Valida que los tenders liquidan EXACTAMENTE el total de la venta. No admite
 * cobros parciales ni de más: el TPV liquida el ticket completo. Lanza
 * `PaymentValidationError` con el detalle si no cuadra.
 */
export function assertTendersCoverTotal(
  tenders: readonly PaymentTender[],
  totalCents: number,
): void {
  if (tenders.length === 0) {
    throw new PaymentValidationError("Se requiere al menos un medio de pago.");
  }
  assertIntegerCents(totalCents, "totalCents");
  for (const [i, tender] of tenders.entries()) {
    assertIntegerCents(tender.amountCents, `tenders[${i}].amountCents`);
    if (tender.amountCents <= 0) {
      throw new PaymentValidationError(
        `El importe del pago ${i + 1} debe ser mayor que 0.`,
      );
    }
  }
  const paid = sumTenders(tenders);
  if (paid !== totalCents) {
    throw new PaymentValidationError(
      `El cobro (${paid}) no coincide con el total de la venta (${totalCents}).`,
    );
  }
}

/** Azúcar: valida directamente contra unos `SaleTotals` calculados. */
export function assertTendersCoverSale(
  tenders: readonly PaymentTender[],
  totals: SaleTotals,
): void {
  assertTendersCoverTotal(tenders, totals.totalCents);
}
