// Lógica de PRESENTACIÓN de la agenda del profesional (pantalla "Mi agenda", sub-3). Parte
// PURA y testeable: recibe el modelo de vista ya cargado (`AppointmentListItem[]` de la capa
// de datos, sub-2) y NO toca red ni DOM. Aquí vive:
//   1) el meta de estado para el badge (etiqueta es-ES + variante de color),
//   2) el formateo de hora inicio/fin y de las cabeceras de día/semana (locale es),
//   3) la agrupación de citas por DÍA LOCAL para la vista de semana.
//
// La etiqueta de cada estado se REUTILIZA de `appointment-groups.ts` (única fuente de verdad
// es-ES de los estados de cita), de modo que la vista de empleado y la de administración
// muestran siempre el mismo texto. Aquí solo se le añade la VARIANTE de color del badge, que
// es una decisión de presentación propia de esta pantalla.
//
// ⛔ SIN DISPONIBILIDAD EN CLIENTE: solo se ordena/particiona lo que el servidor ya devolvió;
// no se derivan huecos libres/ocupados ni solapes de tramos (igual que toda la capa de citas).

import { endOfWeek, format, startOfDay, startOfWeek } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  DEFAULT_WEEK_STARTS_ON,
  sortByStartsAt,
  type AppointmentListItem,
  type AppointmentStatus,
  type WeekStartsOn,
} from '@/lib/appointments';
import { APPOINTMENT_STATUS_LABELS } from '@/lib/appointment-groups';

/** Variantes de color soportadas por `<Badge>` (shadcn). */
export type StatusBadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline';

/**
 * Variante de color del badge por estado. Exhaustiva sobre el enum `appointment_status`: si se
 * añade un estado nuevo a la BD, este `Record` deja de compilar hasta darle color (a prueba de
 * estados olvidados). `confirmed` destaca (default/dorado del tema); `pending` es neutro;
 * `cancelled`/`no_show` usan el rojo destructivo; `completed` queda discreto (outline).
 */
const STATUS_BADGE_VARIANTS: Record<AppointmentStatus, StatusBadgeVariant> = {
  pending: 'secondary',
  confirmed: 'default',
  completed: 'outline',
  cancelled: 'destructive',
  no_show: 'destructive',
};

/** Meta de presentación de un estado: etiqueta legible (es-ES) + variante de color del badge. */
export interface StatusMeta {
  label: string;
  variant: StatusBadgeVariant;
}

/**
 * Etiqueta + variante de color de un estado de cita. La etiqueta viene de la única fuente es-ES
 * (`APPOINTMENT_STATUS_LABELS`); ante un valor desconocido cae a algo seguro (el propio valor
 * y variante `outline`) para no romper el render.
 */
export function statusMeta(status: AppointmentStatus): StatusMeta {
  return {
    label: APPOINTMENT_STATUS_LABELS[status] ?? status,
    variant: STATUS_BADGE_VARIANTS[status] ?? 'outline',
  };
}

/** Hora local `HH:mm` de un instante ISO (el staff usa el equipo en el huso del salón). */
export function formatTime(iso: string): string {
  return format(new Date(iso), 'HH:mm');
}

/** Rango horario legible `HH:mm – HH:mm` (guion largo con espacios) en hora local. */
export function formatTimeRange(startIso: string, endIso: string): string {
  return `${formatTime(startIso)} – ${formatTime(endIso)}`;
}

/** Capitaliza la primera letra (los días/meses de date-fns es vienen en minúscula). */
function capitalizeFirst(text: string): string {
  return text.length > 0 ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

/** Cabecera de la vista de día: `Miércoles, 22 de julio`. */
export function formatDayHeading(ref: Date): string {
  return capitalizeFirst(format(ref, "EEEE, d 'de' LLLL", { locale: es }));
}

/**
 * Cabecera de la vista de semana: `22 – 28 de jul` (mismo mes/año) o `28 de jul – 3 de ago`
 * (a caballo entre meses). Empieza en lunes por defecto (España), como la capa de datos.
 */
export function formatWeekHeading(
  ref: Date,
  weekStartsOn: WeekStartsOn = DEFAULT_WEEK_STARTS_ON,
): string {
  const start = startOfWeek(ref, { weekStartsOn });
  const end = endOfWeek(ref, { weekStartsOn });
  const sameMonth =
    start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
  const startStr = format(start, sameMonth ? 'd' : "d 'de' LLL", { locale: es });
  const endStr = format(end, "d 'de' LLL", { locale: es });
  return `${startStr} – ${endStr}`;
}

/** Un día natural con sus citas, ya ordenadas por hora de inicio. */
export interface AgendaDayGroup {
  /** Clave estable del día local (`yyyy-MM-dd` del inicio de día local). */
  key: string;
  /** Fecha (inicio del día local) para formatear la cabecera. */
  date: Date;
  /** Citas de ese día, ascendente por `starts_at`. */
  appointments: AppointmentListItem[];
}

/**
 * Agrupa las citas por DÍA LOCAL para la vista de semana. Dentro de cada día reafirma el orden
 * por `starts_at` (reusa `sortByStartsAt`, sub-2) y los días se devuelven en orden cronológico.
 * Puro y NO mutante: no altera el array de entrada ni sus elementos.
 *
 * Se agrupa por día LOCAL (no por la fecha de la cadena ISO) para que una cita a las 23:30 caiga
 * en el día correcto del huso del dispositivo, coherente con `dayRange`/`weekRange` de la capa.
 */
export function groupByLocalDay(items: AppointmentListItem[]): AgendaDayGroup[] {
  const byDay = new Map<string, AgendaDayGroup>();
  for (const item of items) {
    const dayStart = startOfDay(new Date(item.startsAt));
    const key = format(dayStart, 'yyyy-MM-dd');
    const group = byDay.get(key);
    if (group) {
      group.appointments.push(item);
    } else {
      byDay.set(key, { key, date: dayStart, appointments: [item] });
    }
  }
  const groups = [...byDay.values()];
  for (const group of groups) {
    group.appointments = sortByStartsAt(group.appointments);
  }
  return groups.sort((a, b) => a.date.getTime() - b.date.getTime());
}
