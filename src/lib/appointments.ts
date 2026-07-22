// Capa de datos de CITAS (agenda del staff) — parte PURA y testeable. Este módulo NO
// importa el cliente de Supabase, NO toca la red ni el DOM: toda la entrada llega por
// argumento. Aquí vive únicamente la lógica DETERMINISTA de:
//   1) calcular el RANGO de `starts_at` de un día o una semana (intervalo semiabierto),
//   2) declarar el SELECT de PostgREST con los joins a customers/services/professionals,
//   3) mapear la fila cruda de la consulta a un modelo de vista normalizado (camelCase),
//   4) ordenar por `starts_at`.
//
// La consulta real (I/O) vive en `appointments-queries.ts`; el cableado con React Query
// y el salon_id resuelto en runtime, en `hooks/use-appointments.ts`. Separar la parte
// pura permite testearla sin mocks de red (mismo patrón que salon.ts vs salon-branding.ts).
//
// ⛔ IMPORTANTE — SIN RECALCULAR DISPONIBILIDAD EN CLIENTE. Esta capa solo LEE citas ya
// existentes. NO deriva huecos libres/ocupados, NO cruza `appointment_blocks` ni calcula
// solapes de tramos: la disponibilidad es responsabilidad del servidor (rangos
// `occupied_range` / RPCs de Salón OS). Aquí jamás se computa free/busy.

import { addDays, addWeeks, startOfDay, startOfWeek } from 'date-fns';
import type { Database } from '@/types/database';

/** Estado de una cita, tal cual el enum `appointment_status` de la BD de Salón OS. */
export type AppointmentStatus = Database['public']['Enums']['appointment_status'];

/** Día de inicio de semana (0 = domingo … 6 = sábado), como en date-fns. */
export type WeekStartsOn = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/**
 * España empieza la semana en LUNES. Es el valor por defecto de la agenda semanal.
 */
export const DEFAULT_WEEK_STARTS_ON: WeekStartsOn = 1;

/**
 * Rango temporal SEMIABIERTO `[gte, lt)` en ISO 8601 (UTC). Se usa como `>= gte` y
 * `< lt` sobre `starts_at`: el intervalo semiabierto evita contar dos veces las citas
 * que caen justo en la frontera (medianoche) entre dos días/semanas contiguos.
 */
export interface DateRange {
  /** Límite inferior INCLUSIVO (`starts_at >= gte`). */
  gte: string;
  /** Límite superior EXCLUSIVO (`starts_at < lt`). */
  lt: string;
}

/**
 * Rango `[inicio de día, inicio del día siguiente)` para el instante `ref`, calculado en
 * la zona horaria LOCAL del dispositivo (el staff usa el equipo en el huso del salón).
 * Se apoya en `startOfDay`, por lo que respeta correctamente los días de cambio de hora
 * (23 h / 25 h) en lugar de sumar 24 h a ciegas.
 */
export function dayRange(ref: Date): DateRange {
  const start = startOfDay(ref);
  const next = startOfDay(addDays(ref, 1));
  return { gte: start.toISOString(), lt: next.toISOString() };
}

/**
 * Rango `[inicio de semana, inicio de la semana siguiente)` para el instante `ref`.
 * Por defecto la semana empieza en lunes (`DEFAULT_WEEK_STARTS_ON`). Usa `startOfWeek`
 * + `addWeeks` (aritmética de calendario), así que es correcto en semanas con cambio de
 * hora.
 */
export function weekRange(
  ref: Date,
  weekStartsOn: WeekStartsOn = DEFAULT_WEEK_STARTS_ON,
): DateRange {
  const start = startOfWeek(ref, { weekStartsOn });
  const next = addWeeks(start, 1);
  return { gte: start.toISOString(), lt: next.toISOString() };
}

/**
 * SELECT de PostgREST para la agenda: una sola consulta que EMBEBE (join) el cliente, el
 * servicio y el profesional de cada cita. Un único viaje ⇒ sin patrón N+1.
 *
 * Las relaciones se desambiguan con el NOMBRE de la FK (`customers!appointments_customer_id_fkey`)
 * porque `appointments` tiene varias claves foráneas compuestas `(*, salon_id)`; nombrar la
 * FK hace la resolución del embed explícita y estable ante regeneraciones de tipos.
 *
 * Tipado como `string` (sin `as const`) a propósito: evita que supabase-js intente
 * inferir el tipo parseando el literal del select; el tipo del resultado se fija con
 * `.returns<AppointmentRow[]>()` en la consulta.
 */
export const APPOINTMENTS_SELECT: string = `
  id,
  salon_id,
  customer_id,
  professional_id,
  service_id,
  starts_at,
  ends_at,
  status,
  price_cents,
  currency,
  notes,
  customer:customers!appointments_customer_id_fkey ( full_name, phone ),
  service:services!appointments_service_id_fkey ( id, name ),
  professional:professionals!appointments_professional_id_fkey ( id, full_name, color )
`;

/** Cliente embebido en la cita (solo los campos pedidos: nombre + teléfono). */
export interface AppointmentCustomerRow {
  full_name: string;
  phone: string | null;
}

/** Servicio embebido en la cita. */
export interface AppointmentServiceRow {
  id: string;
  name: string;
}

/** Profesional embebido en la cita (nombre + color para las etiquetas de la agenda). */
export interface AppointmentProfessionalRow {
  id: string;
  full_name: string;
  color: string | null;
}

/**
 * Fila CRUDA de la consulta (forma exacta de `APPOINTMENTS_SELECT`). Los embeds son
 * objeto-a-uno; se tipan como `| null` de forma defensiva por si RLS ocultara la fila
 * padre (no debería, al ir todo acotado por el mismo `salon_id`).
 */
export interface AppointmentRow {
  id: string;
  salon_id: string;
  customer_id: string;
  professional_id: string;
  service_id: string;
  starts_at: string;
  ends_at: string;
  status: AppointmentStatus;
  price_cents: number;
  currency: string;
  notes: string | null;
  customer: AppointmentCustomerRow | null;
  service: AppointmentServiceRow | null;
  professional: AppointmentProfessionalRow | null;
}

/** Modelo de vista normalizado (camelCase, embeds aplanados) que consume la UI. */
export interface AppointmentListItem {
  id: string;
  salonId: string;
  customerId: string;
  professionalId: string;
  serviceId: string;
  startsAt: string;
  endsAt: string;
  status: AppointmentStatus;
  priceCents: number;
  currency: string;
  notes: string | null;
  customer: { fullName: string; phone: string | null } | null;
  service: { id: string; name: string } | null;
  professional: { id: string; fullName: string; color: string | null } | null;
}

/** Mapea una fila cruda al modelo de vista. Puro y null-safe con los embeds. */
export function mapAppointmentRow(row: AppointmentRow): AppointmentListItem {
  return {
    id: row.id,
    salonId: row.salon_id,
    customerId: row.customer_id,
    professionalId: row.professional_id,
    serviceId: row.service_id,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    status: row.status,
    priceCents: row.price_cents,
    currency: row.currency,
    notes: row.notes ?? null,
    customer: row.customer
      ? { fullName: row.customer.full_name, phone: row.customer.phone ?? null }
      : null,
    service: row.service ? { id: row.service.id, name: row.service.name } : null,
    professional: row.professional
      ? {
          id: row.professional.id,
          fullName: row.professional.full_name,
          color: row.professional.color ?? null,
        }
      : null,
  };
}

/** Mapea un lote de filas crudas (tolera null/undefined ⇒ lista vacía). */
export function mapAppointmentRows(
  rows: AppointmentRow[] | null | undefined,
): AppointmentListItem[] {
  return (rows ?? []).map(mapAppointmentRow);
}

/**
 * Comparador por `starts_at` ASCENDENTE (con desempate estable por `id`). Compara por
 * instante (`Date`), no lexicográficamente, para ser robusto ante distintos offsets de
 * zona en las cadenas ISO.
 */
export function compareByStartsAt(a: AppointmentListItem, b: AppointmentListItem): number {
  const ta = new Date(a.startsAt).getTime();
  const tb = new Date(b.startsAt).getTime();
  if (ta !== tb) return ta - tb;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Ordena por `starts_at` ascendente devolviendo un ARRAY NUEVO (no muta la entrada). La
 * consulta ya pide `.order('starts_at')`; esto es la misma garantía en cliente, útil
 * tras una inserción optimista o al re-mezclar listas.
 */
export function sortByStartsAt(items: AppointmentListItem[]): AppointmentListItem[] {
  return [...items].sort(compareByStartsAt);
}
