import type { Json, PosPaymentMethod } from "@/types/database";

/**
 * Helpers PUROS del arqueo de caja (cierre de sesión del TPV). Sin React, sin
 * red: solo agregación y aritmética de dominio sobre los cobros de una sesión.
 * Los comparte la vista de arqueo (`arqueo-view`) y el Server Action de cierre
 * (`arqueo/actions`), que persiste exactamente lo que aquí se calcula.
 *
 * Invariante del esquema (§1.6): el dinero se opera SIEMPRE en céntimos enteros.
 * El descuadre (`cash_variance_cents`) es la única cifra que puede ser NEGATIVA
 * (falta dinero en el cajón); todo lo demás es no negativo.
 */

/** El subconjunto de un cobro (`pos_payments`) que el arqueo necesita. */
export interface SessionPayment {
  method: PosPaymentMethod;
  amount_cents: number;
}

/** Total agregado de una sesión para un método de pago concreto. */
export interface MethodTotal {
  method: PosPaymentMethod;
  amountCents: number;
}

/**
 * Método base que mueve efectivo físico y, por tanto, cuenta en el cuadre del
 * cajón. Coincide con `pos_payment_methods.affects_cash_drawer` del método por
 * defecto: la autoridad de reconciliación es el enum `method` del propio cobro
 * (ver comentario de `pos_payments.method` en el esquema), no el catálogo.
 */
export const CASH_METHOD: PosPaymentMethod = "efectivo";

/**
 * Orden canónico de los métodos para pintar el arqueo de forma estable
 * (independiente del orden de llegada de los cobros).
 */
export const METHOD_ORDER: readonly PosPaymentMethod[] = [
  "efectivo",
  "tarjeta",
  "bizum",
  "transferencia",
  "otro",
];

/** Etiqueta legible de cada método base (es-ES) para la UI y el informe. */
export const METHOD_LABEL: Record<PosPaymentMethod, string> = {
  efectivo: "Efectivo",
  tarjeta: "Tarjeta",
  bizum: "Bizum",
  transferencia: "Transferencia",
  otro: "Otro",
};

/**
 * Agrega los cobros de una sesión por método de pago, devolviéndolos en el
 * {@link METHOD_ORDER} canónico y OMITIENDO los métodos sin importe. La suma es
 * exacta en céntimos enteros (los `amount_cents` ya lo son en la BD).
 */
export function aggregateByMethod(
  payments: readonly SessionPayment[],
): MethodTotal[] {
  const totals = new Map<PosPaymentMethod, number>();
  for (const payment of payments) {
    totals.set(
      payment.method,
      (totals.get(payment.method) ?? 0) + payment.amount_cents,
    );
  }
  return METHOD_ORDER.filter((method) => totals.has(method)).map((method) => ({
    method,
    amountCents: totals.get(method)!,
  }));
}

/** Suma de TODOS los cobros de la sesión (todos los métodos), en céntimos. */
export function sumAllPayments(payments: readonly SessionPayment[]): number {
  return payments.reduce((acc, payment) => acc + payment.amount_cents, 0);
}

/** Suma solo de los cobros en efectivo (los que mueven el cajón), en céntimos. */
export function sumCashPayments(payments: readonly SessionPayment[]): number {
  return payments.reduce(
    (acc, payment) =>
      payment.method === CASH_METHOD ? acc + payment.amount_cents : acc,
    0,
  );
}

/**
 * Efectivo ESPERADO en el cajón al cierre: fondo inicial + cobros en efectivo.
 * (Las devoluciones restarían aquí, pero el TPV aún no las contempla; los
 * `amount_cents` son siempre positivos.)
 */
export function computeExpectedCash(
  openingFloatCents: number,
  cashPaymentsCents: number,
): number {
  return openingFloatCents + cashPaymentsCents;
}

/**
 * Descuadre de efectivo = contado − esperado. Negativo = FALTA dinero en caja;
 * positivo = SOBRA; cero = cuadra. Es la única cifra que admite signo.
 */
export function computeCashVariance(
  countedCashCents: number,
  expectedCashCents: number,
): number {
  return countedCashCents - expectedCashCents;
}

/**
 * Snapshot de totales por método para persistir en `pos_sessions.closing_totals`
 * (jsonb). Objeto plano `{ efectivo: 12300, tarjeta: 45600 }` con solo los
 * métodos que tuvieron cobros; sirve al informe de arqueo sin releer pagos.
 */
export function buildClosingTotals(payments: readonly SessionPayment[]): Json {
  const snapshot: Record<string, number> = {};
  for (const { method, amountCents } of aggregateByMethod(payments)) {
    snapshot[method] = amountCents;
  }
  return snapshot;
}
