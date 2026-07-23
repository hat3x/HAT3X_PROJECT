import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  CalendarRange,
  Coins,
  Euro,
  Gauge,
  Lock,
  Package,
  ReceiptText,
  Scissors,
  Tag,
  TrendingUp,
  Users,
} from "lucide-react";

import { RangeSelector } from "@/app/(dashboard)/analitica/range-selector";
import {
  CustomersSplitChart,
  PaymentMethodChart,
  RevenueAreaChart,
} from "@/app/(dashboard)/analitica/analitica-charts";
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
  getNewVsReturningCustomers,
  getPaymentMethodDistribution,
  getRevenueTimeseries,
  getSalesSummary,
  getTopItems,
  type AgendaOccupancy,
  type TopItemRow,
} from "@/lib/metrics";
import {
  localTodayIso,
  resolveMetricsRange,
  type RawSearchParams,
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

interface AnaliticaPageProps {
  searchParams: RawSearchParams;
}

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
  const salesPromise = hasPos
    ? (Promise.all([
        getSalesSummary(supabase, salon.id, range.period),
        getRevenueTimeseries(supabase, salon.id, range.period, range.granularity),
        getPaymentMethodDistribution(supabase, salon.id, range.period),
        getTopItems(supabase, salon.id, range.period, null, 8),
        getNewVsReturningCustomers(supabase, salon.id, range.period),
      ] as const))
    : Promise.resolve(null);

  const [occupancy, sales] = await Promise.all([occupancyPromise, salesPromise]);

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

      {sales !== null ? (
        <SalesAnalytics range={range} sales={sales} />
      ) : (
        <PosGateNotice />
      )}

      <section aria-labelledby="ocupacion-heading" className="mt-8">
        <div className={cn("grid gap-4", sales !== null && "lg:grid-cols-2")}>
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
        </div>
      </section>
    </main>
  );
}

/** Bloque de analítica de ventas (gated por `pos`). */
function SalesAnalytics({
  range,
  sales,
}: {
  range: ReturnType<typeof resolveMetricsRange>;
  sales: readonly [
    Awaited<ReturnType<typeof getSalesSummary>>,
    Awaited<ReturnType<typeof getRevenueTimeseries>>,
    Awaited<ReturnType<typeof getPaymentMethodDistribution>>,
    Awaited<ReturnType<typeof getTopItems>>,
    Awaited<ReturnType<typeof getNewVsReturningCustomers>>,
  ];
}): React.ReactElement {
  const [summary, timeseries, payments, topItems, customers] = sales;

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

      {/* Facturación en el tiempo */}
      <section className="mt-8">
        <Card className="animate-fade-up" style={{ animationDelay: "220ms" }}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <TrendingUp className="h-4.5 w-4.5 text-primary" aria-hidden="true" />
              Facturación en el tiempo
            </CardTitle>
            <CardDescription>{granularityLabel(range.granularity)}</CardDescription>
          </CardHeader>
          <CardContent>
            <RevenueAreaChart
              data={timeseries}
              granularity={range.granularity}
              currency={CURRENCY}
            />
          </CardContent>
        </Card>
      </section>

      {/* Cobros por método + composición de clientes */}
      <section className="mt-8 grid gap-4 lg:grid-cols-2">
        <Card className="animate-fade-up" style={{ animationDelay: "260ms" }}>
          <CardHeader>
            <CardTitle className="text-lg">Cobros por método</CardTitle>
            <CardDescription>Reparto del importe cobrado.</CardDescription>
          </CardHeader>
          <CardContent>
            <PaymentMethodChart data={payments} currency={CURRENCY} />
          </CardContent>
        </Card>

        <Card className="animate-fade-up" style={{ animationDelay: "300ms" }}>
          <CardHeader>
            <CardTitle className="text-lg">Clientes</CardTitle>
            <CardDescription>Nuevos, recurrentes y ventas anónimas.</CardDescription>
          </CardHeader>
          <CardContent>
            <CustomersSplitChart data={customers} />
          </CardContent>
        </Card>
      </section>

      {/* Top de artículos */}
      <section className="mt-8">
        <Card className="animate-fade-up" style={{ animationDelay: "340ms" }}>
          <CardHeader>
            <CardTitle className="text-lg">Top servicios y productos</CardTitle>
            <CardDescription>Artículos por ingresos en el periodo.</CardDescription>
          </CardHeader>
          <CardContent>
            <TopItemsList items={topItems} />
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

/** Ranking de artículos por ingresos, con barra proporcional. */
function TopItemsList({ items }: { items: readonly TopItemRow[] }): React.ReactElement {
  if (items.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        Sin ventas de artículos en este periodo.
      </p>
    );
  }
  const max = Math.max(...items.map((item) => item.revenue_cents), 1);

  return (
    <ol className="space-y-3.5">
      {items.map((item, index) => (
        <li key={`${item.item_kind}-${item.item_id ?? item.name}-${index}`}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="flex min-w-0 items-center gap-2">
              <span className="w-4 shrink-0 text-right text-xs font-medium tabular-nums text-muted-foreground">
                {index + 1}
              </span>
              <KindIcon kind={item.item_kind} />
              <span className="truncate font-medium text-foreground">{item.name}</span>
            </span>
            <span className="shrink-0 font-semibold tabular-nums text-foreground">
              {formatMoney(item.revenue_cents, CURRENCY)}
            </span>
          </div>
          <div className="ml-6 mt-1.5 h-1.5 overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full rounded-full bg-primary/70"
              style={{ width: `${(item.revenue_cents / max) * 100}%` }}
            />
          </div>
          <p className="ml-6 mt-1 text-xs text-muted-foreground">
            {item.quantity} uds · {item.lines_count} líneas
          </p>
        </li>
      ))}
    </ol>
  );
}

/** Aviso cuando el salón no tiene TPV: la analítica de ventas queda gated. */
function PosGateNotice(): React.ReactElement {
  return (
    <Card className="animate-fade-up border-dashed">
      <CardContent className="flex flex-col items-start gap-3 p-6 sm:flex-row sm:items-center">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-accent text-accent-foreground">
          <Lock className="h-5 w-5" aria-hidden="true" />
        </span>
        <div>
          <p className="font-medium text-foreground">
            La analítica de ventas necesita el TPV
          </p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Activa el módulo de TPV (caja) para ver facturación, cobros por método y
            clientes. La ocupación de agenda ya está disponible aquí debajo.
          </p>
        </div>
      </CardContent>
    </Card>
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

/** Descripción legible de la granularidad de la serie. */
function granularityLabel(granularity: string): string {
  switch (granularity) {
    case "day":
      return "Facturación por día.";
    case "week":
      return "Facturación por semana.";
    case "month":
      return "Facturación por mes.";
    case "year":
      return "Facturación por año.";
    default:
      return "Facturación por periodo.";
  }
}
