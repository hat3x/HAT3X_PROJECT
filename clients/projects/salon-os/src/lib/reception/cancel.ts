/**
 * CANCELAR una cita del cliente — lógica de dominio de
 * `POST /api/reception/appointments/cancel`.
 *
 * El recepcionista IA (Retell + Twilio + n8n) recibe una llamada de alguien que quiere
 * ANULAR su cita. Ya reconoció a la persona por su teléfono (paso `identify`), así que
 * aquí solo aporta el `appointmentId` que quiere cancelar y el `phone` con el que llama.
 * Esta capa aplica la única regla dura del caso: **una cita solo la cancela su dueño**.
 *
 * ── Autorización a nivel de FILA (quién puede cancelar QUÉ) ─────────────────────────
 * La `x-api-key` autentica al SALÓN (lo hace el guard), pero NO dice de parte de qué
 * cliente actúa la llamada. Con el service_role se podría tocar cualquier cita del salón,
 * así que la pertenencia se comprueba A MANO y en un orden deliberado:
 *
 *   1. ¿Existe la cita en ESTE salón? Si no ⇒ `APPOINTMENT_NOT_FOUND` (404). Se comprueba
 *      ANTES que la pertenencia: si no hay cita, no tiene sentido preguntarse de quién es.
 *   2. ¿Es del cliente identificado por ese `phone`? Se resuelve la ficha por el teléfono
 *      canónico (igual que `identify`) y su `id` debe coincidir con `appointment.customer_id`.
 *      Si el teléfono no identifica a nadie, o identifica a OTRO cliente ⇒
 *      `NOT_YOUR_APPOINTMENT` (403). Nunca se cancela la cita de un tercero.
 *
 * Solo si ambas pasan se marca `status = 'cancelled'` (+ un `cancelled_reason` que deja
 * traza del canal). No hay guarda de transición de estado: el contrato de recepción no
 * define un código «no cancelable», y re-cancelar es idempotente, así que la operación
 * se aplica tal cual (la acota su propio `id` + `salon_id`).
 *
 * ── AISLAMIENTO multi-tenant (crítico) ─────────────────────────────────────────────
 * Petición máquina-a-máquina: NO hay `auth.uid()`, luego la RLS de miembro/self NO aplica.
 * Se usa el cliente ADMIN (service_role, omite RLS) —igual que `identify` y el guard— y por
 * eso CADA consulta (leer la cita, resolver la ficha por teléfono, escribir la cancelación)
 * se acota A MANO por el `salon_id` del guard. Es la ÚNICA barrera de tenant aquí.
 *
 * ── SERVER-ONLY ────────────────────────────────────────────────────────────────────
 * Depende de {@link createAdminClient} (SERVICE ROLE, exige `SUPABASE_SERVICE_ROLE_KEY`,
 * variable SIN `NEXT_PUBLIC_`). NUNCA importar desde código de cliente.
 */
import { normalizePhone } from "@/lib/customers/normalize-phone";
import { ReceptionError } from "@/lib/reception/errors";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AppointmentStatus } from "@/types/database";

/** Cliente Supabase con service_role (omite RLS). Ver `@/lib/supabase/admin`. */
type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * Motivo que se sella en `cancelled_reason` al cancelar por esta vía. Deja constancia
 * del CANAL (fue el propio cliente, por el recepcionista IA) para el histórico y los
 * informes, sin depender de un texto que el llamante pudiera inyectar (el cuerpo solo
 * trae `appointmentId` y `phone`). Se exporta para que los tests afirmen sobre él.
 */
export const RECEPTION_CANCELLED_REASON =
  "Cancelada por el cliente a través del recepcionista IA.";

// -----------------------------------------------------------------------------
// Forma de la respuesta (el contrato que consume la integración)
// -----------------------------------------------------------------------------

/**
 * La cita ya cancelada, aplanada para el recepcionista: lo justo para confirmar la
 * anulación de viva voz ("he cancelado tu {service} del {starts_at}"). Espeja los campos
 * de `UpcomingAppointment` (ver `@/lib/reception/identify`) y añade `cancelled_reason`,
 * que es el resultado propio de esta operación.
 */
export interface CancelledAppointment {
  id: string;
  /** Estado tras la operación: siempre `"cancelled"`. */
  status: AppointmentStatus;
  /** Instante de inicio en ISO-8601 UTC (`appointments.starts_at`). */
  starts_at: string;
  /**
   * Nombre del servicio. En la práctica SIEMPRE presente (la FK `service_id` es NOT
   * NULL), pero se tipa `string | null` por robustez ante un embed ausente.
   */
  service_name: string | null;
  /** Nombre del profesional. Misma garantía/robustez que `service_name`. */
  professional_name: string | null;
  /** Motivo sellado al cancelar (`appointments.cancelled_reason`). */
  cancelled_reason: string | null;
}

/** Dependencias INYECTABLES (tests deterministas). En producción se omiten. */
export interface CancelAppointmentDeps {
  /** Cliente admin (service_role). Por defecto `createAdminClient()` (real). */
  admin?: AdminClient;
}

// -----------------------------------------------------------------------------
// Helpers de lectura/escritura (cliente admin — SIEMPRE acotados por salon_id)
// -----------------------------------------------------------------------------

/**
 * Normaliza un embed to-one de PostgREST: llega como objeto (many-to-one), pero se
 * acepta también array/undefined por robustez ante variaciones de tipado. Devuelve el
 * único elemento o `null`. (Mismo criterio que `@/lib/reception/identify`.)
 */
function embeddedOne<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

/** Lo mínimo de la cita para decidir existencia y pertenencia antes de cancelar. */
interface AppointmentOwnership {
  id: string;
  customer_id: string;
}

/**
 * La cita `appointmentId` de ESTE salón, o `null` si no existe. Acota por `(salon_id,
 * id)` con el cliente admin: nunca se lee la cita de otro salón. Un fallo REAL de
 * consulta ⇒ `INTERNAL_ERROR` (500), sin filtrar la causa.
 */
async function findSalonAppointment(
  admin: AdminClient,
  salonId: string,
  appointmentId: string,
): Promise<AppointmentOwnership | null> {
  const { data, error } = await admin
    .from("appointments")
    .select("id, customer_id")
    .eq("salon_id", salonId)
    .eq("id", appointmentId)
    .maybeSingle();

  if (error !== null) {
    throw ReceptionError.internal(error, "No se pudo localizar la cita.");
  }
  if (data === null) return null;
  return { id: data.id, customer_id: data.customer_id };
}

/**
 * Id de la ficha del salón con ese teléfono canónico, o `null` si ninguna casa. Es la
 * MISMA identidad por teléfono que `identify`: acota por `(salon_id, phone_e164)` —el
 * índice único parcial "un teléfono = una ficha por salón"— con el cliente admin.
 * Un fallo REAL de consulta ⇒ `INTERNAL_ERROR` (500), sin filtrar la causa.
 */
async function findCustomerIdByPhoneE164(
  admin: AdminClient,
  salonId: string,
  phoneE164: string,
): Promise<string | null> {
  const { data, error } = await admin
    .from("customers")
    .select("id")
    .eq("salon_id", salonId)
    .eq("phone_e164", phoneE164)
    .maybeSingle();

  if (error !== null) {
    throw ReceptionError.internal(error, "No se pudo verificar la titularidad de la cita.");
  }
  return data?.id ?? null;
}

/** Fila cruda de la cita ya cancelada (embeds to-one de servicio/profesional). */
interface CancelledRow {
  id: string;
  starts_at: string;
  status: AppointmentStatus;
  cancelled_reason: string | null;
  service: { name: string } | { name: string }[] | null;
  professional: { full_name: string } | { full_name: string }[] | null;
}

/**
 * Marca la cita como cancelada y DEVUELVE su forma aplanada. Escribe `status` y
 * `cancelled_reason` acotando por `(salon_id, id)` —la cota de tenant y de fila— y
 * relee el resultado con los embeds. Como la pertenencia ya se verificó y `id` es la
 * PK, la escritura afecta exactamente a esa fila. Un fallo REAL ⇒ `INTERNAL_ERROR` (500).
 */
async function markAppointmentCancelled(
  admin: AdminClient,
  salonId: string,
  appointmentId: string,
): Promise<CancelledAppointment> {
  const { data, error } = await admin
    .from("appointments")
    .update({ status: "cancelled", cancelled_reason: RECEPTION_CANCELLED_REASON })
    .eq("salon_id", salonId)
    .eq("id", appointmentId)
    .select(
      "id, starts_at, status, cancelled_reason, service:services(name), professional:professionals(full_name)",
    )
    .single();

  if (error !== null || data === null) {
    throw ReceptionError.internal(error, "No se pudo cancelar la cita.");
  }

  const row = data as unknown as CancelledRow;
  return {
    id: row.id,
    status: row.status,
    starts_at: row.starts_at,
    service_name: embeddedOne(row.service)?.name ?? null,
    professional_name: embeddedOne(row.professional)?.full_name ?? null,
    cancelled_reason: row.cancelled_reason,
  };
}

// -----------------------------------------------------------------------------
// cancelAppointment — la anulación con control de pertenencia
// -----------------------------------------------------------------------------

/**
 * Cancela la cita `appointmentId` del `salonId` SOLO si pertenece al cliente
 * identificado por `phone`. Flujo:
 *   1. Localiza la cita por `(salon_id, id)`. Sin cita ⇒ `APPOINTMENT_NOT_FOUND` (404).
 *   2. Resuelve la ficha por `phone` (E.164 canónico) y exige que su `id` coincida con
 *      `appointment.customer_id`. Teléfono sin número real, sin ficha, o de OTRO
 *      cliente ⇒ `NOT_YOUR_APPOINTMENT` (403).
 *   3. Marca `status = 'cancelled'` + `cancelled_reason` y devuelve la cita cancelada.
 *
 * `salonId` DEBE ser el resuelto por el guard desde la `x-api-key` (de fiar). Todas las
 * lecturas y la escritura se acotan por él: es imposible tocar datos de otro salón.
 *
 * @throws {ReceptionError}
 *   · `APPOINTMENT_NOT_FOUND` (404) si no hay cita con ese id en el salón.
 *   · `NOT_YOUR_APPOINTMENT` (403) si la cita no es del cliente de ese teléfono.
 *   · `INTERNAL_ERROR` (500) ante un fallo real de consulta; la causa se guarda para el
 *     log y NUNCA se serializa al cliente.
 */
export async function cancelAppointment(
  salonId: string,
  appointmentId: string,
  phone: string,
  deps: CancelAppointmentDeps = {},
): Promise<CancelledAppointment> {
  const admin = deps.admin ?? createAdminClient();

  // 1) EXISTENCIA — sin cita en este salón, no hay nada que cancelar (404 antes que 403).
  const appointment = await findSalonAppointment(admin, salonId, appointmentId);
  if (appointment === null) {
    throw ReceptionError.appointmentNotFound();
  }

  // 2) PERTENENCIA — la cita debe ser del cliente identificado por ese teléfono.
  //    Un teléfono sin número real no identifica a nadie: no puede ser suya.
  const phoneE164 = normalizePhone(phone);
  if (phoneE164 === null) {
    throw ReceptionError.notYourAppointment();
  }
  const callerCustomerId = await findCustomerIdByPhoneE164(admin, salonId, phoneE164);
  if (callerCustomerId === null || callerCustomerId !== appointment.customer_id) {
    throw ReceptionError.notYourAppointment();
  }

  // 3) CANCELACIÓN — sella estado + motivo y devuelve la cita.
  return markAppointmentCancelled(admin, salonId, appointmentId);
}
