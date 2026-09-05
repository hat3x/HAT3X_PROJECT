import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import type { UseQueryResult } from '@tanstack/react-query';

// El listado consume un único hook de datos. Se mockea para controlar los estados
// (carga/error/vacío/datos) sin red ni Supabase.
vi.mock('@/hooks/use-professionals', () => ({ useProfessionals: vi.fn() }));

import { useProfessionals } from '@/hooks/use-professionals';
import type { ProfessionalListItem } from '@/lib/professionals';
import AdminEmployees from './AdminEmployees';

const mockedUseProfessionals = vi.mocked(useProfessionals);

function setQuery(overrides: Partial<UseQueryResult<ProfessionalListItem[], Error>>) {
  mockedUseProfessionals.mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    ...overrides,
  } as unknown as UseQueryResult<ProfessionalListItem[], Error>);
}

function makePro(overrides: Partial<ProfessionalListItem> = {}): ProfessionalListItem {
  return {
    id: 'p-1',
    salonId: 'salon-1',
    fullName: 'Ada Lovelace',
    active: true,
    color: '#22c55e',
    specialties: [],
    userId: null,
    services: [{ id: 'svc-1', name: 'Corte' }],
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('AdminEmployees — estados de datos (sub-8)', () => {
  it('muestra el estado de carga', () => {
    setQuery({ isLoading: true });
    render(<AdminEmployees />);
    expect(screen.getByText('Cargando empleados...')).toBeInTheDocument();
  });

  it('con error muestra un mensaje LEGIBLE (no la jerga técnica) y reintenta con refetch', () => {
    const refetch = vi.fn();
    // Error crudo de RLS: NO debe llegar tal cual a la persona usuaria.
    setQuery({
      isError: true,
      error: { code: '42501', message: 'permission denied for table professionals' } as unknown as Error,
      refetch,
    });
    render(<AdminEmployees />);

    expect(
      screen.getByRole('heading', { name: /no se pudo cargar el personal/i }),
    ).toBeInTheDocument();
    // Mensaje traducido a algo entendible; el texto crudo en inglés/SQL no aparece.
    expect(screen.getByText('No tienes permiso para ver esta información.')).toBeInTheDocument();
    expect(screen.queryByText(/permission denied/i)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /reintentar/i }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('anuncia el error en una región viva (no queda «en blanco» para lectores de pantalla)', () => {
    setQuery({
      isError: true,
      error: new Error('boom'),
      refetch: vi.fn(),
    });
    render(<AdminEmployees />);

    // La región sr-only role=status está SIEMPRE presente y resume el estado actual.
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('No se pudo cargar el personal.');
  });

  it('muestra el estado vacío cuando no hay personal', () => {
    setQuery({ data: [] });
    render(<AdminEmployees />);
    expect(screen.getByText(/sin personal/i)).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('No hay personal en este salón.');
  });

  it('con datos pinta al profesional y resume el recuento para lectores de pantalla', () => {
    setQuery({
      data: [
        makePro({ fullName: 'Ada Lovelace' }),
        makePro({ id: 'p-2', fullName: 'Grace Hopper', active: false }),
      ],
    });
    render(<AdminEmployees />);

    expect(screen.getByRole('heading', { name: 'Ada Lovelace' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Grace Hopper' })).toBeInTheDocument();
    // 2 profesionales, 1 activo.
    expect(screen.getByRole('status')).toHaveTextContent('2 profesionales, 1 activo.');
  });
});
