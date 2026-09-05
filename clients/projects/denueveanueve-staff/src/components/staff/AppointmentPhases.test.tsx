import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import type { AppointmentBlock } from '@/lib/appointment-blocks';
import { AppointmentPhases, PhaseModelNote } from './AppointmentPhases';

// ISO desde componentes LOCALES: como el chip formatea en hora local, generar el rango desde un
// Date local hace la aserción de horas determinista con independencia del huso de la máquina.
function localISO(y: number, m: number, d: number, h = 0, min = 0): string {
  return new Date(y, m, d, h, min, 0, 0).toISOString();
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
    occupied: { startsAt: localISO(2026, 6, 22, 9, 0), endsAt: localISO(2026, 6, 22, 9, 15) },
    ...overrides,
  };
}

afterEach(cleanup);

describe('AppointmentPhases', () => {
  it('sin tramos no pinta nada (la cita se muestra tal cual)', () => {
    const { container } = render(<AppointmentPhases blocks={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('pinta cada fase con su etiqueta y su franja horaria ocupada', () => {
    render(
      <AppointmentPhases
        blocks={[
          makeBlock({ id: 'a', phaseKey: 'application', phaseLabel: 'Aplicación' }),
          makeBlock({
            id: 'e',
            phaseKey: 'exposure',
            phaseLabel: 'Exposición',
            occupied: { startsAt: localISO(2026, 6, 22, 9, 15), endsAt: localISO(2026, 6, 22, 9, 45) },
          }),
        ]}
      />,
    );

    const list = screen.getByRole('list', { name: /tramos ocupados de la cita/i });
    // Las etiquetas de fase se muestran como texto (no solo color).
    expect(within(list).getByText('Aplicación')).toBeInTheDocument();
    expect(within(list).getByText('Exposición')).toBeInTheDocument();
    // Cada chip muestra su franja horaria HH:mm – HH:mm.
    expect(within(list).getByText('09:00 – 09:15')).toBeInTheDocument();
    expect(within(list).getByText('09:15 – 09:45')).toBeInTheDocument();
    // El aria-label del ítem compone "Fase, franja" para lectura de lazarillo.
    expect(within(list).getByLabelText('Aplicación, 09:00 – 09:15')).toBeInTheDocument();
  });

  it('un tramo sin ventana parseable muestra solo la fase (sin hora)', () => {
    render(<AppointmentPhases blocks={[makeBlock({ id: 'x', occupied: null })]} />);
    const item = screen.getByRole('listitem');
    expect(item).toHaveAccessibleName('Aplicación');
    expect(item.textContent).not.toMatch(/\d{2}:\d{2}/);
  });
});

describe('PhaseModelNote', () => {
  it('explica el modelo y que los solapes NO son un error (rol note, no alert)', () => {
    render(<PhaseModelNote />);
    const note = screen.getByRole('note');
    expect(note).toHaveTextContent(/horarios solapados/i);
    expect(note).toHaveTextContent(/no es un error/i);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
