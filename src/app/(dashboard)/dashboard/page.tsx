import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  CalendarClock,
  CalendarDays,
  Euro,
  Gauge,
  Scissors,
  Sparkles,
  UserPlus,
  Users,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Panel",
};

/**
 * Métricas destacadas del salón. Las cifras se conectarán a datos reales en una
 * tarea posterior; de momento el componente presenta un empty state cuidado
 * (esta tarea es de lenguaje visual, no toca queries ni Server Actions).
 */
const METRICS: ReadonlyArray<{
  label: string;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { label: "Citas de hoy", hint: "Reservas confirmadas", icon: CalendarDays },
  { label: "Ingresos de hoy", hint: "Cobros del día", icon: Euro },
  { label: "Clientes nuevos", hint: "Altas esta semana", icon: UserPlus },
  { label: "Ocupación", hint: "Agenda completada", icon: Gauge },
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

export default async function DashboardPage(): Promise<React.ReactElement> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Defensa en profundidad: el middleware ya redirige, pero verificamos aquí.
  if (user === null) {
    redirect("/login");
  }

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
            Se activa con la actividad registrada
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {METRICS.map((metric, index) => (
            <MetricCard
              key={metric.label}
              label={metric.label}
              hint={metric.hint}
              icon={metric.icon}
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
 * Tarjeta de métrica con empty state elegante: icono en cuadro con tinte de
 * marca, valor grande en placeholder y una etiqueta aclaratoria. Diseñada para
 * recibir un valor real sin cambiar el layout.
 */
function MetricCard({
  label,
  hint,
  icon: Icon,
  delayMs,
}: {
  label: string;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
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
          <p className="truncate text-sm font-medium text-muted-foreground">
            {label}
          </p>
          <p className="mt-0.5 text-3xl font-semibold leading-tight tracking-tight text-foreground/40">
            —
          </p>
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
