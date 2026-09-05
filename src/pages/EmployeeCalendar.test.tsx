import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider, type UseQueryResult } from '@tanstack/react-query';
import type { ReactNode } from 'react';

// Salón resuelto fijo: la resolución en runtime no es lo que se prueba aquí.
vi.mock('@/lib/salon-context', () => ({ useSalonId: () => 'salon-1' }));

// Consultas de agenda: se mockean para controlar carga/error/vacío sin red.
vi.mock('@/hooks/use-appointments', () => ({
  useDayAppointments: vi.fn(),
  useWeekAppointments: vi.fn(),
}));

// Tramos (fases) de las citas: se mockean para controlar el desglose sin red (sub-7).
vi.mock('@/hooks/use-appointment-blocks', () => ({ useAppointmentBlocks: vi.fn() }));

// La consulta del selector de profesionales (useQuery directo) delega en esta función de datos.
vi.mock('@/lib/professionals-queries', () => ({ fetchProfessionals: vi.fn() }));

import { useDayAppointments, useWeekAppointments } from '@/hooks/use-appointments';
import { useAppointmentBlocks } from '@/hooks/use-appointment-blocks';
import { fetchProfessionals } from '@/lib/professionals-queries';
import type { AppointmentListItem } from '@/lib/appointments';
import type { AppointmentBlock } from '@/lib/appointment-blocks';
import type { ProfessionalListItem } from '@/lib/professionals';
import EmployeeCalendar from './EmployeeCalendar';

const mockedUseDay = vi.mocked(useDayAppointments);
const mockedUseWeek = vi.mocked(useWeekAppointments);
const mockedUseBlocks = vi.mocked(useAppointmentBlocks);
const mockedFetchPros = vi.mocked(fetchProfessionals);

/** Resultado de agenda controlable (por defecto: éxito con lista vacía). */
function agendaResult(
  overrides: Partial<UseQueryResult<AppointmentListItem[], Error>> = {},
): UseQueryResult<AppointmentListItem[], Error> {
  return {
    data: [],
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    ...overrides,
  } as unknown as UseQueryResult<AppointmentListItem[], Error>;
}

function makePro(overrides: Partial<ProfessionalListItem> = {}): ProfessionalListItem {
  return {
    id: 'p-ana',
    salonId: 'salon-1',
    fullName: 'Ana',
    active: true,
    color: '#22c55e',
    specialties: [],
    userId: null,
    services: [],
    ...overrides,
  };
}

/** Resultado del hook de tramos (por defecto: sin tramos ⇒ la cita se muestra tal cual). */
function blocksResult(
  blocks: AppointmentBlock[] = [],
): UseQueryResult<AppointmentBlock[], Error> {
  return {
    data: blocks,
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  } as unknown as UseQueryResult<AppointmentBlock[], Error>;
}

function makeAppt(overrides: Partial<AppointmentListItem> = {}): AppointmentListItem {
  return {
    id: 'apt-1',
    salonId: 'salon-1',
    customerId: 'cust-1',
    professionalId: 'p-ana',
    serviceId: 'svc-1',
    startsAt: '2026-07-22T09:00:00.000Z',
    endsAt: '2026-07-22T10:00:00.000Z',
    status: 'confirmed',
    priceCents: 3500,
    currency: 'EUR',
    notes: null,
    customer: { fullName: 'Ada Lovelace', phone: null },
    service: { id: 'svc-1', name: 'Tinte' },
    professional: { id: 'p-ana', fullName: 'Ana', color: '#22c55e' },
    ...overrides,
  };
}

function makeBlock(overrides: Partial<AppointmentBlock> = {}): AppointmentBlock {
  return {
    id: 'blk-1',
    salonId: 'salon-1',
    appointmentId: 'apt-1',
    professionalId: 'p-ana',
    phase: 'application',
    phaseKey: 'application',
    phaseLabel: 'Aplicación',
    occupied: { startsAt: '2026-07-22T09:00:00.000Z', endsAt: '2026-07-22T09:15:00.000Z' },
    ...overrides,
  };
}

function renderPage(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

beforeEach(() => {
  // Por defecto no hay tramos: las pruebas que los necesiten sobrescriben el mock.
  mockedUseBlocks.mockReturnValue(blocksResult());
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.localStorage.clear();
});

describe('EmployeeCalendar — error legible de la agenda (sub-8)', () => {
  it('traduce un error crudo de la agenda a un mensaje legible y no filtra la jerga técnica', async () => {
    // Un único profesional ⇒ la pantalla lo autoselecciona y consulta su agenda.
    mockedFetchPros.mockResolvedValue([makePro()]);
    mockedUseWeek.mockReturnValue(agendaResult());
    const refetch = vi.fn();
    mockedUseDay.mockReturnValue(
      agendaResult({
        data: undefined,
        isError: true,
        error: { code: '42501', message: 'permission denied for table appointments' } as unknown as Error,
        refetch,
      }),
    );

    renderPage(<EmployeeCalendar />);

    // Tras resolver la lista de profesionales, aparece el error traducido.
    expect(
      await screen.findByText('No tienes permiso para ver esta información.'),
    ).toBeInTheDocument();
    // El texto crudo (inglés/SQL) NUNCA llega a la persona usuaria.
    expect(screen.queryByText(/permission denied/i)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /reintentar/i }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('muestra el estado vacío «no hay citas» cuando la agenda del día está vacía', async () => {
    mockedFetchPros.mockResolvedValue([makePro()]);
    mockedUseWeek.mockReturnValue(agendaResult());
    mockedUseDay.mockReturnValue(agendaResult({ data: [] }));

    renderPage(<EmployeeCalendar />);

    expect(await screen.findByText('No hay citas para este día.')).toBeInTheDocument();
  });

  it('si falla la carga del personal muestra un error legible (no la jerga) con reintento', async () => {
    // La consulta de profesionales rechaza ⇒ rama de error del personal (sin agenda todavía).
    mockedFetchPros.mockRejectedValue({
      code: '42501',
      message: 'permission denied for table professionals',
    });
    mockedUseDay.mockReturnValue(agendaResult());
    mockedUseWeek.mockReturnValue(agendaResult());

    renderPage(<EmployeeCalendar />);

    expect(
      await screen.findByRole('heading', { name: /no se pudo cargar el personal/i }),
    ).toBeInTheDocument();
    expect(screen.getByText('No tienes permiso para ver esta información.')).toBeInTheDocument();
    expect(screen.queryByText(/permission denied/i)).toBeNull();
  });
});

describe('EmployeeCalendar — modelo de 3 fases (sub-7)', () => {
  it('desglosa los tramos ocupados de la cita y explica que los solapes son normales', async () => {
    mockedFetchPros.mockResolvedValue([makePro()]);
    mockedUseWeek.mockReturnValue(agendaResult());
    mockedUseDay.mockReturnValue(agendaResult({ data: [makeAppt()] }));
    // Tres tramos: la exposición es cuando el profesional queda libre para otra cita.
    mockedUseBlocks.mockReturnValue(
      blocksResult([
        makeBlock({ id: 'b-app', phase: 'application', phaseKey: 'application', phaseLabel: 'Aplicación' }),
        makeBlock({
          id: 'b-exp',
          phase: 'exposure',
          phaseKey: 'exposure',
          phaseLabel: 'Exposición',
          occupied: { startsAt: '2026-07-22T09:15:00.000Z', endsAt: '2026-07-22T09:45:00.000Z' },
        }),
        makeBlock({
          id: 'b-post',
          phase: 'post_exposure',
          phaseKey: 'post_exposure',
          phaseLabel: 'Post-exposición',
          occupied: { startsAt: '2026-07-22T09:45:00.000Z', endsAt: '2026-07-22T10:00:00.000Z' },
        }),
      ]),
    );

    renderPage(<EmployeeCalendar />);

    // Las tres fases se pintan con su etiqueta de texto (no solo color).
    expect(await screen.findByText('Aplicación')).toBeInTheDocument();
    expect(screen.getByText('Exposición')).toBeInTheDocument();
    expect(screen.getByText('Post-exposición')).toBeInTheDocument();
    // La nota del modelo explica que un solape NO es un error (hay más de una nota en la página:
    // también la del selector de profesional, por eso se busca entre todas).
    const notes = screen.getAllByRole('note');
    expect(notes.some((n) => /no es un error/i.test(n.textContent ?? ''))).toBe(true);
  });

  it('muestra citas que se solapan sin ocultarlas ni marcarlas como error', async () => {
    mockedFetchPros.mockResolvedValue([makePro()]);
    mockedUseWeek.mockReturnValue(agendaResult());
    // Dos citas del MISMO profesional con horarios solapados (patrón de 3 fases).
    mockedUseDay.mockReturnValue(
      agendaResult({
        data: [
          makeAppt({ id: 'a', customer: { fullName: 'Ada Lovelace', phone: null } }),
          makeAppt({
            id: 'b',
            startsAt: '2026-07-22T09:20:00.000Z',
            endsAt: '2026-07-22T09:50:00.000Z',
            customer: { fullName: 'Alan Turing', phone: null },
          }),
        ],
      }),
    );

    renderPage(<EmployeeCalendar />);

    // Ambas citas siguen visibles (nada se oculta por solaparse).
    expect(await screen.findByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('Alan Turing')).toBeInTheDocument();
    // No se emite ninguna alerta de error por el solape.
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
