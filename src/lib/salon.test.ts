import { describe, it, expect } from 'vitest';
import {
  DEFAULT_PRIMARY_COLOR,
  mapBrandingRow,
  normalizeSlug,
  resolveSalonSlug,
  salonFromSearch,
  subdomainFromHost,
  type SalonBrandingRow,
} from './salon';

describe('normalizeSlug', () => {
  it('recorta espacios y baja a minúsculas', () => {
    expect(normalizeSlug('  DeNueveAnueve  ')).toBe('denueveanueve');
  });

  it('devuelve cadena vacía para null/undefined', () => {
    expect(normalizeSlug(null)).toBe('');
    expect(normalizeSlug(undefined)).toBe('');
    expect(normalizeSlug('   ')).toBe('');
  });
});

describe('subdomainFromHost', () => {
  it('extrae el subdominio de un host con subdominio real', () => {
    expect(subdomainFromHost('denueveanueve.salonos.app')).toBe('denueveanueve');
  });

  it('devuelve la PRIMERA etiqueta con subdominios anidados', () => {
    expect(subdomainFromHost('denueveanueve.reservas.salonos.app')).toBe('denueveanueve');
  });

  it('ignora "www" y trata www.dominio.tld como apex (→ null)', () => {
    expect(subdomainFromHost('www.salonos.app')).toBeNull();
  });

  it('quita un "www" inicial antes de extraer el subdominio real', () => {
    expect(subdomainFromHost('www.denueveanueve.salonos.app')).toBe('denueveanueve');
  });

  it('devuelve null para el apex (dominio + TLD)', () => {
    expect(subdomainFromHost('salonos.app')).toBeNull();
  });

  it('devuelve null para localhost y subdominios de localhost', () => {
    expect(subdomainFromHost('localhost')).toBeNull();
    expect(subdomainFromHost('denueveanueve.localhost')).toBeNull();
  });

  it('devuelve null para IPs v4 y v6', () => {
    expect(subdomainFromHost('127.0.0.1')).toBeNull();
    expect(subdomainFromHost('192.168.1.10')).toBeNull();
    expect(subdomainFromHost('::1')).toBeNull();
    expect(subdomainFromHost('2001:db8::1')).toBeNull();
  });

  it('normaliza mayúsculas y el punto final del FQDN', () => {
    expect(subdomainFromHost('DeNueveAnueve.SalonOS.app.')).toBe('denueveanueve');
  });

  it('devuelve null para host vacío', () => {
    expect(subdomainFromHost('')).toBeNull();
    expect(subdomainFromHost('   ')).toBeNull();
  });
});

describe('salonFromSearch', () => {
  it('lee el parámetro ?salon=<slug>', () => {
    expect(salonFromSearch('?salon=denueveanueve')).toBe('denueveanueve');
  });

  it('normaliza el valor del parámetro', () => {
    expect(salonFromSearch('?salon=%20DeNueveAnueve%20')).toBe('denueveanueve');
  });

  it('convive con otros parámetros', () => {
    expect(salonFromSearch('?foo=1&salon=miot&bar=2')).toBe('miot');
  });

  it('devuelve null si no hay parámetro salon o está vacío', () => {
    expect(salonFromSearch('')).toBeNull();
    expect(salonFromSearch('?otra=cosa')).toBeNull();
    expect(salonFromSearch('?salon=')).toBeNull();
    expect(salonFromSearch('?salon=%20%20')).toBeNull();
  });
});

describe('resolveSalonSlug (prioridad subdominio > ?salon= > fallback)', () => {
  const fallbackSlug = 'fallbacksalon';

  it('el subdominio gana sobre el parámetro y el fallback', () => {
    expect(
      resolveSalonSlug({
        host: 'denueveanueve.salonos.app',
        search: '?salon=otrosalon',
        fallbackSlug,
      }),
    ).toBe('denueveanueve');
  });

  it('usa ?salon= cuando no hay subdominio (apex)', () => {
    expect(
      resolveSalonSlug({ host: 'salonos.app', search: '?salon=otrosalon', fallbackSlug }),
    ).toBe('otrosalon');
  });

  it('usa ?salon= en localhost (dev)', () => {
    expect(
      resolveSalonSlug({ host: 'localhost', search: '?salon=denueveanueve', fallbackSlug }),
    ).toBe('denueveanueve');
  });

  it('cae al fallback cuando no hay ni subdominio ni parámetro', () => {
    expect(resolveSalonSlug({ host: 'localhost', search: '', fallbackSlug })).toBe(fallbackSlug);
    expect(resolveSalonSlug({ host: 'salonos.app', search: '', fallbackSlug })).toBe(fallbackSlug);
  });

  it('normaliza el fallback', () => {
    expect(resolveSalonSlug({ host: 'localhost', search: '', fallbackSlug: '  MiSalon ' })).toBe(
      'misalon',
    );
  });
});

describe('mapBrandingRow', () => {
  const fullRow: SalonBrandingRow = {
    id: '00000000-0000-4000-8000-000000000001',
    name: 'Salón de Nueve a Nueve',
    slug: 'denueveanueve',
    logo_url: 'https://cdn.example.test/logo.png',
    primary_color: '#c8a24b',
    secondary_color: '#1f2937',
  };

  it('mapea una fila completa a camelCase', () => {
    expect(mapBrandingRow([fullRow])).toEqual({
      id: fullRow.id,
      name: fullRow.name,
      slug: fullRow.slug,
      logoUrl: fullRow.logo_url,
      primaryColor: fullRow.primary_color,
      secondaryColor: fullRow.secondary_color,
    });
  });

  it('acepta también una fila suelta (no array)', () => {
    expect(mapBrandingRow(fullRow)?.id).toBe(fullRow.id);
  });

  it('toma la PRIMERA fila cuando hay varias', () => {
    const other: SalonBrandingRow = { ...fullRow, id: 'segunda', slug: 'otro' };
    expect(mapBrandingRow([fullRow, other])?.slug).toBe('denueveanueve');
  });

  it('aplica el color por defecto cuando primary_color es null', () => {
    expect(mapBrandingRow([{ ...fullRow, primary_color: null }])?.primaryColor).toBe(
      DEFAULT_PRIMARY_COLOR,
    );
  });

  it('conserva logo/secondary null sin romper', () => {
    const mapped = mapBrandingRow([{ ...fullRow, logo_url: null, secondary_color: null }]);
    expect(mapped?.logoUrl).toBeNull();
    expect(mapped?.secondaryColor).toBeNull();
  });

  it('devuelve null cuando no hay filas (slug inexistente / salón inactivo)', () => {
    expect(mapBrandingRow([])).toBeNull();
    expect(mapBrandingRow(null)).toBeNull();
    expect(mapBrandingRow(undefined)).toBeNull();
  });

  it('devuelve null si la fila no trae id (dato corrupto)', () => {
    expect(mapBrandingRow([{ ...fullRow, id: '' }])).toBeNull();
  });
});
