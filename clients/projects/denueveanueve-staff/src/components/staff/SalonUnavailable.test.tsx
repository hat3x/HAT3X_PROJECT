import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { SalonUnavailable } from './SalonUnavailable';

// Pantalla de error CONTROLADA que sustituye a toda la app cuando el salón no resuelve.
// El caso "slug inexistente → pantalla de error" nace en la función pura mapBrandingRow
// (RPC vacía ⇒ null); aquí verificamos el otro extremo del contrato: que con ese estado
// la app pinta una pantalla ACCESIBLE, con contexto (el slug fallido) y reintento.

afterEach(cleanup);

describe('SalonUnavailable — variant "not-found" (slug inexistente/inactivo)', () => {
  it('pinta la pantalla de error mostrando el slug que no se pudo resolver', () => {
    render(<SalonUnavailable variant="not-found" slug="salon-fantasma" onRetry={() => {}} />);

    const alert = screen.getByRole('alert');
    expect(alert).toHaveAttribute('aria-live', 'assertive');
    expect(alert).toHaveTextContent('Salón no disponible');
    // El slug fallido se muestra al usuario/soporte para dar contexto.
    expect(alert).toHaveTextContent('salon-fantasma');
  });

  it('ofrece reintentar y llama a onRetry al pulsar', () => {
    const onRetry = vi.fn();
    render(<SalonUnavailable variant="not-found" slug="x" onRetry={onRetry} />);

    const button = screen.getByRole('button', { name: /reintentar/i });
    fireEvent.click(button);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('sin onRetry no muestra botón (pantalla informativa)', () => {
    render(<SalonUnavailable variant="not-found" slug="x" />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('SalonUnavailable — variant "network" (error de red/SQL reintentable)', () => {
  it('pinta el copy de conexión, distinto del de "no encontrado"', () => {
    render(<SalonUnavailable variant="network" slug="denueveanueve" onRetry={() => {}} />);

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('No se pudo cargar el salón');
    expect(alert).not.toHaveTextContent('Salón no disponible');
  });

  it('en reintento (busy) deshabilita el botón y muestra "Reintentando…"', () => {
    render(<SalonUnavailable variant="network" slug="x" onRetry={() => {}} busy />);

    const button = screen.getByRole('button', { name: /reintentando/i });
    expect(button).toBeDisabled();
  });
});
