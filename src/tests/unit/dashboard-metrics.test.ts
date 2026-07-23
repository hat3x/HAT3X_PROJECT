/**
 * Derivación de los KPIs del panel (`buildDashboardMetrics` / `formatOccupancy`
 * de `@/app/(dashboard)/dashboard/metric-cards`). Se prueba la lógica delicada en
 * aislamiento, sin render ni base:
 *
 *   · Con `pos`: 4 tarjetas [Ingresos, Tickets, Clientes nuevos, Ocupación]. El
 *     importe se formatea con el MISMO `formatMoney` (céntimos) que el resto del app.
 *   · Sin `pos` (o sin datos de ventas): se OCULTAN ingresos/tickets y se muestra la
 *     analítica de gestión [Citas de hoy, Clientes nuevos, Ocupación] — el gating.
 *   · La ocupación (ratio 0..1) se pinta como porcentaje y su barra SATURA a 100 %
 *     ante sobrerreserva (ratio > 1).
 */
import { describe, it, expect } from "vitest";
import { CalendarDays, Euro, Gauge, Receipt, UserPlus } from "lucide-react";

import {
  buildDashboardMetrics,
  formatOccupancy,
} from "@/app/(dashboard)/dashboard/metric-cards";
import { formatMoney } from "@/lib/format";
import {
  EMPTY_OCCUPANCY,
  EMPTY_SALES_SUMMARY,
  type AgendaOccupancy,
  type SalesSummary,
} from "@/lib/metrics";

const sales = (over: Partial<SalesSummary>): SalesSummary => ({
  ...EMPTY_SALES_SUMMARY,
  ...over,
});
const occupancy = (over: Partial<AgendaOccupancy>): AgendaOccupancy => ({
  ...EMPTY_OCCUPANCY,
  ...over,
});

describe("buildDashboardMetrics — con TPV ('pos' activo)", () => {
  const metrics = buildDashboardMetrics({
    hasPos: true,
    sales: sales({ gross_revenue_cents: 12_345, sales_count: 7 }),
    newCustomers: 3,
    occupancy: occupancy({ occupancy_rate: 0.45, booked_appointments: 9 }),
  });

  it("muestra las 4 tarjetas en orden [ingresos, tickets, clientes, ocupación]", () => {
    expect(metrics.map((m) => m.key)).toEqual([
      "revenue",
      "tickets",
      "new-customers",
      "occupancy",
    ]);
    expect(metrics.map((m) => m.icon)).toEqual([Euro, Receipt, UserPlus, Gauge]);
  });

  it("formatea los ingresos con formatMoney (céntimos), no a mano", () => {
    const revenue = metrics.find((m) => m.key === "revenue");
    expect(revenue?.value).toBe(formatMoney(12_345)); // 123,45 €
  });

  it("muestra el nº de tickets y de clientes nuevos como recuentos", () => {
    expect(metrics.find((m) => m.key === "tickets")?.value).toBe("7");
    expect(metrics.find((m) => m.key === "new-customers")?.value).toBe("3");
  });

  it("pinta la ocupación como porcentaje y su barra 0..1", () => {
    const occ = metrics.find((m) => m.key === "occupancy");
    expect(occ?.value).toBe(formatOccupancy(0.45)); // 45 %
    expect(occ?.progress).toBeCloseTo(0.45, 5);
  });
});

describe("buildDashboardMetrics — sin TPV (gating por 'pos')", () => {
  const base = {
    hasPos: false,
    sales: null,
    newCustomers: 4,
    occupancy: occupancy({ occupancy_rate: 0.2, booked_appointments: 5 }),
  } as const;

  it("oculta ingresos y tickets, y muestra [citas, clientes, ocupación]", () => {
    const metrics = buildDashboardMetrics(base);
    expect(metrics.map((m) => m.key)).toEqual([
      "appointments",
      "new-customers",
      "occupancy",
    ]);
    expect(metrics.some((m) => m.key === "revenue" || m.key === "tickets")).toBe(
      false,
    );
  });

  it("la tarjeta de citas usa las citas confirmadas de la ocupación", () => {
    const appts = buildDashboardMetrics(base).find((m) => m.key === "appointments");
    expect(appts?.value).toBe("5");
    expect(appts?.icon).toBe(CalendarDays);
  });

  it("cae a la vista de gestión aunque haya 'pos' si faltan datos de ventas", () => {
    const metrics = buildDashboardMetrics({ ...base, hasPos: true, sales: null });
    expect(metrics.map((m) => m.key)).toEqual([
      "appointments",
      "new-customers",
      "occupancy",
    ]);
  });
});

describe("ocupación — porcentaje y saturación", () => {
  it("satura la barra a 100 % ante sobrerreserva (ratio > 1)", () => {
    const occ = buildDashboardMetrics({
      hasPos: true,
      sales: sales({}),
      newCustomers: 0,
      occupancy: occupancy({ occupancy_rate: 1.5 }),
    }).find((m) => m.key === "occupancy");
    expect(occ?.value).toBe(formatOccupancy(1.5)); // 150 %
    expect(occ?.progress).toBe(1);
  });

  it("formatOccupancy tolera valores no finitos → 0 %", () => {
    expect(formatOccupancy(Number.NaN)).toBe(formatOccupancy(0));
  });
});
