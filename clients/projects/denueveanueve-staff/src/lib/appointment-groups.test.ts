import { describe, it, expect } from 'vitest';
import type { AppointmentListItem, AppointmentStatus } from './appointments';
import {
  APPOINTMENT_STATUS_LABELS,
  UNKNOWN_PROFESSIONAL_LABEL,
  countAppointments,
  groupAppointmentsByProfessional,
  professionalDisplayName,
} from './appointment-groups';

// Fábrica de item de vista sintético (mismo espíritu que appointments.test.ts): embeds
// completos por defecto, sobreescribibles por caso. `startsAt`/`endsAt` en ISO 8601 UTC.
function makeItem(overrides: Partial<AppointmentListItem> = {}): AppointmentListItem {
  return {
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
    ...overrides,
  };
}

function pro(id: string, fullName: string, color: string | null = null) {
  return { id, fullName, color };
}

describe('groupAppointmentsByProfessional — particionado', () => {
  it('con lista vacía devuelve [] (sin grupos)', () => {
    expect(groupAppointmentsByProfessional([])).toEqual([]);
  });

  it('reúne bajo un mismo grupo todas las citas del mismo professionalId', () => {
    const items = [
      makeItem({ id: 'a', professionalId: 'p1', professional: pro('p1', 'Ana') }),
      makeItem({ id: 'b', professionalId: 'p1', professional: pro('p1', 'Ana') }),
      makeItem({ id: 'c', professionalId: 'p2', professional: pro('p2', 'Bruno') }),
    ];

    const groups = groupAppointmentsByProfessional(items);

    expect(groups).toHaveLength(2);
    const ana = groups.find((g) => g.professionalId === 'p1');
    expect(ana?.appointments.map((a) => a.id)).toEqual(['a', 'b']);
    expect(groups.find((g) => g.professionalId === 'p2')?.appointments).toHaveLength(1);
  });

  it('dentro de cada grupo ordena las citas ascendente por starts_at', () => {
    const items = [
      makeItem({ id: 'late', professionalId: 'p1', startsAt: '2026-07-22T17:00:00.000Z' }),
      makeItem({ id: 'early', professionalId: 'p1', startsAt: '2026-07-22T09:00:00.000Z' }),
      makeItem({ id: 'mid', professionalId: 'p1', startsAt: '2026-07-22T12:30:00.000Z' }),
    ];

    const [group] = groupAppointmentsByProfessional(items);

    expect(group.appointments.map((a) => a.id)).toEqual(['early', 'mid', 'late']);
  });
});

describe('groupAppointmentsByProfessional — orden de los grupos', () => {
  it('ordena los grupos alfabéticamente por nombre de profesional (locale es)', () => {
    const items = [
      makeItem({ id: 'c', professionalId: 'p3', professional: pro('p3', 'Carlos') }),
      makeItem({ id: 'a', professionalId: 'p1', professional: pro('p1', 'Ana') }),
      makeItem({ id: 'b', professionalId: 'p2', professional: pro('p2', 'Bruno') }),
    ];

    const names = groupAppointmentsByProfessional(items).map((g) => g.professional?.fullName);

    expect(names).toEqual(['Ana', 'Bruno', 'Carlos']);
  });

  it('ignora mayúsculas y acentos al ordenar (Álvaro junto a Alba, antes de Bruno)', () => {
    const items = [
      makeItem({ id: 'b', professionalId: 'p2', professional: pro('p2', 'bruno') }),
      makeItem({ id: 'v', professionalId: 'p3', professional: pro('p3', 'Álvaro') }),
      makeItem({ id: 'a', professionalId: 'p1', professional: pro('p1', 'Alba') }),
    ];

    const names = groupAppointmentsByProfessional(items).map((g) => g.professional?.fullName);

    expect(names).toEqual(['Alba', 'Álvaro', 'bruno']);
  });

  it('coloca al final los grupos cuyo profesional no se resolvió (embed null)', () => {
    const items = [
      makeItem({ id: 'x', professionalId: 'p9', professional: null }),
      makeItem({ id: 'a', professionalId: 'p1', professional: pro('p1', 'Ana') }),
    ];

    const groups = groupAppointmentsByProfessional(items);

    expect(groups.map((g) => g.professionalId)).toEqual(['p1', 'p9']);
    expect(groups[1].professional).toBeNull();
  });

  it('completa el profesional del grupo si una cita posterior sí trae el embed', () => {
    const items = [
      makeItem({ id: 'first', professionalId: 'p1', professional: null }),
      makeItem({ id: 'second', professionalId: 'p1', professional: pro('p1', 'Ana', '#f00') }),
    ];

    const [group] = groupAppointmentsByProfessional(items);

    expect(group.professional).toEqual({ id: 'p1', fullName: 'Ana', color: '#f00' });
    expect(group.appointments).toHaveLength(2);
  });

  it('es determinista (desempate por professionalId) con nombres homónimos', () => {
    const items = [
      makeItem({ id: 'z', professionalId: 'p-z', professional: pro('p-z', 'Ana') }),
      makeItem({ id: 'a', professionalId: 'p-a', professional: pro('p-a', 'Ana') }),
    ];

    const ids = groupAppointmentsByProfessional(items).map((g) => g.professionalId);

    expect(ids).toEqual(['p-a', 'p-z']);
  });

  it('no muta el array de entrada ni su orden', () => {
    const items = [
      makeItem({ id: 'late', professionalId: 'p1', startsAt: '2026-07-22T17:00:00.000Z' }),
      makeItem({ id: 'early', professionalId: 'p1', startsAt: '2026-07-22T09:00:00.000Z' }),
    ];
    const snapshot = items.map((i) => i.id);

    groupAppointmentsByProfessional(items);

    expect(items.map((i) => i.id)).toEqual(snapshot);
  });
});

describe('professionalDisplayName', () => {
  it('devuelve el nombre del profesional cuando existe', () => {
    const [group] = groupAppointmentsByProfessional([
      makeItem({ professionalId: 'p1', professional: pro('p1', 'Grace Hopper') }),
    ]);
    expect(professionalDisplayName(group)).toBe('Grace Hopper');
  });

  it('cae al texto neutro cuando el profesional es null o su nombre está vacío', () => {
    const [nullGroup] = groupAppointmentsByProfessional([
      makeItem({ professionalId: 'p1', professional: null }),
    ]);
    expect(professionalDisplayName(nullGroup)).toBe(UNKNOWN_PROFESSIONAL_LABEL);

    const [blankGroup] = groupAppointmentsByProfessional([
      makeItem({ professionalId: 'p2', professional: pro('p2', '   ') }),
    ]);
    expect(professionalDisplayName(blankGroup)).toBe(UNKNOWN_PROFESSIONAL_LABEL);
  });
});

describe('countAppointments', () => {
  it('suma las citas de todos los grupos', () => {
    const groups = groupAppointmentsByProfessional([
      makeItem({ id: 'a', professionalId: 'p1' }),
      makeItem({ id: 'b', professionalId: 'p1' }),
      makeItem({ id: 'c', professionalId: 'p2', professional: pro('p2', 'Bruno') }),
    ]);
    expect(countAppointments(groups)).toBe(3);
  });

  it('es 0 sin grupos', () => {
    expect(countAppointments([])).toBe(0);
  });
});

describe('APPOINTMENT_STATUS_LABELS', () => {
  it('cubre todos los estados del enum con una etiqueta legible', () => {
    const statuses: AppointmentStatus[] = [
      'pending',
      'confirmed',
      'completed',
      'cancelled',
      'no_show',
    ];
    for (const status of statuses) {
      expect(APPOINTMENT_STATUS_LABELS[status]).toBeTruthy();
    }
    expect(APPOINTMENT_STATUS_LABELS.no_show).toBe('No asistió');
  });
});
