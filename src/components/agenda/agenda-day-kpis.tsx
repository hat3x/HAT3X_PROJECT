import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { formatPrice } from "@/lib/booking/format";
import type { AppointmentWithDetails } from "@/lib/queries/appointments";

/*
 * Salon OS — tira de KPIs del día (vista Día de la agenda).
 * ------------------------------------------------------------------
 * Puramente derivada de `appointments`: sin fetch, sin estado, sin hooks.
 * Porta `.kpis`/`.kpi` del mockup aprobado
 * (docs/superpowers/reference/2026-08-12-agenda-mockup.html) sobre los
 * primitivos de Kairos (Card + tokens semánticos de estado).
 */

interface AgendaDayKpisProps {
  appointments: AppointmentWithDetails[];
}

interface DayTotals {
  total: number;
  confirmed: number;
  pending: number;
  completed: number;
  /** Suma de `price_cents` de las citas no canceladas. */
  revenueCents: number;
}

/** Cuenta por estado + facturación prevista (todo lo no cancelado), en una sola pasada. */
function summarizeDay(appointments: readonly AppointmentWithDetails[]): DayTotals {
  return appointments.reduce<DayTotals>(
    (totals, appt) => {
      totals.total += 1;
      if (appt.status === "confirmed") totals.confirmed += 1;
      else if (appt.status === "pending") totals.pending += 1;
      else if (appt.status === "completed") totals.completed += 1;
      if (appt.status !== "cancelled") totals.revenueCents += appt.price_cents;
      return totals;
    },
    { total: 0, confirmed: 0, pending: 0, completed: 0, revenueCents: 0 },
  );
}

interface KpiCard {
  readonly label: string;
  readonly value: string;
  /** Sobreescribe color/tamaño del valor con tokens semánticos (nunca hex crudo). */
  readonly valueClassName?: string;
}

/**
 * Tira de 5 tarjetas con el resumen del día: total de citas, confirmadas,
 * pendientes, completadas y facturación prevista (precio de las no canceladas).
 */
export function AgendaDayKpis({ appointments }: AgendaDayKpisProps): React.ReactElement {
  const totals = summarizeDay(appointments);
  const currency = appointments[0]?.currency ?? "EUR";

  const cards: readonly KpiCard[] = [
    { label: "Citas", value: String(totals.total) },
    { label: "Confirmadas", value: String(totals.confirmed), valueClassName: "text-primary" },
    { label: "Pendientes", value: String(totals.pending), valueClassName: "text-warning" },
    { label: "Completadas", value: String(totals.completed), valueClassName: "text-success" },
    {
      label: "Facturación prevista",
      value: formatPrice(totals.revenueCents, currency),
      valueClassName: "text-base",
    },
  ];

  return (
    <div role="group" aria-label="Resumen del día" className="flex flex-wrap gap-2.5">
      {cards.map((card) => (
        <Card
          key={card.label}
          role="group"
          aria-label={`${card.label}: ${card.value}`}
          className="flex min-w-[9.5rem] flex-1 basis-[9.5rem] flex-col gap-0.5 px-3.5 py-2.5"
        >
          <p
            aria-hidden="true"
            className={cn(
              "text-xl font-bold leading-none tracking-tight tabular-nums",
              card.valueClassName,
            )}
          >
            {card.value}
          </p>
          <p aria-hidden="true" className="text-xs font-medium text-muted-foreground">
            {card.label}
          </p>
        </Card>
      ))}
    </div>
  );
}
