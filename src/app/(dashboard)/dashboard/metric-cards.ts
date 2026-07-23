/**
 * Derivación PURA de los KPIs destacados del panel a partir de las métricas ya
 * agregadas en servidor (`@/lib/metrics`). Sin acceso a red ni a Supabase: recibe
 * los datos resueltos y devuelve los view-models de tarjeta listos para pintar.
 *
 * Al ser puro y determinista es TESTEABLE en aislamiento (ver
 * `src/tests/unit/dashboard-metrics.test.ts`): la lógica delicada —formateo de
 * dinero en céntimos, porcentaje de ocupación y GATING por el add-on `pos`— no
 * depende del render ni de la base.
 *
 * ── Gating por 'pos' (TPV) ────────────────────────────────────────────────────
 * Ingresos y nº de tickets salen de las ventas del TPV: solo tienen sentido si el
 * salón tiene contratado `pos`. Sin él se OCULTAN esos KPIs y se muestra la
 * analítica de gestión (citas, clientes, ocupación), coherente con el resto del
 * panel. Es SOLO presentación; el gate de datos real ya vive en el servidor.
 */
import type { ComponentType } from "react";
import { CalendarDays, Euro, Gauge, Receipt, UserPlus } from "lucide-react";

import { formatMoney } from "@/lib/format";
import type { AgendaOccupancy, SalesSummary } from "@/lib/metrics";

/** View-model de una tarjeta de KPI del resumen del panel. */
export interface DashboardMetric {
  /** Clave estable para `key` de React. */
  key: string;
  label: string;
  /** Valor ya formateado y localizado (dinero, recuento o porcentaje). */
  value: string;
  hint: string;
  icon: ComponentType<{ className?: string }>;
  /** Relleno 0..1 para la barra de ocupación (solo la tarjeta de ocupación). */
  progress?: number;
}

const percentFormatter = new Intl.NumberFormat("es-ES", {
  style: "percent",
  maximumFractionDigits: 0,
});

const countFormatter = new Intl.NumberFormat("es-ES");

/** Ratio de ocupación 0..1 → porcentaje entero local ("45 %"). */
export function formatOccupancy(rate: number): string {
  return percentFormatter.format(Number.isFinite(rate) ? rate : 0);
}

export interface DashboardMetricsInput {
  /** ¿El salón tiene contratado y activo el add-on `pos` (TPV)? */
  hasPos: boolean;
  /**
   * Resumen de ventas de HOY, o `null` cuando `pos` está desactivado (en ese caso
   * ni siquiera se consulta la RPC de ventas: no hay KPIs de ingresos que mostrar).
   */
  sales: SalesSummary | null;
  /** Clientes nuevos del periodo (altas cuya primera venta cae en el rango). */
  newCustomers: number;
  /** Ocupación de agenda de HOY (minutos reservados / capacidad). */
  occupancy: AgendaOccupancy;
}

/**
 * Construye las tarjetas de KPI del resumen. Con `pos`: [Ingresos, Tickets,
 * Clientes nuevos, Ocupación]. Sin `pos`: [Citas de hoy, Clientes nuevos,
 * Ocupación] — se sustituyen los KPIs de ingresos por la actividad de agenda.
 */
export function buildDashboardMetrics({
  hasPos,
  sales,
  newCustomers,
  occupancy,
}: DashboardMetricsInput): DashboardMetric[] {
  const occupancyRate = Number.isFinite(occupancy.occupancy_rate)
    ? occupancy.occupancy_rate
    : 0;

  const occupancyMetric: DashboardMetric = {
    key: "occupancy",
    label: "Ocupación",
    value: formatOccupancy(occupancyRate),
    hint: "Agenda reservada hoy",
    icon: Gauge,
    // La barra satura a 100 %: una sobrerreserva (ratio > 1) no desborda el carril.
    progress: Math.min(Math.max(occupancyRate, 0), 1),
  };

  const newCustomersMetric: DashboardMetric = {
    key: "new-customers",
    label: "Clientes nuevos",
    value: countFormatter.format(newCustomers),
    hint: "Altas este mes",
    icon: UserPlus,
  };

  // Sin TPV: se ocultan ingresos/tickets y se muestra la actividad de la agenda.
  if (!hasPos || sales === null) {
    return [
      {
        key: "appointments",
        label: "Citas de hoy",
        value: countFormatter.format(occupancy.booked_appointments),
        hint: "Reservas confirmadas",
        icon: CalendarDays,
      },
      newCustomersMetric,
      occupancyMetric,
    ];
  }

  return [
    {
      key: "revenue",
      label: "Ingresos de hoy",
      value: formatMoney(sales.gross_revenue_cents),
      hint: "Cobros del día",
      icon: Euro,
    },
    {
      key: "tickets",
      label: "Tickets de hoy",
      value: countFormatter.format(sales.sales_count),
      hint: "Ventas cerradas hoy",
      icon: Receipt,
    },
    newCustomersMetric,
    occupancyMetric,
  ];
}
