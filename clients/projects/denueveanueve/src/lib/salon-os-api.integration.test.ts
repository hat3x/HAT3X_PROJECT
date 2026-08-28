// Tests de INTEGRACIÓN del flujo de reserva: cosen las costuras que los tests
// unitarios dejan a propósito separadas. No prueban un módulo en aislamiento, sino
// los TRES saltos que de verdad importan de punta a punta (con `fetch` MOCKEADO):
//
//   1) SLUG DINÁMICO → transporte. El slug resuelto EN RUNTIME (subdominio > ?salon=
//      > env) —no cableado a ningún salón— llega, tal cual y codificado, a la URL de
//      las 3 llamadas. Multi-tenant: dos salones → dos URLs distintas.
//   2) CUERPO del POST según bookingCustomerSchema. La tubería completa
//      formulario → buildBookingCustomer (booking.ts) → createBooking (salon-os-api.ts)
//      preserva, tras el round-trip JSON del transporte, EXACTAMENTE los campos del
//      schema del servidor (recortados, sin vacíos, sin claves de más).
//   3) ERRORES de la API → clasificación, SIN ROMPER LA APP. La respuesta HTTP real
//      (409/410 hueco ocupado, 400/422 validación, red caída) se convierte en un
//      `SalonOsApiError` tipado que `classifyBookingError` traduce a un caso estable;
//      las llamadas RECHAZAN (promesa atrapable), nunca lanzan sincrónicamente, y un
//      fallo no envenena al cliente (la siguiente llamada vuelve a funcionar).
//
// Complementa (no repite) a:
//   · salon-os-api.test.ts         → URLs/verbos/errores de cada método por separado.
//   · salon-os-api.contract.test.ts → campos EXACTOS con un customer construido a mano.
//   · booking.test.ts              → buildBookingCustomer y classifyBookingError puros.
// Aquí se prueba que esas piezas, ENCAJADAS, siguen cumpliendo el contrato.
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  createSalonOsApi,
  SalonOsApiError,
  type CreateBookingInput,
  type BookingConfirmation,
} from './salon-os-api';
import {
  buildBookingCustomer,
  classifyBookingError,
  isSlotTakenError,
  type CustomerFormValues,
} from './booking';

// ── Datos sintéticos (no producción) ────────────────────────────────────────────
const BASE = 'https://app.salonos.app';
const SLUG = 'jotabarber';
const SERVICE_ID = '11111111-1111-4111-8111-111111111111';
const PROFESSIONAL_ID = '22222222-2222-4222-8222-222222222222';
const STARTS_AT = '2026-07-20T08:00:00.000Z';

const CONFIRMATION: BookingConfirmation = {
  appointmentId: 'appt-1',
  startsAt: STARTS_AT,
  endsAt: '2026-07-20T08:30:00.000Z',
  professionalName: 'Jota',
  serviceName: 'Corte',
  salonName: 'Jota Barber',
};

/** Cuerpo mínimo de reserva válido (cuando el customer es irrelevante para el caso). */
const INPUT: CreateBookingInput = {
  serviceId: SERVICE_ID,
  professionalId: 'any',
  startsAt: STARTS_AT,
  customer: { fullName: 'Ana García', phone: '600123123' },
};

/** Respuesta fake mínima (evita depender del global Response). */
function fakeResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

/** Cliente con un fetch espía que confirma toda reserva (201); devuelve ambos. */
function apiWithSpy() {
  const fetchFn = vi.fn().mockResolvedValue(fakeResponse(CONFIRMATION, 201));
  const api = createSalonOsApi({ baseUrl: BASE, slug: SLUG, fetchFn });
  return { api, fetchFn };
}

/** Extrae y parsea el cuerpo JSON del POST capturado por el espía. */
function postedBody(fetchFn: ReturnType<typeof vi.fn>): CreateBookingInput {
  const init = fetchFn.mock.calls[0]![1] as RequestInit;
  return JSON.parse(init.body as string) as CreateBookingInput;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  // Deshace cualquier ?salon= inyectado en un test (jsdom comparte la location del fichero).
  window.history.replaceState({}, '', '/');
});

// ── 1) Slug dinámico: resuelto en runtime y llevado al transporte ────────────────
describe('slug dinámico llega al transporte (resuelto en runtime, no cableado)', () => {
  it('resuelve el slug en RUNTIME (?salon= gana a env) y ese slug llega a las 3 llamadas', async () => {
    vi.stubEnv('VITE_SALON_OS_API_URL', BASE);
    // El fallback de env DEBE perder frente a ?salon=: así se prueba que el slug se
    // resuelve de verdad en runtime y no se coge el env ni un valor cableado.
    vi.stubEnv('VITE_SALON_SLUG', 'fallback-env');
    window.history.replaceState({}, '', '/?salon=peluqueria-centro');

    const fetchFn = vi.fn().mockResolvedValue(fakeResponse({ slots: [] }));
    // Sin baseUrl ni slug: ambos salen del entorno / runtime (el caso real de la app).
    const api = createSalonOsApi({ fetchFn });

    expect(api.baseUrl).toBe(BASE);
    expect(api.slug).toBe('peluqueria-centro'); // runtime, no el fallback-env ni cableado

    await api.getBootstrap();
    await api.getAvailability({ serviceId: SERVICE_ID, date: '2026-07-20' });
    await api.createBooking(INPUT);

    const urls = fetchFn.mock.calls.map((c) => c[0] as string);
    expect(urls[0]).toBe(`${BASE}/api/public/booking/peluqueria-centro`);
    expect(urls[1]).toContain(`${BASE}/api/public/booking/peluqueria-centro/availability?`);
    expect(urls[2]).toBe(`${BASE}/api/public/booking/peluqueria-centro`);
  });

  it('multi-tenant: dos clientes con slugs distintos pegan a URLs distintas (no cableado a un salón)', async () => {
    const fetchA = vi.fn().mockResolvedValue(fakeResponse({ slots: [] }));
    const fetchB = vi.fn().mockResolvedValue(fakeResponse({ slots: [] }));
    const apiA = createSalonOsApi({ baseUrl: BASE, slug: 'salon-uno', fetchFn: fetchA });
    const apiB = createSalonOsApi({ baseUrl: BASE, slug: 'salon-dos', fetchFn: fetchB });

    await apiA.getBootstrap();
    await apiB.getBootstrap();

    expect(fetchA.mock.calls[0]![0]).toBe(`${BASE}/api/public/booking/salon-uno`);
    expect(fetchB.mock.calls[0]![0]).toBe(`${BASE}/api/public/booking/salon-dos`);
  });

  it('codifica el segmento del slug en la URL (defensivo)', async () => {
    // Los slugs REALES son kebab-case seguro (validado en salon.test.ts), pero el
    // transporte codifica igualmente el segmento: un slug con caracteres reservados no
    // rompe la ruta ni permite inyectar path/query.
    const fetchFn = vi.fn().mockResolvedValue(fakeResponse({ slots: [] }));
    const api = createSalonOsApi({ baseUrl: BASE, slug: 'a b/c', fetchFn });

    await api.getBootstrap();

    expect(fetchFn.mock.calls[0]![0]).toBe(`${BASE}/api/public/booking/a%20b%2Fc`);
  });
});

// ── 2) Cuerpo del POST según bookingCustomerSchema (tubería formulario → hilo) ────
describe('cuerpo del POST según bookingCustomerSchema (formulario → buildBookingCustomer → createBooking)', () => {
  it('recorta y conserva los campos con contenido; omite los vacíos y no añade claves extra', async () => {
    const formValues: CustomerFormValues = {
      fullName: '  Ana García  ',
      phone: '  600 12 34 56  ',
      email: '  ana@example.com  ',
      notes: '   ', // vacío tras recortar → NO debe viajar
      marketingConsent: true,
    };
    const { api, fetchFn } = apiWithSpy();

    await api.createBooking({
      serviceId: SERVICE_ID,
      professionalId: PROFESSIONAL_ID,
      startsAt: STARTS_AT,
      customer: buildBookingCustomer(formValues),
    });

    const body = postedBody(fetchFn);
    // Tras el round-trip JSON del transporte, el customer lleva EXACTAMENTE lo esperado.
    expect(body.customer).toEqual({
      fullName: 'Ana García',
      phone: '600 12 34 56', // recorta extremos, conserva espacios internos
      email: 'ana@example.com',
      marketingConsent: true,
    });
    expect('notes' in body.customer).toBe(false);
    // La raíz lleva EXACTAMENTE las 4 claves del contrato (server .strict() rechaza extras).
    expect(Object.keys(body).sort()).toEqual(['customer', 'professionalId', 'serviceId', 'startsAt']);
  });

  it('customer mínimo: sólo fullName y phone; JSON no serializa los opcionales ausentes', async () => {
    const { api, fetchFn } = apiWithSpy();

    await api.createBooking({
      serviceId: SERVICE_ID,
      professionalId: 'any',
      startsAt: STARTS_AT,
      customer: buildBookingCustomer({ fullName: 'Ana', phone: '600', email: '', notes: null }),
    });

    const body = postedBody(fetchFn);
    // email:"" y notes:null se omiten en origen; undefined no se serializa: ni una clave vacía.
    expect(Object.keys(body.customer).sort()).toEqual(['fullName', 'phone']);
    expect(body.customer).toEqual({ fullName: 'Ana', phone: '600' });
  });

  it('marketingConsent=false viaja como false (booleano explícito ≠ omitido)', async () => {
    const { api, fetchFn } = apiWithSpy();

    await api.createBooking({
      serviceId: SERVICE_ID,
      professionalId: 'any',
      startsAt: STARTS_AT,
      customer: buildBookingCustomer({ fullName: 'A', phone: '6', marketingConsent: false }),
    });

    const { customer } = postedBody(fetchFn);
    expect(customer.marketingConsent).toBe(false);
    expect('marketingConsent' in customer).toBe(true);
  });
});

// ── 3) Errores de la API → clasificación, sin romper la app ──────────────────────
describe('manejo de errores de la API (transporte → classifyBookingError)', () => {
  it('hueco ocupado: 409/410 → SalonOsApiError → "slotTaken" (conserva el mensaje del servidor)', async () => {
    for (const status of [409, 410]) {
      const fetchFn = vi
        .fn()
        .mockResolvedValue(fakeResponse({ error: 'Ese hueco ya no está disponible.' }, status));
      const api = createSalonOsApi({ baseUrl: BASE, slug: SLUG, fetchFn });

      const error = await api.createBooking(INPUT).catch((e) => e);

      expect(error).toBeInstanceOf(SalonOsApiError);
      expect((error as SalonOsApiError).status).toBe(status);
      expect((error as SalonOsApiError).message).toBe('Ese hueco ya no está disponible.');
      expect(classifyBookingError(error)).toBe('slotTaken');
      expect(isSlotTakenError(error)).toBe(true); // la UI puede volver a los huecos
    }
  });

  it('validación: 400/422 con { error } → "invalidData" y el mensaje del servidor se conserva', async () => {
    for (const status of [400, 422]) {
      const fetchFn = vi
        .fn()
        .mockResolvedValue(fakeResponse({ error: 'Teléfono no válido.' }, status));
      const api = createSalonOsApi({ baseUrl: BASE, slug: SLUG, fetchFn });

      const error = await api.createBooking(INPUT).catch((e) => e);

      expect(classifyBookingError(error)).toBe('invalidData');
      expect((error as SalonOsApiError).message).toBe('Teléfono no válido.'); // mostrable al usuario
    }
  });

  it('red caída: fetch rechaza → SalonOsApiError status 0 (con cause) → "network", en cualquier método', async () => {
    const cause = new TypeError('Failed to fetch');
    const fetchFn = vi.fn().mockRejectedValue(cause);
    const api = createSalonOsApi({ baseUrl: BASE, slug: SLUG, fetchFn });

    const onPost = await api.createBooking(INPUT).catch((e) => e);
    expect(onPost).toBeInstanceOf(SalonOsApiError);
    expect((onPost as SalonOsApiError).status).toBe(0);
    expect((onPost as SalonOsApiError).cause).toBe(cause);
    expect(classifyBookingError(onPost)).toBe('network');

    // Agnóstico al método: una lectura caída se clasifica igual.
    const onGet = await api.getAvailability({ serviceId: SERVICE_ID, date: '2026-07-20' }).catch((e) => e);
    expect(classifyBookingError(onGet)).toBe('network');
  });
});

// ── "sin romper la app": rechazos atrapables + cliente sin estado ────────────────
describe('sin romper la app', () => {
  it('la llamada RECHAZA (promesa atrapable), nunca lanza sincrónicamente', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new TypeError('down'));
    const api = createSalonOsApi({ baseUrl: BASE, slug: SLUG, fetchFn });

    let promise: Promise<unknown> | undefined;
    // Invocar no debe lanzar en el acto: el fallo llega como rechazo del Promise.
    expect(() => {
      promise = api.createBooking(INPUT);
    }).not.toThrow();
    expect(promise).toBeInstanceOf(Promise);
    await expect(promise!).rejects.toBeInstanceOf(SalonOsApiError);
  });

  it('un fallo puntual no envenena el cliente: la siguiente llamada vuelve a funcionar', async () => {
    const fetchFn = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('caída puntual'))
      .mockResolvedValueOnce(fakeResponse({ slots: [] }));
    const api = createSalonOsApi({ baseUrl: BASE, slug: SLUG, fetchFn });

    await expect(
      api.getAvailability({ serviceId: SERVICE_ID, date: '2026-07-20' }),
    ).rejects.toBeInstanceOf(SalonOsApiError);
    // El transporte no guarda estado entre peticiones: reintentar devuelve datos.
    await expect(
      api.getAvailability({ serviceId: SERVICE_ID, date: '2026-07-20' }),
    ).resolves.toEqual([]);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
});
