// Lógica PURA del asistente de reserva (elige servicio → profesional → fecha →
// hueco → confirma · Salón OS).
//
// Este módulo NO toca React, ni la red, ni `window`/`import.meta`: sólo transforma
// datos del catálogo público y arma el cuerpo del POST, para poder probarlo en
// aislamiento (ver booking.test.ts). Misma separación que salon.ts / appointments.ts:
//   · Parte PURA (aquí): filtrado de profesionales por servicio, agrupado del
//     catálogo, saneado/orden de los huecos que llegan del servidor y construcción
//     del `customer` del POST.
//   · Parte con EFECTOS (BookAppointment.tsx): react-query sobre la API pública
//     (bootstrap / availability / createBooking) y el estado de la UI.
//
// ── Regla de oro del modelo de 3 fases ──────────────────────────────────────────
// El SERVIDOR es dueño de horarios, duración, solapes, lead-time y zona horaria. El
// cliente NO recalcula disponibilidad: consume los `PublicSlot` TAL CUAL llegan del
// endpoint de availability. Aquí sólo los ORDENAMOS y DEDUPLICAMOS para pintarlos
// (presentación), nunca decidimos si un hueco es reservable.
import { SalonOsApiError } from '@/lib/salon-os-api';
import type {
  BookingBootstrap,
  BookingCustomerInput,
  PublicProfessional,
  PublicService,
  PublicSlot,
} from '@/lib/salon-os-api';

// ── Fecha local del salón (YYYY-MM-DD) ──────────────────────────────────────────

/**
 * Formatea una `Date` (el día elegido en el calendario) como `YYYY-MM-DD` usando sus
 * componentes LOCALES. Es lo que espera el endpoint de disponibilidad como `date`: el
 * día natural que el usuario tocó, sin desplazamientos de huso (`toISOString()` usaría
 * UTC y podría "saltar" de día). El servidor interpreta ese día en la zona del salón.
 */
export function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// ── Profesionales que prestan un servicio ───────────────────────────────────────

/**
 * Profesionales que prestan `serviceId`, en el ORDEN del catálogo (bootstrap). Cruza
 * `serviceProfessionals[serviceId]` (ids) con `professionals` (fichas). Ignora ids sin
 * ficha (catálogo incoherente) sin romper. Servicio desconocido → lista vacía.
 */
export function professionalsForService(
  bootstrap: BookingBootstrap,
  serviceId: string,
): PublicProfessional[] {
  const allowed = new Set(bootstrap.serviceProfessionals[serviceId] ?? []);
  if (allowed.size === 0) return [];
  return bootstrap.professionals.filter((p) => allowed.has(p.id));
}

/** Nombre de un profesional por id (o null si no está en el catálogo). */
export function professionalName(
  bootstrap: BookingBootstrap,
  professionalId: string | null | undefined,
): string | null {
  if (!professionalId) return null;
  return bootstrap.professionals.find((p) => p.id === professionalId)?.fullName ?? null;
}

// ── Catálogo agrupado por categoría (para el catálogo de servicios) ─────────────

/** Una categoría del catálogo con sus servicios, en orden de aparición. */
export interface ServiceGroup {
  /** Etiqueta de la categoría (o `fallbackLabel` para los servicios sin categoría). */
  category: string;
  services: PublicService[];
}

/**
 * Agrupa servicios por su campo `category`, preservando el orden en que aparecen (tanto
 * las categorías como los servicios dentro de cada una). Los servicios sin categoría
 * (`null`/vacía) se juntan bajo `fallbackLabel`, SIEMPRE en último lugar. No muta la
 * entrada. Salón OS dejó el catálogo plano (sin tabla de categorías): esta agrupación
 * es puramente de presentación, a partir del texto libre `category`.
 */
export function groupServicesByCategory(
  services: readonly PublicService[],
  fallbackLabel: string,
): ServiceGroup[] {
  const groups = new Map<string, PublicService[]>();
  let hasUncategorized = false;

  for (const service of services) {
    const raw = service.category?.trim();
    const key = raw && raw.length > 0 ? raw : fallbackLabel;
    if (key === fallbackLabel) hasUncategorized = true;
    const bucket = groups.get(key);
    if (bucket) bucket.push(service);
    else groups.set(key, [service]);
  }

  // Reordena para que "sin categoría" quede el último, conservando el resto del orden.
  const result: ServiceGroup[] = [];
  for (const [category, list] of groups) {
    if (category === fallbackLabel) continue;
    result.push({ category, services: list });
  }
  if (hasUncategorized) {
    result.push({ category: fallbackLabel, services: groups.get(fallbackLabel)! });
  }
  return result;
}

// ── Huecos del servidor: saneado de presentación (NO de disponibilidad) ─────────

/**
 * Prepara los `PublicSlot` del servidor para pintarlos: los ORDENA por `startsAt`
 * ascendente y DEDUPLICA por instante de inicio (quedándose con el primero de cada
 * `startsAt`). El dedup importa en modo "cualquier profesional": varios profesionales
 * libres a la misma hora producen huecos distintos con el MISMO `startsAt`; al usuario
 * le mostramos UNA hora y reservamos con el profesional de ese hueco.
 *
 * IMPORTANTE: esto es presentación, no disponibilidad. No inventa, filtra por reglas
 * de negocio ni recalcula duración: sólo ordena y quita duplicados visuales de lo que
 * el servidor ya declaró reservable.
 */
export function prepareSlots(slots: readonly PublicSlot[]): PublicSlot[] {
  const byStart = new Map<string, PublicSlot>();
  for (const slot of slots) {
    if (!byStart.has(slot.startsAt)) byStart.set(slot.startsAt, slot);
  }
  return Array.from(byStart.values()).sort((a, b) =>
    a.startsAt < b.startsAt ? -1 : a.startsAt > b.startsAt ? 1 : 0,
  );
}

// ── Cuerpo del POST: el bloque `customer` EXACTO ────────────────────────────────

/** Datos de contacto que la pantalla recoge/prellena para la reserva. */
export interface CustomerFormValues {
  fullName: string;
  phone: string;
  email?: string | null;
  notes?: string | null;
  marketingConsent?: boolean;
}

/** ¿Están los datos MÍNIMOS del cliente (nombre y teléfono, no vacíos)? */
export function isCustomerComplete(values: Pick<CustomerFormValues, 'fullName' | 'phone'>): boolean {
  return values.fullName.trim().length > 0 && values.phone.trim().length > 0;
}

/**
 * Construye el `customer` del POST con EXACTAMENTE los campos del contrato del servidor
 * (`{ fullName, phone, email?, notes?, marketingConsent? }`, `.strict()`):
 *   · `fullName` y `phone` obligatorios, recortados.
 *   · `email` y `notes` sólo si tienen contenido tras recortar (si no, se OMITEN: el
 *     servidor los normaliza; nunca mandamos "" salvo que el usuario lo escriba así).
 *   · `marketingConsent` sólo si se pasó explícitamente (booleano).
 * No añade ninguna clave de más (el servidor rechaza claves extra con 400).
 */
export function buildBookingCustomer(values: CustomerFormValues): BookingCustomerInput {
  const customer: BookingCustomerInput = {
    fullName: values.fullName.trim(),
    phone: values.phone.trim(),
  };
  const email = values.email?.trim();
  if (email) customer.email = email;
  const notes = values.notes?.trim();
  if (notes) customer.notes = notes;
  if (typeof values.marketingConsent === 'boolean') {
    customer.marketingConsent = values.marketingConsent;
  }
  return customer;
}

// ── Clasificación de errores (para mensajes legibles, sin romper la app) ─────────

/**
 * Caso de error del flujo de reserva, ya interpretado a algo que la UI sabe explicar.
 * El servidor es la fuente de verdad; aquí NO se decide nada de negocio: sólo se traduce
 * el `status` HTTP del `SalonOsApiError` (transporte) a una categoría estable para elegir
 * el mensaje y el comportamiento (p. ej. volver a huecos si el hueco ya se ocupó).
 *
 *   · `slotTaken`        409/410 · el hueco se ocupó entre verlo y confirmarlo (carrera).
 *   · `invalidData`      400/422 · el servidor rechazó los datos del cuerpo (validación).
 *   · `salonUnavailable` 403/404 · salón no encontrado / no disponible para reservar.
 *   · `network`          0       · la petición ni llegó: red caída / API inaccesible / CORS.
 *   · `server`           5xx     · el servicio de reservas falló al procesar.
 *   · `unknown`          resto   · cualquier otro caso (incluye errores no-API).
 */
export type BookingErrorKind =
  | 'slotTaken'
  | 'invalidData'
  | 'salonUnavailable'
  | 'network'
  | 'server'
  | 'unknown';

/**
 * Traduce un error cualquiera (lo que capture react-query) a un `BookingErrorKind`.
 * Sólo los `SalonOsApiError` (que llevan `status`) se clasifican por código; cualquier
 * otro valor cae en `unknown`. Función PURA: no toca red, i18n ni UI — el mapeo a texto
 * y a comportamiento vive en la pantalla (BookAppointment.tsx).
 */
export function classifyBookingError(error: unknown): BookingErrorKind {
  if (!(error instanceof SalonOsApiError)) return 'unknown';
  const { status } = error;
  if (status === 0) return 'network';
  if (status === 409 || status === 410) return 'slotTaken';
  if (status === 400 || status === 422) return 'invalidData';
  if (status === 403 || status === 404) return 'salonUnavailable';
  if (status >= 500) return 'server';
  return 'unknown';
}

/** ¿El hueco ya no está libre? (carrera entre ver y reservar → 409/410). */
export function isSlotTakenError(error: unknown): boolean {
  return classifyBookingError(error) === 'slotTaken';
}

// ── Prellenado de contacto desde la ficha SELF del cliente autenticado ──────────

/**
 * Subconjunto de la ficha (public.customers) que alimenta el prellenado de contacto.
 * Se acepta una forma laxa (campos opcionales/anulables) para no acoplar esta lógica
 * pura al tipo exacto que devuelva la capa de datos.
 */
export interface CustomerContactRecord {
  full_name?: string | null;
  /** Teléfono tal cual lo tecleó el cliente (sin normalizar). */
  phone?: string | null;
  /** Teléfono NORMALIZADO (E.164) que el servidor resolvió al crear/enlazar la ficha. */
  phone_e164?: string | null;
}

/** Valores de contacto listos para inyectar en los inputs controlados de la reserva. */
export interface ContactPrefill {
  fullName: string;
  phone: string;
}

/**
 * Deriva el nombre y el teléfono a PRECARGAR en la reserva desde la ficha SELF del
 * cliente (la que la app lee con RLS: `user_id = auth.uid()`). Devuelve SIEMPRE cadenas
 * (nunca `null`) para enchufarlas directas a inputs controlados.
 *
 * TELÉFONO — se PREFIERE la forma NORMALIZADA `phone_e164` sobre la cruda `phone`: es
 * el número canónico con el que el servidor YA identificó/enlazó la ficha («reutiliza la
 * ficha existente por teléfono normalizado, ya resuelto en servidor»). Precargarlo hace
 * que, al confirmar, la reserva se re-vincule a ESA misma ficha sin ambigüedad. Si la
 * ficha aún no tiene `phone_e164` (registro antiguo) o viene en blanco, cae al `phone`
 * crudo; sin ninguno de los dos → cadena vacía.
 *
 * NOMBRE — `full_name` recortado (o "" si viene vacío/nulo). Es NOT NULL en el esquema,
 * pero se trata a la defensiva. Ambos campos se RECORTAN: nunca se precargan espacios
 * sueltos que hagan pasar por completo un formulario que en realidad está vacío
 * (coherente con `isCustomerComplete`, que también recorta).
 */
export function customerContactPrefill(
  customer: CustomerContactRecord | null | undefined,
): ContactPrefill {
  if (!customer) return { fullName: '', phone: '' };
  const fullName = customer.full_name?.trim() ?? '';
  const phone = (customer.phone_e164?.trim() || customer.phone?.trim()) ?? '';
  return { fullName, phone };
}
