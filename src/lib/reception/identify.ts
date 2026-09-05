/**
 * IDENTIFICAR al cliente que llama — lógica de dominio de `POST /api/reception/identify`.
 *
 * El recepcionista IA (Retell + Twilio + n8n) recibe una llamada y lo PRIMERO que hace
 * es preguntar "¿de qué número me hablas?" para reconocer a la persona: con el teléfono
 * resuelve su FICHA en el salón y sus PRÓXIMAS citas, y así saluda por su nombre y puede
 * mover/confirmar sin pedir más datos. Esta capa implementa exactamente ese paso.
 *
 * ── Identidad por TELÉFONO (misma clave natural que `@/lib/customers`) ────────────
 * El teléfono es la clave natural de identidad de FASE 3 (ver `@/lib/customers/account`).
 * REUTILIZAMOS `normalizePhone` para canonicalizar a E.164 EXACTAMENTE igual que la
 * columna generada `customers.phone_e164` (y su índice único parcial `(salon_id,
 * phone_e164)`): si la app normalizara distinto que la BD, un número existente parecería
 * nuevo. Un teléfono sin número real ⇒ no puede haber coincidencia ⇒ `{ found: false }`.
 *
 * ── AISLAMIENTO multi-tenant (crítico) ────────────────────────────────────────────
 * La petición es máquina-a-máquina: NO hay `auth.uid()`, luego la RLS de miembro/self NO
 * aplica. Se usa el cliente ADMIN (service_role, omite RLS) —igual que el guard de
 * recepción y que los helpers privados de `@/lib/customers/account`— y por eso CADA
 * consulta se acota A MANO por `salon_id` (el del guard, resuelto desde la `x-api-key`).
 * NUNCA se devuelve la ficha ni las citas de otro salón: el `salon_id` viaja en TODOS los
 * filtros (`customers` y `appointments`). Esa cota manual es la ÚNICA barrera de tenant
 * aquí, así que es innegociable.
 *
 * ── Mínima exposición ──────────────────────────────────────────────────────────────
 * De la ficha solo salen `id` y `full_name` (nunca teléfono, email, notas…): al otro lado
 * hay una integración, no la dueña de los datos. De cada cita, solo lo que el recepcionista
 * necesita para hablar de ella.
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
 * Estados que cuentan como "próxima" cita: la agenda VIVA del cliente. Una cita
 * `cancelled`/`completed`/`no_show` ya no está por venir. Es una lista EXPLÍCITA (no
 * "todo lo que no esté cancelado") para que el criterio sea auditable y no se cuele un
 * estado futuro nuevo sin pensarlo. `satisfies` garantiza que solo contiene estados reales.
 */
const UPCOMING_STATUSES = [
  "pending",
  "confirmed",
] as const satisfies readonly AppointmentStatus[];

// -----------------------------------------------------------------------------
// Forma de la respuesta (el contrato que consume la integración)
// -----------------------------------------------------------------------------

/** Ficha reconocida — SOLO lo imprescindible para saludar y operar. */
export interface IdentifiedCustomer {
  /** Id de la ficha en ESTE salón (para las siguientes llamadas del recepcionista). */
  id: string;
  /** Nombre para saludar. `customers.full_name` es NOT NULL. */
  full_name: string;
}

/** Una próxima cita del cliente, aplanada para el recepcionista. */
export interface UpcomingAppointment {
  id: string;
  /** Instante de inicio en ISO-8601 UTC (`appointments.starts_at`). */
  starts_at: string;
  /**
   * Nombre del servicio. En la práctica SIEMPRE presente (la FK `service_id` es NOT
   * NULL), pero se tipa `string | null` por robustez: el consumidor ramifica por
   * presencia y jamás recibe un `""` inventado si el embed faltara.
   */
  service_name: string | null;
  /** Nombre del profesional. Misma garantía/robustez que `service_name`. */
  professional_name: string | null;
  /** Estado de la cita (siempre uno de {@link UPCOMING_STATUSES} aquí). */
  status: AppointmentStatus;
}

/**
 * Resultado de identificar por teléfono. `customer`/`upcoming` SOLO aparecen si hubo
 * coincidencia (`found: true`); si no, `{ found: false }` a secas (nunca datos ajenos).
 */
export interface IdentifyResult {
  found: boolean;
  customer?: IdentifiedCustomer;
  upcoming?: UpcomingAppointment[];
  /**
   * `true` cuando VARIAS fichas comparten ese teléfono y no se puede saber a
   * cuál corresponde la llamada. Entonces NO viajan `customer` ni `upcoming`:
   * dar por buena la primera ficha sería contarle a quien llama las citas de
   * otra persona, aunque viva en la misma casa.
   */
  ambiguous?: boolean;
  /**
   * Las fichas de ese teléfono, para que quien atiende pregunte por su nombre
   * ("¿hablo con Ana o con Santiago?"). Solo se rellena si `ambiguous`.
   */
  candidates?: IdentifiedCustomer[];
}

/** Dependencias INYECTABLES (tests deterministas). En producción se omiten. */
export interface IdentifyCustomerDeps {
  /** Cliente admin (service_role). Por defecto `createAdminClient()` (real). */
  admin?: AdminClient;
  /** Reloj para el corte "de ahora en adelante". Por defecto la hora real. */
  now?: () => Date;
}

// -----------------------------------------------------------------------------
// Helpers de lectura (cliente admin — SIEMPRE acotados a mano por salon_id)
// -----------------------------------------------------------------------------

/**
 * Normaliza un embed to-one de PostgREST: llega como objeto (many-to-one), pero se
 * acepta también array/undefined por robustez ante variaciones de tipado. Devuelve el
 * único elemento o `null`.
 */
function embeddedOne<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

/**
 * Ficha del salón con ese teléfono canónico (o `null`). Acota por `(salon_id,
 * phone_e164)` — el mismo índice único parcial que garantiza "un teléfono = una ficha
 * por salón" — con el cliente admin. Un fallo REAL de consulta ⇒ `INTERNAL_ERROR` (500),
 * sin filtrar la causa.
 */
/**
 * TODAS las fichas del salón con ese teléfono canónico.
 *
 * Devuelve lista y no una fila porque un teléfono es de una FAMILIA: la madre
 * da su móvil para ella y para sus hijos. Con `maybeSingle()` —como estaba— dos
 * hermanos hacían reventar la consulta y la llamada se caía.
 *
 * Ordenadas por nombre para que quien atiende lea siempre los mismos candidatos
 * en el mismo orden.
 */
async function findCustomersByPhoneE164(
  admin: AdminClient,
  salonId: string,
  phoneE164: string,
): Promise<IdentifiedCustomer[]> {
  const { data, error } = await admin
    .from("customers")
    .select("id, full_name")
    .eq("salon_id", salonId)
    .eq("phone_e164", phoneE164)
    .order("full_name", { ascending: true });

  if (error !== null) {
    throw ReceptionError.internal(error, "No se pudo identificar al cliente por teléfono.");
  }
  // Proyección EXPLÍCITA: la mínima exposición no depende de acordarse de acotar
  // el `select` — aunque la fila trajera de más, solo salen `id` y `full_name`.
  return (data ?? []).map((row) => ({ id: row.id, full_name: row.full_name }));
}

/** Fila cruda de la consulta de próximas citas (embeds to-one de servicio/profesional). */
interface UpcomingRow {
  id: string;
  starts_at: string;
  status: AppointmentStatus;
  service: { name: string } | { name: string }[] | null;
  professional: { full_name: string } | { full_name: string }[] | null;
}

/**
 * Próximas citas de la ficha en el salón, ordenadas por inicio ascendente (la más
 * cercana primero). Filtra a la agenda VIVA ({@link UPCOMING_STATUSES}) y a partir de
 * `nowIso`. Doble cota de tenant: `salon_id` Y `customer_id` (nunca cruza de salón).
 */
async function fetchUpcomingAppointments(
  admin: AdminClient,
  salonId: string,
  customerId: string,
  nowIso: string,
): Promise<UpcomingAppointment[]> {
  const { data, error } = await admin
    .from("appointments")
    .select("id, starts_at, status, service:services(name), professional:professionals(full_name)")
    .eq("salon_id", salonId)
    .eq("customer_id", customerId)
    .in("status", UPCOMING_STATUSES)
    .gte("starts_at", nowIso)
    .order("starts_at", { ascending: true });

  if (error !== null) {
    throw ReceptionError.internal(error, "No se pudieron consultar las próximas citas.");
  }

  const rows = (data ?? []) as unknown as UpcomingRow[];
  return rows.map((row) => ({
    id: row.id,
    starts_at: row.starts_at,
    service_name: embeddedOne(row.service)?.name ?? null,
    professional_name: embeddedOne(row.professional)?.full_name ?? null,
    status: row.status,
  }));
}

// -----------------------------------------------------------------------------
// identifyCustomer — el paso de identificación
// -----------------------------------------------------------------------------

/**
 * Identifica al cliente de `salonId` por su `phone` y, si existe, adjunta sus próximas
 * citas. Flujo:
 *   1. Normaliza `phone` a E.164 con {@link normalizePhone}. Sin número real ⇒
 *      `{ found: false }` (no puede haber coincidencia por teléfono canónico).
 *   2. Busca la ficha por `(salon_id, phone_e164)` con el cliente admin. Sin ficha ⇒
 *      `{ found: false }`.
 *   3. Con ficha ⇒ `{ found: true, customer: { id, full_name }, upcoming: [...] }`,
 *      con las citas VIVAS de aquí en adelante, ordenadas por inicio.
 *
 * `salonId` DEBE ser el resuelto por el guard desde la `x-api-key` (de fiar). Todas las
 * lecturas se acotan por él: es imposible devolver datos de otro salón.
 *
 * @throws {ReceptionError} `INTERNAL_ERROR` (500) ante un fallo real de consulta; la
 *   causa se guarda para el log y NUNCA se serializa al cliente.
 */
export async function identifyCustomer(
  salonId: string,
  phone: string,
  deps: IdentifyCustomerDeps = {},
): Promise<IdentifyResult> {
  const phoneE164 = normalizePhone(phone);
  if (phoneE164 === null) {
    // Sin número real no hay forma canónica que casar: no es un error, simplemente no
    // se reconoce a nadie. No se toca la BD.
    return { found: false };
  }

  const admin = deps.admin ?? createAdminClient();

  const matches = await findCustomersByPhoneE164(admin, salonId, phoneE164);
  if (matches.length === 0) {
    return { found: false };
  }

  // Varias fichas con ese número: no se elige, se pregunta. Y no se consultan
  // las citas de nadie — sin saber quién llama, enseñar una agenda es filtrar
  // datos de un tercero.
  if (matches.length > 1) {
    return { found: true, ambiguous: true, candidates: matches };
  }

  const customer = matches[0]!;
  const nowIso = (deps.now?.() ?? new Date()).toISOString();
  const upcoming = await fetchUpcomingAppointments(admin, salonId, customer.id, nowIso);

  return { found: true, customer, upcoming };
}
