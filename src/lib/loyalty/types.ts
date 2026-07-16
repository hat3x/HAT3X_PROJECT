/**
 * Tipos y parámetros del núcleo NATIVO de fidelización de Salón OS.
 *
 * Este módulo (`@/lib/loyalty/*`) es la réplica nativa —sobre las tablas de
 * `20260716120000_loyalty_base.sql`— del sistema probado en denueveanueve. NO
 * confundir con el fichero hermano `@/lib/loyalty` (la capa proxy HTTP hacia las
 * Edge Functions de denueveanueve): son módulos distintos que conviven durante la
 * migración (ver `docs/loyalty-rules-reference.md` §5, "reapuntar los handlers").
 *
 * Dinero SIEMPRE en enteros de céntimos (`*_cents`), coherente con
 * `@/lib/payments/money` (§1.6 de `docs/schema-reference.md`).
 */

/**
 * Línea de servicio/producto de una visita, insumo del cálculo de puntos.
 *
 * Réplica del contrato de `verify-visit` (§1.1 de la nota de reglas): cada línea
 * aporta puntos según su precio, salvo que el staff los fije a mano (`points`).
 */
export interface LoyaltyLineItem {
  /** Precio de la línea en céntimos enteros (PVP, IVA incluido). */
  price_cents: number;
  /**
   * Override manual de puntos de la línea. Si se indica (entero ≥ 0) sustituye a
   * la regla por defecto `ceil(price_cents / centsPerPoint)`. Equivale al
   * `final_points` / `points_snapshot` de denueveanueve.
   */
  points?: number;
  /** Etiqueta opcional (nombre del servicio) para el motivo del movimiento. */
  label?: string;
}

/**
 * Parámetros de negocio de la fidelización. Por defecto reproducen fielmente
 * denueveanueve; se externalizan aquí para poder configurarlos por salón en el
 * futuro sin tocar la lógica (§6 de la nota de reglas).
 */
export interface LoyaltyConfig {
  /**
   * Céntimos que equivalen a 1 punto. Por defecto `200` → ≈1 punto por cada 2 €.
   *
   * ⚠️ Corrección de unidades crítica (§1.1 de la nota): denueveanueve calcula
   * `ceil(precio_€ / 2)` con el precio en EUROS; Salón OS guarda CÉNTIMOS, así
   * que la regla nativa equivalente es `ceil(price_cents / 200)`. NO usar `/ 2`.
   */
  centsPerPoint: number;
  /** Días de validez de una recompensa de hito. Por defecto 90. */
  rewardValidityDays: number;
  /** Días de validez del cupón de bienvenida. Por defecto 90. */
  couponValidityDays: number;
  /** % de descuento por defecto del cupón de bienvenida. Por defecto 10. */
  defaultWelcomePercentOff: number;
}

/** Configuración por defecto (réplica fiel de denueveanueve, v1). */
export const DEFAULT_LOYALTY_CONFIG: LoyaltyConfig = {
  centsPerPoint: 200,
  rewardValidityDays: 90,
  couponValidityDays: 90,
  defaultWelcomePercentOff: 10,
};

/** Un hito de fidelización: nº de visitas → recompensa que se genera. */
export interface LoyaltyMilestone {
  /** Nº EXACTO de visitas que dispara la recompensa. */
  visits: number;
  /** Tipo de recompensa (catálogo). Base del código `RW-<3 primeras>-…`. */
  rewardType: string;
  /** Etiqueta humana de la recompensa (para UI/auditoría). */
  label: string;
}

/**
 * Catálogo de hitos 3 / 5 / 8 / 10 visitas (§1.6 de la nota). Se dispara UNA
 * recompensa cuando `visits_total` alcanza EXACTAMENTE uno de estos valores; a
 * partir de la visita 11 ya no hay hitos.
 */
export const LOYALTY_MILESTONES: readonly LoyaltyMilestone[] = [
  { visits: 3, rewardType: "SCALP_DIAGNOSIS", label: "Diagnóstico capilar" },
  { visits: 5, rewardType: "EXPRESS_TREATMENT", label: "Tratamiento exprés" },
  { visits: 8, rewardType: "RETAIL_VOUCHER", label: "Vale de producto" },
  { visits: 10, rewardType: "PACK_UPGRADE", label: "Mejora de pack" },
];

/** Identidad mínima del cliente devuelta por el lookup. */
export interface LoyaltyCustomerRef {
  id: string;
  full_name: string;
  qr_token: string;
}

/** Cupón de bienvenida tal como lo ve el TPV (activo y no caducado). */
export interface LoyaltyCouponView {
  id: string;
  percent_off: number;
  expires_at: string;
}

/** Recompensa de hito tal como la ve el TPV (disponible y no caducada). */
export interface LoyaltyRewardView {
  id: string;
  type: string;
  code: string;
  expires_at: string;
}

/**
 * Resultado de `lookupByQr` — SOLO LECTURA (§1.9 de la nota). `points_balance` y
 * `visits_total` son 0 si el cliente aún no tiene cuenta.
 */
export interface LoyaltyLookupResult {
  customer: LoyaltyCustomerRef;
  points_balance: number;
  visits_total: number;
  last_visit_at: string | null;
  welcome_coupons: LoyaltyCouponView[];
  rewards: LoyaltyRewardView[];
}

/** Tipo de referencia que ancla la idempotencia/auditoría de una acreditación. */
export type LoyaltyRefType = "appointment" | "walk_in" | "pos_sale" | "visit";

/** Resultado de `awardVisit`. */
export interface AwardVisitResult {
  /** Puntos sumados en esta visita (0 si fue un no-op idempotente). */
  points_earned: number;
  /** Saldo de puntos resultante. */
  points_balance: number;
  /** Nº total de visitas resultante. */
  visits_total: number;
  /** Cupón de bienvenida canjeado, o `null`. */
  redeemed_coupon: LoyaltyCouponView | null;
  /** Descuento (céntimos) aplicable por el cupón canjeado, o 0. */
  discount_cents: number;
  /** Recompensa de hito generada en esta visita, o `null`. */
  reward: LoyaltyRewardView | null;
  /** `true` si la referencia ya se había acreditado (no se volvió a sumar). */
  already_awarded: boolean;
}
