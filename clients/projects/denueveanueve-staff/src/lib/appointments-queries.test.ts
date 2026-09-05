// Tests de la capa de I/O de CITAS (sub-10). Aquí NO se prueba la lógica pura (eso vive en
// `appointments.test.ts`), sino la CONSTRUCCIÓN de la consulta a PostgREST: que el fetch
// se acote SIEMPRE por `salon_id` (multi-tenant), use el rango semiabierto correcto de
// `starts_at` (día / semana / rango arbitrario), aplique los filtros opcionales
// (profesional / estados), ordene por `starts_at` y devuelva ya el modelo de vista mapeado.
//
// El cliente Supabase se MOCKEA por completo: no hay red ni BD. El mock captura la cadena
// de llamadas del PostgrestFilterBuilder para poder afirmar CON QUÉ argumentos se construyó
// la consulta, que es justo lo que importa de esta capa.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { addDays, addWeeks, startOfDay, startOfWeek } from 'date-fns';

// --- Doble del cliente Supabase -------------------------------------------------------
// Builder encadenable: cada método (select/eq/gte/lt/in/order/abortSignal) registra su
// llamada y devuelve el PROPIO builder (como el PostgrestFilterBuilder real). `.returns()`
// es el punto "thenable": resuelve un `{ data, error }` configurable por test.
//
// Se define con `vi.hoisted` porque `vi.mock` se eleva por encima de los imports y necesita
// tener el `fromMock` disponible en ese momento.
const db = vi.hoisted(() => {
  const result: { data: unknown; error: unknown } = { data: [], error: null };
  // Métodos encadenables que puede usar la consulta de citas.
  const CHAINABLE = ['select', 'eq', 'gte', 'lt', 'in', 'order', 'abortSignal'] as const;
  let lastBuilder: Record<string, ReturnType<typeof vi.fn>> | null = null;

  function makeBuilder() {
    const b: Record<string, ReturnType<typeof vi.fn>> = {};
    for (const m of CHAINABLE) b[m] = vi.fn(() => b);
    // `.returns()` cierra la cadena devolviendo el resultado (mismo objeto ⇒ refleja
    // cualquier `setResult` hecho antes del await).
    b.returns = vi.fn(() => Promise.resolve(result));
    lastBuilder = b;
    return b;
  }

  const fromMock = vi.fn((_table: string) => makeBuilder());

  return {
    fromMock,
    /** Último builder construido (el de la consulta que se acaba de disparar). */
    builder: () => {
      if (!lastBuilder) throw new Error('No se construyó ninguna consulta');
      return lastBuilder;
    },
    /** Configura el `{ data, error }` que resolverá `.returns()`. */
    setResult(data: unknown, error: unknown = null) {
      result.data = data;
      result.error = error;
    },
  };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: db.fromMock },
}));

import {
  fetchAppointmentsInRange,
  fetchDayAppointments,
  fetchWeekAppointments,
} from './appointments-queries';
import {
  APPOINTMENTS_SELECT,
  mapAppointmentRows,
  type AppointmentRow,
  type DateRange,
} from './appointments';

const SALON = 'salon-abc';
// Miércoles 22/07/2026 09:00 UTC. Los rangos esperados se recalculan con date-fns y el
// MISMO `ref`, así que las aserciones son independientes de la zona horaria del runner.
const REF = new Date('2026-07-22T09:00:00.000Z');
// Rango arbitrario para las pruebas del fetch de más bajo nivel.
const RANGE: DateRange = {
  gte: '2026-07-01T00:00:00.000Z',
  lt: '2026-08-01T00:00:00.000Z',
};

/** Fábrica de fila CRUDA sintética (misma forma que `APPOINTMENTS_SELECT`). */
function makeRow(overrides: Partial<AppointmentRow> = {}): AppointmentRow {
  return {
    id: 'apt-1',
    salon_id: SALON,
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

/** Llamadas a `.eq()` cuyo primer argumento es `column`. */
function eqCallsFor(column: string): unknown[][] {
  return db.builder().eq.mock.calls.filter((c) => c[0] === column);
}

beforeEach(() => {
  db.fromMock.mockClear();
  db.setResult([], null);
});

describe('fetchAppointmentsInRange — construcción de la consulta', () => {
  it('consulta la tabla appointments con el SELECT de joins embebidos', async () => {
    await fetchAppointmentsInRange({ salonId: SALON, range: RANGE });

    expect(db.fromMock).toHaveBeenCalledTimes(1);
    expect(db.fromMock).toHaveBeenCalledWith('appointments');
    expect(db.builder().select).toHaveBeenCalledWith(APPOINTMENTS_SELECT);
  });

  it('acota SIEMPRE por salon_id (aislamiento multi-tenant)', async () => {
    await fetchAppointmentsInRange({ salonId: SALON, range: RANGE });

    expect(db.builder().eq).toHaveBeenCalledWith('salon_id', SALON);
  });

  it('aplica el rango semiabierto [gte, lt) sobre starts_at (gte + lt, NO lte)', async () => {
    await fetchAppointmentsInRange({ salonId: SALON, range: RANGE });

    const b = db.builder();
    expect(b.gte).toHaveBeenCalledWith('starts_at', RANGE.gte);
    expect(b.lt).toHaveBeenCalledWith('starts_at', RANGE.lt);
    // El intervalo es semiabierto: jamás debe usarse `lte` en la frontera superior.
    expect(b.lt).toHaveBeenCalledTimes(1);
  });

  it('ordena por starts_at ascendente', async () => {
    await fetchAppointmentsInRange({ salonId: SALON, range: RANGE });

    expect(db.builder().order).toHaveBeenCalledWith('starts_at', { ascending: true });
  });

  it('sin professionalId NO añade el filtro por profesional (solo el de salon_id)', async () => {
    await fetchAppointmentsInRange({ salonId: SALON, range: RANGE });

    expect(eqCallsFor('professional_id')).toHaveLength(0);
    // El único `.eq` es el de salón (multi-tenant).
    expect(db.builder().eq).toHaveBeenCalledTimes(1);
  });

  it('con professionalId restringe la consulta a ese profesional (server-side)', async () => {
    await fetchAppointmentsInRange({ salonId: SALON, range: RANGE, professionalId: 'prof-9' });

    expect(db.builder().eq).toHaveBeenCalledWith('professional_id', 'prof-9');
    // Sigue acotando por salón además del profesional.
    expect(db.builder().eq).toHaveBeenCalledWith('salon_id', SALON);
  });

  it('con statuses filtra por esos estados; sin ellos no aplica `in`', async () => {
    await fetchAppointmentsInRange({
      salonId: SALON,
      range: RANGE,
      statuses: ['pending', 'confirmed'],
    });
    expect(db.builder().in).toHaveBeenCalledWith('status', ['pending', 'confirmed']);

    // Lista de estados vacía ⇒ no se añade el filtro (equivale a "todos").
    db.fromMock.mockClear();
    await fetchAppointmentsInRange({ salonId: SALON, range: RANGE, statuses: [] });
    expect(db.builder().in).not.toHaveBeenCalled();
  });

  it('propaga la señal de cancelación al builder cuando se provee', async () => {
    const signal = new AbortController().signal;
    await fetchAppointmentsInRange({ salonId: SALON, range: RANGE, signal });
    expect(db.builder().abortSignal).toHaveBeenCalledWith(signal);

    // Sin señal, no se llama a abortSignal.
    db.fromMock.mockClear();
    await fetchAppointmentsInRange({ salonId: SALON, range: RANGE });
    expect(db.builder().abortSignal).not.toHaveBeenCalled();
  });
});

describe('fetchAppointmentsInRange — resultado', () => {
  it('devuelve las filas ya MAPEADAS al modelo de vista (camelCase, embeds aplanados)', async () => {
    const rows = [makeRow({ id: 'a' }), makeRow({ id: 'b', professional_id: 'prof-2' })];
    db.setResult(rows, null);

    const items = await fetchAppointmentsInRange({ salonId: SALON, range: RANGE });

    expect(items).toEqual(mapAppointmentRows(rows));
    expect(items[0].startsAt).toBe(rows[0].starts_at); // ya en camelCase
  });

  it('tolera data null/vacía ⇒ lista vacía', async () => {
    db.setResult(null, null);
    await expect(fetchAppointmentsInRange({ salonId: SALON, range: RANGE })).resolves.toEqual([]);
  });

  it('propaga el error de PostgREST (para que React Query lo trate como error)', async () => {
    db.setResult(null, { message: 'boom', code: '500' });

    await expect(
      fetchAppointmentsInRange({ salonId: SALON, range: RANGE }),
    ).rejects.toEqual({ message: 'boom', code: '500' });
  });
});

describe('fetchAppointmentsInRange — guarda de salon_id', () => {
  it('lanza si salonId es vacío y NO llega a construir consulta (sin red)', async () => {
    await expect(
      fetchAppointmentsInRange({ salonId: '', range: RANGE }),
    ).rejects.toThrow(/salonId es obligatorio/i);

    expect(db.fromMock).not.toHaveBeenCalled();
  });
});

describe('fetchDayAppointments — citas de un día', () => {
  it('usa el rango [inicio de día, inicio del día siguiente) del ref', async () => {
    await fetchDayAppointments(SALON, REF);

    const b = db.builder();
    // Recalculado con date-fns y el MISMO ref (independiente del huso del runner).
    expect(b.gte).toHaveBeenCalledWith('starts_at', startOfDay(REF).toISOString());
    expect(b.lt).toHaveBeenCalledWith('starts_at', startOfDay(addDays(REF, 1)).toISOString());
    expect(b.eq).toHaveBeenCalledWith('salon_id', SALON);
  });

  it('combina "por día" + "por profesional" cuando se pasa el filtro', async () => {
    await fetchDayAppointments(SALON, REF, { professionalId: 'prof-7' });

    const b = db.builder();
    expect(b.eq).toHaveBeenCalledWith('professional_id', 'prof-7');
    expect(b.eq).toHaveBeenCalledWith('salon_id', SALON);
    expect(b.gte).toHaveBeenCalledWith('starts_at', startOfDay(REF).toISOString());
    expect(b.lt).toHaveBeenCalledWith('starts_at', startOfDay(addDays(REF, 1)).toISOString());
  });
});

describe('fetchWeekAppointments — citas de una semana', () => {
  it('por defecto usa el rango de la semana que empieza en LUNES', async () => {
    await fetchWeekAppointments(SALON, REF);

    const b = db.builder();
    const start = startOfWeek(REF, { weekStartsOn: 1 });
    expect(b.gte).toHaveBeenCalledWith('starts_at', start.toISOString());
    expect(b.lt).toHaveBeenCalledWith('starts_at', addWeeks(start, 1).toISOString());
  });

  it('respeta un primer día de semana distinto (domingo = 0)', async () => {
    await fetchWeekAppointments(SALON, REF, {}, 0);

    const start = startOfWeek(REF, { weekStartsOn: 0 });
    expect(db.builder().gte).toHaveBeenCalledWith('starts_at', start.toISOString());
  });
});
