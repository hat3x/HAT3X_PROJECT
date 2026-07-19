// Test de CONTRATO de la reserva pública, centrado en los campos EXACTOS que viajan
// al servidor. Complementa a salon-os-api.test.ts (que cubre URLs, verbos y errores)
// blindando lo único que el transporte NO puede recalcular: la FORMA del cuerpo.
//
// Fuente de verdad: salon-os · src/lib/booking/schema.ts
//   · bookingCustomerSchema = { fullName, email?, phone, notes?, marketingConsent? }
//   · createBookingSchema   = { serviceId, professionalId, startsAt, customer }.strict()
//
// El `.strict()` del servidor RECHAZA (400) cualquier clave extra en el cuerpo. Por eso
// aquí se afirma, en tiempo de compilación Y de ejecución, que el cliente envía EXACTA-
// mente esas claves: ni una de más (invención) ni una de menos (pérdida de dato). Si el
// contrato del cliente o del servidor cambia sin sincronizar el otro, esto deja de
// compilar o el test se pone rojo.
import { describe, it, expect, vi } from 'vitest';
import {
  createSalonOsApi,
  type BookingCustomerInput,
  type CreateBookingInput,
  type BookingConfirmation,
} from './salon-os-api';

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

/** Respuesta fake mínima (evita depender del global Response). */
function fakeResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

/** Crea el cliente con un fetch espía y devuelve ambos para inspeccionar el cuerpo. */
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

// ── Cierre de claves en TIEMPO DE COMPILACIÓN ───────────────────────────────────
// Igualdad EXACTA (bidireccional) entre el conjunto de claves del tipo del cliente y la
// lista declarada de campos del schema. Si divergen, `_match` no puede ser `true` y el
// fichero no compila → typecheck en rojo antes de llegar a runtime.
type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

const CUSTOMER_FIELDS = ['fullName', 'email', 'phone', 'notes', 'marketingConsent'] as const;
type ListedCustomerKey = (typeof CUSTOMER_FIELDS)[number];
const _customerKeysMatch: Exact<keyof BookingCustomerInput, ListedCustomerKey> = true;
void _customerKeysMatch;

const BOOKING_FIELDS = ['serviceId', 'professionalId', 'startsAt', 'customer'] as const;
type ListedBookingKey = (typeof BOOKING_FIELDS)[number];
const _bookingKeysMatch: Exact<keyof CreateBookingInput, ListedBookingKey> = true;
void _bookingKeysMatch;

// ── Cierre de claves + fidelidad en TIEMPO DE EJECUCIÓN ─────────────────────────
describe('contrato del cuerpo de reserva — campos EXACTOS de customer', () => {
  it('envía los 5 campos del cliente tal cual cuando están todos presentes', async () => {
    const customer: BookingCustomerInput = {
      fullName: 'Ana García',
      email: 'ana@example.com',
      phone: '600123123',
      notes: 'Alergia a un tinte concreto.',
      marketingConsent: true,
    };
    const { api, fetchFn } = apiWithSpy();

    await api.createBooking({
      serviceId: SERVICE_ID,
      professionalId: PROFESSIONAL_ID,
      startsAt: STARTS_AT,
      customer,
    });

    const body = postedBody(fetchFn);
    // La raíz lleva EXACTAMENTE las 4 claves del contrato (nada de sobra: server .strict()).
    expect(Object.keys(body).sort()).toEqual([...BOOKING_FIELDS].sort());
    // El bloque customer lleva EXACTAMENTE los 5 campos del schema, con sus valores.
    expect(Object.keys(body.customer).sort()).toEqual([...CUSTOMER_FIELDS].sort());
    expect(body.customer).toEqual(customer);
  });

  it('omite del cuerpo los campos opcionales ausentes (customer mínimo)', async () => {
    // Sólo los obligatorios del schema: fullName + phone.
    const customer: BookingCustomerInput = { fullName: 'Ana García', phone: '600123123' };
    const { api, fetchFn } = apiWithSpy();

    await api.createBooking({
      serviceId: SERVICE_ID,
      professionalId: 'any',
      startsAt: STARTS_AT,
      customer,
    });

    const body = postedBody(fetchFn);
    // JSON.stringify no serializa `undefined`: no se cuela ninguna clave opcional vacía.
    expect(Object.keys(body.customer).sort()).toEqual(['fullName', 'phone']);
    expect(body.customer).toEqual(customer);
  });

  it('preserva el email vacío ("") — lo normaliza el servidor, no el cliente', async () => {
    // El schema admite email como "" (además de email válido u omitido). El transporte
    // NO decide: pasa "" tal cual y deja que el servidor lo normalice a null.
    const customer: BookingCustomerInput = { fullName: 'Ana García', phone: '600123123', email: '' };
    const { api, fetchFn } = apiWithSpy();

    await api.createBooking({
      serviceId: SERVICE_ID,
      professionalId: 'any',
      startsAt: STARTS_AT,
      customer,
    });

    expect(postedBody(fetchFn).customer.email).toBe('');
  });

  it('conserva professionalId "any" en el cuerpo (lo resuelve el servidor)', async () => {
    // A diferencia de la query de disponibilidad (donde "any" se OMITE), en el POST "any"
    // es un valor legítimo del schema: el cliente no debe traducirlo ni omitirlo.
    const { api, fetchFn } = apiWithSpy();

    await api.createBooking({
      serviceId: SERVICE_ID,
      professionalId: 'any',
      startsAt: STARTS_AT,
      customer: { fullName: 'Ana García', phone: '600123123' },
    });

    expect(postedBody(fetchFn).professionalId).toBe('any');
  });
});
