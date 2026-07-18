import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SalonBrandingRow } from './salon';

// Se mockea el cliente de Supabase para probar el mapeo/errores de la RPC sin red.
// `vi.hoisted` garantiza que `rpcMock` existe cuando corre la factory de `vi.mock`.
const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: rpcMock },
}));

import { fetchSalonBranding } from './salon-branding';

const row: SalonBrandingRow = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Salón de Nueve a Nueve',
  slug: 'denueveanueve',
  logo_url: null,
  primary_color: '#c8a24b',
  secondary_color: null,
};

describe('fetchSalonBranding', () => {
  beforeEach(() => rpcMock.mockReset());

  it('invoca get_salon_branding con p_slug y devuelve la marca mapeada', async () => {
    rpcMock.mockResolvedValue({ data: [row], error: null });

    const result = await fetchSalonBranding('denueveanueve');

    expect(rpcMock).toHaveBeenCalledWith('get_salon_branding', { p_slug: 'denueveanueve' });
    expect(result).toMatchObject({ id: row.id, slug: 'denueveanueve', primaryColor: '#c8a24b' });
  });

  it('devuelve null cuando la RPC responde con conjunto vacío (slug inexistente/inactivo)', async () => {
    rpcMock.mockResolvedValue({ data: [], error: null });

    await expect(fetchSalonBranding('inexistente')).resolves.toBeNull();
  });

  it('lanza cuando la RPC devuelve un error de transporte/SQL', async () => {
    const error = { message: 'network down' };
    rpcMock.mockResolvedValue({ data: null, error });

    await expect(fetchSalonBranding('denueveanueve')).rejects.toBe(error);
  });
});
