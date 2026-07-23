"use client";

import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { useEffect, useState } from "react";
import { LineChart as LineChartIcon } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Skeleton } from "@/components/ui/skeleton";
import { formatMoney } from "@/lib/format";
import type {
  NewVsReturningCustomers,
  PaymentMethodDistributionRow,
  RevenueGranularity,
  RevenueTimeseriesPoint,
} from "@/lib/metrics/types";
import type { PosPaymentMethod } from "@/types/database";

/*
 * Gráficas de `/analitica` (recharts, empaquetado con la app — sin CDN).
 * ---------------------------------------------------------------------
 * Componentes CLIENTE puros: reciben filas YA AGREGADAS en servidor (una por
 * bucket / método / grupo) y solo las pintan. El rango temporal lo gobierna la
 * página (Server Component) vía el `RangeSelector`; aquí no hay lógica de fechas
 * ni fetching.
 *
 * Tematizado: los ejes y la rejilla usan variables CSS (`hsl(var(--border))`,
 * `--muted-foreground`) y el área de facturación usa `--primary`, de modo que
 * las gráficas siguen el tema claro/oscuro y la marca del salón (white-label).
 * Las paletas categóricas (métodos de pago, tipos de cliente) sí son fijas para
 * que las porciones sean distinguibles.
 *
 * Importes SIEMPRE en céntimos: se formatean con `formatMoney` / el formateador
 * compacto; nunca se dividen a mano.
 */

// ── Tokens de color ───────────────────────────────────────────────────────────
const BRAND = "hsl(var(--primary))";
const AXIS = "hsl(var(--muted-foreground))";
const GRID = "hsl(var(--border))";

const AXIS_TICK = { fontSize: 12, fill: AXIS } as const;

// ── Utilidades de formato ─────────────────────────────────────────────────────

/** Importe compacto para ticks del eje Y (p. ej. «1,2 mil €»). */
function compactMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency,
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(cents / 100);
}

/** Etiqueta corta de bucket para el eje X, según granularidad. */
function formatBucketShort(iso: string, g: RevenueGranularity): string {
  const d = parseISO(iso);
  if (g === "year") return format(d, "yyyy");
  if (g === "month") return format(d, "LLL", { locale: es });
  return format(d, "d MMM", { locale: es });
}

/** Etiqueta larga de bucket para el tooltip. */
function formatBucketLong(iso: string, g: RevenueGranularity): string {
  const d = parseISO(iso);
  if (g === "year") return format(d, "yyyy");
  if (g === "month") return format(d, "LLLL yyyy", { locale: es });
  return format(d, "d MMM yyyy", { locale: es });
}

// ── Hooks de presentación ─────────────────────────────────────────────────────

/**
 * `true` tras el primer montaje en cliente. recharts mide su contenedor en el
 * navegador; hasta entonces mostramos un esqueleto del mismo alto para evitar un
 * desajuste de hidratación y un salto de layout.
 */
function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}

/** Respeta «prefiero menos movimiento» (WCAG 2.3.3): desactiva la animación. */
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = (): void => setReduced(mq.matches);
    sync();
    mq.addEventListener?.("change", sync);
    return () => mq.removeEventListener?.("change", sync);
  }, []);
  return reduced;
}

// ── Envoltorio común de gráfica (esqueleto + vacío + contenedor responsive) ────

interface ChartShellProps {
  height: number;
  isEmpty: boolean;
  emptyMessage: string;
  /** Contenido superpuesto y centrado (p. ej. el total del donut). */
  overlay?: React.ReactNode;
  /** Único hijo: el gráfico recharts. */
  children: React.ReactElement;
}

function ChartShell({
  height,
  isEmpty,
  emptyMessage,
  overlay,
  children,
}: ChartShellProps): React.ReactElement {
  const mounted = useMounted();

  if (!mounted) {
    return <Skeleton className="w-full rounded-lg" style={{ height }} />;
  }
  if (isEmpty) {
    return (
      <div
        style={{ height }}
        className="flex w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border/70 bg-muted/30 text-center"
      >
        <LineChartIcon className="h-6 w-6 text-muted-foreground/50" aria-hidden="true" />
        <p className="px-4 text-sm text-muted-foreground">{emptyMessage}</p>
      </div>
    );
  }
  return (
    <div className="relative w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height={height}>
        {children}
      </ResponsiveContainer>
      {overlay}
    </div>
  );
}

// ── Gráfica 1: facturación en el tiempo (área) ────────────────────────────────

interface RevenueRow {
  x: string;
  revenueCents: number;
  salesCount: number;
}

interface RevenueTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: RevenueRow }>;
  currency: string;
  granularity: RevenueGranularity;
}

function RevenueTooltip({
  active,
  payload,
  currency,
  granularity,
}: RevenueTooltipProps): React.ReactElement | null {
  const entry = payload?.[0];
  if (!active || !entry) return null;
  const row = entry.payload;
  return (
    <div className="rounded-lg border border-border/70 bg-popover px-3 py-2 text-sm shadow-md">
      <p className="mb-1 font-medium text-popover-foreground">
        {formatBucketLong(row.x, granularity)}
      </p>
      <p className="text-muted-foreground">
        Facturación:{" "}
        <span className="font-semibold text-foreground">
          {formatMoney(row.revenueCents, currency)}
        </span>
      </p>
      <p className="text-muted-foreground">
        Tickets:{" "}
        <span className="font-semibold text-foreground">{row.salesCount}</span>
      </p>
    </div>
  );
}

interface RevenueAreaChartProps {
  data: readonly RevenueTimeseriesPoint[];
  granularity: RevenueGranularity;
  currency?: string;
  height?: number;
}

/** Área de facturación por bucket temporal. El eje X se adapta a la granularidad. */
export function RevenueAreaChart({
  data,
  granularity,
  currency = "EUR",
  height = 300,
}: RevenueAreaChartProps): React.ReactElement {
  const reduced = usePrefersReducedMotion();
  const rows: RevenueRow[] = data.map((point) => ({
    x: point.bucket_start,
    revenueCents: point.revenue_cents,
    salesCount: point.sales_count,
  }));
  const isEmpty = rows.every((row) => row.revenueCents === 0);

  return (
    <ChartShell
      height={height}
      isEmpty={rows.length === 0 || isEmpty}
      emptyMessage="Sin facturación registrada en este periodo."
    >
      <AreaChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="analitica-revenue-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={BRAND} stopOpacity={0.28} />
            <stop offset="100%" stopColor={BRAND} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke={GRID} strokeOpacity={0.6} />
        <XAxis
          dataKey="x"
          tickFormatter={(value: string) => formatBucketShort(value, granularity)}
          tickLine={false}
          axisLine={false}
          minTickGap={28}
          interval="preserveStartEnd"
          tick={AXIS_TICK}
          padding={{ left: 8, right: 8 }}
        />
        <YAxis
          width={64}
          tickFormatter={(value: number) => compactMoney(value, currency)}
          tickLine={false}
          axisLine={false}
          tick={AXIS_TICK}
        />
        <Tooltip
          content={<RevenueTooltip currency={currency} granularity={granularity} />}
          cursor={{ stroke: BRAND, strokeOpacity: 0.25, strokeWidth: 1 }}
        />
        <Area
          type="monotone"
          dataKey="revenueCents"
          stroke={BRAND}
          strokeWidth={2}
          fill="url(#analitica-revenue-fill)"
          activeDot={{ r: 4, strokeWidth: 0 }}
          isAnimationActive={!reduced}
          animationDuration={450}
        />
      </AreaChart>
    </ChartShell>
  );
}

// ── Donut genérico (métodos de pago / tipos de cliente) ───────────────────────

interface DonutSlice {
  key: string;
  label: string;
  value: number;
  color: string;
}

interface SliceTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number; payload: DonutSlice }>;
  total: number;
  format: (value: number) => string;
}

function SliceTooltip({
  active,
  payload,
  total,
  format: formatValue,
}: SliceTooltipProps): React.ReactElement | null {
  const entry = payload?.[0];
  if (!active || !entry) return null;
  const slice = entry.payload;
  const value = entry.value;
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="rounded-lg border border-border/70 bg-popover px-3 py-2 text-sm shadow-md">
      <div className="flex items-center gap-2">
        <span
          className="h-2.5 w-2.5 rounded-full"
          style={{ backgroundColor: slice.color }}
          aria-hidden="true"
        />
        <span className="font-medium text-popover-foreground">{slice.label}</span>
      </div>
      <p className="mt-0.5 text-muted-foreground">
        <span className="font-semibold text-foreground">{formatValue(value)}</span>
        {" · "}
        {pct}%
      </p>
    </div>
  );
}

interface DonutProps {
  slices: DonutSlice[];
  centerLabel: string;
  centerValue: string;
  format: (value: number) => string;
  ariaLabel: string;
  height?: number;
}

function Donut({
  slices,
  centerLabel,
  centerValue,
  format: formatValue,
  ariaLabel,
  height = 220,
}: DonutProps): React.ReactElement {
  const reduced = usePrefersReducedMotion();
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  const visible = slices.filter((slice) => slice.value > 0);
  const isEmpty = total <= 0;

  return (
    <div>
      <ChartShell
        height={height}
        isEmpty={isEmpty}
        emptyMessage="Sin datos en este periodo."
        overlay={
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-xl font-semibold tracking-tight text-foreground">
              {centerValue}
            </span>
            <span className="text-xs text-muted-foreground">{centerLabel}</span>
          </div>
        }
      >
        <PieChart>
          <Pie
            data={visible}
            dataKey="value"
            nameKey="label"
            innerRadius="62%"
            outerRadius="86%"
            paddingAngle={visible.length > 1 ? 2 : 0}
            startAngle={90}
            endAngle={-270}
            stroke="hsl(var(--card))"
            strokeWidth={2}
            isAnimationActive={!reduced}
            animationDuration={450}
            aria-label={ariaLabel}
          >
            {visible.map((slice) => (
              <Cell key={slice.key} fill={slice.color} />
            ))}
          </Pie>
          <Tooltip content={<SliceTooltip total={total} format={formatValue} />} />
        </PieChart>
      </ChartShell>

      <ul className="mt-4 grid gap-x-4 gap-y-2 sm:grid-cols-2">
        {slices.map((slice) => {
          const pct = total > 0 ? Math.round((slice.value / total) * 100) : 0;
          return (
            <li key={slice.key} className="flex items-center justify-between gap-3 text-sm">
              <span className="flex min-w-0 items-center gap-2">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: slice.color }}
                  aria-hidden="true"
                />
                <span className="truncate text-muted-foreground">{slice.label}</span>
              </span>
              <span className="shrink-0 font-medium tabular-nums text-foreground">
                {formatValue(slice.value)}
                <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                  {pct}%
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ── Gráfica 2: distribución por método de pago (donut) ────────────────────────

const METHOD_LABELS: Record<PosPaymentMethod, string> = {
  efectivo: "Efectivo",
  tarjeta: "Tarjeta",
  bizum: "Bizum",
  transferencia: "Transferencia",
  otro: "Otro",
};

const METHOD_COLORS: Record<PosPaymentMethod, string> = {
  tarjeta: "hsl(262 72% 60%)", // violeta (marca)
  efectivo: "hsl(160 55% 42%)", // verde
  bizum: "hsl(190 75% 45%)", // turquesa
  transferencia: "hsl(222 47% 56%)", // azul
  otro: "hsl(32 12% 58%)", // gris cálido
};

/** Orden de presentación estable (independiente del orden que devuelva la RPC). */
const METHOD_ORDER: readonly PosPaymentMethod[] = [
  "efectivo",
  "tarjeta",
  "bizum",
  "transferencia",
  "otro",
];

interface PaymentMethodChartProps {
  data: readonly PaymentMethodDistributionRow[];
  currency?: string;
}

/** Donut del reparto de cobros por método de pago (importe). */
export function PaymentMethodChart({
  data,
  currency = "EUR",
}: PaymentMethodChartProps): React.ReactElement {
  const byMethod = new Map<PosPaymentMethod, number>();
  for (const row of data) {
    byMethod.set(row.method, (byMethod.get(row.method) ?? 0) + row.amount_cents);
  }
  const slices: DonutSlice[] = METHOD_ORDER.filter((method) =>
    byMethod.has(method),
  ).map((method) => ({
    key: method,
    label: METHOD_LABELS[method],
    value: byMethod.get(method) ?? 0,
    color: METHOD_COLORS[method],
  }));
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);

  return (
    <Donut
      slices={slices}
      centerLabel="cobrado"
      centerValue={formatMoney(total, currency)}
      format={(value) => formatMoney(value, currency)}
      ariaLabel="Reparto de cobros por método de pago"
    />
  );
}

// ── Gráfica 3: clientes nuevos vs recurrentes (donut) ─────────────────────────

interface CustomersSplitChartProps {
  data: NewVsReturningCustomers;
}

/** Donut de la composición de clientes del periodo (nuevos / recurrentes / anónimos). */
export function CustomersSplitChart({
  data,
}: CustomersSplitChartProps): React.ReactElement {
  const slices: DonutSlice[] = [
    {
      key: "new",
      label: "Nuevos",
      value: data.new_customers,
      color: "hsl(262 72% 60%)",
    },
    {
      key: "returning",
      label: "Recurrentes",
      value: data.returning_customers,
      color: "hsl(190 70% 44%)",
    },
    {
      key: "anonymous",
      label: "Anónimos",
      value: data.anonymous_sales,
      color: "hsl(32 12% 60%)",
    },
  ];

  return (
    <Donut
      slices={slices}
      centerLabel="clientes"
      centerValue={String(
        data.new_customers + data.returning_customers + data.anonymous_sales,
      )}
      format={(value) => String(value)}
      ariaLabel="Composición de clientes nuevos, recurrentes y anónimos"
    />
  );
}
