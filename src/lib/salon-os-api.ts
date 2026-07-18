// Cliente HTTP TIPADO de la API PÚBLICA de reserva de Salón OS.
//
// Salón OS (Next.js) expone 3 endpoints públicos (anon, sin sesión) bajo
//   {VITE_SALON_OS_API_URL}/api/public/booking/{slug}
//     · GET  /                                            → bootstrap (salón + catálogo)
//     · GET  /availability?serviceId=&date=&professionalId= → huecos reservables
//     · POST /                                            → crea la reserva (cita pending)
//
// Este módulo es la CAPA DE TRANSPORTE y nada más: construye la URL, envía la
// petición y tipa/propaga la respuesta. NO recalcula duraciones ni disponibilidad
// —el servidor es dueño de horarios, solapes, lead-time y zona horaria—; el cliente
// sólo pasa los datos tal cual llegan. El slug del salón se RESUELVE EN RUNTIME con
// la lógica ya existente (resolveSalonSlug: subdominio > ?salon= > VITE_SALON_SLUG),
// nunca cableado a un salón concreto.
//
// Separación de responsabilidades (igual patrón que salon.ts / salon-branding.ts):
//   · Parte PURA (normalización de URL base, builders de URL, narrowing de error):
//     sin `fetch`, sin `window`, sin `import.meta` → testeable en aislamiento.
//   · Parte con EFECTOS (leer env, resolver el slug con `window`, hacer `fetch`):
//     la factoría `createSalonOsApi` y los defaults de runtime.
import { resolveSalonSlug } from '@/lib/salon';

// ── Contrato de la API (espejo de salon-os · src/lib/booking/types.ts) ─────────
// Se replica aquí porque denueveanueve y salon-os son despliegues separados sin
// paquete compartido. Mantener sincronizado con el contrato del servidor.

/** Salón público que arranca el asistente de reserva. */
export interface PublicSalon {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  phone: string | null;
  address: string | null;
}

/** Servicio del catálogo público. `durationMinutes` la fija el servidor. */
export interface PublicService {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  durationMinutes: number;
  priceCents: number;
  currency: string;
}

/** Profesional que presta servicios. */
export interface PublicProfessional {
  id: string;
  fullName: string;
  color: string | null;
}

/** Respuesta de arranque: salón + catálogo + qué profesional presta qué. */
export interface BookingBootstrap {
  salon: PublicSalon;
  services: PublicService[];
  professionals: PublicProfessional[];
  /** serviceId → lista de professionalId que lo prestan. */
  serviceProfessionals: Record<string, string[]>;
}

/** Hueco reservable. Instantes UTC en ISO 8601, calculados por el servidor. */
export interface PublicSlot {
  startsAt: string;
  endsAt: string;
  professionalId: string;
}

/** Respuesta cruda del endpoint de disponibilidad. */
export interface AvailabilityResponse {
  slots: PublicSlot[];
}

/** Confirmación tras crear la reserva (cita en estado pending). */
export interface BookingConfirmation {
  appointmentId: string;
  startsAt: string;
  endsAt: string;
  professionalName: string;
  serviceName: string;
  salonName: string;
}

/** Forma de error homogénea de la API pública. */
export interface ApiError {
  error: string;
}

// ── Entradas de las peticiones ────────────────────────────────────────────────

/**
 * `"any"` = cualquier profesional que preste el servicio (lo asigna el servidor).
 * Un uuid = un profesional concreto.
 */
export type ProfessionalSelection = string | 'any';

/** Parámetros de la consulta de disponibilidad. */
export interface AvailabilityParams {
  /** uuid del servicio. */
  serviceId: string;
  /** Fecha local del salón en formato `YYYY-MM-DD`. */
  date: string;
  /** Profesional concreto (uuid) o `"any"`/omitido = cualquiera. */
  professionalId?: ProfessionalSelection;
}

/** Datos de contacto del cliente en la reserva. */
export interface BookingCustomerInput {
  fullName: string;
  phone: string;
  /** Opcional; omítelo (o cadena vacía) si no hay email. */
  email?: string;
  notes?: string;
  marketingConsent?: boolean;
}

/** Cuerpo del POST de creación de reserva. Lo valida el servidor (Zod). */
export interface CreateBookingInput {
  serviceId: string;
  professionalId: ProfessionalSelection;
  /** Inicio del hueco elegido: instante UTC en ISO 8601 con offset. */
  startsAt: string;
  customer: BookingCustomerInput;
}

// ── Errores de transporte ──────────────────────────────────────────────────────

/**
 * Error del cliente de la API pública. Lleva el `status` HTTP para que el llamador
 * distinga 4xx (dato/entrada) de 5xx (servidor) y de fallo de red (`status === 0`).
 * El `message` es, cuando existe, el `error` que devuelve el propio servidor.
 */
export class SalonOsApiError extends Error {
  /** Código HTTP, o `0` si la petición ni siquiera llegó (fallo de red). */
  public readonly status: number;
  /** Error subyacente (p. ej. el `TypeError` de un fallo de red), si lo hay. */
  public readonly cause?: unknown;

  constructor(message: string, status: number, options?: { cause?: unknown }) {
    // `super(message, { cause })` requiere lib ES2022; el proyecto compila a ES2020,
    // así que declaramos `cause` como campo propio y lo asignamos a mano.
    super(message);
    this.name = 'SalonOsApiError';
    this.status = status;
    this.cause = options?.cause;
  }
}

/**
 * Error de CONFIGURACIÓN (no de transporte): falta `VITE_SALON_OS_API_URL` o no se
 * pudo resolver el slug del salón. Es un fallo de arranque, no un 4xx/5xx.
 */
export class SalonOsConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SalonOsConfigError';
  }
}

// ── Parte PURA: URLs y narrowing (sin fetch/window/env) ─────────────────────────

/** Prefijo de ruta común de los 3 endpoints públicos. */
const PUBLIC_BOOKING_PATH = '/api/public/booking';

/**
 * Normaliza el origen de la API base: exige un valor no vacío y le quita la(s)
 * barra(s) final(es) para poder concatenar rutas sin dobles barras. Lanza
 * `SalonOsConfigError` si falta (fallo de configuración, mensaje claro).
 */
export function normalizeApiBaseUrl(raw: string | null | undefined): string {
  const value = raw?.trim();
  if (!value) {
    throw new SalonOsConfigError(
      'Falta VITE_SALON_OS_API_URL: define el origen de la API pública de Salón OS ' +
        'en tu .env (consulta .env.example).',
    );
  }
  return value.replace(/\/+$/, '');
}

/** URL del endpoint de bootstrap: `{base}/api/public/booking/{slug}`. */
export function buildBootstrapUrl(baseUrl: string, slug: string): string {
  return `${baseUrl}${PUBLIC_BOOKING_PATH}/${encodeURIComponent(slug)}`;
}

/** URL del POST de reserva (misma ruta que bootstrap, distinto verbo). */
export function buildBookingUrl(baseUrl: string, slug: string): string {
  return `${baseUrl}${PUBLIC_BOOKING_PATH}/${encodeURIComponent(slug)}`;
}

/**
 * URL de disponibilidad con su query. `professionalId` sólo se incluye cuando es un
 * profesional concreto: `"any"`, cadena vacía u omitido = cualquiera (igual criterio
 * que el schema del servidor, que trata `""`/`"any"` como «sin filtro»).
 */
export function buildAvailabilityUrl(
  baseUrl: string,
  slug: string,
  params: AvailabilityParams,
): string {
  const query = new URLSearchParams({
    serviceId: params.serviceId,
    date: params.date,
  });
  const professionalId = params.professionalId;
  if (professionalId && professionalId !== 'any') {
    query.set('professionalId', professionalId);
  }
  return `${buildBootstrapUrl(baseUrl, slug)}/availability?${query.toString()}`;
}

/** Type guard del error homogéneo `{ error: string }` de la API. */
export function isApiError(value: unknown): value is ApiError {
  return (
    typeof value === 'object' &&
    value !== null &&
    'error' in value &&
    typeof (value as Record<string, unknown>).error === 'string'
  );
}

// ── Parte con EFECTOS: resolución de runtime + cliente ──────────────────────────

/** Lee la URL base de la API pública de las variables de entorno de Vite. */
export function readApiBaseUrlFromEnv(): string {
  return normalizeApiBaseUrl(import.meta.env.VITE_SALON_OS_API_URL);
}

/**
 * Resuelve el slug del salón EN RUNTIME con la lógica existente (subdominio >
 * ?salon= > VITE_SALON_SLUG), leyendo el host/URL reales. No cablea ningún salón.
 * Lanza `SalonOsConfigError` si no hay forma de resolverlo (sin subdominio, sin
 * ?salon y sin fallback) — no se puede llamar a la API sin saber a qué salón.
 */
export function resolveRuntimeSalonSlug(): string {
  const { slug } = resolveSalonSlug({
    hostname: window.location.hostname,
    search: window.location.search,
    envSlug: (import.meta.env.VITE_SALON_SLUG as string | undefined) ?? null,
  });
  if (!slug) {
    throw new SalonOsConfigError(
      'No se pudo resolver el salón: sin subdominio, sin ?salon= y sin VITE_SALON_SLUG.',
    );
  }
  return slug;
}

/** Opciones para construir el cliente. Todo opcional: por defecto, runtime. */
export interface SalonOsApiOptions {
  /** Origen de la API. Por defecto: `VITE_SALON_OS_API_URL` (normalizado). */
  baseUrl?: string;
  /**
   * Slug del salón. Por defecto: se RESUELVE EN RUNTIME (subdominio > ?salon= >
   * env). Pásalo explícito (p. ej. desde `useSalon().slug`) para evitar re-resolver
   * o para usar el cliente fuera del navegador.
   */
  slug?: string;
  /** `fetch` inyectable (tests / entornos sin fetch global). Por defecto el global. */
  fetchFn?: typeof fetch;
}

/** Cliente tipado ligado a un `baseUrl` y un `slug` concretos. */
export interface SalonOsApi {
  /** Origen de la API resuelto para este cliente. */
  readonly baseUrl: string;
  /** Slug del salón resuelto para este cliente. */
  readonly slug: string;
  /** GET bootstrap: salón + catálogo para arrancar el asistente. */
  getBootstrap(signal?: AbortSignal): Promise<BookingBootstrap>;
  /** GET disponibilidad: huecos reservables (tal cual los calcula el servidor). */
  getAvailability(params: AvailabilityParams, signal?: AbortSignal): Promise<PublicSlot[]>;
  /** POST reserva: crea la cita (estado pending) y devuelve su confirmación. */
  createBooking(input: CreateBookingInput, signal?: AbortSignal): Promise<BookingConfirmation>;
}

/**
 * Ejecuta la petición y normaliza el resultado:
 *   · fetch que rechaza (red/DNS/CORS) → SalonOsApiError status 0.
 *   · respuesta no-2xx → SalonOsApiError con el `error` del servidor (o genérico).
 *   · 2xx → JSON tipado como `T`.
 */
async function request<T>(
  url: string,
  init: RequestInit,
  fetchFn: typeof fetch,
): Promise<T> {
  let response: Response;
  try {
    response = await fetchFn(url, init);
  } catch (cause) {
    throw new SalonOsApiError(
      'No se pudo conectar con el servicio de reservas.',
      0,
      { cause },
    );
  }

  // La API responde JSON en éxito y en error; toleramos un cuerpo vacío/no-JSON.
  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const message = isApiError(payload)
      ? payload.error
      : `Error ${response.status} del servicio de reservas.`;
    throw new SalonOsApiError(message, response.status);
  }

  return payload as T;
}

/**
 * Crea el cliente HTTP tipado de la API pública de Salón OS.
 * Resuelve `baseUrl` y `slug` UNA vez (en la creación): por defecto desde el entorno
 * y el runtime; ambos se pueden inyectar. No mantiene estado entre peticiones.
 */
export function createSalonOsApi(options: SalonOsApiOptions = {}): SalonOsApi {
  const baseUrl =
    options.baseUrl !== undefined
      ? normalizeApiBaseUrl(options.baseUrl)
      : readApiBaseUrlFromEnv();
  const slug = options.slug ?? resolveRuntimeSalonSlug();
  const fetchFn = options.fetchFn ?? globalThis.fetch.bind(globalThis);

  return {
    baseUrl,
    slug,
    getBootstrap(signal) {
      return request<BookingBootstrap>(
        buildBootstrapUrl(baseUrl, slug),
        { method: 'GET', signal },
        fetchFn,
      );
    },
    async getAvailability(params, signal) {
      const { slots } = await request<AvailabilityResponse>(
        buildAvailabilityUrl(baseUrl, slug, params),
        { method: 'GET', signal },
        fetchFn,
      );
      return slots;
    },
    createBooking(input, signal) {
      return request<BookingConfirmation>(
        buildBookingUrl(baseUrl, slug),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
          signal,
        },
        fetchFn,
      );
    },
  };
}
