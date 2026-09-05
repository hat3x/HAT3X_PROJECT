import { describe, it, expect } from 'vitest';
import { addDays, addWeeks, startOfDay, startOfWeek } from 'date-fns';
import {
  APPOINTMENTS_SELECT,
  compareByStartsAt,
  dayRange,
  mapAppointmentRow,
  mapAppointmentRows,
  sortByStartsAt,
  weekRange,
  type AppointmentListItem,
  type AppointmentRow,
} from './appointments';

// Instante de referencia fijo para las pruebas (miércoles 22/07/2026, 09:00 UTC). Las
// comprobaciones de rango se hacen contra date-fns con el MISMO `ref`, de modo que son
// independientes de la zona horaria de la máquina que ejecuta los tests.
const REF = new Date('2026-07-22T09:00:00.000Z');

/** Fábrica de fila cruda sintética (embeds completos por defecto). */
function makeRow(overrides: Partial<AppointmentRow> = {}): AppointmentRow {
  return {
    id: 'apt-1',
    salon_id: 'salon-1',
    customer_id: 'cust-1',
    professional_id: 'prof-1',
    service_id: 'svc-1',
    starts_at: '2026-07-22T09:00:00.000Z',
    ends_at: '2026-07-22T10:00:00.000Z',
    status: 'confirmed',
    price_cents: 3500,
    currency: 'EUR',
    notes: null,
    customer: { full_name: 'Ada Lovelace', phone: '+34600111222' },
    service: { id: 'svc-1', name: 'Corte + peinado' },
    professional: { id: 'prof-1', full_name: 'Grace Hopper', color: '#22c55e' },
    ...overrides,
  };
}

describe('dayRange', () => {
  it('devuelve el intervalo [inicio de día, inicio del día siguiente) en ISO', () => {
    const { gte, lt } = dayRange(REF);
    expect(gte).toBe(startOfDay(REF).toISOString());
    expect(lt).toBe(startOfDay(addDays(REF, 1)).toISOString());
  });

  it('es semiabierto: el propio ref cae dentro de [gte, lt)', () => {
    const { gte, lt } = dayRange(REF);
    expect(new Date(gte).getTime()).toBeLessThanOrEqual(REF.getTime());
    expect(REF.getTime()).toBeLessThan(new Date(lt).getTime());
  });

  it('produce cadenas ISO válidas (round-trip por Date)', () => {
    const { gte, lt } = dayRange(REF);
    expect(new Date(gte).toISOString()).toBe(gte);
    expect(new Date(lt).toISOString()).toBe(lt);
  });
});

describe('weekRange', () => {
  it('por defecto la semana empieza en LUNES', () => {
    const { gte } = weekRange(REF);
    // getDay() en hora local: 1 = lunes (mismo huso con el que se calculó startOfWeek).
    expect(new Date(gte).getDay()).toBe(1);
    expect(gte).toBe(startOfWeek(REF, { weekStartsOn: 1 }).toISOString());
  });

  it('abarca exactamente una semana de calendario', () => {
    const { gte, lt } = weekRange(REF);
    const expectedLt = addWeeks(startOfWeek(REF, { weekStartsOn: 1 }), 1).toISOString();
    expect(lt).toBe(expectedLt);
  });

  it('respeta un primer día de semana distinto (domingo = 0)', () => {
    const { gte } = weekRange(REF, 0);
    expect(new Date(gte).getDay()).toBe(0);
  });

  it('es semiabierto: el ref cae dentro de [gte, lt)', () => {
    const { gte, lt } = weekRange(REF);
    expect(new Date(gte).getTime()).toBeLessThanOrEqual(REF.getTime());
    expect(REF.getTime()).toBeLessThan(new Date(lt).getTime());
  });
});

describe('APPOINTMENTS_SELECT', () => {
  it('acota por starts_at y embebe customers(full_name, phone), services y professionals', () => {
    expect(APPOINTMENTS_SELECT).toContain('starts_at');
    // Joins desambiguados por el nombre de la FK.
    expect(APPOINTMENTS_SELECT).toContain('customers!appointments_customer_id_fkey');
    expect(APPOINTMENTS_SELECT).toContain('services!appointments_service_id_fkey');
    expect(APPOINTMENTS_SELECT).toContain('professionals!appointments_professional_id_fkey');
    // Campos pedidos del cliente.
    expect(APPOINTMENTS_SELECT).toContain('full_name');
    expect(APPOINTMENTS_SELECT).toContain('phone');
  });
});

describe('mapAppointmentRow', () => {
  it('aplana los embeds y normaliza a camelCase', () => {
    const item = mapAppointmentRow(makeRow());
    expect(item).toEqual<AppointmentListItem>({
      id: 'apt-1',
      salonId: 'salon-1',
      customerId: 'cust-1',
      professionalId: 'prof-1',
      serviceId: 'svc-1',
      startsAt: '2026-07-22T09:00:00.000Z',
      endsAt: '2026-07-22T10:00:00.000Z',
      status: 'confirmed',
      priceCents: 3500,
      currency: 'EUR',
      notes: null,
      customer: { fullName: 'Ada Lovelace', phone: '+34600111222' },
      service: { id: 'svc-1', name: 'Corte + peinado' },
      professional: { id: 'prof-1', fullName: 'Grace Hopper', color: '#22c55e' },
    });
  });

  it('es null-safe cuando algún embed viene vacío (RLS/orfandad defensiva)', () => {
    const item = mapAppointmentRow(
      makeRow({ customer: null, service: null, professional: null }),
    );
    expect(item.customer).toBeNull();
    expect(item.service).toBeNull();
    expect(item.professional).toBeNull();
    // Los ids de FK de primer nivel se conservan aunque el embed falte.
    expect(item.customerId).toBe('cust-1');
  });

  it('normaliza teléfono ausente del cliente a null', () => {
    const item = mapAppointmentRow(makeRow({ customer: { full_name: 'Sin tel', phone: null } }));
    expect(item.customer).toEqual({ fullName: 'Sin tel', phone: null });
  });
});

describe('mapAppointmentRows', () => {
  it('mapea un lote y tolera null/undefined ⇒ lista vacía', () => {
    expect(mapAppointmentRows(null)).toEqual([]);
    expect(mapAppointmentRows(undefined)).toEqual([]);
    expect(mapAppointmentRows([makeRow(), makeRow({ id: 'apt-2' })])).toHaveLength(2);
  });
});

describe('compareByStartsAt / sortByStartsAt', () => {
  const early = mapAppointmentRow(makeRow({ id: 'a', starts_at: '2026-07-22T08:00:00.000Z' }));
  const late = mapAppointmentRow(makeRow({ id: 'b', starts_at: '2026-07-22T18:00:00.000Z' }));

  it('ordena ascendente por starts_at', () => {
    expect(sortByStartsAt([late, early]).map((a) => a.id)).toEqual(['a', 'b']);
  });

  it('no muta el array de entrada', () => {
    const input = [late, early];
    const output = sortByStartsAt(input);
    expect(input.map((a) => a.id)).toEqual(['b', 'a']); // intacto
    expect(output).not.toBe(input);
  });

  it('desempata de forma estable por id cuando starts_at coincide', () => {
    const z = mapAppointmentRow(makeRow({ id: 'z', starts_at: '2026-07-22T09:00:00.000Z' }));
    const a = mapAppointmentRow(makeRow({ id: 'a', starts_at: '2026-07-22T09:00:00.000Z' }));
    expect(sortByStartsAt([z, a]).map((x) => x.id)).toEqual(['a', 'z']);
    expect(compareByStartsAt(a, z)).toBeLessThan(0);
  });
});
