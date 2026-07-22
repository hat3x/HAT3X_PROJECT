import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { UseQueryResult } from '@tanstack/react-query';
import type { User } from '@supabase/supabase-js';

// La agenda va autoprotegida por rol vía <RequireRole>, que lee useAuth() (única fuente de
// salon_members). Mockeamos SOLO useAuth y conservamos las constantes reales (ADMIN_ROLES).
vi.mock('@/lib/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth')>();
  return { ...actual, useAuth: vi.fn() };
});

// La capa de datos (sub-2) se mockea para controlar los estados (carga/error/vacío/datos)
// sin red ni Supabase. El componente solo consume useDayAppointments de este módulo.
vi.mock('@/hooks/use-appointments', () => ({ useDayAppointments: vi.fn() }));

// Tramos (fases) de las citas: se mockean para controlar el desglose sin red (sub-7).
vi.mock('@/hooks/use-appointment-blocks', () => ({ useAppointmentBlocks: vi.fn() }));

import { useAuth } from '@/lib/auth';
import { useDayAppointments } from '@/hooks/use-appointments';
import { useAppointmentBlocks } from '@/hooks/use-appointment-blocks';
import type { AppointmentListItem } from '@/lib/appointments';
import type { AppointmentBlock } from '@/lib/appointment-blocks';
import AdminEmployeeCalendar from './AdminEmployeeCalendar';

const mockedUseAuth = vi.mocked(useAuth);
const mockedUseDay = vi.mocked(useDayAppointments);
const mockedUseBlocks = vi.mocked(useAppointmentBlocks);
const FAKE_USER = { id: 'user-1' } as unknown as User;

function setAuth(overrides: Partial<ReturnType<typeof useAuth>>) {
  mockedUseAuth.mockReturnValue({
    user: null,
    session: null,
    roles: [],
    isStaff: false,
    isManager: false,
    isAdmin: false,
    loading: false,
    error: null,
    signIn: vi.fn(),
    signOut: vi.fn(),
    hasStaffAccess: false,
    ...overrides,
  } as ReturnType<typeof useAuth>);
}

function asOwner() {
  setAuth({
    user: FAKE_USER,
    roles: ['owner'],
    isStaff: true,
    isManager: true,
    isAdmin: true,
    hasStaffAccess: true,
  });
}

function setQuery(overrides: Partial<UseQueryResult<AppointmentListItem[], Error>>) {
  mockedUseDay.mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
    ...overrides,
  } as unknown as UseQueryResult<AppointmentListItem[], Error>);
}

/** Resultado del hook de tramos (por defecto: sin tramos ⇒ la cita se muestra tal cual). */
function setBlocks(blocks: AppointmentBlock[] = []) {
  mockedUseBlocks.mockReturnValue({
    data: blocks,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  } as unknown as UseQueryResult<AppointmentBlock[], Error>);
}

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

function renderPage() {
  return render(
    <MemoryRouter>
      <AdminEmployeeCalendar />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  // Por defecto no hay tramos: las pruebas que los necesiten sobrescriben el mock con setBlocks.
  setBlocks();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('AdminEmployeeCalendar — guard de rol (sub-4)', () => {
  it('BLOQUEA a un usuario staff: muestra acceso denegado, no la agenda', () => {
    setAuth({ user: FAKE_USER, roles: ['staff'], isStaff: true, hasStaffAccess: true });
    setQuery({ data: [] });
    renderPage();

    expect(screen.getByRole('alert')).toHaveTextContent('Acceso denegado');
    expect(screen.queryByText('Agenda del salón')).toBeNull();
  });

  it('PERMITE a owner/manager ver la agenda', () => {
    asOwner();
    setQuery({ data: [] });
    renderPage();

    expect(
      screen.getByRole('heading', { level: 1, name: /agenda del salón/i }),
    ).toBeInTheDocument();
  });
});

describe('AdminEmployeeCalendar — estados de datos', () => {
  it('muestra el estado de carga mientras se obtienen las citas', () => {
    asOwner();
    setQuery({ isLoading: true });
    renderPage();

    // Texto EXACTO del LoadingState visible (la región sr-only usa otro texto distinto).
    expect(screen.getByText('Cargando la agenda…')).toBeInTheDocument();
  });

  it('muestra el estado de error y reintenta con refetch', () => {
    asOwner();
    const refetch = vi.fn();
    setQuery({ isError: true, refetch });
    renderPage();

    // El TÍTULO del ErrorState es un heading (la región sr-only comparte texto pero no rol).
    expect(
      screen.getByRole('heading', { name: /no se pudo cargar la agenda/i }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /reintentar/i }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('muestra el estado vacío cuando no hay citas ese día', () => {
    asOwner();
    setQuery({ data: [] });
    renderPage();

    expect(screen.getByText(/sin citas este día/i)).toBeInTheDocument();
  });
});

describe('AdminEmployeeCalendar — agrupación por profesional', () => {
  it('agrupa las citas por profesional y pinta cliente, servicio y estado', () => {
    asOwner();
    setQuery({
      data: [
        makeItem({
          id: 'a',
          professionalId: 'p-ana',
          professional: { id: 'p-ana', fullName: 'Ana', color: '#22c55e' },
          customer: { fullName: 'Ada Lovelace', phone: null },
          service: { id: 's1', name: 'Corte' },
          status: 'confirmed',
        }),
        makeItem({
          id: 'b',
          professionalId: 'p-bruno',
          professional: { id: 'p-bruno', fullName: 'Bruno', color: '#3b82f6' },
          customer: { fullName: 'Alan Turing', phone: null },
          service: { id: 's2', name: 'Tinte' },
          status: 'cancelled',
        }),
      ],
    });
    renderPage();

    // Un encabezado (h2) por profesional, en orden alfabético (Ana antes que Bruno).
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual(['Ana', 'Bruno']);

    // Cliente + servicio + etiqueta de estado (texto, no solo color) presentes.
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('Corte')).toBeInTheDocument();
    expect(screen.getByText('Confirmada')).toBeInTheDocument();
    expect(screen.getByText('Alan Turing')).toBeInTheDocument();
    expect(screen.getByText('Cancelada')).toBeInTheDocument();
  });

  it('coloca cada cita bajo la sección de SU profesional', () => {
    asOwner();
    setQuery({
      data: [
        makeItem({
          id: 'a1',
          professionalId: 'p-ana',
          professional: { id: 'p-ana', fullName: 'Ana', color: null },
          customer: { fullName: 'Cliente de Ana', phone: null },
        }),
        makeItem({
          id: 'b1',
          professionalId: 'p-bruno',
          professional: { id: 'p-bruno', fullName: 'Bruno', color: null },
          customer: { fullName: 'Cliente de Bruno', phone: null },
        }),
      ],
    });
    renderPage();

    const anaSection = screen.getByRole('region', { name: 'Ana' });
    expect(within(anaSection).getByText('Cliente de Ana')).toBeInTheDocument();
    expect(within(anaSection).queryByText('Cliente de Bruno')).toBeNull();
  });
});

describe('AdminEmployeeCalendar — navegación por día', () => {
  it('expone controles accesibles de día anterior/siguiente', () => {
    asOwner();
    setQuery({ data: [] });
    renderPage();

    expect(screen.getByRole('button', { name: /día anterior/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /día siguiente/i })).toBeInTheDocument();
  });

  it('al cambiar de día aparece el acceso "Volver a hoy"', () => {
    asOwner();
    setQuery({ data: [] });
    renderPage();

    // Inicialmente es hoy: no hay botón de volver.
    expect(screen.queryByRole('button', { name: /volver a hoy/i })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /día siguiente/i }));
    expect(screen.getByRole('button', { name: /volver a hoy/i })).toBeInTheDocument();
  });
});

describe('AdminEmployeeCalendar — modelo de 3 fases (sub-7)', () => {
  it('desglosa los tramos ocupados de la cita y explica que los solapes son normales', () => {
    asOwner();
    setQuery({ data: [makeItem({ id: 'apt-1', professionalId: 'prof-1' })] });
    setBlocks([
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
    ]);
    renderPage();

    // Cada fase se pinta con su etiqueta de texto (no solo color).
    expect(screen.getByText('Aplicación')).toBeInTheDocument();
    expect(screen.getByText('Exposición')).toBeInTheDocument();
    expect(screen.getByText('Post-exposición')).toBeInTheDocument();
    // La nota del modelo aclara que un solape NO es un error.
    expect(screen.getByRole('note')).toHaveTextContent(/no es un error/i);
  });

  it('sin appointment_blocks muestra la cita tal cual, sin nota ni desglose', () => {
    asOwner();
    setQuery({ data: [makeItem({ id: 'apt-1', customer: { fullName: 'Ada Lovelace', phone: null } })] });
    // setBlocks() del beforeEach ya deja la lista de tramos vacía.
    renderPage();

    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.queryByText('Aplicación')).toBeNull();
    expect(screen.queryByRole('note')).toBeNull();
  });

  it('muestra citas solapadas del mismo profesional sin ocultarlas ni marcarlas como error', () => {
    asOwner();
    setQuery({
      data: [
        makeItem({
          id: 'a',
          professionalId: 'prof-1',
          professional: { id: 'prof-1', fullName: 'Ana', color: null },
          customer: { fullName: 'Ada Lovelace', phone: null },
          startsAt: '2026-07-22T09:00:00.000Z',
          endsAt: '2026-07-22T10:00:00.000Z',
        }),
        makeItem({
          id: 'b',
          professionalId: 'prof-1',
          professional: { id: 'prof-1', fullName: 'Ana', color: null },
          customer: { fullName: 'Alan Turing', phone: null },
          startsAt: '2026-07-22T09:20:00.000Z',
          endsAt: '2026-07-22T09:50:00.000Z',
        }),
      ],
    });
    renderPage();

    // Las dos citas solapadas conviven en la sección del profesional; ninguna se oculta.
    const anaSection = screen.getByRole('region', { name: 'Ana' });
    expect(within(anaSection).getByText('Ada Lovelace')).toBeInTheDocument();
    expect(within(anaSection).getByText('Alan Turing')).toBeInTheDocument();
    // El solape no genera ninguna alerta de error.
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
