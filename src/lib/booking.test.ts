// Tests de la lógica PURA del asistente de reserva (src/lib/booking.ts).
//
// Blindan lo que el cliente SÍ decide (presentación y forma del cuerpo) sin cruzar la
// línea que es del servidor (disponibilidad del modelo de 3 fases): aquí no se prueba
// —ni existe— ningún cálculo de si un hueco es reservable; los `PublicSlot` se dan por
// verdad y sólo se comprueba su orden/dedup para pintarlos.
import { describe, it, expect } from 'vitest';
import type {
  BookingBootstrap,
  PublicProfessional,
  PublicService,
  PublicSlot,
} from '@/lib/salon-os-api';
import {
  buildBookingCustomer,
  formatLocalDate,
  groupServicesByCategory,
  isCustomerComplete,
  prepareSlots,
  professionalName,
  professionalsForService,
} from '@/lib/booking';

// ── Fixtures sintéticas (uuids/ids de juguete, no producción) ────────────────────

const svc = (id: string, over: Partial<PublicService> = {}): PublicService => ({
  id,
  name: `Servicio ${id}`,
  description: null,
  category: null,
  durationMinutes: 30,
  priceCents: 2500,
  currency: 'EUR',
  ...over,
});

const pro = (id: string, fullName: string): PublicProfessional => ({
  id,
  fullName,
  color: null,
});

const slot = (startsAt: string, professionalId: string, endsAt = ''): PublicSlot => ({
  startsAt,
  endsAt: endsAt || startsAt,
  professionalId,
});

const bootstrap = (over: Partial<BookingBootstrap> = {}): BookingBootstrap => ({
  salon: { id: 's1', name: 'Salón', slug: 'salon', timezone: 'Europe/Madrid', phone: null, address: null },
  services: [svc('svc-a'), svc('svc-b')],
  professionals: [pro('pro-1', 'Ana'), pro('pro-2', 'Beto'), pro('pro-3', 'Caro')],
  serviceProfessionals: { 'svc-a': ['pro-1', 'pro-3'], 'svc-b': [] },
  ...over,
});

// ── formatLocalDate ──────────────────────────────────────────────────────────────

describe('formatLocalDate', () => {
  it('formatea el día LOCAL como YYYY-MM-DD con ceros a la izquierda', () => {
    // Fecha construida con componentes locales (evita el salto de huso de toISOString).
    expect(formatLocalDate(new Date(2026, 0, 5))).toBe('2026-01-05'); // enero = mes 0
    expect(formatLocalDate(new Date(2026, 11, 31))).toBe('2026-12-31');
  });
});

// ── professionalsForService / professionalName ──────────────────────────────────

describe('professionalsForService', () => {
  it('devuelve los profesionales del servicio en el orden del catálogo', () => {
    const result = professionalsForService(bootstrap(), 'svc-a');
    expect(result.map((p) => p.id)).toEqual(['pro-1', 'pro-3']); // respeta orden bootstrap
  });

  it('devuelve lista vacía si el servicio no tiene profesionales o no existe', () => {
    expect(professionalsForService(bootstrap(), 'svc-b')).toEqual([]);
    expect(professionalsForService(bootstrap(), 'no-existe')).toEqual([]);
  });

  it('ignora ids sin ficha en el catálogo sin romper', () => {
    const b = bootstrap({ serviceProfessionals: { 'svc-a': ['pro-1', 'fantasma'] } });
    expect(professionalsForService(b, 'svc-a').map((p) => p.id)).toEqual(['pro-1']);
  });
});

describe('professionalName', () => {
  it('resuelve el nombre por id y null si no está o el id es vacío', () => {
    const b = bootstrap();
    expect(professionalName(b, 'pro-2')).toBe('Beto');
    expect(professionalName(b, 'no-existe')).toBeNull();
    expect(professionalName(b, null)).toBeNull();
  });
});

// ── groupServicesByCategory ──────────────────────────────────────────────────────

describe('groupServicesByCategory', () => {
  it('agrupa por categoría preservando el orden de aparición', () => {
    const services = [
      svc('1', { category: 'Corte' }),
      svc('2', { category: 'Color' }),
      svc('3', { category: 'Corte' }),
    ];
    const groups = groupServicesByCategory(services, 'Otros');
    expect(groups.map((g) => g.category)).toEqual(['Corte', 'Color']);
    expect(groups[0].services.map((s) => s.id)).toEqual(['1', '3']);
  });

  it('junta los servicios sin categoría bajo el fallback y SIEMPRE al final', () => {
    const services = [
      svc('1', { category: null }),
      svc('2', { category: 'Corte' }),
      svc('3', { category: '   ' }), // vacía tras recortar → sin categoría
    ];
    const groups = groupServicesByCategory(services, 'Otros');
    expect(groups.map((g) => g.category)).toEqual(['Corte', 'Otros']);
    expect(groups.at(-1)!.services.map((s) => s.id)).toEqual(['1', '3']);
  });

  it('no muta la entrada', () => {
    const services = [svc('1', { category: 'Corte' })];
    const copy = [...services];
    groupServicesByCategory(services, 'Otros');
    expect(services).toEqual(copy);
  });
});

// ── prepareSlots (orden + dedup de presentación) ────────────────────────────────

describe('prepareSlots', () => {
  it('ordena por startsAt ascendente', () => {
    const slots = [slot('2026-07-20T11:00:00Z', 'pro-1'), slot('2026-07-20T09:00:00Z', 'pro-1')];
    expect(prepareSlots(slots).map((s) => s.startsAt)).toEqual([
      '2026-07-20T09:00:00Z',
      '2026-07-20T11:00:00Z',
    ]);
  });

  it('deduplica por startsAt quedándose con el PRIMER hueco de esa hora (modo "cualquiera")', () => {
    // Dos profesionales libres a la misma hora → una sola hora visible, con el primero.
    const slots = [
      slot('2026-07-20T09:00:00Z', 'pro-2'),
      slot('2026-07-20T09:00:00Z', 'pro-1'),
      slot('2026-07-20T09:30:00Z', 'pro-1'),
    ];
    const result = prepareSlots(slots);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ startsAt: '2026-07-20T09:00:00Z', professionalId: 'pro-2' });
    expect(result[1].startsAt).toBe('2026-07-20T09:30:00Z');
  });

  it('lista vacía si no hay huecos', () => {
    expect(prepareSlots([])).toEqual([]);
  });
});

// ── isCustomerComplete ───────────────────────────────────────────────────────────

describe('isCustomerComplete', () => {
  it('exige nombre y teléfono no vacíos (recortados)', () => {
    expect(isCustomerComplete({ fullName: 'Ana', phone: '600' })).toBe(true);
    expect(isCustomerComplete({ fullName: '  ', phone: '600' })).toBe(false);
    expect(isCustomerComplete({ fullName: 'Ana', phone: '   ' })).toBe(false);
  });
});

// ── buildBookingCustomer (forma EXACTA del cuerpo) ──────────────────────────────

describe('buildBookingCustomer', () => {
  it('manda sólo fullName y phone (recortados) cuando no hay opcionales', () => {
    const customer = buildBookingCustomer({ fullName: '  Ana García ', phone: ' 600123123 ' });
    expect(Object.keys(customer).sort()).toEqual(['fullName', 'phone']);
    expect(customer).toEqual({ fullName: 'Ana García', phone: '600123123' });
  });

  it('incluye email y notes sólo si tienen contenido; omite los vacíos', () => {
    const customer = buildBookingCustomer({
      fullName: 'Ana',
      phone: '600',
      email: '  ana@example.com ',
      notes: '   ',
    });
    expect(customer).toEqual({ fullName: 'Ana', phone: '600', email: 'ana@example.com' });
    expect('notes' in customer).toBe(false);
  });

  it('incluye marketingConsent sólo cuando es booleano', () => {
    expect('marketingConsent' in buildBookingCustomer({ fullName: 'A', phone: '6' })).toBe(false);
    expect(buildBookingCustomer({ fullName: 'A', phone: '6', marketingConsent: false }))
      .toMatchObject({ marketingConsent: false });
    expect(buildBookingCustomer({ fullName: 'A', phone: '6', marketingConsent: true }))
      .toMatchObject({ marketingConsent: true });
  });

  it('nunca añade claves fuera del contrato .strict() del servidor', () => {
    const customer = buildBookingCustomer({
      fullName: 'Ana',
      phone: '600',
      email: 'ana@example.com',
      notes: 'Alergia',
      marketingConsent: true,
    });
    const allowed = ['fullName', 'phone', 'email', 'notes', 'marketingConsent'].sort();
    expect(Object.keys(customer).sort()).toEqual(allowed);
  });
});
