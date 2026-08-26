import { describe, it, expect } from 'vitest';
import {
  resolveSalonSlug,
  mapSalonBrandingRow,
  type SalonBrandingRow,
} from './salon';

// Base domain of the production white-label deploy: <slug>.salonos.app
describe('resolveSalonSlug — priority: subdomain > ?salon > env fallback', () => {
  describe('subdomain of the host (highest priority)', () => {
    it('extracts the slug from a real salon subdomain', () => {
      expect(
        resolveSalonSlug({ hostname: 'jotabarber.salonos.app' })
      ).toEqual({ slug: 'jotabarber', source: 'subdomain' });
    });

    it('beats the ?salon param and the env fallback', () => {
      expect(
        resolveSalonSlug({
          hostname: 'jotabarber.salonos.app',
          search: '?salon=otro',
          envSlug: 'denueveanueve',
        })
      ).toEqual({ slug: 'jotabarber', source: 'subdomain' });
    });

    it('lowercases the host label', () => {
      expect(
        resolveSalonSlug({ hostname: 'JotaBarber.salonos.app' })
      ).toEqual({ slug: 'jotabarber', source: 'subdomain' });
    });

    it('tolerates a trailing dot (FQDN form)', () => {
      expect(
        resolveSalonSlug({ hostname: 'jotabarber.salonos.app.' })
      ).toEqual({ slug: 'jotabarber', source: 'subdomain' });
    });

    it('strips a leading www but keeps a deeper salon subdomain', () => {
      expect(
        resolveSalonSlug({ hostname: 'www.jotabarber.salonos.app' })
      ).toEqual({ slug: 'jotabarber', source: 'subdomain' });
    });

    it('rejects a subdomain label that is not a valid kebab slug', () => {
      // underscore is not allowed in a slug → not a subdomain, fall through to env
      expect(
        resolveSalonSlug({ hostname: 'foo_bar.salonos.app', envSlug: 'denueveanueve' })
      ).toEqual({ slug: 'denueveanueve', source: 'env' });
    });
  });

  describe('ignored hosts (no subdomain) → fall through', () => {
    it('ignores the bare apex domain', () => {
      expect(
        resolveSalonSlug({ hostname: 'salonos.app', envSlug: 'denueveanueve' })
      ).toEqual({ slug: 'denueveanueve', source: 'env' });
    });

    it('ignores www on the apex', () => {
      expect(
        resolveSalonSlug({ hostname: 'www.salonos.app', envSlug: 'denueveanueve' })
      ).toEqual({ slug: 'denueveanueve', source: 'env' });
    });

    it('ignores localhost', () => {
      expect(
        resolveSalonSlug({ hostname: 'localhost', envSlug: 'denueveanueve' })
      ).toEqual({ slug: 'denueveanueve', source: 'env' });
    });

    it('ignores localhost with a dev port', () => {
      expect(
        resolveSalonSlug({ hostname: 'localhost:5173', envSlug: 'denueveanueve' })
      ).toEqual({ slug: 'denueveanueve', source: 'env' });
    });

    it('ignores *.localhost', () => {
      expect(
        resolveSalonSlug({ hostname: 'jotabarber.localhost', envSlug: 'denueveanueve' })
      ).toEqual({ slug: 'denueveanueve', source: 'env' });
    });

    it('ignores an IPv4 literal', () => {
      expect(
        resolveSalonSlug({ hostname: '127.0.0.1', envSlug: 'denueveanueve' })
      ).toEqual({ slug: 'denueveanueve', source: 'env' });
    });

    it('ignores an IPv6 literal', () => {
      expect(
        resolveSalonSlug({ hostname: '::1', envSlug: 'denueveanueve' })
      ).toEqual({ slug: 'denueveanueve', source: 'env' });
    });
  });

  describe('?salon query param (second priority)', () => {
    it('is used when the host has no usable subdomain', () => {
      expect(
        resolveSalonSlug({ hostname: 'localhost', search: '?salon=barbershop' })
      ).toEqual({ slug: 'barbershop', source: 'query' });
    });

    it('beats the env fallback', () => {
      expect(
        resolveSalonSlug({
          hostname: 'localhost',
          search: '?salon=barbershop',
          envSlug: 'denueveanueve',
        })
      ).toEqual({ slug: 'barbershop', source: 'query' });
    });

    it('normalises case and surrounding whitespace', () => {
      expect(
        resolveSalonSlug({ hostname: 'localhost', search: '?salon=%20Downtown%20' })
      ).toEqual({ slug: 'downtown', source: 'query' });
    });

    it('ignores an empty or invalid ?salon value', () => {
      expect(
        resolveSalonSlug({ hostname: 'localhost', search: '?salon=', envSlug: 'denueveanueve' })
      ).toEqual({ slug: 'denueveanueve', source: 'env' });
    });
  });

  describe('env fallback (lowest priority)', () => {
    it('is used when there is neither subdomain nor query param', () => {
      expect(
        resolveSalonSlug({ hostname: 'localhost', envSlug: 'denueveanueve' })
      ).toEqual({ slug: 'denueveanueve', source: 'env' });
    });

    it('normalises the env value', () => {
      expect(
        resolveSalonSlug({ hostname: 'localhost', envSlug: '  DeNueveAnueve ' })
      ).toEqual({ slug: 'denueveanueve', source: 'env' });
    });
  });

  describe('nothing resolves', () => {
    it('returns null / none when host, query and env are all empty', () => {
      expect(resolveSalonSlug({ hostname: 'localhost' })).toEqual({
        slug: null,
        source: 'none',
      });
    });

    it('returns null / none for a blank hostname and no fallback', () => {
      expect(resolveSalonSlug({ hostname: '' })).toEqual({ slug: null, source: 'none' });
    });
  });
});

describe('mapSalonBrandingRow', () => {
  it('maps a full RPC row (snake_case) to the camelCase branding shape', () => {
    expect(
      mapSalonBrandingRow({
        id: 'abeef620-4fe3-4b29-a17b-6c51a8284f8f',
        name: 'Jota Barber',
        slug: 'jotabarber',
        logo_url: 'https://cdn.example/logo.png',
        primary_color: '#c9a24b',
        secondary_color: '#1a1712',
      })
    ).toEqual({
      id: 'abeef620-4fe3-4b29-a17b-6c51a8284f8f',
      name: 'Jota Barber',
      slug: 'jotabarber',
      logoUrl: 'https://cdn.example/logo.png',
      primaryColor: '#c9a24b',
      secondaryColor: '#1a1712',
    });
  });

  it('preserves null logo_url and secondary_color (salon without full branding)', () => {
    expect(
      mapSalonBrandingRow({
        id: 'id-1',
        name: 'Sin Marca',
        slug: 'sin-marca',
        logo_url: null,
        primary_color: '#111827',
        secondary_color: null,
      })
    ).toEqual({
      id: 'id-1',
      name: 'Sin Marca',
      slug: 'sin-marca',
      logoUrl: null,
      primaryColor: '#111827',
      secondaryColor: null,
    });
  });

  it('returns null when the RPC returned no row (slug not found / inactive)', () => {
    expect(mapSalonBrandingRow(null)).toBeNull();
    expect(mapSalonBrandingRow(undefined)).toBeNull();
  });

  it('returns null defensively when the row lacks an id', () => {
    expect(
      mapSalonBrandingRow({
        id: '',
        name: 'x',
        slug: 'x',
        logo_url: null,
        primary_color: '#111827',
        secondary_color: null,
      })
    ).toBeNull();
  });
});

describe('slug inexistente → branding nulo (alimenta la pantalla "salón no encontrado")', () => {
  // El <SalonProvider> pinta la pantalla de error 'not-found' en DOS casos, y ambos
  // nacen de estas funciones PURAS: (a) no se resuelve ningún slug, y (b) el slug se
  // resuelve pero la RPC no devuelve salón (inexistente/inactivo). Aquí fijamos ese
  // contrato en el límite puro; el render del <SalonError> se cubre en integración.

  it('(a) sin subdominio, sin ?salon y sin env ⇒ slug null (Provider → not-found)', () => {
    // Sin ninguna vía de resolución, no hay salón que montar: el árbol cae a la
    // pantalla "salón no encontrado", nunca a un pantallazo en blanco.
    expect(resolveSalonSlug({ hostname: 'localhost' })).toEqual({ slug: null, source: 'none' });
    expect(resolveSalonSlug({ hostname: '', search: '?salon=', envSlug: '  ' })).toEqual({
      slug: null,
      source: 'none',
    });
  });

  it('(b) la RPC RETURNS TABLE vacía ([]) para un slug resuelto ⇒ branding null', () => {
    // fetchSalonBranding toma la PRIMERA fila de la RPC: para un slug inexistente la
    // RPC devuelve [], data[0] es undefined y el mapper puro devuelve null → not-found.
    const rpcEmpty: SalonBrandingRow[] = [];
    expect(mapSalonBrandingRow(rpcEmpty[0])).toBeNull();
    expect(mapSalonBrandingRow(null)).toBeNull();
    expect(mapSalonBrandingRow(undefined)).toBeNull();
  });
});
