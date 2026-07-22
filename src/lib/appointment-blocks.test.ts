import { describe, it, expect } from 'vitest';
import {
  PHASE_LABELS,
  compareBlocks,
  groupBlocksByAppointment,
  mapAppointmentBlockRow,
  mapAppointmentBlockRows,
  normalizePhase,
  parseOccupiedRange,
  phaseLabel,
  type AppointmentBlock,
  type AppointmentBlockRow,
} from './appointment-blocks';

/** Fila cruda sintética (forma de `appointment_blocks`). */
function makeRow(overrides: Partial<AppointmentBlockRow> = {}): AppointmentBlockRow {
  return {
    id: 'blk-1',
    salon_id: 'salon-1',
    appointment_id: 'apt-1',
    professional_id: 'prof-1',
    phase: 'application',
    occupied_range: '["2026-07-22 09:00:00+00","2026-07-22 09:15:00+00")',
    ...overrides,
  };
}

/** Bloque de vista sintético (para probar orden/agrupación sin pasar por el mapeo). */
function makeBlock(overrides: Partial<AppointmentBlock> = {}): AppointmentBlock {
  return {
    id: 'blk-1',
    salonId: 'salon-1',
    appointmentId: 'apt-1',
    professionalId: 'prof-1',
    phase: 'application',
    phaseKey: 'application',
    phaseLabel: 'Aplicación',
    occupied: { startsAt: '2026-07-22T09:00:00.000Z', endsAt: '2026-07-22T09:15:00.000Z' },
    ...overrides,
  };
}

describe('normalizePhase', () => {
  it('reconoce las tres fases canónicas del servicio', () => {
    expect(normalizePhase('application')).toBe('application');
    expect(normalizePhase('exposure')).toBe('exposure');
    expect(normalizePhase('post_exposure')).toBe('post_exposure');
  });

  it('tolera variantes de formato y acentos es-ES', () => {
    expect(normalizePhase('Post-Exposure')).toBe('post_exposure');
    expect(normalizePhase('postExposure')).toBe('post_exposure');
    expect(normalizePhase('Aplicación')).toBe('application');
    expect(normalizePhase('exposición')).toBe('exposure');
  });

  it('no confunde "post_exposure" con "exposure" (post gana)', () => {
    expect(normalizePhase('post_exposure')).not.toBe('exposure');
  });

  it('cualquier valor desconocido cae en "other"', () => {
    expect(normalizePhase('limpieza')).toBe('other');
    expect(normalizePhase('')).toBe('other');
  });
});

describe('phaseLabel', () => {
  it('usa la etiqueta canónica es-ES de cada fase conocida', () => {
    expect(phaseLabel('application')).toBe(PHASE_LABELS.application);
    expect(phaseLabel('exposure')).toBe(PHASE_LABELS.exposure);
    expect(phaseLabel('post_exposure')).toBe(PHASE_LABELS.post_exposure);
  });

  it('capitaliza el texto crudo de una fase desconocida (no la pierde)', () => {
    expect(phaseLabel('secado')).toBe('Secado');
  });

  it('cae a "Tramo" si la fase viene vacía', () => {
    expect(phaseLabel('   ')).toBe('Tramo');
  });
});

describe('parseOccupiedRange', () => {
  it('parsea la forma canónica de Postgres (comillas + corchetes de inclusividad)', () => {
    const range = parseOccupiedRange('["2026-07-22 09:00:00+00","2026-07-22 09:30:00+00")');
    expect(range).toEqual({
      startsAt: '2026-07-22T09:00:00.000Z',
      endsAt: '2026-07-22T09:30:00.000Z',
    });
  });

  it('parsea límites sin comillas y con offset completo', () => {
    const range = parseOccupiedRange('[2026-07-22T09:00:00+00:00,2026-07-22T09:30:00+00:00]');
    expect(range?.startsAt).toBe('2026-07-22T09:00:00.000Z');
    expect(range?.endsAt).toBe('2026-07-22T09:30:00.000Z');
  });

  it('acepta la forma de objeto {start,end} de forma defensiva', () => {
    const range = parseOccupiedRange({
      start: '2026-07-22T09:00:00Z',
      end: '2026-07-22T09:30:00Z',
    });
    expect(range).toEqual({
      startsAt: '2026-07-22T09:00:00.000Z',
      endsAt: '2026-07-22T09:30:00.000Z',
    });
  });

  it('devuelve null ante rango vacío, nulo o no reconocible (degradación segura)', () => {
    expect(parseOccupiedRange('empty')).toBeNull();
    expect(parseOccupiedRange('')).toBeNull();
    expect(parseOccupiedRange(null)).toBeNull();
    expect(parseOccupiedRange(undefined)).toBeNull();
    expect(parseOccupiedRange(42)).toBeNull();
    expect(parseOccupiedRange('no soy un rango')).toBeNull();
  });

  it('devuelve null si algún límite es infinito (sin ventana cerrada)', () => {
    expect(parseOccupiedRange('["2026-07-22 09:00:00+00",)')).toBeNull();
    expect(parseOccupiedRange('[,"2026-07-22 09:30:00+00")')).toBeNull();
  });
});

describe('mapAppointmentBlockRow / mapAppointmentBlockRows', () => {
  it('mapea a camelCase, normaliza la fase y parsea la ventana', () => {
    const block = mapAppointmentBlockRow(makeRow());
    expect(block).toMatchObject({
      appointmentId: 'apt-1',
      professionalId: 'prof-1',
      phase: 'application',
      phaseKey: 'application',
      phaseLabel: 'Aplicación',
      occupied: {
        startsAt: '2026-07-22T09:00:00.000Z',
        endsAt: '2026-07-22T09:15:00.000Z',
      },
    });
  });

  it('deja occupied en null cuando el rango no es parseable (no rompe)', () => {
    const block = mapAppointmentBlockRow(makeRow({ occupied_range: 'empty' }));
    expect(block.occupied).toBeNull();
    expect(block.phaseLabel).toBe('Aplicación');
  });

  it('mapAppointmentBlockRows tolera null/undefined ⇒ lista vacía', () => {
    expect(mapAppointmentBlockRows(null)).toEqual([]);
    expect(mapAppointmentBlockRows(undefined)).toEqual([]);
    expect(mapAppointmentBlockRows([makeRow()])).toHaveLength(1);
  });
});

describe('compareBlocks', () => {
  it('ordena por fase: aplicación → exposición → post → otras', () => {
    const application = makeBlock({ id: 'a', phaseKey: 'application', occupied: null });
    const exposure = makeBlock({ id: 'e', phaseKey: 'exposure', occupied: null });
    const post = makeBlock({ id: 'p', phaseKey: 'post_exposure', occupied: null });
    const other = makeBlock({ id: 'o', phaseKey: 'other', occupied: null });

    const sorted = [other, post, exposure, application].sort(compareBlocks);
    expect(sorted.map((b) => b.id)).toEqual(['a', 'e', 'p', 'o']);
  });

  it('a igualdad de fase, ordena por inicio de la ventana (sin ventana al final)', () => {
    const early = makeBlock({
      id: 'early',
      occupied: { startsAt: '2026-07-22T09:00:00.000Z', endsAt: '2026-07-22T09:05:00.000Z' },
    });
    const late = makeBlock({
      id: 'late',
      occupied: { startsAt: '2026-07-22T09:30:00.000Z', endsAt: '2026-07-22T09:35:00.000Z' },
    });
    const noWindow = makeBlock({ id: 'none', occupied: null });

    const sorted = [noWindow, late, early].sort(compareBlocks);
    expect(sorted.map((b) => b.id)).toEqual(['early', 'late', 'none']);
  });
});

describe('groupBlocksByAppointment', () => {
  it('con lista vacía devuelve un Map vacío', () => {
    expect(groupBlocksByAppointment([]).size).toBe(0);
  });

  it('agrupa por appointment_id y ordena cada grupo por fase', () => {
    const blocks = [
      makeBlock({ id: 'b-post', appointmentId: 'apt-1', phaseKey: 'post_exposure', occupied: null }),
      makeBlock({ id: 'b-app', appointmentId: 'apt-1', phaseKey: 'application', occupied: null }),
      makeBlock({ id: 'b-other', appointmentId: 'apt-2', phaseKey: 'application', occupied: null }),
    ];
    const grouped = groupBlocksByAppointment(blocks);

    expect([...grouped.keys()].sort()).toEqual(['apt-1', 'apt-2']);
    expect(grouped.get('apt-1')?.map((b) => b.id)).toEqual(['b-app', 'b-post']);
    expect(grouped.get('apt-2')).toHaveLength(1);
  });

  it('es puro: no muta el array de entrada', () => {
    const blocks = [makeBlock({ id: 'x' })];
    const snapshot = [...blocks];
    groupBlocksByAppointment(blocks);
    expect(blocks).toEqual(snapshot);
  });
});
