"use client";

import { useState } from "react";
import {
  Award,
  CalendarClock,
  Coins,
  Loader2,
  ScanLine,
  Sparkles,
  TicketPercent,
  UserRound,
  X,
} from "lucide-react";

import type { LoyaltyLookupActionResult } from "@/app/(dashboard)/tpv/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/format";
import { LOYALTY_MILESTONES, type LoyaltyLookupResult } from "@/lib/loyalty/types";
import { cn } from "@/lib/utils";

/**
 * Etiqueta humana de cada tipo de recompensa, derivada del catálogo de hitos.
 * Copia local (compacta) de la que usa la ficha de fidelización del cliente: en
 * esta fase de migración cada subtarea mantiene su presentación aislada para no
 * acoplarse entre sí; si se estabiliza, se extrae a `@/lib/loyalty`.
 */
const REWARD_TYPE_LABELS: Record<string, string> = Object.fromEntries(
  LOYALTY_MILESTONES.map((milestone) => [milestone.rewardType, milestone.label]),
);

/** Días naturales (hacia arriba) hasta una fecha ISO. */
function daysUntil(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

interface LoyaltyPanelProps {
  /** La consulta del QR está en curso. */
  pending: boolean;
  /** Último desenlace del lookup, o `undefined` si aún no se ha escaneado nada. */
  result: LoyaltyLookupActionResult | undefined;
  /** Dispara la consulta con el token escaneado/tecleado. */
  onScan: (qrToken: string) => void;
  /** Descarta el cliente escaneado y vuelve al estado de reposo. */
  onClear: () => void;
}

/**
 * Tarjeta de fidelización del TPV. Es puramente presentacional: recibe el estado
 * del lookup (dueño: `TpvView` vía `useLoyaltyLookup`) y ofrece un campo para
 * escanear el carné. Un lector físico QR actúa como teclado (teclea el token y
 * pulsa Enter), así que un `<form>` con un `<input>` cubre tanto el escaneo como
 * la entrada manual.
 *
 * Aditiva por diseño: mientras no haya cliente escaneado, no altera en absoluto
 * el flujo de cobro —solo muestra el campo de escaneo—.
 */
export function LoyaltyPanel({
  pending,
  result,
  onScan,
  onClear,
}: LoyaltyPanelProps): React.ReactElement {
  const [token, setToken] = useState("");

  const scanned = result?.ok === true ? result.data : null;
  const error = result !== undefined && !result.ok ? result : null;
  const canSubmit = token.trim() !== "" && !pending;

  function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const trimmed = token.trim();
    if (trimmed === "" || pending) return;
    onScan(trimmed);
    setToken(""); // Deja el campo listo para el siguiente escaneo.
  }

  function handleClear(): void {
    setToken("");
    onClear();
  }

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4 sm:p-5">
        <form onSubmit={handleSubmit} className="space-y-2.5">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <ScanLine className="h-4 w-4 text-primary" />
            Fidelización del cliente
          </div>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <ScanLine className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={token}
                onChange={(event) => setToken(event.target.value)}
                placeholder="Escanea o teclea el carné…"
                className="h-11 rounded-xl pl-10 text-base"
                aria-label="Token del carné de fidelización"
                autoComplete="off"
                enterKeyHint="search"
                spellCheck={false}
              />
            </div>
            <Button
              type="submit"
              size="lg"
              className="h-11 shrink-0 rounded-xl px-4"
              disabled={!canSubmit}
            >
              {pending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ScanLine className="h-4 w-4" />
              )}
              <span className="ml-2">Buscar</span>
            </Button>
          </div>
        </form>

        {/* Región de resultado: se anuncia a lectores de pantalla al escanear. */}
        <div aria-live="polite" aria-busy={pending}>
          {pending ? (
            <ScanningHint />
          ) : scanned !== null ? (
            <ScannedCustomer data={scanned} onClear={handleClear} />
          ) : error !== null ? (
            <ScanError code={error.code} message={error.error} />
          ) : (
            <IdleHint />
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Estados del panel ─────────────────────────────────────────────────────────

function IdleHint(): React.ReactElement {
  return (
    <p className="mt-3 text-xs text-muted-foreground">
      Escanea el carné para ver puntos, cupones y recompensas del cliente.
    </p>
  );
}

function ScanningHint(): React.ReactElement {
  return (
    <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
      <Loader2 className="h-3.5 w-3.5 animate-spin" />
      Consultando fidelización…
    </p>
  );
}

function ScanError({
  code,
  message,
}: {
  code: string;
  message: string;
}): React.ReactElement {
  // `not_found` es un desenlace normal del escaneo (QR ajeno/inexistente): aviso
  // suave. El resto (sesión/permiso/interno) es un fallo real: tono destructivo.
  const notFound = code === "not_found";
  return (
    <div
      role="status"
      className={cn(
        "mt-3 flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-sm",
        notFound
          ? "border-warning/30 bg-warning/10 text-foreground"
          : "border-destructive/30 bg-destructive/10 text-foreground",
      )}
    >
      <span
        className={cn(
          "mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full",
          notFound ? "bg-warning" : "bg-destructive",
        )}
        aria-hidden
      />
      <span>{message}</span>
    </div>
  );
}

/** Resumen del cliente escaneado: identidad, métricas, cupones y recompensas. */
function ScannedCustomer({
  data,
  onClear,
}: {
  data: LoyaltyLookupResult;
  onClear: () => void;
}): React.ReactElement {
  const { customer, points_balance, visits_total, last_visit_at } = data;
  const coupons = data.welcome_coupons;
  const rewards = data.rewards;
  const nothingActive = coupons.length === 0 && rewards.length === 0;

  return (
    <div className="mt-4 space-y-4 animate-fade-up">
      {/* Identidad + descartar */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-inset ring-primary/15">
            <UserRound className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-[0.7rem] font-medium uppercase tracking-wide text-muted-foreground">
              Cliente escaneado
            </p>
            <p className="truncate text-base font-semibold leading-tight text-foreground">
              {customer.full_name}
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
          aria-label="Quitar cliente escaneado"
          onClick={onClear}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Métricas principales */}
      <div className="grid grid-cols-2 gap-2.5">
        <Stat
          icon={<Coins className="h-4 w-4" />}
          value={points_balance}
          label={points_balance === 1 ? "punto" : "puntos"}
          highlight
        />
        <Stat
          icon={<Sparkles className="h-4 w-4" />}
          value={visits_total}
          label={visits_total === 1 ? "visita" : "visitas"}
        />
      </div>
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <CalendarClock className="h-3.5 w-3.5" />
        {last_visit_at !== null
          ? `Última visita el ${formatDate(last_visit_at)}`
          : "Aún sin visitas registradas"}
      </p>

      {/* Cupones de bienvenida ACTIVE */}
      {coupons.length > 0 ? (
        <RewardSection
          icon={<TicketPercent className="h-4 w-4 text-primary" />}
          title="Cupones activos"
          count={coupons.length}
        >
          {coupons.map((coupon) => (
            <RewardRow
              key={coupon.id}
              icon={<TicketPercent className="h-4 w-4" />}
              title={`${coupon.percent_off}% de descuento`}
              subtitle="Cupón de bienvenida"
              expiresAt={coupon.expires_at}
            />
          ))}
        </RewardSection>
      ) : null}

      {/* Recompensas de hito AVAILABLE */}
      {rewards.length > 0 ? (
        <RewardSection
          icon={<Award className="h-4 w-4 text-primary" />}
          title="Recompensas"
          count={rewards.length}
        >
          {rewards.map((reward) => (
            <RewardRow
              key={reward.id}
              icon={<Award className="h-4 w-4" />}
              title={REWARD_TYPE_LABELS[reward.type] ?? reward.type}
              subtitle={reward.code}
              subtitleMono
              expiresAt={reward.expires_at}
            />
          ))}
        </RewardSection>
      ) : null}

      {nothingActive ? (
        <p className="rounded-lg border border-dashed border-border bg-card/40 px-3 py-2.5 text-center text-xs text-muted-foreground">
          Sin cupones ni recompensas activas.
        </p>
      ) : null}
    </div>
  );
}

/** Métrica compacta (puntos / visitas). */
function Stat({
  icon,
  value,
  label,
  highlight = false,
}: {
  icon: React.ReactNode;
  value: number;
  label: string;
  highlight?: boolean;
}): React.ReactElement {
  return (
    <div
      className={cn(
        "rounded-xl border p-3 shadow-xs",
        highlight ? "border-primary/25 bg-primary/[0.06]" : "border-border/70 bg-card",
      )}
    >
      <span
        className={cn(
          "mb-2 flex h-8 w-8 items-center justify-center rounded-lg",
          highlight ? "bg-primary/15 text-primary" : "bg-accent text-accent-foreground",
        )}
      >
        {icon}
      </span>
      <p
        className={cn(
          "text-2xl font-bold tabular-nums leading-none",
          highlight && "text-primary",
        )}
      >
        {value}
      </p>
      <p className="mt-1 text-[0.7rem] text-muted-foreground">{label}</p>
    </div>
  );
}

/** Bloque titulado (cupones o recompensas) con contador. */
function RewardSection({
  icon,
  title,
  count,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  count: number;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <section className="space-y-2">
      <h4 className="flex items-center gap-1.5 text-sm font-semibold">
        {icon}
        {title}
        <Badge variant="secondary" className="ml-0.5 tabular-nums">
          {count}
        </Badge>
      </h4>
      <ul className="space-y-2">{children}</ul>
    </section>
  );
}

/** Fila de un cupón o recompensa, con caducidad. */
function RewardRow({
  icon,
  title,
  subtitle,
  subtitleMono = false,
  expiresAt,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  subtitleMono?: boolean;
  expiresAt: string;
}): React.ReactElement {
  return (
    <li className="flex items-center gap-3 rounded-lg border border-border/70 p-2.5">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold tabular-nums leading-tight">
          {title}
        </p>
        <p
          className={cn(
            "truncate text-xs text-muted-foreground",
            subtitleMono && "font-mono",
          )}
        >
          {subtitle}
        </p>
      </div>
      <ExpiresHint iso={expiresAt} />
    </li>
  );
}

/** Chip de caducidad; resalta en ámbar cuando faltan 7 días o menos. */
function ExpiresHint({ iso }: { iso: string }): React.ReactElement {
  const days = daysUntil(iso);
  if (days <= 7) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 text-[0.7rem] font-medium text-foreground">
        <span className="h-1.5 w-1.5 rounded-full bg-warning" aria-hidden />
        {days <= 0 ? "Hoy" : `${days} ${days === 1 ? "día" : "días"}`}
      </span>
    );
  }
  return (
    <span className="shrink-0 text-[0.7rem] text-muted-foreground">
      {formatDate(iso)}
    </span>
  );
}
