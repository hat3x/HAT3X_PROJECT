import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  Building2,
  CalendarRange,
  Coins,
  CreditCard,
  Euro,
  Gauge,
  Package,
  ReceiptText,
  Scissors,
  Tag,
  TrendingUp,
  UserRound,
  Users,
} from "lucide-react";

import { DentalKpis } from "@/app/(dashboard)/analitica/dental-kpis";
import { RangeSelector } from "@/app/(dashboard)/analitica/range-selector";
import {
  CustomersSplitChart,
  PaymentMethodChart,
  SalesTrendChart,
} from "@/app/(dashboard)/analitica/analitica-charts-lazy";
import { FeatureGateNotice } from "@/components/feature-gate-notice";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatMoney } from "@/lib/format";
import {
  getAgendaOccupancy,
  getDentalAppointmentOutcomes,
  getDentalPlanAcceptance,
  getDentalUnscheduledWork,
  getNewVsReturningCustomers,
  getPaymentMethodDistribution,
  getRevenueByLocation,
  getRevenueByProfessional,
  getRevenueTimeseries,
  getSalesSummary,
  getTopProducts,
  getTopServices,
  type AgendaOccupancy,
  type RevenueGranularity,
  type TopItemRow,
} from "@/lib/metrics";
import {
  localTodayIso,
  resolveMetricsRange,
  type RawSearchParams,
  type ResolvedRange,
} from "@/lib/metrics/range";
import { canManageSettings, getActiveMembership, getActiveSalon } from "@/lib/salon";
import { salonHasFeature } from "@/lib/salon-features";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Analítica",
};

/** Moneda del salón (Spain / VeriFactu → EUR por ahora). */
const CURRENCY = "EUR";

/** Cliente Supabase de servidor (sesión del usuario, con RLS del salón). */
type ServerSupabase = ReturnType<typeof createClient>;

interface AnaliticaPageProps {
  searchParams: RawSearchParams;
}

/**
 * Carga TODAS las métricas de ventas del periodo en paralelo (un solo rango).
 * Cada llamada es una RPC de agregación (`@/lib/metrics`) que ya hace el
 * `group by` en base: nunca se traen ventas en crudo al servidor de Next.
 */
async function loadSalesAnalytics(
  supabase: ServerSupabase,
  salonId: string,
  range: ResolvedRange,
) {
  const [
    summary,
    timeseries,
    byLocation,
    byProfessional,
    topServices,
    topProducts,
    payments,
    customers,
  ] = await Promise.all([
    getSalesSummary(supabase, salonId, range.period),
    getRevenueTimeseries(supabase, salonId, range.period, range.granularity),
    getRevenueByLocation(supabase, salonId, range.period),
    getRevenueByProfessional(supabase, salonId, range.period, 8),
    getTopServices(supabase, salonId, range.period, 6),
    getTopProducts(supabase, salonId, range.period, 6),
    getPaymentMethodDistribution(supabase, salonId, range.period),
    getNewVsReturningCustomers(supabase, salonId, range.period),
  ]);

  return {
    summary,
    timeseries,
    byLocation,
    byProfessional,
    topServices,
    topProducts,
    payments,
    customers,
  };
}

type SalesData = Awaited<ReturnType<typeof loadSalesAnalytics>>;

/**
 * `/analitica` — panel de rendimiento del salón por periodo.
 *
 * Server Component: resuelve el rango pedido (URL) a un `{ from, to }` en la zona
 * del salón y con ese ÚNICO periodo consulta TODAS las métricas ya agregadas en
 * base (`@/lib/metrics`) — nunca trae ventas en crudo. El `RangeSelector` escribe
 * el rango en la URL y esta página re-renderiza; por eso el selector gobierna a la
 * vez KPIs y gráficas.
 *
 * Guard: la analítica es materia de gestión (facturación, clientes) → solo
 * owner/manager, igual que /facturacion y /ajustes.
 *
 * Gating por add-on `pos` (TPV): la analítica de VENTAS (facturación, cobros,
 * clientes) se muestra solo si el salón tiene TPV; la OCUPACIÓN de agenda (que no
 * depende del TPV) se muestra siempre. Es gating de presentación con defensa en
 * profundidad: sin `pos` ni siquiera se consultan las métricas de ventas.
 */
export default async function AnaliticaPage({
  searchParams,
}: AnaliticaPageProps): Promise<React.ReactElement> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user === null) {
    redirect("/login?next=/analitica");
  }

  const membership = await getActiveMembership();
  if (!canManageSettings(membership?.role)) {
    redirect("/dashboard");
  }

  const salon = await getActiveSalon();
  if (salon === null) {
    return <NoSalonState />;
  }

  const range = resolveMetricsRange(searchParams, salon.timezone);
  const today = localTodayIso(salon.timezone);
  const hasPos = await salonHasFeature(supabase, salon.id, "pos");

  // Ocupación (siempre); ventas (solo con TPV). Todo en paralelo, un solo periodo.
  const occupancyPromise = getAgendaOccupancy(supabase, salon.id, range.period);
  const salesPromise: Promise<SalesData | null> = hasPos
    ? loadSalesAnalytics(supabase, salon.id, range)
    : Promise.resolve(null);

  const isDental = salon.sector === "odontologia";
  const dentalPromise = isDental
    ? Promise.all([
        getDentalPlanAcceptance(supabase, salon.id, range.period),
        getDentalAppointmentOutcomes(supabase, salon.id, range.period),
        getDentalUnscheduledWork(supabase, salon.id),
      ])
    : Promise.resolve(null);

  const [occupancy, sales, dental] = await Promise.all([
    occupancyPromise,
    salesPromise,
    dentalPromise,
  ]);

  return (
    <main className="container py-8 md:py-10">
      <header className="mb-8 flex flex-col gap-5 animate-fade-up">
        <div>
          <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-accent/60 px-3 py-1 text-xs font-medium text-accent-foreground">
            <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />
            Rendimiento del salón
          </div>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Analítica</h1>
          <p className="mt-1.5 max-w-prose text-muted-foreground">
            Facturación, cobros, clientes y ocupación de agenda por periodo. Elige un
            rango y toda la vista se actualiza.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <RangeSelector
            preset={range.preset}
            from={range.period.from}
            to={range.period.to}
            maxDate={today}
          />
          <p className="text-sm text-muted-foreground">
            <CalendarRange
              className="mr-1.5 inline-block h-3.5 w-3.5 align-[-2px]"
              aria-hidden="true"
            />
            Mostrando{" "}
            <span className="font-medium text-foreground">{range.label}</span>
            <span className="text-muted-foreground/70"> · zona {salon.timezone}</span>
          </p>
        </div>
      </header>

      {/* Va ANTES de la analitica de comercio: quien dirige una clinica entra a
          mirar presupuestos y ausencias, no ticket medio. Lo primero de la
          pagina debe ser lo primero que se busca. */}
      {dental !== null ? (
        <div className="mb-8">
          <DentalKpis
            planCounts={dental[0]}
            outcomes={dental[1]}
            unscheduled={dental[2]}
            currency={CURRENCY}
          />
        </div>
      ) : null}

      {sales !== null ? (
        <SalesAnalytics range={range} sales={sales} />
      ) : (
        <PosGateNotice />
      )}

      <section aria-labelledby="ocupacion-heading" className="mt-8">
        <Card className="animate-fade-up" style={{ animationDelay: "120ms" }}>
          <CardHeader>
            <CardTitle
              className="flex items-center gap-2 text-lg"
              id="ocupacion-heading"
            >
              <Gauge className="h-4.5 w-4.5 text-primary" aria-hidden="true" />
              Ocupación de agenda
            </CardTitle>
            <CardDescription>
              Minutos reservados frente a la capacidad del personal.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <OccupancyMeter data={occupancy} />
          </CardContent>
        </Card>
      </section>
    </main>
  );
}

/** Bloque de analítica de ventas (gated por `pos`). */
function SalesAnalytics({
  range,
  sales,
}: {
  range: ResolvedRange;
  sales: SalesData;
}): React.ReactElement {
  const {
    summary,
    timeseries,
    byLocation,
    byProfessional,
    topServices,
    topProducts,
    payments,
    customers,
  } = sales;

  return (
    <>
      {/* KPIs de facturación */}
      <section
        aria-label="Indicadores clave"
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        <StatCard
          icon={Euro}
          label="Facturación"
          value={formatMoney(summary.gross_revenue_cents, CURRENCY)}
          hint="Ingresos del periodo"
          delayMs={40}
        />
        <StatCard
          icon={ReceiptText}
          label="Tickets"
          value={String(summary.sales_count)}
          hint="Ventas completadas"
          delayMs={90}
        />
        <StatCard
          icon={Coins}
          label="Ticket medio"
          value={formatMoney(summary.avg_ticket_cents, CURRENCY)}
          hint="Importe por venta"
          delayMs={140}
        />
        <StatCard
          icon={Users}
          label="Clientes"
          value={String(summary.customers_count)}
          hint="Clientes atendidos"
          delayMs={190}
        />
      </section>

      {/* Tendencia de ventas en el tiempo (facturación / tickets / ticket medio) */}
      <section className="mt-8">
        <Card className="animate-fade-up" style={{ animationDelay: "220ms" }}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <TrendingUp className="h-4.5 w-4.5 text-primary" aria-hidden="true" />
              Tendencia de ventas
            </CardTitle>
            <CardDescription>
              Facturación, nº de tickets y ticket medio por{" "}
              {granularityWord(range.granularity)}. Cambia la métrica sin recargar.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SalesTrendChart
              data={timeseries}
              granularity={range.granularity}
              currency={CURRENCY}
            />
          </CardContent>
        </Card>
      </section>

      {/* Ingresos por sede + ranking por profesional */}
      <section className="mt-8 grid gap-4 lg:grid-cols-2">
        <Card className="animate-fade-up" style={{ animationDelay: "260ms" }}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Building2 className="h-4.5 w-4.5 text-primary" aria-hidden="true" />
              Ingresos por sede
            </CardTitle>
            <CardDescription>Reparto de la facturación entre sedes.</CardDescription>
          </CardHeader>
          <CardContent>
            <RankBars
              rows={byLocation.map((row) => ({
                key: row.location_id ?? "sin-sede",
                name: row.location_name,
                valueCents: row.revenue_cents,
                leading: (
                  <Building2
                    className="h-3.5 w-3.5 text-muted-foreground"
                    aria-hidden="true"
                  />
                ),
                sub: ticketsLabel(row.sales_count),
              }))}
              emptyMessage="Sin ventas con sede asignada en este periodo."
            />
          </CardContent>
        </Card>

        <Card className="animate-fade-up" style={{ animationDelay: "300ms" }}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <UserRound className="h-4.5 w-4.5 text-primary" aria-hidden="true" />
              Ingresos por profesional
            </CardTitle>
            <CardDescription>Ranking por facturación del periodo.</CardDescription>
          </CardHeader>
          <CardContent>
            <RankBars
              showRank
              rows={byProfessional.map((row) => ({
                key: row.professional_id ?? "sin-profesional",
                name: row.professional_name,
                valueCents: row.revenue_cents,
                leading: (
                  <UserRound
                    className="h-3.5 w-3.5 text-muted-foreground"
                    aria-hidden="true"
                  />
                ),
                sub: ticketsLabel(row.sales_count),
              }))}
              emptyMessage="Sin ventas atribuidas a profesionales en este periodo."
            />
          </CardContent>
        </Card>
      </section>

      {/* Top servicios + top productos */}
      <section className="mt-8 grid gap-4 lg:grid-cols-2">
        <Card className="animate-fade-up" style={{ animationDelay: "340ms" }}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Scissors className="h-4.5 w-4.5 text-primary" aria-hidden="true" />
              Top servicios
            </CardTitle>
            <CardDescription>Servicios por ingresos en el periodo.</CardDescription>
          </CardHeader>
          <CardContent>
            <RankBars
              showRank
              rows={topItemRows(topServices)}
              emptyMessage="Sin servicios vendidos en este periodo."
            />
          </CardContent>
        </Card>

        <Card className="animate-fade-up" style={{ animationDelay: "380ms" }}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Package className="h-4.5 w-4.5 text-primary" aria-hidden="true" />
              Top productos
            </CardTitle>
            <CardDescription>Productos por ingresos en el periodo.</CardDescription>
          </CardHeader>
          <CardContent>
            <RankBars
              showRank
              rows={topItemRows(topProducts)}
              emptyMessage="Sin productos vendidos en este periodo."
            />
          </CardContent>
        </Card>
      </section>

      {/* Cobros por método + composición de clientes */}
      <section className="mt-8 grid gap-4 lg:grid-cols-2">
        <Card className="animate-fade-up" style={{ animationDelay: "420ms" }}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <CreditCard className="h-4.5 w-4.5 text-primary" aria-hidden="true" />
              Cobros por método
            </CardTitle>
            <CardDescription>Reparto del importe cobrado.</CardDescription>
          </CardHeader>
          <CardContent>
            <PaymentMethodChart data={payments} currency={CURRENCY} />
          </CardContent>
        </Card>

        <Card className="animate-fade-up" style={{ animationDelay: "460ms" }}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Users className="h-4.5 w-4.5 text-primary" aria-hidden="true" />
              Clientes
            </CardTitle>
            <CardDescription>Nuevos, recurrentes y ventas anónimas.</CardDescription>
          </CardHeader>
          <CardContent>
            <CustomersSplitChart data={customers} />
          </CardContent>
        </Card>
      </section>
    </>
  );
}

// ── Presentacional (Server Components, sin interactividad) ─────────────────────

/** Tarjeta de KPI: icono en cuadro de marca + valor grande + aclaración. */
function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  delayMs,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  hint: string;
  delayMs: number;
}): React.ReactElement {
  return (
    <Card
      className="animate-fade-up transition-shadow duration-200 hover:shadow-md"
      style={{ animationDelay: `${delayMs}ms` }}
    >
      <CardContent className="flex items-start gap-4 p-5">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-accent text-accent-foreground">
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-muted-foreground">{label}</p>
          <p className="mt-0.5 text-2xl font-semibold leading-tight tracking-tight text-foreground">
            {value}
          </p>
          <p className="mt-1 text-xs text-muted-foreground/80">{hint}</p>
        </div>
      </CardContent>
    </Card>
  );
}

/** Formatea minutos a horas legibles (p. ej. «12,5 h»). */
function formatHours(minutes: number): string {
  const hours = minutes / 60;
  return `${new Intl.NumberFormat("es-ES", { maximumFractionDigits: 1 }).format(hours)} h`;
}

/** Medidor de ocupación de agenda (reservado / capacidad). */
function OccupancyMeter({ data }: { data: AgendaOccupancy }): React.ReactElement {
  if (data.capacity_minutes <= 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Configura los horarios del personal para calcular la ocupación de este periodo.
      </p>
    );
  }
  const pct = Math.round(data.occupancy_rate * 100);
  const barPct = Math.min(100, Math.max(0, pct));
  const over = pct > 100;

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-3xl font-semibold tracking-tight text-foreground">
          {pct}%
        </span>
        <span className="text-sm text-muted-foreground">
          {data.booked_appointments} citas
        </span>
      </div>
      <div
        className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-secondary"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Ocupación de agenda"
      >
        <div
          className={cn(
            "h-full rounded-full transition-all",
            over ? "bg-warning" : "bg-primary",
          )}
          style={{ width: `${barPct}%` }}
        />
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        {formatHours(data.booked_minutes)} reservadas de{" "}
        {formatHours(data.capacity_minutes)} disponibles
        {over && <span className="ml-1 text-warning">· sobrerreserva</span>}
      </p>
    </div>
  );
}

/** Icono + etiqueta accesible por tipo de artículo. */
function KindIcon({ kind }: { kind: TopItemRow["item_kind"] }): React.ReactElement {
  if (kind === "service") {
    return <Scissors className="h-3.5 w-3.5 text-muted-foreground" aria-label="Servicio" />;
  }
  if (kind === "product") {
    return <Package className="h-3.5 w-3.5 text-muted-foreground" aria-label="Producto" />;
  }
  return <Tag className="h-3.5 w-3.5 text-muted-foreground" aria-label="Cargo manual" />;
}

/** «N tickets» / «1 ticket» (plural correcto para las sub-líneas del ranking). */
function ticketsLabel(count: number): string {
  return `${count} ${count === 1 ? "ticket" : "tickets"}`;
}

/** Fila de un ranking con barra proporcional (ingresos en céntimos). */
interface RankBarRow {
  /** Clave estable para React. */
  key: string;
  /** Nombre visible (sede / profesional / artículo). */
  name: string;
  /** Importe en CÉNTIMOS: gobierna el valor mostrado y la anchura de la barra. */
  valueCents: number;
  /** Icono a la izquierda del nombre. */
  leading?: React.ReactNode;
  /** Línea secundaria bajo la barra (p. ej. «12 tickets»). */
  sub?: React.ReactNode;
}

/**
 * Ranking por ingresos con barra proporcional al mayor de la lista. Reutilizado
 * por ingresos por sede / profesional y por los tops de servicios / productos.
 * `showRank` numera las filas (rankings) y sangra la barra bajo el número.
 */
function RankBars({
  rows,
  emptyMessage,
  showRank = false,
  barClassName = "bg-primary/70",
}: {
  rows: readonly RankBarRow[];
  emptyMessage: string;
  showRank?: boolean;
  barClassName?: string;
}): React.ReactElement {
  if (rows.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">{emptyMessage}</p>
    );
  }
  const max = Math.max(...rows.map((row) => row.valueCents), 1);
  const indent = showRank ? "ml-6" : "";

  return (
    <ol className="space-y-3.5">
      {rows.map((row, index) => (
        <li key={row.key}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="flex min-w-0 items-center gap-2">
              {showRank && (
                <span className="w-4 shrink-0 text-right text-xs font-medium tabular-nums text-muted-foreground">
                  {index + 1}
                </span>
              )}
              {row.leading}
              <span className="truncate font-medium text-foreground">{row.name}</span>
            </span>
            <span className="shrink-0 font-semibold tabular-nums text-foreground">
              {formatMoney(row.valueCents, CURRENCY)}
            </span>
          </div>
          <div
            className={cn(
              "mt-1.5 h-1.5 overflow-hidden rounded-full bg-secondary",
              indent,
            )}
          >
            <div
              className={cn("h-full rounded-full", barClassName)}
              style={{ width: `${(row.valueCents / max) * 100}%` }}
            />
          </div>
          {row.sub != null && (
            <p className={cn("mt-1 text-xs text-muted-foreground", indent)}>{row.sub}</p>
          )}
        </li>
      ))}
    </ol>
  );
}

/** Proyecta filas de `salon_top_items` a filas de {@link RankBars}. */
function topItemRows(items: readonly TopItemRow[]): RankBarRow[] {
  return items.map((item, index) => ({
    key: `${item.item_kind}-${item.item_id ?? item.name}-${index}`,
    name: item.name,
    valueCents: item.revenue_cents,
    leading: <KindIcon kind={item.item_kind} />,
    sub: `${item.quantity} uds · ${item.lines_count} líneas`,
  }));
}

/**
 * Aviso cuando el salón no tiene TPV: la analítica de ventas queda gated. Delega en
 * el aviso compartido {@link FeatureGateNotice} para que el copy y el aspecto sean
 * idénticos a los de Facturación (gating coherente); la ocupación de agenda sigue
 * debajo, ajena a `pos`.
 */
function PosGateNotice(): React.ReactElement {
  return (
    <FeatureGateNotice
      title="La analítica de ventas necesita el TPV"
      description="Activa el módulo de TPV (caja) para ver facturación, cobros por método y clientes. La ocupación de agenda ya está disponible aquí debajo."
    />
  );
}

/** Estado cuando el usuario no tiene un salón activo. */
function NoSalonState(): React.ReactElement {
  return (
    <main className="container py-10">
      <Card className="mx-auto max-w-lg animate-fade-up">
        <CardContent className="p-8 text-center">
          <h1 className="text-xl font-semibold">Sin salón activo</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            No hay ningún salón asociado a tu cuenta, así que no hay analítica que mostrar.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}

/** Palabra del bucket de la serie según la granularidad (para descripciones). */
function granularityWord(granularity: RevenueGranularity): string {
  switch (granularity) {
    case "day":
      return "día";
    case "week":
      return "semana";
    case "month":
      return "mes";
    case "year":
      return "año";
    default:
      return "periodo";
  }
}
