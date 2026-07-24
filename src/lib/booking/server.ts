/**
 * Lógica de servidor de la reserva pública. USO EXCLUSIVO DE SERVIDOR:
 * usa el cliente admin (service role) y por eso valida a mano que todo lo que
 * toca pertenezca al salón del `slug`.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import {
  generateSlots,
  generateDaySlots,
  mergeSlotsByProfessional,
  type AvailableSlot,
  type BusyInterval,
  type DaySlot,
  type GenerateSlotsInput,
} from "@/lib/booking/availability";
import { normalizeEmail, type CreateBookingInput } from "@/lib/booking/schema";
import { localDateInZone, zonedWallTimeToUtc } from "@/lib/booking/timezone";
import { normalizePhone } from "@/lib/customers/normalize-phone";
import type {
  BookingBootstrap,
  BookingConfirmation,
  PublicDaySlot,
  PublicSlot,
} from "@/lib/booking/types";

/** Error de dominio con código HTTP asociado, para respuestas homogéneas. */
export class BookingError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "BookingError";
  }
}

type AdminClient = ReturnType<typeof createAdminClient>;

interface SalonConfig {
  id: string;
  timezone: string;
  slotIntervalMinutes: number;
  minLeadMinutes: number;
}

/** Lee números opcionales de salons.settings sin romper el tipado. */
function readSettingNumber(
  settings: unknown,
  key: string,
  fallback: number,
): number {
  if (settings && typeof settings === "object" && key in settings) {
    const value = (settings as Record<string, unknown>)[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return fallback;
}

/** Carga un salón activo por slug o lanza BookingError 404. */
async function loadSalon(admin: AdminClient, slug: string): Promise<SalonConfig> {
  const { data, error } = await admin
    .from("salons")
    .select("id, timezone, settings, active")
    .eq("slug", slug)
    .maybeSingle();

  if (error) throw new BookingError(500, "Error al cargar el salón.");
  if (!data || !data.active) throw new BookingError(404, "Salón no encontrado.");

  return {
    id: data.id,
    timezone: data.timezone,
    slotIntervalMinutes: readSettingNumber(data.settings, "slot_interval_minutes", 15),
    minLeadMinutes: readSettingNumber(data.settings, "min_lead_minutes", 0),
  };
}

/**
 * Carga un salón activo por su `id` o lanza BookingError 404. Hermano de
 * {@link loadSalon} (que resuelve por `slug`): idéntica proyección y validación de
 * `active`, pero acotando por la clave primaria. Lo usa la disponibilidad de
 * RECEPCIÓN, que ya conoce el `salon_id` (viene de la clave `x-api-key`) y no un slug.
 */
async function loadSalonById(admin: AdminClient, salonId: string): Promise<SalonConfig> {
  const { data, error } = await admin
    .from("salons")
    .select("id, timezone, settings, active")
    .eq("id", salonId)
    .maybeSingle();

  if (error) throw new BookingError(500, "Error al cargar el salón.");
  if (!data || !data.active) throw new BookingError(404, "Salón no encontrado.");

  return {
    id: data.id,
    timezone: data.timezone,
    slotIntervalMinutes: readSettingNumber(data.settings, "slot_interval_minutes", 15),
    minLeadMinutes: readSettingNumber(data.settings, "min_lead_minutes", 0),
  };
}

/** Límites UTC [inicio, fin) del día local del salón. */
function dayBoundsUtc(date: string, timeZone: string): { startIso: string; endIso: string } {
  const start = zonedWallTimeToUtc(date, "00:00", timeZone);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

// -----------------------------------------------------------------------------
// Bootstrap: salón + catálogo activo + mapa servicio→profesionales
// -----------------------------------------------------------------------------
export async function getBootstrap(slug: string): Promise<BookingBootstrap> {
  const admin = createAdminClient();

  const { data: salon, error: salonError } = await admin
    .from("salons")
    .select("id, name, slug, timezone, phone, address, active")
    .eq("slug", slug)
    .maybeSingle();

  if (salonError) throw new BookingError(500, "Error al cargar el salón.");
  if (!salon || !salon.active) throw new BookingError(404, "Salón no encontrado.");

  const [servicesRes, professionalsRes, linksRes] = await Promise.all([
    admin
      .from("services")
      .select("id, name, description, category, duration_minutes, price_cents, currency")
      .eq("salon_id", salon.id)
      .eq("active", true)
      .order("category", { ascending: true })
      .order("name", { ascending: true }),
    admin
      .from("professionals")
      .select("id, full_name, color")
      .eq("salon_id", salon.id)
      .eq("active", true)
      .order("full_name", { ascending: true }),
    admin
      .from("professional_services")
      .select("service_id, professional_id")
      .eq("salon_id", salon.id),
  ]);

  if (servicesRes.error || professionalsRes.error || linksRes.error) {
    throw new BookingError(500, "Error al cargar el catálogo.");
  }

  const activeProfessionalIds = new Set(
    (professionalsRes.data ?? []).map((p) => p.id),
  );

  const serviceProfessionals: Record<string, string[]> = {};
  for (const link of linksRes.data ?? []) {
    if (!activeProfessionalIds.has(link.professional_id)) continue;
    (serviceProfessionals[link.service_id] ??= []).push(link.professional_id);
  }

  return {
    salon: {
      id: salon.id,
      name: salon.name,
      slug: salon.slug,
      timezone: salon.timezone,
      phone: salon.phone,
      address: salon.address,
    },
    services: (servicesRes.data ?? []).map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      category: s.category,
      durationMinutes: s.duration_minutes,
      priceCents: s.price_cents,
      currency: s.currency,
    })),
    professionals: (professionalsRes.data ?? []).map((p) => ({
      id: p.id,
      fullName: p.full_name,
      color: p.color,
    })),
    serviceProfessionals,
  };
}

// -----------------------------------------------------------------------------
// Disponibilidad
// -----------------------------------------------------------------------------

/** Profesionales activos que prestan el servicio (opcionalmente filtrado a uno). */
async function resolveProfessionals(
  admin: AdminClient,
  salonId: string,
  serviceId: string,
  professionalId: string | undefined,
): Promise<string[]> {
  const { data, error } = await admin
    .from("professional_services")
    .select("professional_id, professionals!inner(active)")
    .eq("salon_id", salonId)
    .eq("service_id", serviceId);

  if (error) throw new BookingError(500, "Error al cargar profesionales.");

  const offering = (data ?? [])
    .filter((row) => {
      const prof = row.professionals as unknown as { active: boolean } | null;
      return prof?.active === true;
    })
    .map((row) => row.professional_id);

  if (professionalId) {
    return offering.includes(professionalId) ? [professionalId] : [];
  }
  return offering;
}

/**
 * Convierte el literal tstzrange devuelto por PostgreSQL a un BusyInterval.
 * Formato típico: ["2026-01-01 10:00:00+00","2026-01-01 10:15:00+00")
 */
function parseTstzRange(range: string): BusyInterval {
  const inner = range.slice(1, range.length - 1); // quitar '[' y ')'
  const commaIdx = inner.indexOf(",");
  const rawLower = inner.slice(0, commaIdx).trim().replace(/^"|"$/g, "");
  const rawUpper = inner.slice(commaIdx + 1).trim().replace(/^"|"$/g, "");
  // "2026-01-01 10:00:00+00" → "2026-01-01T10:00:00+00:00" (ISO 8601 estricto)
  const normalize = (ts: string) =>
    ts.replace(" ", "T").replace(/\+00$/, "+00:00");
  return { starts_at: normalize(rawLower), ends_at: normalize(rawUpper) };
}

/**
 * Carga los INPUTS de disponibilidad de un profesional para un día (horario, excepción y
 * bloques ocupados) ya en la forma que consume el motor puro ({@link GenerateSlotsInput}).
 *
 * FUENTE ÚNICA de datos para las dos vistas del endpoint: la de huecos libres
 * (`generateSlots`) y la de rejilla completa (`generateDaySlots`) parten EXACTAMENTE de
 * los mismos inputs, así que sus resultados no pueden divergir tampoco en la capa de datos
 * (además del invariante del motor puro, sub-1).
 *
 * Si se pasa `excludeAppointmentId`, los bloques de ESA cita NO cuentan como ocupados: es
 * lo que permite MOVER una cita a un hueco que solapa su posición actual sin que se
 * auto-bloquee (ver {@link rescheduleBookingForSalon}). Omitido ⇒ toda ocupación bloquea.
 */
async function loadProfessionalDayInputs(
  admin: AdminClient,
  salon: SalonConfig,
  professionalId: string,
  applicationMin: number,
  exposureMin: number,
  postExposureMin: number,
  date: string,
  excludeAppointmentId?: string,
): Promise<GenerateSlotsInput> {
  const { startIso, endIso } = dayBoundsUtc(date, salon.timezone);

  // Solo bloques físicos de ocupación del profesional (application + post_exposure).
  // El tramo de exposure de otras citas NO aparece aquí y por tanto no bloquea.
  let blocksQuery = admin
    .from("appointment_blocks")
    .select("occupied_range")
    .eq("salon_id", salon.id)
    .eq("professional_id", professionalId)
    .filter("occupied_range", "ov", `["${startIso}","${endIso}")`);
  // Al reprogramar, la PROPIA cita no debe contarse a sí misma como ocupación.
  if (excludeAppointmentId) {
    blocksQuery = blocksQuery.neq("appointment_id", excludeAppointmentId);
  }

  const [schedulesRes, exceptionRes, blocksRes] = await Promise.all([
    admin
      .from("professional_schedules")
      .select("weekday, start_time, end_time")
      .eq("salon_id", salon.id)
      .eq("professional_id", professionalId),
    admin
      .from("schedule_exceptions")
      .select("is_available, start_time, end_time")
      .eq("salon_id", salon.id)
      .eq("professional_id", professionalId)
      .eq("exception_date", date)
      .maybeSingle(),
    blocksQuery,
  ]);

  if (schedulesRes.error || blocksRes.error) {
    throw new BookingError(500, "Error al cargar la disponibilidad.");
  }

  const busy: BusyInterval[] = (blocksRes.data ?? []).map((b) =>
    parseTstzRange(b.occupied_range),
  );

  // Duración de bloqueo efectivo: solo las fases activas que generan bloques.
  const blockingMin = applicationMin + postExposureMin;
  // Duración total: encaje en horario laboral y endsAt del hueco devuelto al cliente.
  const totalMin = applicationMin + exposureMin + postExposureMin;

  return {
    date,
    timeZone: salon.timezone,
    serviceDurationMinutes: blockingMin,
    appointmentDurationMinutes: totalMin,
    schedules: schedulesRes.data ?? [],
    exception: exceptionRes.data ?? null,
    busy,
    slotIntervalMinutes: salon.slotIntervalMinutes,
    minLeadMinutes: salon.minLeadMinutes,
  };
}

/**
 * Huecos LIBRES de un profesional para un día (vista por defecto del endpoint). Delega en
 * {@link loadProfessionalDayInputs} + `generateSlots`. `excludeAppointmentId` se propaga
 * para la reprogramación (ver {@link rescheduleBookingForSalon}).
 */
async function slotsForProfessional(
  admin: AdminClient,
  salon: SalonConfig,
  professionalId: string,
  applicationMin: number,
  exposureMin: number,
  postExposureMin: number,
  date: string,
  excludeAppointmentId?: string,
): Promise<AvailableSlot[]> {
  const input = await loadProfessionalDayInputs(
    admin,
    salon,
    professionalId,
    applicationMin,
    exposureMin,
    postExposureMin,
    date,
    excludeAppointmentId,
  );
  return generateSlots(input);
}

/**
 * Rejilla COMPLETA de la jornada de un profesional para un día (vista `view=day`): TODOS
 * los pasos del horario etiquetados con `available` + `reason`. Delega en
 * {@link loadProfessionalDayInputs} + `generateDaySlots`, los MISMOS inputs que la vista
 * de libres, de modo que sus `available: true` coinciden con `generateSlots` (invariante
 * sub-1). No admite `excludeAppointmentId`: la rejilla es para pintar la agenda, no para
 * reprogramar.
 */
async function daySlotsForProfessional(
  admin: AdminClient,
  salon: SalonConfig,
  professionalId: string,
  applicationMin: number,
  exposureMin: number,
  postExposureMin: number,
  date: string,
): Promise<DaySlot[]> {
  const input = await loadProfessionalDayInputs(
    admin,
    salon,
    professionalId,
    applicationMin,
    exposureMin,
    postExposureMin,
    date,
  );
  return generateDaySlots(input);
}

/**
 * NÚCLEO de disponibilidad, ya RESUELTO el salón. Lo COMPARTEN los dos puntos de
 * entrada —{@link getAvailability} (por slug, reserva pública) y
 * {@link getAvailabilityForSalon} (por id, recepción)—: ambos cargan las fases del
 * servicio, resuelven los profesionales que lo prestan y generan los MISMOS huecos
 * vía `slotsForProfessional` → `generateSlots`. Al ser una única función, el
 * cálculo es idéntico en los dos flujos por construcción (no hay dos copias que
 * puedan divergir), y todo queda ACOTADO por `salon.id` (aislamiento a mano, como
 * exige el cliente admin que omite RLS).
 */
async function availabilityForSalonConfig(
  admin: AdminClient,
  salon: SalonConfig,
  serviceId: string,
  date: string,
  professionalId: string | undefined,
  excludeAppointmentId?: string,
): Promise<PublicSlot[]> {
  const { data: service, error: serviceError } = await admin
    .from("services")
    .select("application_min, exposure_min, post_exposure_min, active")
    .eq("salon_id", salon.id)
    .eq("id", serviceId)
    .maybeSingle();

  if (serviceError) throw new BookingError(500, "Error al cargar el servicio.");
  if (!service || !service.active) throw new BookingError(404, "Servicio no disponible.");

  const professionalIds = await resolveProfessionals(
    admin,
    salon.id,
    serviceId,
    professionalId,
  );
  if (professionalIds.length === 0) return [];

  const perProfessional = await Promise.all(
    professionalIds.map(async (id) => ({
      professionalId: id,
      slots: await slotsForProfessional(
        admin,
        salon,
        id,
        service.application_min,
        service.exposure_min,
        service.post_exposure_min,
        date,
        excludeAppointmentId,
      ),
    })),
  );

  // Profesional concreto → sus huecos; "cualquiera" → unión por instante.
  if (professionalId) {
    const entry = perProfessional[0];
    return (entry?.slots ?? []).map((s) => ({ ...s, professionalId }));
  }
  return mergeSlotsByProfessional(perProfessional);
}

export async function getAvailability(
  slug: string,
  serviceId: string,
  date: string,
  professionalId: string | undefined,
): Promise<PublicSlot[]> {
  const admin = createAdminClient();
  const salon = await loadSalon(admin, slug);
  return availabilityForSalonConfig(admin, salon, serviceId, date, professionalId);
}

/**
 * NÚCLEO de la vista de REJILLA (`view=day`), ya RESUELTO el salón. Hermano de
 * {@link availabilityForSalonConfig} pero, en lugar de los huecos libres de todos los
 * profesionales, devuelve la jornada COMPLETA de UN profesional concreto (con `available`
 * + `reason` por slot), que es lo que pinta su columna de agenda.
 *
 * Reutiliza la MISMA resolución de servicio y el MISMO filtro «¿este profesional presta el
 * servicio y está activo?» que la vista de libres ({@link resolveProfessionals}), y el
 * mismo motor de datos ({@link daySlotsForProfessional}). Si el profesional no presta el
 * servicio, la rejilla es vacía (no hay columna que pintar). Todo ACOTADO por `salon.id`.
 */
async function dayAvailabilityForSalonConfig(
  admin: AdminClient,
  salon: SalonConfig,
  serviceId: string,
  date: string,
  professionalId: string,
): Promise<PublicDaySlot[]> {
  const { data: service, error: serviceError } = await admin
    .from("services")
    .select("application_min, exposure_min, post_exposure_min, active")
    .eq("salon_id", salon.id)
    .eq("id", serviceId)
    .maybeSingle();

  if (serviceError) throw new BookingError(500, "Error al cargar el servicio.");
  if (!service || !service.active) throw new BookingError(404, "Servicio no disponible.");

  // [] ⇒ el profesional no presta el servicio (o no está activo) ⇒ rejilla vacía.
  const professionalIds = await resolveProfessionals(
    admin,
    salon.id,
    serviceId,
    professionalId,
  );
  if (professionalIds.length === 0) return [];

  const grid = await daySlotsForProfessional(
    admin,
    salon,
    professionalId,
    service.application_min,
    service.exposure_min,
    service.post_exposure_min,
    date,
  );
  return grid.map((slot) => ({ ...slot, professionalId }));
}

/**
 * Rejilla diaria (vista `view=day`) de la reserva pública, entrando por `slug`. Espejo de
 * {@link getAvailability} pero para la jornada COMPLETA de un profesional concreto. El
 * `professionalId` es OBLIGATORIO —la rejilla es per-profesional; el schema del endpoint
 * lo exige con un 400 si falta—, por eso su tipo NO admite `undefined`.
 */
export async function getDayAvailability(
  slug: string,
  serviceId: string,
  date: string,
  professionalId: string,
): Promise<PublicDaySlot[]> {
  const admin = createAdminClient();
  const salon = await loadSalon(admin, slug);
  return dayAvailabilityForSalonConfig(admin, salon, serviceId, date, professionalId);
}

/**
 * Disponibilidad ACOTADA por `salonId` (no por slug). Es EXACTAMENTE el mismo motor
 * que la reserva pública —resuelve el salón, carga las fases del servicio y genera
 * los huecos con `generateSlots`— pero entra por el id del salón: el que la
 * RECEPCIÓN (`GET /api/reception/availability`) obtiene de su clave de servicio
 * (`x-api-key`), ya validada por el guard. Comparte `availabilityForSalonConfig`
 * con {@link getAvailability}, así que devuelve los MISMOS huecos que vería la
 * reserva pública para ese salón; no recalcula disponibilidad a mano.
 */
export async function getAvailabilityForSalon(
  salonId: string,
  serviceId: string,
  date: string,
  professionalId: string | undefined,
): Promise<PublicSlot[]> {
  const admin = createAdminClient();
  const salon = await loadSalonById(admin, salonId);
  return availabilityForSalonConfig(admin, salon, serviceId, date, professionalId);
}

// -----------------------------------------------------------------------------
// Creación de reserva
// -----------------------------------------------------------------------------

/**
 * Ficha del salón cuyo teléfono canónico (E.164) coincide, o `null`. Consulta el
 * índice único parcial `(salon_id, phone_e164)` — la clave de dedup por teléfono —
 * SIEMPRE acotada por `salon_id` (el cliente admin omite RLS: aislamiento a mano).
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
  if (error) throw new BookingError(500, "Error al buscar el cliente por teléfono.");
  return data?.id ?? null;
}

/**
 * Resuelve la ficha existente de la persona: primero por TELÉFONO (clave natural
 * de identidad, FASE 3) y, si no hay, por email (índice único `(salon_id, email)`,
 * para no chocar con él al insertar). Acotado siempre por `salon_id`.
 */
async function findExistingCustomerId(
  admin: AdminClient,
  salonId: string,
  phoneE164: string,
  email: string | null,
): Promise<string | null> {
  const byPhone = await findCustomerIdByPhoneE164(admin, salonId, phoneE164);
  if (byPhone) return byPhone;

  if (email) {
    const { data, error } = await admin
      .from("customers")
      .select("id")
      .eq("salon_id", salonId)
      .eq("email", email)
      .maybeSingle();
    if (error) throw new BookingError(500, "Error al buscar el cliente por email.");
    if (data) return data.id;
  }
  return null;
}

/**
 * Resuelve la ficha del cliente de la reserva por su TELÉFONO —identidad por
 * teléfono (FASE 3)— dentro del salón, reutilizándola si ya existe o creándola.
 *
 * El teléfono es la CLAVE NATURAL: se canonicaliza a E.164 con `normalizePhone`
 * (espejo exacto de la función SQL `app.normalize_phone` que alimenta la columna
 * GENERADA `customers.phone_e164`) y se busca por `phone_e164` SIEMPRE acotado por
 * `salon_id` (índice único parcial `(salon_id, phone_e164)`). Si la ficha ya
 * existe, se REUTILIZA tal cual: nunca se pisa su `user_id` (enlace con la cuenta
 * de la app de cliente) ni su nombre. Si no existe, se crea.
 *
 * El teléfono es obligatorio en la reserva pública. Si no contiene un número real
 * (no normaliza), se rechaza con un error de validación claro (400) en vez de
 * crear una ficha con `phone_e164` NULL que quedaría fuera del dedup por teléfono.
 */
async function findOrCreateCustomer(
  admin: AdminClient,
  salonId: string,
  customer: CreateBookingInput["customer"],
): Promise<string> {
  const email = normalizeEmail(customer.email);
  const phone = customer.phone.trim();
  const phoneE164 = normalizePhone(phone);

  // Sin número real no hay clave de identidad por teléfono: rechazo claro (400),
  // no una ficha con phone_e164 NULL que rompería el dedup.
  if (phoneE164 === null) {
    throw new BookingError(400, "El teléfono no es válido. Revísalo e inténtalo de nuevo.");
  }

  // ¿Ya existe la persona (por teléfono, o por email) en ESTE salón? Reutilizar.
  const existingId = await findExistingCustomerId(admin, salonId, phoneE164, email);
  if (existingId) return existingId;

  const { data: created, error } = await admin
    .from("customers")
    .insert({
      salon_id: salonId,
      full_name: customer.fullName.trim(),
      email,
      phone,
      marketing_consent: customer.marketingConsent ?? false,
    })
    .select("id")
    .single();

  if (error === null && created !== null) return created.id;

  // Carrera (p. ej. doble envío del formulario): entre la re-lectura previa y este
  // INSERT, otra petición creó la ficha y el índice único parcial `(salon_id,
  // phone_e164)` —o `(salon_id, email)`— rechazó la segunda inserción con `23505`.
  // RE-RESOLVEMOS por teléfono (clave natural) acotado al salón —y, si no, por
  // email— y REUTILIZAMOS la ficha ganadora en lugar de propagar un 500 espurio.
  // Mismo criterio que `linkOrCreateCustomerAccount` (@/lib/customers/account) para
  // el `23505`. Si aun así no se re-resuelve, el error es real: se propaga (500).
  if (error !== null && error.code === "23505") {
    const raced = await findExistingCustomerId(admin, salonId, phoneE164, email);
    if (raced) return raced;
  }

  throw new BookingError(500, "No se pudo registrar el cliente.");
}

/**
 * NÚCLEO de creación de reserva, ya RESUELTO el salón (config) y con el cliente admin.
 * Lo COMPARTEN los dos puntos de entrada —{@link createBooking} (por slug, reserva
 * pública) y {@link createBookingForSalon} (por id, recepción)—: ambos recalculan la
 * disponibilidad EN EL SERVIDOR con `availabilityForSalonConfig` (nunca fían del hueco
 * enviado por el cliente), resuelven/crean la ficha por TELÉFONO normalizado (un cliente
 * = una ficha, sub-1) e insertan la cita en estado `pending`. Al ser una única función,
 * los dos flujos crean la cita de forma IDÉNTICA por construcción (no hay dos copias que
 * puedan divergir) y todo queda ACOTADO por `salon.id` (aislamiento a mano, como exige el
 * cliente admin que omite RLS).
 */
async function createBookingForSalonConfig(
  admin: AdminClient,
  salon: SalonConfig,
  input: CreateBookingInput,
): Promise<BookingConfirmation> {
  const { data: salonMeta } = await admin
    .from("salons")
    .select("name")
    .eq("id", salon.id)
    .single();

  const { data: service, error: serviceError } = await admin
    .from("services")
    .select(
      "id, name, application_min, exposure_min, post_exposure_min, price_cents, currency, active",
    )
    .eq("salon_id", salon.id)
    .eq("id", input.serviceId)
    .maybeSingle();

  if (serviceError) throw new BookingError(500, "Error al cargar el servicio.");
  if (!service || !service.active) throw new BookingError(404, "Servicio no disponible.");

  // Fecha local del salón para el instante elegido.
  const date = localDateInZone(salon.timezone, new Date(input.startsAt));
  const wantedProfessional =
    input.professionalId === "any" ? undefined : input.professionalId;

  // Recalcular disponibilidad en el servidor con el MISMO motor (mismo admin+salón, sin
  // re-resolver el salón): nunca confiar en el hueco enviado por el cliente.
  const slots = await availabilityForSalonConfig(
    admin,
    salon,
    input.serviceId,
    date,
    wantedProfessional,
  );
  const match = slots.find((s) => s.startsAt === input.startsAt);
  if (!match) {
    throw new BookingError(409, "Ese horario ya no está disponible. Elige otro.");
  }

  const professionalId = match.professionalId;

  // ends_at cubre la cita completa: aplicación + exposición + post-exposición.
  // Coincide con `match.endsAt` (el motor de disponibilidad usa el mismo total),
  // pero lo derivamos aquí explícitamente de las fases del servicio para no
  // depender de la forma del hueco. El trigger sync_appointment_blocks calcula
  // los rangos de bloqueo por fase a partir del servicio, no de este ends_at.
  const totalMinutes =
    service.application_min + service.exposure_min + service.post_exposure_min;
  const endsAt = new Date(
    new Date(input.startsAt).getTime() + totalMinutes * 60_000,
  ).toISOString();

  const customerId = await findOrCreateCustomer(admin, salon.id, input.customer);

  const { data: appointment, error: insertError } = await admin
    .from("appointments")
    .insert({
      salon_id: salon.id,
      customer_id: customerId,
      professional_id: professionalId,
      service_id: service.id,
      status: "pending",
      starts_at: input.startsAt,
      ends_at: endsAt,
      price_cents: service.price_cents,
      currency: service.currency,
      notes: input.customer.notes?.trim() || null,
    })
    .select("id, starts_at, ends_at")
    .single();

  if (insertError) {
    // Violación de la exclusion constraint anti-solape: alguien reservó antes.
    if (insertError.code === "23P01") {
      throw new BookingError(409, "Ese horario acaba de ocuparse. Elige otro.");
    }
    throw new BookingError(500, "No se pudo crear la reserva.");
  }

  const { data: professional } = await admin
    .from("professionals")
    .select("full_name")
    .eq("id", professionalId)
    .single();

  return {
    appointmentId: appointment.id,
    startsAt: appointment.starts_at,
    endsAt: appointment.ends_at,
    professionalName: professional?.full_name ?? "",
    serviceName: service.name,
    salonName: salonMeta?.name ?? "",
  };
}

/**
 * Crea la reserva pública entrando por `slug`. Resuelve el salón por slug y delega en
 * {@link createBookingForSalonConfig} (el núcleo compartido con la recepción).
 */
export async function createBooking(
  slug: string,
  input: CreateBookingInput,
): Promise<BookingConfirmation> {
  const admin = createAdminClient();
  const salon = await loadSalon(admin, slug);
  return createBookingForSalonConfig(admin, salon, input);
}

/**
 * Creación de reserva ACOTADA por `salonId` (no por slug). Es EXACTAMENTE el mismo motor
 * que la reserva pública —recalcula disponibilidad en el servidor, resuelve/crea la ficha
 * por TELÉFONO normalizado (un cliente = una ficha) e inserta la cita `pending`— pero
 * entra por el id del salón: el que la RECEPCIÓN (`POST /api/reception/appointments`)
 * obtiene de su clave de servicio (`x-api-key`), ya validada por el guard. Comparte
 * {@link createBookingForSalonConfig} con {@link createBooking}, así que crea la cita
 * igual que la reserva pública para ese salón; no reimplementa la reserva a mano. Al
 * reutilizar el dedup por teléfono (FASE 3), reservar por recepción con un teléfono ya
 * conocido REUTILIZA su ficha en vez de duplicarla.
 */
export async function createBookingForSalon(
  salonId: string,
  input: CreateBookingInput,
): Promise<BookingConfirmation> {
  const admin = createAdminClient();
  const salon = await loadSalonById(admin, salonId);
  return createBookingForSalonConfig(admin, salon, input);
}

// -----------------------------------------------------------------------------
// Reprogramación (mover) de una cita existente
// -----------------------------------------------------------------------------

/** Datos para MOVER una cita existente a otro hueco (y opcionalmente otro profesional). */
export interface RescheduleBookingInput {
  /** PK de la cita a mover. Su PERTENENCIA la verifica quien llama (recepción). */
  appointmentId: string;
  /**
   * Servicio de la cita (se mantiene al mover: reprogramar cambia CUÁNDO, no QUÉ). Lo
   * aporta el llamante desde la propia cita; el servidor lo re-acota por `salon_id`.
   */
  serviceId: string;
  /** Nuevo inicio elegido (instante UTC en ISO con offset). */
  startsAt: string;
  /**
   * Profesional destino: un uuid concreto (mismo o distinto) o `"any"` para que el
   * servidor asigne uno disponible. La recepción resuelve el "mantener el actual"
   * (cuerpo sin `newProfessionalId`) a su uuid ANTES de llegar aquí.
   */
  professionalId: string | "any";
}

/**
 * MUEVE la cita `appointmentId` del `salonId` a `startsAt` (+ profesional destino),
 * REUTILIZANDO el motor de disponibilidad. Es la operación gemela de
 * {@link createBookingForSalon} pero sobre una cita YA existente: no crea ni resuelve
 * ficha de cliente (la cita ya tiene la suya), solo re-valida el hueco y reescribe la
 * agenda. Flujo:
 *
 *   1. Resuelve el salón por id y carga el servicio (fases + nombre, acotado por salón).
 *   2. Recalcula disponibilidad EN EL SERVIDOR con `availabilityForSalonConfig`, pero
 *      EXCLUYENDO los bloques de la PROPIA cita (`excludeAppointmentId`): así un hueco
 *      que solapa su posición actual no la marca como ocupada (no se auto-bloquea).
 *      Nunca se fía del hueco enviado por el cliente.
 *   3. Exige que `startsAt` esté ENTRE los huecos libres; si no ⇒ `BookingError(409)`.
 *   4. Reescribe `starts_at` / `ends_at` / `professional_id` acotando por `(salon_id,
 *      id)`. El trigger `sync_appointment_blocks` regenera los bloques; si el nuevo
 *      hueco lo ocupó otra reserva entre el recomputo y el UPDATE, la exclusion
 *      constraint anti-solape lo rechaza (`23P01`) ⇒ `BookingError(409)`.
 *
 * `salonId` DEBE ser el de fiar (de la `x-api-key`, resuelto por el guard de recepción).
 * TODA lectura/escritura se acota por él: es imposible tocar la cita de otro salón.
 *
 * @throws {BookingError}
 *   · 404 si el servicio de la cita ya no es reservable en el salón.
 *   · 409 si el nuevo hueco no está libre (recomputo o carrera anti-solape).
 *   · 500 ante un fallo real de consulta/escritura.
 */
export async function rescheduleBookingForSalon(
  salonId: string,
  input: RescheduleBookingInput,
): Promise<BookingConfirmation> {
  const admin = createAdminClient();
  const salon = await loadSalonById(admin, salonId);

  const { data: salonMeta } = await admin
    .from("salons")
    .select("name")
    .eq("id", salon.id)
    .single();

  const { data: service, error: serviceError } = await admin
    .from("services")
    .select("id, name, application_min, exposure_min, post_exposure_min, active")
    .eq("salon_id", salon.id)
    .eq("id", input.serviceId)
    .maybeSingle();

  if (serviceError) throw new BookingError(500, "Error al cargar el servicio.");
  if (!service || !service.active) throw new BookingError(404, "Servicio no disponible.");

  const date = localDateInZone(salon.timezone, new Date(input.startsAt));
  const wantedProfessional =
    input.professionalId === "any" ? undefined : input.professionalId;

  // Recomputar disponibilidad con el MISMO motor, EXCLUYENDO la propia cita para que no
  // se bloquee a sí misma al moverse a un hueco solapado con su posición actual.
  const slots = await availabilityForSalonConfig(
    admin,
    salon,
    input.serviceId,
    date,
    wantedProfessional,
    input.appointmentId,
  );
  const match = slots.find((s) => s.startsAt === input.startsAt);
  if (!match) {
    throw new BookingError(409, "Ese horario ya no está disponible. Elige otro.");
  }

  const professionalId = match.professionalId;

  // ends_at cubre la cita completa: aplicación + exposición + post-exposición. Coincide
  // con `match.endsAt`, pero se deriva aquí de las fases del servicio para no depender de
  // la forma del hueco (el trigger de bloques recalcula por fase a partir del servicio).
  const totalMinutes =
    service.application_min + service.exposure_min + service.post_exposure_min;
  const endsAt = new Date(
    new Date(input.startsAt).getTime() + totalMinutes * 60_000,
  ).toISOString();

  const { data: appointment, error: updateError } = await admin
    .from("appointments")
    .update({
      starts_at: input.startsAt,
      ends_at: endsAt,
      professional_id: professionalId,
    })
    .eq("salon_id", salon.id)
    .eq("id", input.appointmentId)
    .select("id, starts_at, ends_at")
    .single();

  if (updateError || !appointment) {
    // Violación de la exclusion constraint anti-solape: alguien ocupó el hueco antes.
    if (updateError?.code === "23P01") {
      throw new BookingError(409, "Ese horario acaba de ocuparse. Elige otro.");
    }
    throw new BookingError(500, "No se pudo mover la cita.");
  }

  const { data: professional } = await admin
    .from("professionals")
    .select("full_name")
    .eq("id", professionalId)
    .single();

  return {
    appointmentId: appointment.id,
    startsAt: appointment.starts_at,
    endsAt: appointment.ends_at,
    professionalName: professional?.full_name ?? "",
    serviceName: service.name,
    salonName: salonMeta?.name ?? "",
  };
}
