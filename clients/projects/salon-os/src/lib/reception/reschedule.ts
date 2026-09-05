/**
 * REPROGRAMAR (mover) una cita del cliente — lógica de dominio de
 * `POST /api/reception/appointments/reschedule`.
 *
 * El recepcionista IA (Retell + Twilio + n8n) recibe una llamada de alguien que quiere
 * CAMBIAR la hora (y opcionalmente el profesional) de su cita. Ya reconoció a la persona
 * por su teléfono (paso `identify`), así que aquí aporta el `appointmentId`, el `phone`
 * con el que llama, el `newStartsAt` deseado y, opcionalmente, `newProfessionalId`.
 * Esta capa aplica la única regla dura del caso —**una cita solo la mueve su dueño**— y
 * DELEGA el movimiento en el motor de reservas (que re-valida el hueco).
 *
 * ── Autorización a nivel de FILA (quién puede mover QUÉ) — idéntica a `cancel` ──────
 * La `x-api-key` autentica al SALÓN (lo hace el guard), pero NO dice de parte de qué
 * cliente actúa la llamada. Con el service_role se podría tocar cualquier cita del salón,
 * así que la pertenencia se comprueba A MANO y en un orden deliberado:
 *
 *   1. ¿Existe la cita en ESTE salón? Si no ⇒ `APPOINTMENT_NOT_FOUND` (404). Se comprueba
 *      ANTES que la pertenencia: si no hay cita, no tiene sentido preguntarse de quién es.
 *   2. ¿Es del cliente identificado por ese `phone`? Se resuelve la ficha por el teléfono
 *      canónico (igual que `identify`/`cancel`) y su `id` debe coincidir con
 *      `appointment.customer_id`. Teléfono sin número real, sin ficha, o de OTRO cliente
 *      ⇒ `NOT_YOUR_APPOINTMENT` (403). Nunca se mueve la cita de un tercero.
 *
 * Solo si ambas pasan se delega en {@link rescheduleBookingForSalon}, que recomputa la
 * disponibilidad del NUEVO hueco (excluyendo la propia cita para no auto-bloquearse) y,
 * si está libre, reescribe la agenda; si no ⇒ `SLOT_TAKEN` (409).
 *
 * ── Semántica de `newProfessionalId` (por qué es opcional Y admite "any") ───────────
 * Son tres estados DISTINTOS a propósito:
 *   · AUSENTE      → mantener el profesional ACTUAL de la cita (solo se mueve la hora).
 *   · `"any"`      → reasignar a CUALQUIER profesional disponible (lo elige el motor).
 *   · `<uuid>`     → mover a ESE profesional concreto.
 * El "ausente → actual" se resuelve AQUÍ (leemos `professional_id` de la cita) para que
 * el motor reciba siempre un destino concreto (`uuid | "any"`).
 *
 * ── AISLAMIENTO multi-tenant (crítico) ─────────────────────────────────────────────
 * Petición máquina-a-máquina: NO hay `auth.uid()`, luego la RLS de miembro/self NO aplica.
 * Se usa el cliente ADMIN (service_role, omite RLS) —igual que `identify`/`cancel` y el
 * motor— y por eso CADA consulta se acota A MANO por el `salon_id` del guard.
 *
 * ── SERVER-ONLY ────────────────────────────────────────────────────────────────────
 * Depende de {@link createAdminClient} (SERVICE ROLE) y del motor de reservas (que
 * también lo usa). NUNCA importar desde código de cliente.
 */
import { BookingError, rescheduleBookingForSalon } from "@/lib/booking/server";
import { normalizePhone } from "@/lib/customers/normalize-phone";
import { ReceptionError } from "@/lib/reception/errors";
import { createAdminClient } from "@/lib/supabase/admin";

/** Cliente Supabase con service_role (omite RLS). Ver `@/lib/supabase/admin`. */
type AdminClient = ReturnType<typeof createAdminClient>;

// -----------------------------------------------------------------------------
// Forma de la respuesta (el contrato que consume la integración)
// -----------------------------------------------------------------------------

/**
 * La cita ya movida, aplanada para el recepcionista: lo justo para confirmar el cambio
 * de viva voz ("he movido tu {service} al {starts_at} con {professional}"). Espeja el
 * MISMO vocabulario que la creación (`ReceptionCreatedAppointment`): `id` + `snake_case`,
 * para que la integración opere de punta a punta sin traducir entre formas.
 */
export interface RescheduledAppointment {
  /** Id de la cita movida (sin cambios: reprogramar no crea una cita nueva). */
  id: string;
  /** Nuevo inicio en ISO-8601 UTC (`appointments.starts_at`). */
  starts_at: string;
  /** Nuevo fin en ISO-8601 UTC (aplicación + exposición + post-exposición). */
  ends_at: string;
  /** Nombre del servicio (se mantiene: reprogramar cambia cuándo, no qué). */
  service_name: string;
  /** Nombre del profesional asignado tras el movimiento. */
  professional_name: string;
  /** Nombre del salón (el de la clave). */
  salon_name: string;
}

/** Dependencias INYECTABLES (tests deterministas). En producción se omiten. */
export interface RescheduleAppointmentDeps {
  /** Cliente admin (service_role). Por defecto `createAdminClient()` (real). */
  admin?: AdminClient;
  /** Motor de movimiento. Por defecto {@link rescheduleBookingForSalon} (real). */
  reschedule?: typeof rescheduleBookingForSalon;
}

// -----------------------------------------------------------------------------
// Helpers de lectura (cliente admin — SIEMPRE acotados por salon_id)
// -----------------------------------------------------------------------------

/** Lo mínimo de la cita para decidir existencia, pertenencia y destino por defecto. */
interface AppointmentContext {
  id: string;
  customer_id: string;
  service_id: string;
  professional_id: string;
}

/**
 * La cita `appointmentId` de ESTE salón, o `null` si no existe. Acota por `(salon_id,
 * id)` con el cliente admin: nunca se lee la cita de otro salón. Proyecta también
 * `service_id` (el motor lo necesita: reprogramar mantiene el servicio) y
 * `professional_id` (el destino por defecto si el cuerpo no trae `newProfessionalId`).
 * Un fallo REAL de consulta ⇒ `INTERNAL_ERROR` (500), sin filtrar la causa.
 */
async function findSalonAppointment(
  admin: AdminClient,
  salonId: string,
  appointmentId: string,
): Promise<AppointmentContext | null> {
  const { data, error } = await admin
    .from("appointments")
    .select("id, customer_id, service_id, professional_id")
    .eq("salon_id", salonId)
    .eq("id", appointmentId)
    .maybeSingle();

  if (error !== null) {
    throw ReceptionError.internal(error, "No se pudo localizar la cita.");
  }
  if (data === null) return null;
  return {
    id: data.id,
    customer_id: data.customer_id,
    service_id: data.service_id,
    professional_id: data.professional_id,
  };
}

/**
 * Id de la ficha del salón con ese teléfono canónico, o `null` si ninguna casa. Es la
 * MISMA identidad por teléfono que `identify`/`cancel`: acota por `(salon_id,
 * phone_e164)` —el índice único parcial "un teléfono = una ficha por salón"— con el
 * cliente admin. Un fallo REAL de consulta ⇒ `INTERNAL_ERROR` (500), sin filtrar la causa.
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

/**
 * Traduce un {@link BookingError} del motor de reservas al contrato de RECEPCIÓN. Al
 * mover una cita el motor solo lanza estas familias:
 *
 *   · 404 — el servicio de la cita ya no es reservable en el salón. Para el recepcionista
 *     eso es «no hay huecos para lo que pides» ⇒ `NO_AVAILABILITY` (409), cuyo copy invita
 *     a probar otra fecha/profesional (mismo criterio que la creación).
 *   · 409 — el nuevo hueco no está: bien porque el recomputo no lo incluye, bien porque el
 *     UPDATE chocó con la exclusion constraint anti-solape (carrera) ⇒ `SLOT_TAKEN`.
 *   · cualquier otra (500) ⇒ `INTERNAL_ERROR`, conservando la causa para el log del
 *     servidor, JAMÁS para el cliente.
 */
function bookingErrorToReception(error: unknown): ReceptionError {
  if (error instanceof BookingError) {
    switch (error.status) {
      case 404:
        return ReceptionError.noAvailability();
      case 409:
        return ReceptionError.slotTaken();
      default:
        return ReceptionError.internal(error);
    }
  }
  return ReceptionError.internal(error);
}

// -----------------------------------------------------------------------------
// rescheduleAppointment — el movimiento con control de pertenencia
// -----------------------------------------------------------------------------

/**
 * Mueve la cita `appointmentId` del `salonId` a `newStartsAt` (+ profesional destino)
 * SOLO si pertenece al cliente identificado por `phone`. Flujo:
 *   1. Localiza la cita por `(salon_id, id)`. Sin cita ⇒ `APPOINTMENT_NOT_FOUND` (404).
 *   2. Resuelve la ficha por `phone` (E.164 canónico) y exige que su `id` coincida con
 *      `appointment.customer_id`. Teléfono sin número real, sin ficha, o de OTRO
 *      cliente ⇒ `NOT_YOUR_APPOINTMENT` (403).
 *   3. Resuelve el destino de profesional (`newProfessionalId` ausente → el actual de la
 *      cita) y DELEGA en el motor, que re-valida el hueco y reescribe la agenda; los
 *      conflictos de agenda del motor se traducen (`NO_AVAILABILITY` / `SLOT_TAKEN`).
 *
 * `salonId` DEBE ser el resuelto por el guard desde la `x-api-key` (de fiar). Las
 * lecturas de pertenencia y el movimiento se acotan por él: imposible tocar otro salón.
 *
 * @param newProfessionalId `"any"` (reasignar), un uuid (profesional concreto) o
 *   `undefined` (mantener el profesional actual de la cita).
 * @throws {ReceptionError}
 *   · `APPOINTMENT_NOT_FOUND` (404) si no hay cita con ese id en el salón.
 *   · `NOT_YOUR_APPOINTMENT` (403) si la cita no es del cliente de ese teléfono.
 *   · `SLOT_TAKEN` (409) si el nuevo hueco no está libre.
 *   · `NO_AVAILABILITY` (409) si el servicio ya no es reservable.
 *   · `INTERNAL_ERROR` (500) ante un fallo real; la causa se guarda para el log y NUNCA
 *     se serializa al cliente.
 */
export async function rescheduleAppointment(
  salonId: string,
  appointmentId: string,
  phone: string,
  newStartsAt: string,
  newProfessionalId: string | "any" | undefined,
  deps: RescheduleAppointmentDeps = {},
): Promise<RescheduledAppointment> {
  const admin = deps.admin ?? createAdminClient();
  const reschedule = deps.reschedule ?? rescheduleBookingForSalon;

  // 1) EXISTENCIA — sin cita en este salón, no hay nada que mover (404 antes que 403).
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

  // 3) MOVER — `newProfessionalId` ausente ⇒ mantener el profesional actual de la cita.
  //    El motor recomputa la disponibilidad del hueco (excluyendo la propia cita) y
  //    reescribe la agenda; sus conflictos se traducen al contrato de recepción.
  const professionalId = newProfessionalId ?? appointment.professional_id;
  let confirmation;
  try {
    confirmation = await reschedule(salonId, {
      appointmentId,
      serviceId: appointment.service_id,
      startsAt: newStartsAt,
      professionalId,
    });
  } catch (error) {
    throw bookingErrorToReception(error);
  }

  return {
    id: confirmation.appointmentId,
    starts_at: confirmation.startsAt,
    ends_at: confirmation.endsAt,
    service_name: confirmation.serviceName,
    professional_name: confirmation.professionalName,
    salon_name: confirmation.salonName,
  };
}
