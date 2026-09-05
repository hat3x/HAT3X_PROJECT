import { describe, it, expect } from 'vitest';
import type { AppointmentListItem } from './appointments';
import { APPOINTMENT_STATUS_LABELS } from './appointment-groups';
import {
  formatDayHeading,
  formatTime,
  formatTimeRange,
  formatWeekHeading,
  groupByLocalDay,
  statusMeta,
} from './employee-agenda';

// Construye una cadena ISO A PARTIR DE COMPONENTES LOCALES. Como el formateo/agrupación de la
// agenda trabaja en hora LOCAL, generar el ISO desde un Date local hace que los tests sean
// deterministas independientemente del huso de la máquina (round-trip local → UTC → local).
function localISO(y: number, m: number, d: number, h = 0, min = 0): string {
  return new Date(y, m, d, h, min, 0, 0).toISOString();
}

/** Item de vista sintético (mismo espíritu que appointment-groups.test.ts). */
function makeItem(overrides: Partial<AppointmentListItem> = {}): AppointmentListItem {
  return {
    id: 'apt-1',
    salonId: 'salon-1',
    customerId: 'cust-1',
    professionalId: 'prof-1',
    serviceId: 'svc-1',
    startsAt: localISO(2026, 6, 22, 9, 0),
    endsAt: localISO(2026, 6, 22, 10, 0),
    status: 'confirmed',
    priceCents: 3500,
    currency: 'EUR',
    notes: null,
    customer: { fullName: 'Ada Lovelace', phone: '+34600111222' },
    service: { id: 'svc-1', name: 'Corte + peinado' },
    professional: { id: 'prof-1', fullName: 'Grace Hopper', color: '#22c55e' },
    ...overrides,
  };
}

describe('statusMeta', () => {
  it('usa la etiqueta es-ES canónica de appointment-groups para cada estado', () => {
    expect(statusMeta('pending').label).toBe(APPOINTMENT_STATUS_LABELS.pending);
    expect(statusMeta('confirmed').label).toBe(APPOINTMENT_STATUS_LABELS.confirmed);
    expect(statusMeta('completed').label).toBe(APPOINTMENT_STATUS_LABELS.completed);
    expect(statusMeta('cancelled').label).toBe(APPOINTMENT_STATUS_LABELS.cancelled);
    expect(statusMeta('no_show').label).toBe(APPOINTMENT_STATUS_LABELS.no_show);
  });

  it('asigna variantes de color coherentes (confirmada destaca; cancelada/no-show en rojo)', () => {
    expect(statusMeta('confirmed').variant).toBe('default');
    expect(statusMeta('pending').variant).toBe('secondary');
    expect(statusMeta('completed').variant).toBe('outline');
    expect(statusMeta('cancelled').variant).toBe('destructive');
    expect(statusMeta('no_show').variant).toBe('destructive');
  });
});

describe('formatTime / formatTimeRange', () => {
  it('formatea el instante en hora local HH:mm', () => {
    expect(formatTime(localISO(2026, 6, 22, 9, 5))).toBe('09:05');
    expect(formatTime(localISO(2026, 6, 22, 18, 30))).toBe('18:30');
  });

  it('compone el rango con guion largo y espacios', () => {
    const start = localISO(2026, 6, 22, 9, 0);
    const end = localISO(2026, 6, 22, 10, 15);
    expect(formatTimeRange(start, end)).toBe('09:00 – 10:15');
  });
});

describe('formatDayHeading', () => {
  it('devuelve el día capitalizado en español', () => {
    // 22/07/2026 es miércoles (mismo ref que appointments.test.ts).
    expect(formatDayHeading(new Date(2026, 6, 22))).toBe('Miércoles, 22 de julio');
  });
});

describe('formatWeekHeading', () => {
  it('mismo mes: abrevia el mes una sola vez al final', () => {
    // Semana (lunes) que contiene el 22/07/2026: 20 → 26 de julio.
    expect(formatWeekHeading(new Date(2026, 6, 22))).toBe('20 – 26 de jul');
  });

  it('a caballo entre meses: muestra el mes en ambos extremos', () => {
    // Semana (lunes) que contiene el 30/07/2026: 27 jul → 2 ago.
    expect(formatWeekHeading(new Date(2026, 6, 30))).toBe('27 de jul – 2 de ago');
  });
});

describe('groupByLocalDay', () => {
  it('con lista vacía devuelve []', () => {
    expect(groupByLocalDay([])).toEqual([]);
  });

  it('agrupa por día local y ordena los días cronológicamente', () => {
    const items = [
      makeItem({ id: 'b', startsAt: localISO(2026, 6, 22, 9, 0), endsAt: localISO(2026, 6, 22, 10, 0) }),
      makeItem({ id: 'a', startsAt: localISO(2026, 6, 20, 12, 0), endsAt: localISO(2026, 6, 20, 13, 0) }),
    ];
    const groups = groupByLocalDay(items);
    expect(groups.map((g) => g.key)).toEqual(['2026-07-20', '2026-07-22']);
  });

  it('dentro de un día reafirma el orden ascendente por starts_at', () => {
    const items = [
      makeItem({ id: 'late', startsAt: localISO(2026, 6, 22, 17, 0), endsAt: localISO(2026, 6, 22, 18, 0) }),
      makeItem({ id: 'early', startsAt: localISO(2026, 6, 22, 9, 0), endsAt: localISO(2026, 6, 22, 10, 0) }),
    ];
    const [group] = groupByLocalDay(items);
    expect(group.appointments.map((a) => a.id)).toEqual(['early', 'late']);
  });

  it('cuenta una cita nocturna en su día LOCAL (no en el de la cadena UTC)', () => {
    // 23:30 hora local del 22/07: debe caer en 2026-07-22 sea cual sea el huso.
    const groups = groupByLocalDay([
      makeItem({ startsAt: localISO(2026, 6, 22, 23, 30), endsAt: localISO(2026, 6, 23, 0, 30) }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe('2026-07-22');
  });

  it('es puro: no muta el array de entrada', () => {
    const items = [makeItem({ id: 'x' })];
    const snapshot = [...items];
    groupByLocalDay(items);
    expect(items).toEqual(snapshot);
  });
});
