// Lógica PURA de la pantalla "Mis Citas" (autoservicio del cliente · Salón OS).
//
// Este módulo NO toca React, Supabase, window ni import.meta: solo transforma y
// formatea datos, para poder probarlo en aislamiento (ver appointments.test.ts).
// Misma separación de responsabilidades que salon.ts / salon-os-api.ts:
//   · Parte PURA (aquí): partición próximas/historial, enriquecido con el catálogo,
//     estilos de estado y formateo (fecha/hora/precio/duración).
//   · Parte con EFECTOS (useAppointments.ts): leer de Supabase (RLS self de sub-7),
//     traer el catálogo público (bootstrap) y exponerlo a la UI con react-query.
//
// ── De dónde salen los datos y por qué ─────────────────────────────────────────
// El cliente LEE sus citas de public.appointments mediante la política RLS SELF de
// solo lectura "self_select_own_appointments" (migración 20260719100000): solo ve
// las citas de SU ficha. Esa fila trae `service_id`/`professional_id` (uuids) pero
// el cliente NO puede leer las tablas `services`/`professionals` (su RLS es de
// STAFF, acotada por app.user_salon_ids()). Para mostrar nombres legibles, la UI
// enriquece cada cita con el CATÁLOGO PÚBLICO del salón (endpoint anónimo bootstrap
// de salon-os-api), que sí expone servicios y profesionales. El enriquecido es
// OPCIONAL: si el catálogo no está disponible, la cita se muestra igual con su
// fecha/hora/precio/estado y un rótulo genérico.
import type { Tables } from '@/integrations/supabase/types';
import type {
  BookingBootstrap,
  PublicProfessional,
  PublicService,
} from '@/lib/salon-os-api';

// ── Tipos ───────────────────────────────────────────────────────────────────────

/** Estados de una cita (espejo del enum public.appointment_status de Salón OS). */
export type AppointmentStatus = Tables<'appointments'>['status'];

/**
 * Subconjunto de columnas de `appointments` que la pantalla NECESITA y que el
 * cliente debe ver. Se seleccionan explícitamente (no `*`): RLS no filtra columnas,
 * así que `notes` y `cancelled_reason` —que pueden contener observaciones internas
 * del staff— se dejan FUERA a propósito (misma cautela que anota la migración RLS).
 */
export type AppointmentRow = Pick<
  Tables<'appointments'>,
  | 'id'
  | 'starts_at'
  | 'ends_at'
  | 'status'
  | 'service_id'
  | 'professional_id'
  | 'price_cents'
  | 'currency'
>;

/** Cita ya lista para pintar: la fila + los nombres resueltos + la duración. */
export interface EnrichedAppointment extends AppointmentRow {
  /** Nombre del servicio, o null si el catálogo no lo resuelve (servicio retirado). */
  serviceName: string | null;
  /** Nombre del profesional, o null si el catálogo no lo resuelve. */
  professionalName: string | null;
  /** Duración en minutos, derivada de starts_at→ends_at (>= 0). */
  durationMinutes: number;
}

/** Índice del catálogo público para resolver nombres en O(1). */
export interface CatalogIndex {
  services: Map<string, PublicService>;
  professionals: Map<string, PublicProfessional>;
  /** Zona horaria del salón (p. ej. 'Europe/Madrid') para formatear las horas. */
  timezone: string | null;
}

/** Las dos pestañas de la pantalla. */
export type AppointmentTab = 'upcoming' | 'history';

// ── Diagnóstico de acceso: ¿el servidor RECHAZÓ la lectura self? ──────────────────

/**
 * ¿El error de Supabase indica que el cliente NO tiene permiso para leer sus citas?
 *
 * La lectura self de "Mis Citas" depende de una política/RPC RLS *self* en el servidor
 * de Salón OS (fuera del alcance de esta app). Si ese permiso no está activo, PostgREST
 * responde «permission denied» (código Postgres `42501`) en lugar de datos. Detectarlo
 * deja dar un AVISO HONESTO en pantalla ("requiere un permiso de servidor aún no
 * activo") en vez de un error genérico de red que invita a reintentar en vano — y SIN
 * abrir políticas amplias como parche desde el cliente (ver docs/PENDIENTE-mis-citas-rls.md).
 *
 * OJO — límite conocido: si el servidor tuviera RLS habilitada pero SIN política SELECT
 * (en vez de faltar el GRANT), la lectura NO da error: PostgREST devuelve 0 filas. Ese
 * caso es INDISTINGUIBLE de "no tienes citas" desde el cliente; queda documentado como
 * pendiente. Aquí sólo se captura el rechazo EXPLÍCITO (el único señalable sin ambigüedad).
 *
 * Función PURA (no toca red ni React): mira el `code` (`42501`) del PostgrestError y, a
 * la defensiva, el texto del mensaje ("permission denied" / "row-level security"), por si
 * el transporte no propagara el código. Cualquier otro error (red, 5xx…) → false: es un
 * fallo transitorio normal y la pantalla lo trata como reintentable.
 */
export function isAccessDeniedError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  if ((error as { code?: unknown }).code === '42501') return true;
  const message = (error as { message?: unknown }).message;
  if (typeof message !== 'string') return false;
  const normalized = message.toLowerCase();
  return (
    normalized.includes('permission denied') ||
    normalized.includes('row-level security') ||
    normalized.includes('row level security')
  );
}

// ── Estados: qué es "próxima" y estilo del badge ─────────────────────────────────

/**
 * Estados "vivos": una cita en estos estados aún puede ocurrir. Los demás
 * (completed/cancelled/no_show) son terminales y viven siempre en el historial.
 */
const ACTIVE_STATUSES: ReadonlySet<AppointmentStatus> = new Set<AppointmentStatus>([
  'pending',
  'confirmed',
]);

/**
 * Clases Tailwind del badge por estado. Jerarquía visual sobre el tema oro/oscuro:
 *   · pending   → ámbar (warning): a la espera de confirmación.
 *   · confirmed → verde (success): todo listo.
 *   · completed → oro suave (brand): visita hecha (suma fidelidad).
 *   · cancelled → rojo (destructive): la única señal "destructiva".
 *   · no_show   → neutro (muted): ausencia, sin dramatizar.
 * Se declara con `satisfies Record<...>` para forzar exhaustividad: si el enum
 * gana un estado nuevo, TypeScript obliga a añadir su estilo aquí.
 */
export const STATUS_BADGE_CLASS = {
  pending: 'bg-warning/15 text-warning ring-1 ring-warning/25',
  confirmed: 'bg-success/15 text-success ring-1 ring-success/25',
  completed: 'bg-gold/10 text-gold ring-1 ring-gold/20',
  cancelled: 'bg-destructive/15 text-destructive ring-1 ring-destructive/25',
  no_show: 'bg-muted text-muted-foreground ring-1 ring-border',
} satisfies Record<AppointmentStatus, string>;

/** Clave i18n del rótulo de un estado (appointments.status.<estado>). */
export function statusLabelKey(status: AppointmentStatus): string {
  return `appointments.status.${status}`;
}

// ── Partición próximas / historial ───────────────────────────────────────────────

/**
 * Una cita es "próxima" si su estado es vivo (pending/confirmed) Y todavía no ha
 * terminado (ends_at >= ahora). Usar `ends_at` (no starts_at) mantiene en "próximas"
 * una cita EN CURSO. Todo lo demás (terminadas, canceladas, no-show, o vivas ya
 * pasadas sin cerrar) cae en el historial.
 */
export function isUpcoming(row: Pick<AppointmentRow, 'status' | 'ends_at'>, nowMs: number): boolean {
  if (!ACTIVE_STATUSES.has(row.status)) return false;
  const endMs = Date.parse(row.ends_at);
  // Fecha inválida → no la tratamos como futura (evita colar basura en "próximas").
  return Number.isFinite(endMs) && endMs >= nowMs;
}

/**
 * Reparte las citas en dos listas ordenadas para la UI:
 *   · upcoming: cronológico ASCENDENTE (la más cercana primero).
 *   · history:  cronológico DESCENDENTE (la más reciente primero).
 * `nowMs` se inyecta (Date.now() en runtime) para que la función sea determinista
 * y testeable. No muta la entrada.
 */
export function partitionAppointments<T extends AppointmentRow>(
  rows: readonly T[],
  nowMs: number,
): { upcoming: T[]; history: T[] } {
  const upcoming: T[] = [];
  const history: T[] = [];
  for (const row of rows) {
    (isUpcoming(row, nowMs) ? upcoming : history).push(row);
  }
  const startMs = (r: AppointmentRow) => Date.parse(r.starts_at) || 0;
  upcoming.sort((a, b) => startMs(a) - startMs(b));
  history.sort((a, b) => startMs(b) - startMs(a));
  return { upcoming, history };
}

// ── Enriquecido con el catálogo público ──────────────────────────────────────────

/** Construye el índice de búsqueda del catálogo (bootstrap) por id. */
export function buildCatalogIndex(bootstrap: BookingBootstrap): CatalogIndex {
  return {
    services: new Map(bootstrap.services.map((s) => [s.id, s])),
    professionals: new Map(bootstrap.professionals.map((p) => [p.id, p])),
    timezone: bootstrap.salon.timezone ?? null,
  };
}

/** Minutos entre dos instantes ISO; 0 si alguno es inválido o el rango es negativo. */
export function computeDurationMinutes(startIso: string, endIso: string): number {
  const start = Date.parse(startIso);
  const end = Date.parse(endIso);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.max(0, Math.round((end - start) / 60000));
}

/**
 * Enriquece una fila con los nombres del catálogo y la duración. Si `index` es null
 * (catálogo aún cargando o no disponible) o no contiene el id (servicio/profesional
 * retirado), los nombres quedan en null y la UI usa un rótulo genérico.
 */
export function enrichAppointment(
  row: AppointmentRow,
  index: CatalogIndex | null,
): EnrichedAppointment {
  return {
    ...row,
    serviceName: index?.services.get(row.service_id)?.name ?? null,
    professionalName: index?.professionals.get(row.professional_id)?.fullName ?? null,
    durationMinutes: computeDurationMinutes(row.starts_at, row.ends_at),
  };
}

// ── Formateo (localizado, sin dependencias) ──────────────────────────────────────

/** Mapea el locale de la app (es/en) a un BCP-47 con convenciones europeas (24h, DD/MM). */
export function localeToBcp47(locale: string): string {
  return locale === 'en' ? 'en-GB' : 'es-ES';
}

interface FormatCtx {
  /** 'es' | 'en' (locale de la app). */
  locale: string;
  /**
   * Zona horaria del salón (del catálogo). Se formatea SIEMPRE en la hora del salón:
   * el cliente debe ver la hora a la que ir, aunque esté en otro huso. Si falta,
   * Intl usa la del dispositivo (aproximación válida para el cliente local).
   */
  timeZone?: string | null;
}

/** Opciones base de Intl con la zona del salón (omite timeZone si no se conoce). */
function intlOptions(ctx: FormatCtx, opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormatOptions {
  return ctx.timeZone ? { ...opts, timeZone: ctx.timeZone } : opts;
}

/** Partes de la "regleta" de fecha del card: día del mes, mes y día de la semana, abreviados. */
export function formatDateParts(
  iso: string,
  ctx: FormatCtx,
): { weekday: string; day: string; month: string } {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return { weekday: '', day: '—', month: '' };
  const bcp47 = localeToBcp47(ctx.locale);
  const parts = new Intl.DateTimeFormat(
    bcp47,
    intlOptions(ctx, { weekday: 'short', day: 'numeric', month: 'short' }),
  ).formatToParts(date);
  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? '';
  // Quita el punto de las abreviaturas ("jul." → "jul") para la regleta compacta.
  const clean = (s: string) => s.replace(/\.$/, '');
  return { weekday: clean(pick('weekday')), day: pick('day'), month: clean(pick('month')) };
}

/** Fecha larga y legible: "vie, 25 jul" — para lectores de pantalla y cabeceras. */
export function formatLongDate(iso: string, ctx: FormatCtx): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(
    localeToBcp47(ctx.locale),
    intlOptions(ctx, { weekday: 'short', day: 'numeric', month: 'short' }),
  ).format(date);
}

/** Hora local del salón, 24h: "10:00". */
export function formatTime(iso: string, ctx: FormatCtx): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(
    localeToBcp47(ctx.locale),
    intlOptions(ctx, { hour: '2-digit', minute: '2-digit', hour12: false }),
  ).format(date);
}

/** Franja horaria de la cita: "10:00 – 10:45" (guion largo, sin ambigüedad). */
export function formatTimeRange(startIso: string, endIso: string, ctx: FormatCtx): string {
  const start = formatTime(startIso, ctx);
  const end = formatTime(endIso, ctx);
  return end ? `${start} – ${end}` : start;
}

/** Duración humana: "45 min", "1 h", "1 h 30 min". */
export function formatDuration(minutes: number): string {
  if (minutes <= 0) return '';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}

/** Precio localizado desde céntimos: 2500,'EUR','es' → "25,00 €". */
export function formatPrice(cents: number, currency: string, locale: string): string {
  try {
    return new Intl.NumberFormat(localeToBcp47(locale), {
      style: 'currency',
      currency,
    }).format(cents / 100);
  } catch {
    // Divisa no reconocida por Intl → degrada a "25.00 EUR" sin romper el render.
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}
