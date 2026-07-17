"use client";

import Link from "next/link";
import {
  ArrowLeft,
  Award,
  CalendarCheck,
  CalendarClock,
  Coins,
  Gift,
  Sparkles,
  Ticket,
  TicketPercent,
  Trophy,
} from "lucide-react";

import { CustomerQr } from "@/app/(dashboard)/customers/[id]/loyalty/customer-qr";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatDate } from "@/lib/format";
import { LOYALTY_MILESTONES } from "@/lib/loyalty/types";
import type { LoyaltyLookupResult } from "@/lib/loyalty/types";

interface CustomerLoyaltyViewProps {
  customerId: string;
  lookup: LoyaltyLookupResult;
}

/** Etiqueta humana de cada tipo de recompensa (derivada del catálogo de hitos). */
const REWARD_TYPE_LABELS: Record<string, string> = Object.fromEntries(
  LOYALTY_MILESTONES.map((milestone) => [milestone.rewardType, milestone.label]),
);

/** Días naturales (redondeando hacia arriba) hasta una fecha ISO. */
function daysUntil(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

/**
 * Progreso hacia el siguiente hito de visitas (3 / 5 / 8 / 10). Devuelve `null`
 * cuando ya se han superado todos los hitos.
 */
function milestoneProgress(visits: number): {
  next: (typeof LOYALTY_MILESTONES)[number];
  remaining: number;
  percent: number;
} | null {
  const next = LOYALTY_MILESTONES.find((milestone) => milestone.visits > visits);
  if (next === undefined) return null;
  const previous =
    [...LOYALTY_MILESTONES].reverse().find((m) => m.visits <= visits)?.visits ?? 0;
  const span = next.visits - previous;
  const percent = span === 0 ? 0 : Math.round(((visits - previous) / span) * 100);
  return { next, remaining: next.visits - visits, percent };
}

/** Chip de caducidad; resalta en ámbar cuando faltan 7 días o menos. */
function ExpiresChip({ iso }: { iso: string }): React.ReactElement {
  const days = daysUntil(iso);
  if (days <= 7) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-warning/15 px-2.5 py-0.5 text-xs font-medium text-foreground">
        <span className="h-1.5 w-1.5 rounded-full bg-warning" aria-hidden />
        {days <= 0
          ? "Caduca hoy"
          : `Caduca en ${days} ${days === 1 ? "día" : "días"}`}
      </span>
    );
  }
  return (
    <span className="text-xs text-muted-foreground">
      Caduca el {formatDate(iso)}
    </span>
  );
}

export function CustomerLoyaltyView({
  customerId,
  lookup,
}: CustomerLoyaltyViewProps): React.ReactElement {
  const { customer, points_balance, visits_total, last_visit_at } = lookup;
  const coupons = lookup.welcome_coupons;
  const rewards = lookup.rewards;
  const progress = milestoneProgress(visits_total);

  return (
    <main className="container py-10">
      <Link
        href={`/customers/${customerId}`}
        className="group mb-6 inline-flex items-center text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="mr-1 h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
        Volver a la ficha
      </Link>

      <header className="mb-8 flex items-center gap-4 animate-fade-up">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-inset ring-primary/15">
          <Gift className="h-7 w-7" />
        </span>
        <div className="space-y-1">
          <p className="text-sm font-medium text-muted-foreground">
            Programa de fidelización
          </p>
          <h1 className="text-3xl font-bold tracking-tight">
            {customer.full_name}
          </h1>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* Métricas principales */}
          <section
            className="grid grid-cols-1 gap-4 sm:grid-cols-3 animate-fade-up [animation-delay:60ms]"
            aria-label="Resumen de fidelización"
          >
            <div className="rounded-xl border border-primary/25 bg-primary/[0.06] p-5 shadow-sm transition-shadow hover:shadow-md">
              <span className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
                <Coins className="h-5 w-5" />
              </span>
              <p className="text-3xl font-bold tabular-nums text-primary">
                {points_balance}
              </p>
              <p className="text-xs text-muted-foreground">puntos acumulados</p>
            </div>
            <div className="rounded-xl border bg-card p-5 shadow-sm transition-shadow hover:shadow-md">
              <span className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                <CalendarCheck className="h-5 w-5" />
              </span>
              <p className="text-3xl font-bold tabular-nums">{visits_total}</p>
              <p className="text-xs text-muted-foreground">
                {visits_total === 1 ? "visita registrada" : "visitas registradas"}
              </p>
            </div>
            <div className="rounded-xl border bg-card p-5 shadow-sm transition-shadow hover:shadow-md">
              <span className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                <CalendarClock className="h-5 w-5" />
              </span>
              <p className="text-2xl font-bold tabular-nums">
                {last_visit_at !== null ? formatDate(last_visit_at) : "—"}
              </p>
              <p className="text-xs text-muted-foreground">última visita</p>
            </div>
          </section>

          {/* Progreso de hitos */}
          <Card className="animate-fade-up [animation-delay:120ms]">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Trophy className="h-5 w-5 text-primary" />
                Progreso de hitos
              </CardTitle>
              <CardDescription>
                Los hitos de 3, 5, 8 y 10 visitas generan una recompensa.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {progress !== null ? (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-sm font-medium">
                      Próximo hito:{" "}
                      <span className="text-primary">{progress.next.label}</span>
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {progress.remaining === 1
                        ? "Falta 1 visita"
                        : `Faltan ${progress.remaining} visitas`}
                    </p>
                  </div>
                  <div
                    className="h-2.5 w-full overflow-hidden rounded-full bg-secondary"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={progress.next.visits}
                    aria-valuenow={visits_total}
                    aria-label={`Progreso hacia ${progress.next.label}`}
                  >
                    <div
                      className="h-full rounded-full bg-primary transition-[width] duration-500 ease-apple-out"
                      style={{ width: `${Math.max(progress.percent, 4)}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {visits_total} de {progress.next.visits} visitas
                  </p>
                </div>
              ) : (
                <div className="flex items-center gap-3 rounded-lg bg-success/10 p-4">
                  <Sparkles className="h-5 w-5 shrink-0 text-success" />
                  <p className="text-sm font-medium">
                    ¡Todos los hitos alcanzados! Este cliente ha completado la
                    escalera de fidelización.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Cupones de bienvenida (ACTIVE) */}
          <Card className="animate-fade-up [animation-delay:180ms]">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2 text-lg">
                <TicketPercent className="h-5 w-5 text-primary" />
                Cupones activos
                {coupons.length > 0 ? (
                  <Badge variant="secondary" className="ml-1 tabular-nums">
                    {coupons.length}
                  </Badge>
                ) : null}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {coupons.length === 0 ? (
                <EmptyState
                  icon={<Ticket className="h-5 w-5" />}
                  title="Sin cupones activos"
                  hint="El cupón de bienvenida aparecerá aquí mientras esté vigente."
                />
              ) : (
                <ul className="space-y-3">
                  {coupons.map((coupon) => (
                    <li
                      key={coupon.id}
                      className="flex items-center gap-4 rounded-lg border border-border/70 p-3.5 transition-colors hover:bg-accent/40"
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                        <TicketPercent className="h-5 w-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold tabular-nums">
                          {coupon.percent_off}% de descuento
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Cupón de bienvenida
                        </p>
                      </div>
                      <ExpiresChip iso={coupon.expires_at} />
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Recompensas disponibles (AVAILABLE) */}
          <Card className="animate-fade-up [animation-delay:240ms]">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Award className="h-5 w-5 text-primary" />
                Recompensas disponibles
                {rewards.length > 0 ? (
                  <Badge variant="secondary" className="ml-1 tabular-nums">
                    {rewards.length}
                  </Badge>
                ) : null}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {rewards.length === 0 ? (
                <EmptyState
                  icon={<Gift className="h-5 w-5" />}
                  title="Sin recompensas disponibles"
                  hint="Se generan al alcanzar 3, 5, 8 y 10 visitas."
                />
              ) : (
                <ul className="space-y-3">
                  {rewards.map((reward) => (
                    <li
                      key={reward.id}
                      className="flex items-center gap-4 rounded-lg border border-border/70 p-3.5 transition-colors hover:bg-accent/40"
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                        <Award className="h-5 w-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold">
                          {REWARD_TYPE_LABELS[reward.type] ?? reward.type}
                        </p>
                        <p className="truncate font-mono text-xs text-muted-foreground">
                          {reward.code}
                        </p>
                      </div>
                      <ExpiresChip iso={reward.expires_at} />
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Carné / QR */}
        <div className="lg:col-span-1 animate-fade-up [animation-delay:120ms]">
          <CustomerQr name={customer.full_name} qrToken={customer.qr_token} />
        </div>
      </div>
    </main>
  );
}

/** Estado vacío compacto reutilizado por cupones y recompensas. */
function EmptyState({
  icon,
  title,
  hint,
}: {
  icon: React.ReactNode;
  title: string;
  hint: string;
}): React.ReactElement {
  return (
    <div className="flex flex-col items-center py-8 text-center">
      <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-accent text-accent-foreground ring-1 ring-inset ring-primary/10">
        {icon}
      </span>
      <p className="font-medium">{title}</p>
      <p className="mt-1 max-w-xs text-sm text-muted-foreground">{hint}</p>
    </div>
  );
}
