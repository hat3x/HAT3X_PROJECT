/**
 * Capa de MÉTRICAS del panel — envoltorios TS de SERVIDOR sobre las RPC de
 * agregación (`20260723100000_rpc_dashboard_metrics.sql`).
 *
 * ── Por qué RPC y no `.from(...).select(...)` ────────────────────────────────
 * El requisito de la tarea es NO traer miles de ventas al cliente para sumarlas.
 * Cada función aquí llama a una RPC `supabase.rpc("salon_*")` que ya hace el
 * `date_trunc` + `group by` en la base y devuelve SOLO las filas agregadas (una
 * serie temporal, un ranking, una distribución…). El coste de red y de memoria
 * es O(nº de buckets), no O(nº de ventas).
 *
 * ── Seguridad ────────────────────────────────────────────────────────────────
 * Las RPC son SOLO LECTURA y SECURITY INVOKER: la RLS del salón se aplica dentro
 * de la función, así que pasar el cliente RLS de la SESIÓN basta para que un
 * miembro solo vea las métricas de SU salón (aislamiento multi-tenant). Aun así
 * cada llamada acota por `salonId` explícito.
 *
 * ── Importes en céntimos ─────────────────────────────────────────────────────
 * Todos los `*_cents` son enteros de céntimos: formatear en la UI con
 * `formatMoney(cents)` de `@/lib/format`. No recalcular importes aquí.
 *
 * USO EXCLUSIVO DE SERVIDOR (Server Components / Route Handlers): pasa el cliente
 * Supabase de servidor (`@/lib/supabase/server`). No importar desde componentes
 * cliente.
 */
import type {
  AppointmentOutcomeCounts,
  TreatmentPlanStatusCounts,
} from "@/lib/metrics/dental";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

import {
  EMPTY_NEW_VS_RETURNING,
  EMPTY_OCCUPANCY,
  EMPTY_SALES_SUMMARY,
  type AgendaOccupancy,
  type MetricsPeriod,
  type NewVsReturningCustomers,
  type PaymentMethodDistributionRow,
  type RevenueByLocationRow,
  type RevenueByProfessionalRow,
  type RevenueGranularity,
  type RevenueTimeseriesPoint,
  type SalesSummary,
  type TopItemRow,
} from "./types";

/** Cliente Supabase tipado con el esquema del proyecto (sesión o admin). */
type AnySupabaseClient = SupabaseClient<Database>;

/** Tipo de línea para el filtro de `getTopItems` (o `null` = servicios+productos). */
type TopItemKind = "service" | "product" | "manual";

/**
 * KPIs de facturación del periodo (facturación total, nº de tickets, clientes
 * distintos y ticket medio). Siempre resuelve a UNA fila (a cero si no hay datos).
 */
export async function getSalesSummary(
  client: AnySupabaseClient,
  salonId: string,
  period: MetricsPeriod,
): Promise<SalesSummary> {
  const { data, error } = await client.rpc("salon_sales_summary", {
    p_salon_id: salonId,
    p_from: period.from,
    p_to: period.to,
  });
  if (error !== null) {
    throw error;
  }
  return data?.[0] ?? EMPTY_SALES_SUMMARY;
}

/**
 * Facturación / nº de tickets / ticket medio EN EL TIEMPO. Devuelve un punto por
 * bucket (día/semana/mes/año local), ordenado ascendente. Listo para el eje X.
 */
export async function getRevenueTimeseries(
  client: AnySupabaseClient,
  salonId: string,
  period: MetricsPeriod,
  granularity: RevenueGranularity = "day",
): Promise<RevenueTimeseriesPoint[]> {
  const { data, error } = await client.rpc("salon_revenue_timeseries", {
    p_salon_id: salonId,
    p_from: period.from,
    p_to: period.to,
    p_granularity: granularity,
  });
  if (error !== null) {
    throw error;
  }
  return data ?? [];
}

/** Ingresos por sede (ventas sin sede → fila "Sin sede", `location_id` null). */
export async function getRevenueByLocation(
  client: AnySupabaseClient,
  salonId: string,
  period: MetricsPeriod,
): Promise<RevenueByLocationRow[]> {
  const { data, error } = await client.rpc("salon_revenue_by_location", {
    p_salon_id: salonId,
    p_from: period.from,
    p_to: period.to,
  });
  if (error !== null) {
    throw error;
  }
  return data ?? [];
}

/** Ranking de ingresos por profesional (top `limit`, por defecto 20). */
export async function getRevenueByProfessional(
  client: AnySupabaseClient,
  salonId: string,
  period: MetricsPeriod,
  limit = 20,
): Promise<RevenueByProfessionalRow[]> {
  const { data, error } = await client.rpc("salon_revenue_by_professional", {
    p_salon_id: salonId,
    p_from: period.from,
    p_to: period.to,
    p_limit: limit,
  });
  if (error !== null) {
    throw error;
  }
  return data ?? [];
}

/**
 * Top de artículos por ingresos. `kind`:
 *   · "service" | "product" | "manual" → filtra a ese tipo.
 *   · null (por defecto) → servicios + productos (excluye cargos manuales).
 */
export async function getTopItems(
  client: AnySupabaseClient,
  salonId: string,
  period: MetricsPeriod,
  kind: TopItemKind | null = null,
  limit = 10,
): Promise<TopItemRow[]> {
  const { data, error } = await client.rpc("salon_top_items", {
    p_salon_id: salonId,
    p_from: period.from,
    p_to: period.to,
    p_item_kind: kind,
    p_limit: limit,
  });
  if (error !== null) {
    throw error;
  }
  return data ?? [];
}

/** Atajo: top servicios. */
export function getTopServices(
  client: AnySupabaseClient,
  salonId: string,
  period: MetricsPeriod,
  limit = 10,
): Promise<TopItemRow[]> {
  return getTopItems(client, salonId, period, "service", limit);
}

/** Atajo: top productos. */
export function getTopProducts(
  client: AnySupabaseClient,
  salonId: string,
  period: MetricsPeriod,
  limit = 10,
): Promise<TopItemRow[]> {
  return getTopItems(client, salonId, period, "product", limit);
}

/** Distribución de cobros por método de pago (para la gráfica de tarta). */
export async function getPaymentMethodDistribution(
  client: AnySupabaseClient,
  salonId: string,
  period: MetricsPeriod,
): Promise<PaymentMethodDistributionRow[]> {
  const { data, error } = await client.rpc(
    "salon_payment_method_distribution",
    {
      p_salon_id: salonId,
      p_from: period.from,
      p_to: period.to,
    },
  );
  if (error !== null) {
    throw error;
  }
  return data ?? [];
}

/** Clientes nuevos vs recurrentes (+ tickets anónimos). Siempre UNA fila. */
export async function getNewVsReturningCustomers(
  client: AnySupabaseClient,
  salonId: string,
  period: MetricsPeriod,
): Promise<NewVsReturningCustomers> {
  const { data, error } = await client.rpc(
    "salon_new_vs_returning_customers",
    {
      p_salon_id: salonId,
      p_from: period.from,
      p_to: period.to,
    },
  );
  if (error !== null) {
    throw error;
  }
  return data?.[0] ?? EMPTY_NEW_VS_RETURNING;
}

/**
 * Ocupación de agenda (minutos reservados / minutos de capacidad) en el periodo.
 * `locationId` opcional acota a los profesionales de una sede. Siempre UNA fila.
 */
export async function getAgendaOccupancy(
  client: AnySupabaseClient,
  salonId: string,
  period: MetricsPeriod,
  locationId: string | null = null,
): Promise<AgendaOccupancy> {
  const { data, error } = await client.rpc("salon_agenda_occupancy", {
    p_salon_id: salonId,
    p_from: period.from,
    p_to: period.to,
    p_location_id: locationId,
  });
  if (error !== null) {
    throw error;
  }
  return data?.[0] ?? EMPTY_OCCUPANCY;
}

// ─────────────────────────────────────────────────────────────────────────────
// Indicadores de clínica dental (B5) — migración 20260829100000_dental_kpis.
//
// Los tres RPC devuelven RECUENTOS EN CRUDO. Las tasas se derivan en
// `@/lib/metrics/dental`, que es donde están probadas las definiciones: qué
// cuenta como aceptado y sobre qué se divide. Ahí está el juicio; aquí, el
// transporte.
// ─────────────────────────────────────────────────────────────────────────────

/** Planes de tratamiento por estado, creados dentro del periodo. */
export async function getDentalPlanAcceptance(
  client: AnySupabaseClient,
  salonId: string,
  period: MetricsPeriod,
): Promise<TreatmentPlanStatusCounts> {
  const { data, error } = await client.rpc("salon_dental_plan_acceptance", {
    p_salon_id: salonId,
    p_from: period.from,
    p_to: period.to,
  });
  if (error !== null) {
    throw error;
  }
  const row = data?.[0];
  return {
    draft: Number(row?.draft ?? 0),
    proposed: Number(row?.proposed ?? 0),
    accepted: Number(row?.accepted ?? 0),
    in_progress: Number(row?.in_progress ?? 0),
    completed: Number(row?.completed ?? 0),
    cancelled: Number(row?.cancelled ?? 0),
  };
}

export interface DentalUnscheduledWork {
  items: number;
  patients: number;
  valueCents: number;
}

/**
 * Trabajo ya aceptado por el paciente y todavía sin fecha. SIN periodo: es una
 * bolsa viva, y lo propuesto hace meses es justo lo que hay que rescatar.
 */
export async function getDentalUnscheduledWork(
  client: AnySupabaseClient,
  salonId: string,
): Promise<DentalUnscheduledWork> {
  const { data, error } = await client.rpc("salon_dental_unscheduled_work", {
    p_salon_id: salonId,
  });
  if (error !== null) {
    throw error;
  }
  const row = data?.[0];
  return {
    items: Number(row?.items ?? 0),
    patients: Number(row?.patients ?? 0),
    valueCents: Number(row?.value_cents ?? 0),
  };
}

/** Citas del periodo por desenlace. */
export async function getDentalAppointmentOutcomes(
  client: AnySupabaseClient,
  salonId: string,
  period: MetricsPeriod,
): Promise<AppointmentOutcomeCounts> {
  const { data, error } = await client.rpc("salon_dental_appointment_outcomes", {
    p_salon_id: salonId,
    p_from: period.from,
    p_to: period.to,
  });
  if (error !== null) {
    throw error;
  }
  const row = data?.[0];
  return {
    noShow: Number(row?.no_show ?? 0),
    completed: Number(row?.completed ?? 0),
    cancelled: Number(row?.cancelled ?? 0),
    pending: Number(row?.pending ?? 0),
  };
}
