import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  CalendarClock,
  CalendarDays,
  Euro,
  Gauge,
  Receipt,
  Scissors,
  Sparkles,
  UserPlus,
  Users,
} from "lucide-react";

import {
  buildDashboardMetrics,
  type DashboardMetric,
} from "@/app/(dashboard)/dashboard/metric-cards";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { localDateInZone } from "@/lib/booking/timezone";
import {
  getAgendaOccupancy,
  getNewVsReturningCustomers,
  getSalesSummary,
} from "@/lib/metrics";
import { getActiveSalon, type ActiveSalon } from "@/lib/salon";
import { salonHasFeature } from "@/lib/salon-features";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Panel",
};

/** Cliente Supabase de servidor (con la sesión del usuario). */
type ServerSupabase = ReturnType<typeof createClient>;

/**
 * KPIs a mostrar cuando el usuario aún no tiene salón asociado: mismas etiquetas
 * que el caso con `pos`, con valor "—" y en tono apagado (empty state cuidado, sin
 * consultar la base porque no hay salón sobre el que agregar).
 */
const PLACEHOLDER_METRICS: readonly DashboardMetric[] = [
  { key: "revenue", label: "Ingresos de hoy", value: "—", hint: "Cobros del día", icon: Euro },
  { key: "tickets", label: "Tickets de hoy", value: "—", hint: "Ventas cerradas hoy", icon: Receipt },
  { key: "new-customers", label: "Clientes nuevos", value: "—", hint: "Altas este mes", icon: UserPlus },
  { key: "occupancy", label: "Ocupación", value: "—", hint: "Agenda reservada hoy", icon: Gauge },
];

/** Accesos rápidos a las áreas principales del panel. */
const SHORTCUTS: ReadonlyArray<{
  href: string;
  title: string;
  description: string;
  cta: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  {
    href: "/day-panel",
    title: "Panel del día",
    description: "Vista en tiempo real por profesional.",
    cta: "Abrir panel del día",
    icon: CalendarClock,
  },
  {
    href: "/appointments",
    title: "Citas",
    description: "Agenda del día y gestión de reservas.",
    cta: "Ver agenda",
    icon: CalendarDays,
  },
  {
    href: "/customers",
    title: "Clientes",
    description: "Fichas, historial y base de clientes.",
    cta: "Ver clientes",
    icon: Users,
  },
  {
    href: "/ajustes/servicios",
    title: "Servicios",
    description: "Catálogo, precios y duración.",
    cta: "Gestionar catálogo",
    icon: Scissors,
  },
];

/**
 * Resuelve los KPIs del resumen para el salón activo, agregados EN SERVIDOR
 * (RPC de `@/lib/metrics`; nunca se traen las ventas al cliente para sumarlas).
 *
 *   · Ingresos y nº de tickets → ventas de HOY (`salon_sales_summary`), y SOLO se
 *     consultan si el salón tiene `pos`: sin TPV no hay KPIs de ingresos.
 *   · Clientes nuevos → altas del MES en curso (`salon_new_vs_returning_customers`).
 *   · Ocupación / citas de hoy → agenda de HOY (`salon_agenda_occupancy`).
 *
 * "Hoy" y el inicio de mes se calculan en la zona horaria del salón para que el
 * corte de día coincida con el que usan las propias RPC (`salons.timezone`).
 */
async function loadDashboardMetrics(
  supabase: ServerSupabase,
  salon: ActiveSalon,
): Promise<DashboardMetric[]> {
  const today = localDateInZone(salon.timezone); // YYYY-MM-DD en la zona del salón
  const monthStart = `${today.slice(0, 7)}-01`; // primer día del mes en curso
  const todayPeriod = { from: today, to: today };
  const monthPeriod = { from: monthStart, to: today };

  const hasPos = await salonHasFeature(supabase, salon.id, "pos");

  const [sales, newVsReturning, occupancy] = await Promise.all([
    hasPos
      ? getSalesSummary(supabase, salon.id, todayPeriod)
      : Promise.resolve(null),
    getNewVsReturningCustomers(supabase, salon.id, monthPeriod),
    getAgendaOccupancy(supabase, salon.id, todayPeriod),
  ]);

  return buildDashboardMetrics({
    hasPos,
    sales,
    newCustomers: newVsReturning.new_customers,
    occupancy,
  });
}

export default async function DashboardPage(): Promise<React.ReactElement> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Defensa en profundidad: el middleware ya redirige, pero verificamos aquí.
  if (user === null) {
    redirect("/login");
  }

  const salon = await getActiveSalon();
  const metrics = salon ? await loadDashboardMetrics(supabase, salon) : null;

  // Sin salón: empty state apagado (no hay datos que agregar). Con salón: KPIs reales.
  const cards = metrics ?? PLACEHOLDER_METRICS;
  const isEmpty = metrics === null;
  const metricsGridCols = cards.length >= 4 ? "xl:grid-cols-4" : "xl:grid-cols-3";

  return (
    <main className="container py-10">
      {/* Encabezado */}
      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="animate-fade-up">
          <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-accent/60 px-3 py-1 text-xs font-medium text-accent-foreground">
            <Sparkles className="h-3.5 w-3.5" />
            Tu salón, de un vistazo
          </div>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Panel</h1>
          <p className="mt-1 text-muted-foreground">
            Sesión iniciada como{" "}
            <span className="font-medium text-foreground">{user.email}</span>
          </p>
        </div>
        <form action="/auth/signout" method="post">
          <Button variant="outline" type="submit">
            Cerrar sesión
          </Button>
        </form>
      </header>

      {/* Métricas */}
      <section
        aria-labelledby="metrics-heading"
        className="mb-10 animate-fade-up"
        style={{ animationDelay: "60ms" }}
      >
        <div className="mb-3 flex items-baseline justify-between">
          <h2
            id="metrics-heading"
            className="text-sm font-semibold uppercase tracking-wide text-muted-foreground"
          >
            Resumen
          </h2>
          <p className="text-xs text-muted-foreground">
            {isEmpty ? "Se activa con la actividad registrada" : "Actividad de hoy"}
          </p>
        </div>
        <div className={cn("grid gap-4 sm:grid-cols-2", metricsGridCols)}>
          {cards.map((metric, index) => (
            <MetricCard
              key={metric.key}
              label={metric.label}
              value={metric.value}
              hint={metric.hint}
              icon={metric.icon}
              progress={metric.progress}
              muted={isEmpty}
              delayMs={80 + index * 50}
            />
          ))}
        </div>
      </section>

      {/* Accesos rápidos */}
      <section aria-labelledby="shortcuts-heading">
        <h2
          id="shortcuts-heading"
          className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground"
        >
          Accesos rápidos
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {SHORTCUTS.map((item, index) => (
            <ShortcutTile key={item.href} {...item} delayMs={220 + index * 50} />
          ))}
        </div>
      </section>
    </main>
  );
}

/**
 * Tarjeta de métrica: icono en cuadro con tinte de marca, valor grande y una
 * etiqueta aclaratoria. `muted` la deja en empty state (valor "—" apagado) cuando
 * no hay salón; `progress` (0..1) pinta un carril de ocupación bajo el valor.
 */
function MetricCard({
  label,
  value,
  hint,
  icon: Icon,
  progress,
  muted = false,
  delayMs,
}: {
  label: string;
  value: string;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
  progress?: number;
  muted?: boolean;
  delayMs: number;
}): React.ReactElement {
  const showMeter = !muted && typeof progress === "number";

  return (
    <Card
      className="animate-fade-up transition-shadow duration-200 hover:shadow-md"
      style={{ animationDelay: `${delayMs}ms` }}
    >
      <CardContent className="flex items-start gap-4 p-5">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-accent text-accent-foreground">
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-muted-foreground">
            {label}
          </p>
          <p
            className={cn(
              "mt-0.5 text-3xl font-semibold leading-tight tracking-tight tabular-nums",
              muted ? "text-foreground/40" : "text-foreground",
            )}
          >
            {value}
          </p>
          {showMeter ? (
            <div
              aria-hidden
              className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-accent"
            >
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-500 ease-apple-out"
                style={{ width: `${Math.round(progress! * 100)}%` }}
              />
            </div>
          ) : null}
          <p className="mt-1 text-xs text-muted-foreground/80">{hint}</p>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Tile de acceso rápido: la tarjeta entera es enlace, con elevación e icono
 * animado en hover. Coherente con las micro-interacciones del sistema (150-250ms
 * y easing Apple).
 */
function ShortcutTile({
  href,
  title,
  description,
  cta,
  icon: Icon,
  delayMs,
}: {
  href: string;
  title: string;
  description: string;
  cta: string;
  icon: React.ComponentType<{ className?: string }>;
  delayMs: number;
}): React.ReactElement {
  return (
    <Link
      href={href}
      className="group animate-fade-up rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      style={{ animationDelay: `${delayMs}ms` }}
    >
      <Card
        className={cn(
          "h-full border-border/70 transition-all duration-200 ease-apple-out",
          "group-hover:-translate-y-0.5 group-hover:border-primary/30 group-hover:shadow-md",
        )}
      >
        <CardHeader className="pb-3">
          <span className="mb-1 grid h-10 w-10 place-items-center rounded-lg bg-secondary text-secondary-foreground transition-colors duration-200 group-hover:bg-accent group-hover:text-accent-foreground">
            <Icon className="h-5 w-5" />
          </span>
          <CardTitle className="text-lg">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          <span className="inline-flex items-center text-sm font-medium text-primary">
            {cta}
            <ArrowRight className="ml-1 h-4 w-4 transition-transform duration-200 ease-apple-out group-hover:translate-x-0.5" />
          </span>
        </CardContent>
      </Card>
    </Link>
  );
}
