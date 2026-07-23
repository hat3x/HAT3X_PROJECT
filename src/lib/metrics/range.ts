/**
 * RANGO temporal de la analítica — presets + resolución a `{ from, to }` local.
 *
 * Este módulo es la ÚNICA fuente de verdad del selector de rango de `/analitica`:
 * el mismo periodo resuelto aquí alimenta TODOS los KPIs y TODAS las gráficas de la
 * página, de modo que cambiar el rango (en la URL) gobierna la vista entera.
 *
 * ── Por qué vive fuera de `server.ts` ────────────────────────────────────────
 * Es lógica PURA (fechas + `Intl`), sin Supabase, así que la importan por igual el
 * Server Component de la página (para calcular el periodo antes de consultar) y el
 * selector CLIENTE (para pintar los botones y prefijar el rango personalizado).
 * Importar SIEMPRE desde `@/lib/metrics/range` (NO desde `@/lib/metrics`, cuyo
 * barrel arrastra `server.ts` y rompería el bundle de cliente).
 *
 * ── Convenciones (heredadas del contrato de métricas) ────────────────────────
 *   · El rango es `{ from, to }` en fechas locales `YYYY-MM-DD` del salón; `to` es
 *     INCLUSIVO (día completo). Los cortes «hoy / mes / año» se calculan en la
 *     `timezone` del salón (por defecto `Europe/Madrid`), no en la del servidor.
 *   · La aritmética de calendario se hace sobre medianoche UTC (`Date.UTC`) para
 *     que sumar/restar días sea INMUNE al huso del servidor y al horario de verano.
 */
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";

import type { MetricsPeriod, RevenueGranularity } from "./types";

/** Preset del selector. `personalizado` usa `desde`/`hasta` explícitos. */
export type RangePreset = "hoy" | "7d" | "30d" | "mes" | "ano" | "personalizado";

/** Preset por defecto (y de reserva si el rango personalizado es inválido). */
export const DEFAULT_RANGE_PRESET: RangePreset = "30d";

/** Nombres de los parámetros de URL que gobiernan el rango. */
export const RANGE_PARAM = "rango";
export const FROM_PARAM = "desde";
export const TO_PARAM = "hasta";

/** Opción presentable del selector (valor + etiqueta legible). */
export interface RangePresetOption {
  value: RangePreset;
  label: string;
}

/**
 * Presets en orden de uso (de más corto a más largo, y personalizado al final).
 * Los consume el `RangeSelector` para pintar el control segmentado.
 */
export const RANGE_PRESETS: readonly RangePresetOption[] = [
  { value: "hoy", label: "Hoy" },
  { value: "7d", label: "7 días" },
  { value: "30d", label: "30 días" },
  { value: "mes", label: "Este mes" },
  { value: "ano", label: "Este año" },
  { value: "personalizado", label: "Personalizado" },
];

/** Rango ya resuelto: periodo consultable + granularidad de serie + etiqueta. */
export interface ResolvedRange {
  /** Preset EFECTIVO (un personalizado inválido cae al preset por defecto). */
  preset: RangePreset;
  /** Periodo `{ from, to }` en fechas locales del salón, `to` inclusivo. */
  period: MetricsPeriod;
  /** Granularidad recomendada para `getRevenueTimeseries` según la amplitud. */
  granularity: RevenueGranularity;
  /** Etiqueta humana del rango, p. ej. «1–23 jul 2026». */
  label: string;
}

/** `searchParams` tal cual los entrega Next (valor único, lista o ausente). */
export type RawSearchParams = Record<string, string | string[] | undefined>;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Primer valor de un parámetro que Next puede dar como string | string[]. */
function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** ¿Es `s` una fecha `YYYY-MM-DD` de calendario real (rechaza 2026-02-31)? */
export function isIsoDate(s: string | undefined): s is string {
  if (!s || !ISO_DATE.test(s)) return false;
  const d = isoToUtc(s);
  return utcToIso(d) === s; // ida y vuelta: descarta días/meses fuera de rango
}

/** `YYYY-MM-DD` → `Date` en medianoche UTC (calendario puro, sin huso). */
function isoToUtc(iso: string): Date {
  const parts = iso.split("-");
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  const d = Number(parts[2]);
  return new Date(Date.UTC(y, m - 1, d));
}

/** `Date` UTC → `YYYY-MM-DD`. */
function utcToIso(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Suma (o resta) días de calendario a una fecha ISO. */
function addDays(iso: string, days: number): string {
  const d = isoToUtc(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return utcToIso(d);
}

/** Nº de días de calendario del rango, contando ambos extremos (`to` inclusivo). */
export function daySpan(from: string, to: string): number {
  const diff = isoToUtc(to).getTime() - isoToUtc(from).getTime();
  return Math.round(diff / 86_400_000) + 1;
}

/**
 * «Hoy» como fecha de calendario `YYYY-MM-DD` en la zona `timeZone` del salón.
 * Usa `Intl` (locale `en-CA`, que formatea en ISO) para leer el día local sin
 * arrastrar la hora ni el huso del servidor. Si `timeZone` es inválida, cae a la
 * zona del sistema (nunca lanza: el panel no debe romperse por un dato de salón).
 */
export function localTodayIso(timeZone: string, now: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
  } catch {
    return new Intl.DateTimeFormat("en-CA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
  }
}

/** Valida el parámetro `rango` contra los presets conocidos (o cae al defecto). */
export function parseRangePreset(raw: string | undefined): RangePreset {
  return RANGE_PRESETS.some((p) => p.value === raw)
    ? (raw as RangePreset)
    : DEFAULT_RANGE_PRESET;
}

/** `{ from, to }` de un preset NO personalizado, anclado a «hoy» local. */
function periodForPreset(
  preset: Exclude<RangePreset, "personalizado">,
  today: string,
): MetricsPeriod {
  switch (preset) {
    case "hoy":
      return { from: today, to: today };
    case "7d":
      return { from: addDays(today, -6), to: today };
    case "30d":
      return { from: addDays(today, -29), to: today };
    case "mes":
      return { from: `${today.slice(0, 7)}-01`, to: today };
    case "ano":
      return { from: `${today.slice(0, 4)}-01-01`, to: today };
  }
}

/**
 * Granularidad de la serie temporal según la amplitud del rango, para que la
 * gráfica no tenga ni 1 barra (rango de un día) ni cientos (rango de años):
 *   · ≤ ~2 meses  → día
 *   · ≤ ~2 años   → mes
 *   · más largo   → año
 */
export function granularityForSpan(days: number): RevenueGranularity {
  if (days <= 62) return "day";
  if (days <= 731) return "month";
  return "year";
}

/** Etiqueta humana compacta del rango (colapsa mes/año comunes). */
export function formatRangeLabel(from: string, to: string): string {
  const a = parseISO(from);
  const b = parseISO(to);
  if (from === to) return format(a, "d MMM yyyy", { locale: es });

  const sameYear = from.slice(0, 4) === to.slice(0, 4);
  const sameMonth = sameYear && from.slice(0, 7) === to.slice(0, 7);
  if (sameMonth) {
    return `${format(a, "d", { locale: es })}–${format(b, "d MMM yyyy", { locale: es })}`;
  }
  if (sameYear) {
    return `${format(a, "d MMM", { locale: es })} – ${format(b, "d MMM yyyy", { locale: es })}`;
  }
  return `${format(a, "d MMM yyyy", { locale: es })} – ${format(b, "d MMM yyyy", { locale: es })}`;
}

/**
 * Resuelve el rango a consultar desde los `searchParams` de la URL y la zona del
 * salón. Es el punto único que traduce «lo que pidió el usuario» a un periodo
 * concreto; su salida gobierna TODOS los KPIs y gráficas de la página.
 *
 * Reglas de robustez (nunca lanza, siempre devuelve un rango usable):
 *   · `rango` desconocido → preset por defecto ({@link DEFAULT_RANGE_PRESET}).
 *   · `personalizado` sin `desde`/`hasta` válidos o con `desde > hasta` → cae al
 *     preset por defecto (y el selector marcará ese preset, no «personalizado»).
 */
export function resolveMetricsRange(
  searchParams: RawSearchParams,
  timeZone: string,
  now: Date = new Date(),
): ResolvedRange {
  const today = localTodayIso(timeZone, now);
  let preset = parseRangePreset(firstParam(searchParams[RANGE_PARAM]));

  if (preset === "personalizado") {
    const from = firstParam(searchParams[FROM_PARAM]);
    const to = firstParam(searchParams[TO_PARAM]);
    if (isIsoDate(from) && isIsoDate(to) && from <= to) {
      return {
        preset,
        period: { from, to },
        granularity: granularityForSpan(daySpan(from, to)),
        label: formatRangeLabel(from, to),
      };
    }
    preset = DEFAULT_RANGE_PRESET; // personalizado inválido → defecto sensato
  }

  // Aquí `preset` ya NO puede ser "personalizado" (o entró como otro preset, o se
  // reasignó al defecto arriba); el cast lo refleja para `periodForPreset`.
  const period = periodForPreset(
    preset as Exclude<RangePreset, "personalizado">,
    today,
  );
  return {
    preset,
    period,
    granularity: granularityForSpan(daySpan(period.from, period.to)),
    label: formatRangeLabel(period.from, period.to),
  };
}
