/**
 * seed-demo-appointments.ts — Generador PURO y DETERMINISTA del plan de citas demo.
 * ---------------------------------------------------------------------------
 * Fábrica de ~12 meses de citas ficticias (sub-6) para el *seed* del salón demo
 * ("Bella Studio"). Hermano de `seed-demo-data.ts` (catálogo operativo) y
 * `seed-demo-customers.ts` (clientes): `scripts/seed-demo-salon.ts` lo consume
 * para SEMBRAR las citas de forma additiva e idempotente; los tests lo importan
 * para verificar sus invariantes SIN base de datos ni cliente Supabase.
 *
 * REGLA DE ORO: módulo **puro**, sin acceso a BD, sin `process`, sin Node APIs,
 * sin `Math.random()` ni la hora de pared (`new Date()` / `Date.now()`). El
 * "hoy" del salón se INYECTA como `todayStr` (fecha local `YYYY-MM-DD`), de modo
 * que el generador es:
 *
 *   · DETERMINISTA  — misma entrada ⇒ misma salida SIEMPRE (PRNG sembrado por
 *     (profesional, día)). Requisito de la IDEMPOTENCIA del seed: al reejecutar
 *     produce exactamente las mismas citas y el dedup por `(professional_id,
 *     starts_at)` las reconoce y no las duplica. `new Date(Date.UTC(...))` se usa
 *     SOLO para aritmética de calendario sobre fechas concretas (nunca "ahora").
 *   · TESTEABLE — se importa tal cual desde Vitest (no arrastra el cliente admin).
 *
 * QUÉ MODELA (fiel a la petición del cliente):
 *   · ESTACIONALIDAD — más viernes/sábado (factor por día de la semana) y PICOS en
 *     fechas señaladas de España/Madrid: campaña de Navidad, Nochevieja, Semana
 *     Santa (calculada con el algoritmo de Gauss), Día de la Madre (1.er domingo de
 *     mayo → sábado previo), San Valentín, pre-vacaciones de verano y hueco de
 *     agosto, Black Friday. Además una TENDENCIA de crecimiento (salón que crece):
 *     los meses recientes tienen más carga que los de hace un año.
 *   · MODELO DE 3 FASES — la duración total de la cita = application + exposure +
 *     post_exposure (de `seed-demo-data`), la misma que el motor de reservas usa
 *     para `ends_at`. Las citas de un MISMO profesional se colocan secuencialmente
 *     dentro del horario de SU sede, de forma que sus rangos NO se solapan: así los
 *     `appointment_blocks` (que el trigger genera para las fases ocupadas) tampoco
 *     se solapan y no disparan la exclusión `appointment_blocks_no_overlap` (23P01).
 *   · MEZCLA DE ESTADOS — MAYORÍA pasadas `completed` (con una minoría `cancelled`
 *     / `no_show`) y algunas futuras `confirmed` (con algunas `pending`) para
 *     poblar la agenda próxima.
 *
 * Las citas se producen en HORA LOCAL DE PARED del salón (`dateStr` + `startTime`);
 * la conversión a instante UTC (`starts_at` / `ends_at`) y la resolución de IDs
 * (profesional/servicio/cliente) las hace la capa de siembra en `seed-demo-salon.ts`
 * (reutilizando `zonedWallTimeToUtc` de `@/lib/booking/timezone`). Ver
 * `docs/seed-demo-contracts.md` §4 para el contrato de citas.
 */

import {
  DEMO_LOCATIONS,
  DEMO_OPEN_WEEKDAYS,
  DEMO_PROFESSIONALS,
  DEMO_SERVICES,
  professionalCoversService,
  serviceTotalMinutes,
  type DemoProfessional,
  type DemoService,
} from "./seed-demo-data";

// ───────────────────────────────────────────────────────────────────────────
// Tipos y parámetros.
// ───────────────────────────────────────────────────────────────────────────

/** Estado con el que nace una cita demo. Espejo del enum `appointment_status`. */
export type DemoAppointmentStatus =
  | "completed"
  | "cancelled"
  | "no_show"
  | "confirmed"
  | "pending";

/**
 * Una cita del plan, en HORA LOCAL DE PARED y con CLAVES NATURALES (no UUIDs). La
 * capa de siembra la traduce a una fila de `public.appointments`:
 *   · `professionalName` → `professional_id`  (mapa por `full_name`).
 *   · `serviceName`      → `service_id`        (+ fases para `ends_at`, + precio).
 *   · `customerIndex`    → `customer_id`       (índice 0-based en el catálogo de
 *                                               clientes demo, resuelto por teléfono).
 *   · `dateStr`+`startTime` → `starts_at` (UTC) vía `zonedWallTimeToUtc`.
 *   · `ends_at` = `starts_at` + `durationMinutes`.
 */
export interface DemoAppointmentPlan {
  /** Nombre del profesional (único en `DEMO_PROFESSIONALS`). */
  professionalName: string;
  /** Nombre del servicio (único en `DEMO_SERVICES`); su categoría la cubre el profesional. */
  serviceName: string;
  /** Índice 0-based del cliente en el catálogo demo (`generateDemoCustomers`). */
  customerIndex: number;
  /** Fecha local del salón `YYYY-MM-DD` (siempre un día de apertura L–S). */
  dateStr: string;
  /** Hora local de inicio `HH:MM` (dentro del horario de la sede del profesional). */
  startTime: string;
  /** Duración total en minutos = suma de las 3 fases del servicio. */
  durationMinutes: number;
  /** Snapshot del precio del servicio en céntimos (IVA incl.). */
  priceCents: number;
  /** Estado con el que se siembra la cita (ver `DemoAppointmentStatus`). */
  status: DemoAppointmentStatus;
}

/** Parámetros del generador (todo inyectado ⇒ pureza y determinismo). */
export interface GenerateAppointmentsParams {
  /** "Hoy" del salón en su zona, `YYYY-MM-DD` (lo calcula la capa de siembra). */
  todayStr: string;
  /** Nº de clientes demo sembrados (define el rango de `customerIndex`). */
  customerCount: number;
  /**
   * Densidad: media de citas por profesional y día de apertura ANTES de aplicar
   * los factores de estacionalidad/crecimiento. Saturada a un rango sensato.
   */
  density?: number;
  /** Meses hacia atrás que cubre el historial (por defecto 12). */
  pastMonths?: number;
  /** Días hacia delante que se pueblan en la agenda próxima (por defecto 28). */
  futureDays?: number;
}

/** Densidad por defecto (citas/profesional/día de apertura antes de factores). */
export const DEFAULT_APPOINTMENT_DENSITY = 1.2;
/** Mínimo de densidad admitido (evita un seed vacío). */
export const MIN_APPOINTMENT_DENSITY = 0.2;
/** Máximo de densidad admitido (evita un seed desmesuradamente grande). */
export const MAX_APPOINTMENT_DENSITY = 6;

/** Meses de historial por defecto (la petición pide ~12 meses). */
export const DEFAULT_PAST_MONTHS = 12;
/** Días de agenda futura por defecto (~4 semanas). */
export const DEFAULT_FUTURE_DAYS = 28;

/**
 * Resuelve la densidad desde un valor de entorno opcional
 * (`SEED_DEMO_APPOINTMENT_DENSITY`): parsea, cae al por defecto si no es finito y
 * SATURA al rango [0.2, 6]. Determinista y sin efectos.
 */
export function resolveAppointmentDensity(raw: string | undefined): number {
  const parsed = raw !== undefined ? Number.parseFloat(raw.trim()) : Number.NaN;
  const value = Number.isFinite(parsed) ? parsed : DEFAULT_APPOINTMENT_DENSITY;
  return Math.min(MAX_APPOINTMENT_DENSITY, Math.max(MIN_APPOINTMENT_DENSITY, value));
}

// ───────────────────────────────────────────────────────────────────────────
// PRNG determinista (mulberry32) — el mismo patrón que seed-demo-customers.
// ───────────────────────────────────────────────────────────────────────────

/** Generador mulberry32: determinista, rápido y suficiente para datos ficticios. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Semilla base fija del generador de citas demo (distinta de la de clientes). */
const BASE_SEED = 0x0a17b0c1;

/** Hash entero estable de un texto (para sembrar PRNG por nombre de profesional). */
function hashString(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Elige un elemento de un catálogo NO vacío (seguro bajo noUncheckedIndexedAccess). */
function pick<T>(rng: () => number, items: readonly T[]): T {
  const index = Math.floor(rng() * items.length) % items.length;
  const value = items[index];
  if (value === undefined) {
    throw new Error("pick: catálogo vacío (no debería ocurrir).");
  }
  return value;
}

// ───────────────────────────────────────────────────────────────────────────
// Aritmética de calendario (deterministas; NUNCA usan la hora actual).
// ───────────────────────────────────────────────────────────────────────────

/** Parsea `YYYY-MM-DD` a componentes numéricos (año, mes 1-12, día). */
function parseDateStr(dateStr: string): { year: number; month: number; day: number } {
  const [year, month, day] = dateStr.split("-").map(Number) as [number, number, number];
  return { year, month, day };
}

/** Fecha `YYYY-MM-DD` como instante UTC de medianoche (para aritmética de días). */
function dateStrToUtcMidnight(dateStr: string): number {
  const { year, month, day } = parseDateStr(dateStr);
  return Date.UTC(year, month - 1, day);
}

/** Formatea un instante UTC de medianoche a `YYYY-MM-DD`. */
function utcMidnightToDateStr(utcMs: number): string {
  const d = new Date(utcMs);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  return `${y}-${pad2(m)}-${pad2(day)}`;
}

/** Día de la semana (0=domingo … 6=sábado) de una fecha `YYYY-MM-DD`. */
function weekdayOf(dateStr: string): number {
  return new Date(dateStrToUtcMidnight(dateStr)).getUTCDay();
}

/** Suma `months` meses a una fecha `YYYY-MM-DD` (saturando el día al fin de mes). */
function addMonths(dateStr: string, months: number): string {
  const { year, month, day } = parseDateStr(dateStr);
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const ty = target.getUTCFullYear();
  const tm = target.getUTCMonth();
  const lastDay = new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate();
  return `${ty}-${pad2(tm + 1)}-${pad2(Math.min(day, lastDay))}`;
}

/** Rellena a 2 dígitos con cero a la izquierda. */
function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/** Minutos desde medianoche de una hora `HH:MM`. */
function minutesOfDay(time: string): number {
  const [h, m] = time.split(":").map(Number) as [number, number];
  return h * 60 + m;
}

/** Formatea minutos-desde-medianoche a `HH:MM`. */
function minutesToTime(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${pad2(h)}:${pad2(m)}`;
}

// ───────────────────────────────────────────────────────────────────────────
// Estacionalidad.
// ───────────────────────────────────────────────────────────────────────────

/**
 * Factor por día de la semana: la peluquería se llena hacia el fin de semana.
 * Índice 0=domingo (cerrado) … 6=sábado. Domingo = 0 (el salón cierra).
 */
const WEEKDAY_FACTOR: readonly number[] = [
  0, // domingo — cerrado
  0.7, // lunes
  0.8, // martes
  0.85, // miércoles
  1.0, // jueves
  1.4, // viernes
  1.6, // sábado
];

/** Domingo de Resurrección (Pascua) del año dado — algoritmo de Gauss/Anonymous. */
function easterSunday(year: number): { month: number; day: number } {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3=marzo, 4=abril
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { month, day };
}

/** Diferencia en días entre dos fechas `YYYY-MM-DD` (a − b). */
function daysBetween(a: string, b: string): number {
  return Math.round((dateStrToUtcMidnight(a) - dateStrToUtcMidnight(b)) / 86_400_000);
}

/**
 * Multiplicador de demanda por FECHA SEÑALADA (España/Madrid). Combina varias
 * campañas; devuelve el mayor factor aplicable (los picos no se acumulan). 1.0 =
 * temporada normal. Puro y determinista (solo depende del calendario).
 */
export function seasonalMultiplier(dateStr: string): number {
  const { year, month, day } = parseDateStr(dateStr);
  const factors: number[] = [1.0];

  // — Campaña de Navidad: diciembre, con clímax del 20 al 24 —
  if (month === 12 && day >= 1 && day <= 24) factors.push(day >= 20 ? 1.9 : 1.55);
  // — Nochevieja (31 dic): peinados y recogidos de fin de año —
  if (month === 12 && day >= 30) factors.push(1.7);

  // — San Valentín (10–14 feb) —
  if (month === 2 && day >= 10 && day <= 14) factors.push(1.2);

  // — Semana Santa: los 6 días previos al Domingo de Resurrección —
  const easter = easterSunday(year);
  const easterStr = `${year}-${pad2(easter.month)}-${pad2(easter.day)}`;
  const toEaster = daysBetween(easterStr, dateStr);
  if (toEaster >= 1 && toEaster <= 6) factors.push(1.5);

  // — Día de la Madre (1.er domingo de mayo) → sábado y viernes previos —
  //   El 1.er domingo cae en el día (7 − weekday(1 may)) % 7 + 1.
  const firstMayWeekday = weekdayOf(`${year}-05-01`); // 0..6
  const firstSundayMay = ((7 - firstMayWeekday) % 7) + 1;
  if (month === 5 && (day === firstSundayMay - 1 || day === firstSundayMay - 2)) {
    factors.push(1.5);
  }

  // — Pre-vacaciones de verano (15 jun – 15 jul): puesta a punto antes de viajar —
  if ((month === 6 && day >= 15) || (month === 7 && day <= 15)) factors.push(1.3);
  // — Hueco de agosto (1–24): muchos de vacaciones, cae la demanda —
  if (month === 8 && day <= 24) factors.push(0.55);

  // — Black Friday: la última semana de noviembre (24–30 nov) —
  if (month === 11 && day >= 24) factors.push(1.35);

  // Los picos "ganan" (max); el hueco de agosto (0.55) baja el mínimo.
  return Math.max(...factors) * Math.min(...factors);
}

// ───────────────────────────────────────────────────────────────────────────
// Generador principal.
// ───────────────────────────────────────────────────────────────────────────

/** Ventana de apertura (minutos-desde-medianoche) de la sede de un profesional. */
function locationWindow(professional: DemoProfessional): { open: number; close: number } {
  const loc = DEMO_LOCATIONS.find((l) => l.slug === professional.locationSlug);
  if (loc === undefined) {
    throw new Error(`Sede desconocida para "${professional.fullName}": ${professional.locationSlug}`);
  }
  return { open: minutesOfDay(loc.openStart), close: minutesOfDay(loc.openEnd) };
}

/** Servicios que un profesional puede prestar (según sus especialidades). */
function coveredServices(professional: DemoProfessional): DemoService[] {
  return DEMO_SERVICES.filter((service) => professionalCoversService(professional, service));
}

/**
 * Peso de un cliente en el reparto de citas: unos pocos "habituales" concentran
 * muchas visitas y la cola larga va poco. Determinista por índice: los primeros
 * índices pesan más (curva ~1/(1+i·k)). No importa el orden real de clientes; solo
 * produce una distribución realista de frecuencias (nuevos vs recurrentes).
 */
function customerWeight(index: number): number {
  return 1 / (1 + index * 0.04);
}

/** Elige un índice de cliente con la distribución de pesos (muestreo por ruleta). */
function pickCustomerIndex(
  rng: () => number,
  cumulativeWeights: readonly number[],
  totalWeight: number,
): number {
  const target = rng() * totalWeight;
  // Búsqueda lineal (customerCount ≤ 150 ⇒ trivial); estable y determinista.
  for (let i = 0; i < cumulativeWeights.length; i += 1) {
    const w = cumulativeWeights[i];
    if (w !== undefined && target < w) return i;
  }
  return cumulativeWeights.length - 1;
}

/** Estado de una cita PASADA: mayoría `completed`, minoría `cancelled`/`no_show`. */
function pastStatus(rng: () => number): DemoAppointmentStatus {
  const roll = rng();
  if (roll < 0.85) return "completed";
  if (roll < 0.93) return "no_show";
  return "cancelled";
}

/** Estado de una cita FUTURA: mayoría `confirmed`, algunas `pending`. */
function futureStatus(rng: () => number): DemoAppointmentStatus {
  return rng() < 0.72 ? "confirmed" : "pending";
}

/**
 * Genera el plan de citas demo: ~`pastMonths` de historial + `futureDays` de agenda
 * próxima, con estacionalidad y sin solape por profesional. DETERMINISTA: cada
 * (profesional, día) tiene su propio flujo PRNG sembrado de forma estable, así que
 * reejecutar produce EXACTAMENTE el mismo plan (clave de la idempotencia del seed).
 *
 * El recorrido es por PROFESIONAL y luego por DÍA: dentro de un día, las citas se
 * colocan secuencialmente en el horario de su sede (cada una empieza cuando acaba la
 * anterior + un pequeño hueco), de modo que los rangos del MISMO profesional nunca
 * se solapan (ni sus `appointment_blocks`).
 */
export function generateDemoAppointments(
  params: GenerateAppointmentsParams,
): DemoAppointmentPlan[] {
  const {
    todayStr,
    customerCount,
    density = DEFAULT_APPOINTMENT_DENSITY,
    pastMonths = DEFAULT_PAST_MONTHS,
    futureDays = DEFAULT_FUTURE_DAYS,
  } = params;

  const startStr = addMonths(todayStr, -pastMonths);
  const endMs = dateStrToUtcMidnight(todayStr) + futureDays * 86_400_000;
  const startMs = dateStrToUtcMidnight(startStr);
  const totalPastDays = Math.max(1, daysBetween(todayStr, startStr));

  // Reparto de clientes: pesos acumulados para el muestreo por ruleta.
  const cumulativeWeights: number[] = [];
  let running = 0;
  for (let i = 0; i < customerCount; i += 1) {
    running += customerWeight(i);
    cumulativeWeights.push(running);
  }
  const totalWeight = running;

  const plan: DemoAppointmentPlan[] = [];

  for (const professional of DEMO_PROFESSIONALS) {
    const services = coveredServices(professional);
    if (services.length === 0) continue; // (no debería ocurrir: todos cubren algo)
    const { open, close } = locationWindow(professional);
    const proSeed = (BASE_SEED ^ hashString(professional.fullName)) >>> 0;

    for (let dayMs = startMs; dayMs < endMs; dayMs += 86_400_000) {
      const dateStr = utcMidnightToDateStr(dayMs);
      const weekday = weekdayOf(dateStr);
      if (!DEMO_OPEN_WEEKDAYS.includes(weekday)) continue; // salón cerrado ese día

      // PRNG estable por (profesional, día): día como offset entero desde el inicio.
      const dayIndex = Math.round((dayMs - startMs) / 86_400_000);
      const rng = mulberry32((proSeed + Math.imul(dayIndex + 1, 0x9e3779b1)) >>> 0);

      // Carga esperada del día = densidad × día de semana × estacionalidad × crecimiento.
      const isPast = dateStr < todayStr;
      const growth = isPast
        ? 0.55 + 0.6 * (daysBetween(dateStr, startStr) / totalPastDays) // rampa 0.55→1.15
        : 1.15; // agenda futura: al nivel actual
      const expected =
        density *
        (WEEKDAY_FACTOR[weekday] ?? 1) *
        seasonalMultiplier(dateStr) *
        growth;

      // Nº de citas del día: parte entera + parte fraccionaria como probabilidad,
      // más un jitter suave. Nunca negativo.
      const jitter = 0.7 + 0.6 * rng(); // 0.7–1.3
      const rawCount = expected * jitter;
      let count = Math.floor(rawCount);
      if (rng() < rawCount - count) count += 1;
      if (count <= 0) continue;

      // Colocación secuencial dentro del horario de la sede (sin solape del profesional).
      // Arranque con un pequeño retardo variable respecto a la apertura.
      let cursor = open + Math.floor(rng() * 30);
      let placed = 0;
      for (let n = 0; n < count; n += 1) {
        const service = pick(rng, services);
        const dur = serviceTotalMinutes(service);
        if (cursor + dur > close) break; // no cabe en la jornada → día completo

        const startTime = minutesToTime(cursor);
        const customerIndex = pickCustomerIndex(rng, cumulativeWeights, totalWeight);
        const status = isPast ? pastStatus(rng) : futureStatus(rng);

        plan.push({
          professionalName: professional.fullName,
          serviceName: service.name,
          customerIndex,
          dateStr,
          startTime,
          durationMinutes: dur,
          priceCents: service.priceCents,
          status,
        });
        placed += 1;

        // Avanza el cursor: fin de la cita + hueco corto; a veces una pausa mayor
        // (comida/hueco) para que la agenda no quede pared-a-pared (ocupación realista).
        const gap = 5 + Math.floor(rng() * 15); // 5–19 min de margen
        const longBreak = rng() < 0.18 ? 20 + Math.floor(rng() * 40) : 0; // pausa ocasional
        cursor = cursor + dur + gap + longBreak;
        if (cursor >= close) break;
      }
      if (placed === 0) continue;
    }
  }

  return plan;
}
