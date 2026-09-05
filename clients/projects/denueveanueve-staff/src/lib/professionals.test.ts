import { describe, it, expect } from 'vitest';
import {
  PROFESSIONALS_SELECT,
  compareByFullName,
  dedupeServices,
  initials,
  mapProfessionalRow,
  mapProfessionalRows,
  readableTextColor,
  sortByFullName,
  type ProfessionalListItem,
  type ProfessionalRow,
  type ProfessionalServiceRef,
} from './professionals';

/** Fábrica de fila cruda sintética (un profesional activo con un servicio embebido). */
function makeRow(overrides: Partial<ProfessionalRow> = {}): ProfessionalRow {
  return {
    id: 'prof-1',
    salon_id: 'salon-1',
    full_name: 'Ada Lovelace',
    active: true,
    color: '#22c55e',
    specialties: ['color'],
    user_id: null,
    professional_services: [
      { service: { id: 'svc-1', name: 'Corte', active: true } },
    ],
    ...overrides,
  };
}

function makeItem(overrides: Partial<ProfessionalListItem> = {}): ProfessionalListItem {
  return {
    id: 'prof-1',
    salonId: 'salon-1',
    fullName: 'Ada Lovelace',
    active: true,
    color: '#22c55e',
    specialties: [],
    userId: null,
    services: [],
    ...overrides,
  };
}

describe('PROFESSIONALS_SELECT', () => {
  it('pide las columnas base del listado', () => {
    for (const col of ['id', 'salon_id', 'full_name', 'active', 'color', 'specialties', 'user_id']) {
      expect(PROFESSIONALS_SELECT).toContain(col);
    }
  });

  it('embebe los servicios vía la tabla puente con el nombre de FK (sin N+1)', () => {
    expect(PROFESSIONALS_SELECT).toContain('professional_services');
    expect(PROFESSIONALS_SELECT).toContain('services!professional_services_service_id_fkey');
  });
});

describe('mapProfessionalRow', () => {
  it('mapea a camelCase y aplana los servicios embebidos', () => {
    const item = mapProfessionalRow(makeRow());
    expect(item).toMatchObject({
      id: 'prof-1',
      salonId: 'salon-1',
      fullName: 'Ada Lovelace',
      active: true,
      color: '#22c55e',
      specialties: ['color'],
    });
    expect(item.services).toEqual([{ id: 'svc-1', name: 'Corte', active: true }]);
  });

  it('mapea user_id a userId cuando la ficha SÍ está ligada a una cuenta', () => {
    const item = mapProfessionalRow(makeRow({ user_id: 'user-abc-123' }));
    expect(item.userId).toBe('user-abc-123');
  });

  it('es null-safe: sin servicios ni specialties ⇒ arrays vacíos', () => {
    const item = mapProfessionalRow(
      makeRow({ professional_services: null, specialties: null, color: null }),
    );
    expect(item.services).toEqual([]);
    expect(item.specialties).toEqual([]);
    expect(item.color).toBeNull();
  });

  it('descarta enlaces con servicio nulo (embed oculto por RLS/datos)', () => {
    const item = mapProfessionalRow(
      makeRow({
        professional_services: [
          { service: null },
          { service: { id: 'svc-2', name: 'Tinte', active: true } },
        ],
      }),
    );
    expect(item.services).toEqual([{ id: 'svc-2', name: 'Tinte', active: true }]);
  });

  it('deduplica y ordena los servicios por nombre (ES)', () => {
    const item = mapProfessionalRow(
      makeRow({
        professional_services: [
          { service: { id: 'svc-b', name: 'Peinado', active: true } },
          { service: { id: 'svc-a', name: 'Álisado', active: true } },
          { service: { id: 'svc-b', name: 'Peinado', active: true } }, // duplicado por id
        ],
      }),
    );
    expect(item.services.map((s) => s.name)).toEqual(['Álisado', 'Peinado']);
  });
});

describe('mapProfessionalRows', () => {
  it('tolera null/undefined devolviendo lista vacía', () => {
    expect(mapProfessionalRows(null)).toEqual([]);
    expect(mapProfessionalRows(undefined)).toEqual([]);
  });

  it('mapea un lote respetando el orden de entrada', () => {
    const rows = [makeRow({ id: 'a', full_name: 'A' }), makeRow({ id: 'b', full_name: 'B' })];
    expect(mapProfessionalRows(rows).map((p) => p.id)).toEqual(['a', 'b']);
  });
});

describe('dedupeServices', () => {
  it('elimina duplicados por id conservando la primera aparición', () => {
    const services: ProfessionalServiceRef[] = [
      { id: '1', name: 'Corte', active: true },
      { id: '1', name: 'Corte', active: false },
      { id: '2', name: 'Barba', active: true },
    ];
    const out = dedupeServices(services);
    expect(out).toHaveLength(2);
    expect(out.find((s) => s.id === '1')?.active).toBe(true); // conserva la primera
  });

  it('ordena alfabéticamente con collation española', () => {
    const services: ProfessionalServiceRef[] = [
      { id: '3', name: 'Zumba', active: true },
      { id: '1', name: 'ácido', active: true },
      { id: '2', name: 'Balayage', active: true },
    ];
    expect(dedupeServices(services).map((s) => s.name)).toEqual(['ácido', 'Balayage', 'Zumba']);
  });
});

describe('compareByFullName / sortByFullName', () => {
  it('ordena por nombre con acentos y desempata por id de forma estable', () => {
    const items = [
      makeItem({ id: 'c', fullName: 'Óscar' }),
      makeItem({ id: 'a', fullName: 'ana' }),
      makeItem({ id: 'b', fullName: 'Bruno' }),
    ];
    expect(sortByFullName(items).map((p) => p.fullName)).toEqual(['ana', 'Bruno', 'Óscar']);
  });

  it('con nombres iguales, desempata por id ascendente', () => {
    const a = makeItem({ id: 'z', fullName: 'Eva' });
    const b = makeItem({ id: 'a', fullName: 'Eva' });
    expect(compareByFullName(a, b)).toBeGreaterThan(0);
    expect(sortByFullName([a, b]).map((p) => p.id)).toEqual(['a', 'z']);
  });

  it('no muta el array de entrada', () => {
    const items = [makeItem({ id: 'b', fullName: 'B' }), makeItem({ id: 'a', fullName: 'A' })];
    const copy = [...items];
    sortByFullName(items);
    expect(items).toEqual(copy);
  });
});

describe('initials', () => {
  it('toma la inicial del primer y último token', () => {
    expect(initials('Ada Lovelace')).toBe('AL');
    expect(initials('María del Carmen Ruiz')).toBe('MR');
  });

  it('con un solo token toma las dos primeras letras', () => {
    expect(initials('Cher')).toBe('CH');
  });

  it('tolera espacios extra y nombre vacío', () => {
    expect(initials('  Grace   Hopper ')).toBe('GH');
    expect(initials('   ')).toBe('?');
  });
});

describe('readableTextColor', () => {
  it('elige texto oscuro sobre fondos claros', () => {
    expect(readableTextColor('#ffffff')).toBe('#111827');
    expect(readableTextColor('#22c55e')).toBe('#111827'); // verde claro
  });

  it('elige texto blanco sobre fondos oscuros', () => {
    expect(readableTextColor('#000000')).toBe('#ffffff');
    expect(readableTextColor('#1e3a8a')).toBe('#ffffff'); // azul oscuro
  });

  it('acepta hex corto (#rgb)', () => {
    expect(readableTextColor('#fff')).toBe('#111827');
    expect(readableTextColor('#000')).toBe('#ffffff');
  });

  it('ante hex inválido o ausente, cae a texto oscuro', () => {
    expect(readableTextColor(null)).toBe('#111827');
    expect(readableTextColor(undefined)).toBe('#111827');
    expect(readableTextColor('rebeccapurple')).toBe('#111827');
    expect(readableTextColor('#12')).toBe('#111827');
  });
});
