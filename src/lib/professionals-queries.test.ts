// Tests de la capa de I/O de PROFESIONALES (sub-10). Complementan a `professionals.test.ts`
// (que cubre la lógica pura de mapeo/orden): aquí se verifica la CONSTRUCCIÓN de la consulta
// a PostgREST del listado de personal de la vista de salón —que se acote SIEMPRE por
// `salon_id` (mismo aislamiento multi-tenant que las citas), aplique el filtro opcional
// `activeOnly`, ordene por `full_name` y devuelva el modelo de vista ya mapeado y reordenado.
//
// El cliente Supabase se MOCKEA por completo: no hay red ni BD. El mock captura la cadena de
// llamadas para poder afirmar con qué argumentos se construyó la consulta.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Builder encadenable idéntico en espíritu al de `appointments-queries.test.ts`: cada método
// registra su llamada y devuelve el propio builder; `.returns()` resuelve `{ data, error }`.
const db = vi.hoisted(() => {
  const result: { data: unknown; error: unknown } = { data: [], error: null };
  const CHAINABLE = ['select', 'eq', 'order', 'abortSignal'] as const;
  let lastBuilder: Record<string, ReturnType<typeof vi.fn>> | null = null;

  function makeBuilder() {
    const b: Record<string, ReturnType<typeof vi.fn>> = {};
    for (const m of CHAINABLE) b[m] = vi.fn(() => b);
    b.returns = vi.fn(() => Promise.resolve(result));
    lastBuilder = b;
    return b;
  }

  const fromMock = vi.fn((_table: string) => makeBuilder());

  return {
    fromMock,
    builder: () => {
      if (!lastBuilder) throw new Error('No se construyó ninguna consulta');
      return lastBuilder;
    },
    setResult(data: unknown, error: unknown = null) {
      result.data = data;
      result.error = error;
    },
  };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: db.fromMock },
}));

import { fetchProfessionals } from './professionals-queries';
import { PROFESSIONALS_SELECT, type ProfessionalRow } from './professionals';

const SALON = 'salon-abc';

/** Fábrica de fila CRUDA sintética (forma de `PROFESSIONALS_SELECT`). */
function makeRow(overrides: Partial<ProfessionalRow> = {}): ProfessionalRow {
  return {
    id: 'prof-1',
    salon_id: SALON,
    full_name: 'Grace Hopper',
    active: true,
    color: '#22c55e',
    specialties: null,
    professional_services: null,
    ...overrides,
  };
}

beforeEach(() => {
  db.fromMock.mockClear();
  db.setResult([], null);
});

describe('fetchProfessionals — construcción de la consulta', () => {
  it('consulta la tabla professionals con el SELECT de servicios embebidos', async () => {
    await fetchProfessionals({ salonId: SALON });

    expect(db.fromMock).toHaveBeenCalledTimes(1);
    expect(db.fromMock).toHaveBeenCalledWith('professionals');
    expect(db.builder().select).toHaveBeenCalledWith(PROFESSIONALS_SELECT);
  });

  it('acota SIEMPRE por salon_id (aislamiento multi-tenant)', async () => {
    await fetchProfessionals({ salonId: SALON });

    expect(db.builder().eq).toHaveBeenCalledWith('salon_id', SALON);
  });

  it('ordena por full_name ascendente', async () => {
    await fetchProfessionals({ salonId: SALON });

    expect(db.builder().order).toHaveBeenCalledWith('full_name', { ascending: true });
  });

  it('por defecto NO restringe a activos (la administración ve también inactivos)', async () => {
    await fetchProfessionals({ salonId: SALON });

    const activeCalls = db.builder().eq.mock.calls.filter((c) => c[0] === 'active');
    expect(activeCalls).toHaveLength(0);
  });

  it('con activeOnly: true filtra active = true server-side', async () => {
    await fetchProfessionals({ salonId: SALON, activeOnly: true });

    expect(db.builder().eq).toHaveBeenCalledWith('active', true);
    expect(db.builder().eq).toHaveBeenCalledWith('salon_id', SALON);
  });

  it('propaga la señal de cancelación cuando se provee', async () => {
    const signal = new AbortController().signal;
    await fetchProfessionals({ salonId: SALON, signal });
    expect(db.builder().abortSignal).toHaveBeenCalledWith(signal);

    db.fromMock.mockClear();
    await fetchProfessionals({ salonId: SALON });
    expect(db.builder().abortSignal).not.toHaveBeenCalled();
  });
});

describe('fetchProfessionals — resultado', () => {
  it('devuelve el modelo de vista ordenado por nombre (collation ES) tras mapear', async () => {
    // Llegan desordenados: el fetch reordena en cliente con sortByFullName.
    db.setResult(
      [
        makeRow({ id: 'p-b', full_name: 'Bruno' }),
        makeRow({ id: 'p-a', full_name: 'Álvaro' }),
        makeRow({ id: 'p-al', full_name: 'Alba' }),
      ],
      null,
    );

    const items = await fetchProfessionals({ salonId: SALON });

    expect(items.map((p) => p.fullName)).toEqual(['Alba', 'Álvaro', 'Bruno']);
    expect(items[0].salonId).toBe(SALON); // ya en camelCase
  });

  it('tolera data null/vacía ⇒ lista vacía', async () => {
    db.setResult(null, null);
    await expect(fetchProfessionals({ salonId: SALON })).resolves.toEqual([]);
  });

  it('propaga el error de PostgREST', async () => {
    db.setResult(null, { message: 'boom', code: '500' });
    await expect(fetchProfessionals({ salonId: SALON })).rejects.toEqual({
      message: 'boom',
      code: '500',
    });
  });
});

describe('fetchProfessionals — guarda de salon_id', () => {
  it('lanza si salonId es vacío y NO llega a construir consulta (sin red)', async () => {
    await expect(fetchProfessionals({ salonId: '' })).rejects.toThrow(/salonId es obligatorio/i);
    expect(db.fromMock).not.toHaveBeenCalled();
  });
});
