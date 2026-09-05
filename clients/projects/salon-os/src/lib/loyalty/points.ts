/**
 * Lógica PURA de fidelización: cálculo de puntos, hitos, códigos de recompensa y
 * descuentos. Sin BD, sin red, sin reloj ni aleatoriedad ambientales (el `Date`
 * y el generador de bytes se inyectan) → 100 % determinista y testeable.
 *
 * La orquestación con la BD (RLS, service role, transacción) vive en
 * `@/lib/loyalty/server`. Aquí solo está el "qué se calcula", no el "cómo se
 * persiste".
 */
import { roundHalfAwayFromZero } from "@/lib/payments/money";
import {
  DEFAULT_LOYALTY_CONFIG,
  LOYALTY_MILESTONES,
  type LoyaltyLineItem,
  type LoyaltyMilestone,
} from "@/lib/loyalty/types";

/** Alfabeto del sufijo del código de recompensa: alfanumérico MAYÚSCULAS. */
const REWARD_CODE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

/** Valida que `value` sea un entero ≥ 0, o lanza. */
function assertNonNegativeInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${label} debe ser un entero ≥ 0, recibido: ${value}`);
  }
}

/**
 * Puntos de UNA línea. Prioridad (réplica de §1.1 de la nota de reglas):
 *   1. `points` (override manual del staff), si viene fijado.
 *   2. Regla por defecto: `ceil(price_cents / centsPerPoint)`.
 *
 * `centsPerPoint` por defecto 200 → ≈1 punto por cada 2 € (corrección de unidades
 * de §1.1: NO `ceil(price_cents / 2)`, que daría 100× puntos).
 */
export function computeLinePoints(
  line: LoyaltyLineItem,
  centsPerPoint: number = DEFAULT_LOYALTY_CONFIG.centsPerPoint,
): number {
  if (line.points !== undefined) {
    assertNonNegativeInteger(line.points, "points de línea");
    return line.points;
  }
  assertNonNegativeInteger(line.price_cents, "price_cents de línea");
  if (!Number.isInteger(centsPerPoint) || centsPerPoint <= 0) {
    throw new RangeError(`centsPerPoint debe ser un entero > 0, recibido: ${centsPerPoint}`);
  }
  return Math.ceil(line.price_cents / centsPerPoint);
}

/** Desglose de una visita: puntos totales y precio total (céntimos). */
export interface VisitPointsBreakdown {
  pointsTotal: number;
  priceCentsTotal: number;
}

/**
 * Suma de puntos y de precio de todas las líneas de la visita
 * (`pointsToAdd = Σ puntos_línea`, `finalTotalPrice = Σ precio_línea`, §1.1).
 */
export function computeVisitPoints(
  lines: readonly LoyaltyLineItem[],
  centsPerPoint: number = DEFAULT_LOYALTY_CONFIG.centsPerPoint,
): VisitPointsBreakdown {
  let pointsTotal = 0;
  let priceCentsTotal = 0;
  for (const line of lines) {
    pointsTotal += computeLinePoints(line, centsPerPoint);
    assertNonNegativeInteger(line.price_cents, "price_cents de línea");
    priceCentsTotal += line.price_cents;
  }
  return { pointsTotal, priceCentsTotal };
}

/**
 * Devuelve el hito alcanzado EXACTAMENTE con `visitsTotal`, o `null`. Solo salta
 * en la coincidencia exacta (`visits_total === hito`); a partir de 11 no hay
 * hitos (§1.6).
 */
export function milestoneForVisitCount(visitsTotal: number): LoyaltyMilestone | null {
  return LOYALTY_MILESTONES.find((m) => m.visits === visitsTotal) ?? null;
}

/**
 * Sufijo aleatorio de `length` caracteres alfanuméricos MAYÚSCULAS a partir de
 * un proveedor de bytes inyectado (`node:crypto` en producción; determinista en
 * tests). Equivale al `Math.random().toString(36).substring(2,8).toUpperCase()`
 * de denueveanueve, pero con aleatoriedad criptográfica.
 */
export function randomRewardSuffix(
  randomBytes: (n: number) => Uint8Array,
  length = 6,
): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    const byte = bytes[i] ?? 0;
    out += REWARD_CODE_ALPHABET.charAt(byte % REWARD_CODE_ALPHABET.length);
  }
  return out;
}

/**
 * Código de recompensa `RW-<3 primeras letras del tipo>-<sufijo>` (§1.6). El
 * prefijo se recorta y pasa a mayúsculas para tolerar tipos en minúscula.
 */
export function formatRewardCode(rewardType: string, suffix: string): string {
  const prefix = rewardType.slice(0, 3).toUpperCase();
  return `RW-${prefix}-${suffix}`;
}

/**
 * Descuento (céntimos enteros) de un cupón de `percentOff` % sobre un importe
 * bruto. Redondeo comercial (`roundHalfAwayFromZero`) y saturado al total para
 * que nunca supere el importe cobrado.
 */
export function computeCouponDiscountCents(totalCents: number, percentOff: number): number {
  assertNonNegativeInteger(totalCents, "totalCents");
  if (!Number.isFinite(percentOff) || percentOff <= 0 || percentOff > 100) {
    throw new RangeError(`percent_off debe estar en (0, 100], recibido: ${percentOff}`);
  }
  const discount = roundHalfAwayFromZero((totalCents * percentOff) / 100);
  return Math.min(discount, totalCents);
}

/**
 * Instante `now + days` como ISO 8601 UTC. Base de `expires_at` de recompensas y
 * cupones (`now + 90 días`, §1.6/§1.7). `now` se inyecta para poder testear.
 */
export function addDaysIso(now: Date, days: number): string {
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}
