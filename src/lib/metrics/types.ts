/**
 * Tipos de la capa de MÉTRICAS del panel — derivados del contrato SQL.
 *
 * Se derivan del bloque `Functions` de `@/types/database` (a su vez espejo de la
 * migración `20260723100000_rpc_dashboard_metrics.sql`), de modo que si cambia la
 * firma de una RPC, estos tipos cambian con ella (una sola fuente de verdad). NO
 * declarar los campos a mano aquí.
 *
 * Convenciones del contrato:
 *   · Importes SIEMPRE en CÉNTIMOS enteros (`*_cents`). Formatear con
 *     `formatMoney(cents)` de `@/lib/format`; nunca dividir por 100 a mano.
 *   · Rango `{ from, to }` como fechas ISO `YYYY-MM-DD` en la zona local del
 *     salón; `to` es INCLUSIVO (día completo).
 */
import type { Database } from "@/types/database";

type Fn = Database["public"]["Functions"];

/** Rango temporal (fechas locales del salón, `to` inclusivo). */
export interface MetricsPeriod {
  /** Inicio del rango, ISO `YYYY-MM-DD`. */
  from: string;
  /** Fin del rango (inclusivo), ISO `YYYY-MM-DD`. */
  to: string;
}

/** Granularidad de las series temporales. */
export type RevenueGranularity = "day" | "week" | "month" | "year";

// ── Filas de retorno de cada RPC (una por métrica) ────────────────────────────
export type SalesSummary = Fn["salon_sales_summary"]["Returns"][number];
export type RevenueTimeseriesPoint =
  Fn["salon_revenue_timeseries"]["Returns"][number];
export type RevenueByLocationRow =
  Fn["salon_revenue_by_location"]["Returns"][number];
export type RevenueByProfessionalRow =
  Fn["salon_revenue_by_professional"]["Returns"][number];
export type TopItemRow = Fn["salon_top_items"]["Returns"][number];
export type PaymentMethodDistributionRow =
  Fn["salon_payment_method_distribution"]["Returns"][number];
export type NewVsReturningCustomers =
  Fn["salon_new_vs_returning_customers"]["Returns"][number];
export type AgendaOccupancy = Fn["salon_agenda_occupancy"]["Returns"][number];

/** KPIs a cero (periodo sin ventas / salón no visible por RLS). */
export const EMPTY_SALES_SUMMARY: SalesSummary = {
  sales_count: 0,
  customers_count: 0,
  gross_revenue_cents: 0,
  taxable_base_cents: 0,
  discount_cents: 0,
  tax_cents: 0,
  avg_ticket_cents: 0,
};

/** Nuevos vs recurrentes a cero. */
export const EMPTY_NEW_VS_RETURNING: NewVsReturningCustomers = {
  new_customers: 0,
  returning_customers: 0,
  anonymous_sales: 0,
  new_revenue_cents: 0,
  returning_revenue_cents: 0,
  anonymous_revenue_cents: 0,
};

/** Ocupación a cero. */
export const EMPTY_OCCUPANCY: AgendaOccupancy = {
  capacity_minutes: 0,
  booked_minutes: 0,
  booked_appointments: 0,
  occupancy_rate: 0,
};
