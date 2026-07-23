/**
 * Capa de MÉTRICAS del panel — índice público.
 *
 * Importar SIEMPRE desde `@/lib/metrics`, no de los submódulos. Los tipos son
 * seguros para cliente y servidor; las funciones de `server.ts` son de uso
 * EXCLUSIVO de servidor (necesitan un cliente Supabase de servidor).
 *
 * Espejo TS de la migración `20260723100000_rpc_dashboard_metrics.sql`
 * (agregación en base: `date_trunc` + `group by`, aislada por RLS del salón).
 * Ver `src/lib/metrics/README.md` para el contrato completo.
 */
export {
  getSalesSummary,
  getRevenueTimeseries,
  getRevenueByLocation,
  getRevenueByProfessional,
  getTopItems,
  getTopServices,
  getTopProducts,
  getPaymentMethodDistribution,
  getNewVsReturningCustomers,
  getAgendaOccupancy,
} from "./server";

export {
  EMPTY_SALES_SUMMARY,
  EMPTY_NEW_VS_RETURNING,
  EMPTY_OCCUPANCY,
  type MetricsPeriod,
  type RevenueGranularity,
  type SalesSummary,
  type RevenueTimeseriesPoint,
  type RevenueByLocationRow,
  type RevenueByProfessionalRow,
  type TopItemRow,
  type PaymentMethodDistributionRow,
  type NewVsReturningCustomers,
  type AgendaOccupancy,
} from "./types";
