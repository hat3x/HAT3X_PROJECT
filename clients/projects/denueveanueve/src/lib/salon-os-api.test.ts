import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  createSalonOsApi,
  normalizeApiBaseUrl,
  buildBootstrapUrl,
  buildBookingUrl,
  buildAvailabilityUrl,
  isApiError,
  resolveRuntimeSalonSlug,
  SalonOsApiError,
  SalonOsConfigError,
  type BookingBootstrap,
  type BookingConfirmation,
  type CreateBookingInput,
  type PublicSlot,
} from './salon-os-api';

// ── Datos sintéticos (no producción) ────────────────────────────────────────────
const BASE = 'https://app.salonos.app';
const SLUG = 'jotabarber';
const SERVICE_ID = '11111111-1111-4111-8111-111111111111';
const PROFESSIONAL_ID = '22222222-2222-4222-8222-222222222222';

/** Respuesta fake mínima (evita depender del global Response). */
function fakeResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

/** Respuesta fake cuyo cuerpo NO es JSON parseable. */
function fakeNonJsonResponse(status: number): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => {
      throw new SyntaxError('Unexpected token');
    },
  } as unknown as Response;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

// ── Parte PURA: normalización de la URL base ────────────────────────────────────
describe('normalizeApiBaseUrl', () => {
  it('deja intacto un origen ya limpio', () => {
    expect(normalizeApiBaseUrl('https://app.salonos.app')).toBe('https://app.salonos.app');
  });

  it('recorta espacios y quita la(s) barra(s) final(es)', () => {
    expect(normalizeApiBaseUrl('  https://app.salonos.app/  ')).toBe('https://app.salonos.app');
    expect(normalizeApiBaseUrl('https://app.salonos.app///')).toBe('https://app.salonos.app');
  });

  it('conserva un subpath (despliegue bajo prefijo), sin barra final', () => {
    expect(normalizeApiBaseUrl('https://host/base/')).toBe('https://host/base');
  });

  it('lanza SalonOsConfigError si falta o está vacía', () => {
    expect(() => normalizeApiBaseUrl(undefined)).toThrow(SalonOsConfigError);
    expect(() => normalizeApiBaseUrl(null)).toThrow(SalonOsConfigError);
    expect(() => normalizeApiBaseUrl('   ')).toThrow(SalonOsConfigError);
  });
});

// ── Parte PURA: builders de URL ─────────────────────────────────────────────────
describe('builders de URL', () => {
  it('bootstrap y booking comparten ruta {base}/api/public/booking/{slug}', () => {
    expect(buildBootstrapUrl(BASE, SLUG)).toBe(`${BASE}/api/public/booking/${SLUG}`);
    expect(buildBookingUrl(BASE, SLUG)).toBe(`${BASE}/api/public/booking/${SLUG}`);
  });

  it('disponibilidad incluye serviceId + date y omite professionalId cuando es "any"', () => {
    const url = buildAvailabilityUrl(BASE, SLUG, {
      serviceId: SERVICE_ID,
      date: '2026-07-20',
      professionalId: 'any',
    });
    expect(url).toBe(
      `${BASE}/api/public/booking/${SLUG}/availability?serviceId=${SERVICE_ID}&date=2026-07-20`,
    );
  });

  it('disponibilidad omite professionalId cuando se omite o va vacío', () => {
    const omitted = buildAvailabilityUrl(BASE, SLUG, { serviceId: SERVICE_ID, date: '2026-07-20' });
    const empty = buildAvailabilityUrl(BASE, SLUG, {
      serviceId: SERVICE_ID,
      date: '2026-07-20',
      professionalId: '',
    });
    expect(omitted).not.toContain('professionalId');
    expect(empty).not.toContain('professionalId');
  });

  it('disponibilidad incluye professionalId cuando es un uuid concreto', () => {
    const url = buildAvailabilityUrl(BASE, SLUG, {
      serviceId: SERVICE_ID,
      date: '2026-07-20',
      professionalId: PROFESSIONAL_ID,
    });
    expect(url).toContain(`professionalId=${PROFESSIONAL_ID}`);
  });
});

// ── Parte PURA: type guard del error de la API ──────────────────────────────────
describe('isApiError', () => {
  it('reconoce { error: string }', () => {
    expect(isApiError({ error: 'Salón no encontrado.' })).toBe(true);
  });
  it('rechaza formas que no encajan', () => {
    expect(isApiError(null)).toBe(false);
    expect(isApiError({ error: 404 })).toBe(false);
    expect(isApiError({ message: 'x' })).toBe(false);
    expect(isApiError('error')).toBe(false);
  });
});

// ── resolveRuntimeSalonSlug (efecto: window + env) ──────────────────────────────
describe('resolveRuntimeSalonSlug', () => {
  it('cae al fallback VITE_SALON_SLUG en localhost (jsdom)', () => {
    vi.stubEnv('VITE_SALON_SLUG', 'denueveanueve');
    // jsdom sirve en http://localhost → sin subdominio ni ?salon → env.
    expect(resolveRuntimeSalonSlug()).toBe('denueveanueve');
  });

  it('lanza SalonOsConfigError si no hay forma de resolver el salón', () => {
    vi.stubEnv('VITE_SALON_SLUG', '');
    expect(() => resolveRuntimeSalonSlug()).toThrow(SalonOsConfigError);
  });
});

// ── createSalonOsApi: resolución de baseUrl + slug ──────────────────────────────
describe('createSalonOsApi — configuración', () => {
  it('por defecto lee VITE_SALON_OS_API_URL (normalizada) y resuelve el slug en runtime', () => {
    vi.stubEnv('VITE_SALON_OS_API_URL', 'https://app.salonos.app/');
    vi.stubEnv('VITE_SALON_SLUG', 'denueveanueve');
    const api = createSalonOsApi({ fetchFn: vi.fn() });
    expect(api.baseUrl).toBe('https://app.salonos.app');
    expect(api.slug).toBe('denueveanueve');
  });

  it('respeta baseUrl y slug inyectados (sin tocar env/window)', () => {
    const api = createSalonOsApi({ baseUrl: `${BASE}/`, slug: SLUG, fetchFn: vi.fn() });
    expect(api.baseUrl).toBe(BASE);
    expect(api.slug).toBe(SLUG);
  });

  it('lanza SalonOsConfigError si falta la URL base', () => {
    vi.stubEnv('VITE_SALON_OS_API_URL', '');
    vi.stubEnv('VITE_SALON_SLUG', 'denueveanueve');
    expect(() => createSalonOsApi({ fetchFn: vi.fn() })).toThrow(SalonOsConfigError);
  });
});

// ── createSalonOsApi: getBootstrap ──────────────────────────────────────────────
describe('createSalonOsApi.getBootstrap', () => {
  const bootstrap: BookingBootstrap = {
    salon: {
      id: 'salon-1',
      name: 'Jota Barber',
      slug: SLUG,
      timezone: 'Europe/Madrid',
      phone: null,
      address: null,
    },
    services: [],
    professionals: [],
    serviceProfessionals: {},
  };

  it('hace GET a la ruta de bootstrap y devuelve el cuerpo tipado', async () => {
    const fetchFn = vi.fn().mockResolvedValue(fakeResponse(bootstrap));
    const api = createSalonOsApi({ baseUrl: BASE, slug: SLUG, fetchFn });

    const result = await api.getBootstrap();

    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe(`${BASE}/api/public/booking/${SLUG}`);
    expect(init).toMatchObject({ method: 'GET' });
    expect(result).toEqual(bootstrap);
  });

  it('propaga el AbortSignal recibido', async () => {
    const fetchFn = vi.fn().mockResolvedValue(fakeResponse(bootstrap));
    const api = createSalonOsApi({ baseUrl: BASE, slug: SLUG, fetchFn });
    const controller = new AbortController();

    await api.getBootstrap(controller.signal);

    expect(fetchFn.mock.calls[0]![1]).toMatchObject({ signal: controller.signal });
  });
});

// ── createSalonOsApi: getAvailability ───────────────────────────────────────────
describe('createSalonOsApi.getAvailability', () => {
  const slots: PublicSlot[] = [
    {
      startsAt: '2026-07-20T08:00:00.000Z',
      endsAt: '2026-07-20T08:30:00.000Z',
      professionalId: PROFESSIONAL_ID,
    },
  ];

  it('construye la query y DESENVUELVE los slots del cuerpo', async () => {
    const fetchFn = vi.fn().mockResolvedValue(fakeResponse({ slots }));
    const api = createSalonOsApi({ baseUrl: BASE, slug: SLUG, fetchFn });

    const result = await api.getAvailability({ serviceId: SERVICE_ID, date: '2026-07-20' });

    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe(
      `${BASE}/api/public/booking/${SLUG}/availability?serviceId=${SERVICE_ID}&date=2026-07-20`,
    );
    expect(init).toMatchObject({ method: 'GET' });
    // El cliente NO recalcula: devuelve exactamente los slots del servidor.
    expect(result).toEqual(slots);
  });

  it('pasa el professionalId concreto a la query', async () => {
    const fetchFn = vi.fn().mockResolvedValue(fakeResponse({ slots: [] }));
    const api = createSalonOsApi({ baseUrl: BASE, slug: SLUG, fetchFn });

    await api.getAvailability({
      serviceId: SERVICE_ID,
      date: '2026-07-20',
      professionalId: PROFESSIONAL_ID,
    });

    expect(fetchFn.mock.calls[0]![0]).toContain(`professionalId=${PROFESSIONAL_ID}`);
  });
});

// ── createSalonOsApi: createBooking ─────────────────────────────────────────────
describe('createSalonOsApi.createBooking', () => {
  const input: CreateBookingInput = {
    serviceId: SERVICE_ID,
    professionalId: 'any',
    startsAt: '2026-07-20T08:00:00.000Z',
    customer: { fullName: 'Ana García', phone: '600000000', marketingConsent: false },
  };
  const confirmation: BookingConfirmation = {
    appointmentId: 'appt-1',
    startsAt: '2026-07-20T08:00:00.000Z',
    endsAt: '2026-07-20T08:30:00.000Z',
    professionalName: 'Jota',
    serviceName: 'Corte',
    salonName: 'Jota Barber',
  };

  it('hace POST con JSON, cabecera Content-Type y devuelve la confirmación (201)', async () => {
    const fetchFn = vi.fn().mockResolvedValue(fakeResponse(confirmation, 201));
    const api = createSalonOsApi({ baseUrl: BASE, slug: SLUG, fetchFn });

    const result = await api.createBooking(input);

    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe(`${BASE}/api/public/booking/${SLUG}`);
    expect(init).toMatchObject({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    expect(JSON.parse((init as RequestInit).body as string)).toEqual(input);
    expect(result).toEqual(confirmation);
  });
});

// ── Mapeo de errores de transporte ──────────────────────────────────────────────
describe('createSalonOsApi — errores', () => {
  it('convierte un no-2xx con { error } en SalonOsApiError (mensaje + status del servidor)', async () => {
    const fetchFn = vi.fn().mockResolvedValue(fakeResponse({ error: 'Salón no encontrado.' }, 404));
    const api = createSalonOsApi({ baseUrl: BASE, slug: SLUG, fetchFn });

    await expect(api.getBootstrap()).rejects.toMatchObject({
      name: 'SalonOsApiError',
      status: 404,
      message: 'Salón no encontrado.',
    });
  });

  it('usa un mensaje genérico cuando el error no trae cuerpo JSON', async () => {
    const fetchFn = vi.fn().mockResolvedValue(fakeNonJsonResponse(500));
    const api = createSalonOsApi({ baseUrl: BASE, slug: SLUG, fetchFn });

    const error = await api.getBootstrap().catch((e) => e);
    expect(error).toBeInstanceOf(SalonOsApiError);
    expect((error as SalonOsApiError).status).toBe(500);
    expect((error as SalonOsApiError).message).toContain('500');
  });

  it('un fallo de red (fetch rechaza) es SalonOsApiError con status 0', async () => {
    const cause = new TypeError('Failed to fetch');
    const fetchFn = vi.fn().mockRejectedValue(cause);
    const api = createSalonOsApi({ baseUrl: BASE, slug: SLUG, fetchFn });

    const error = await api.getBootstrap().catch((e) => e);
    expect(error).toBeInstanceOf(SalonOsApiError);
    expect((error as SalonOsApiError).status).toBe(0);
    expect((error as SalonOsApiError).cause).toBe(cause);
  });
});
