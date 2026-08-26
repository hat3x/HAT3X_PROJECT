import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { SalonOsConfigError } from '@/lib/salon-os-api';

// Se mockea SÓLO el contexto del salón para inyectar un slug ya resuelto en runtime,
// sin montar <SalonProvider> (que llamaría a la RPC de branding). El resto —leer la
// base de env y construir el cliente— se ejercita REAL, para verificar que la config
// combina de verdad la base de VITE_SALON_OS_API_URL con el slug de useSalon().
// vi.hoisted es necesario: vi.mock se iza por encima de este archivo, así que la
// factoría no puede capturar un `const` normal (aún sin inicializar al izarse).
const { useSalonMock } = vi.hoisted(() => ({ useSalonMock: vi.fn() }));
vi.mock('@/lib/salon-context', () => ({ useSalon: useSalonMock }));

import { getSalonOsApiBaseUrl, useSalonOsConfig, useSalonOsApi } from './salon-os';

// Datos sintéticos (no producción). Sólo se usa `slug` del branding; el resto de
// SalonBranding es irrelevante para la config, de ahí el cast acotado.
const brandingWithSlug = (slug: string) => ({ slug }) as unknown as ReturnType<typeof useSalonMock>;

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  useSalonMock.mockReset();
});

// ── getSalonOsApiBaseUrl: base de env, normalizada (delega en el transporte) ──────
describe('getSalonOsApiBaseUrl', () => {
  it('lee VITE_SALON_OS_API_URL y la normaliza (sin barra final)', () => {
    vi.stubEnv('VITE_SALON_OS_API_URL', 'https://app.salonos.app/');
    expect(getSalonOsApiBaseUrl()).toBe('https://app.salonos.app');
  });

  it('lanza SalonOsConfigError si falta la base (fallo de config de build-time)', () => {
    vi.stubEnv('VITE_SALON_OS_API_URL', '');
    expect(() => getSalonOsApiBaseUrl()).toThrow(SalonOsConfigError);
  });
});

// ── useSalonOsConfig: base de env + slug REUTILIZADO del runtime ─────────────────
describe('useSalonOsConfig', () => {
  it('reutiliza el slug de useSalon() y lo combina con la base de env', () => {
    vi.stubEnv('VITE_SALON_OS_API_URL', 'https://app.salonos.app');
    useSalonMock.mockReturnValue(brandingWithSlug('jotabarber'));

    const { result } = renderHook(() => useSalonOsConfig());

    expect(result.current).toEqual({
      baseUrl: 'https://app.salonos.app',
      slug: 'jotabarber',
    });
  });

  it('NO cablea el slug: sigue al que resuelve useSalon() en cada salón', () => {
    vi.stubEnv('VITE_SALON_OS_API_URL', 'https://app.salonos.app');
    useSalonMock.mockReturnValue(brandingWithSlug('otro-salon'));

    const { result } = renderHook(() => useSalonOsConfig());

    expect(result.current.slug).toBe('otro-salon');
  });

  it('propaga el fallo de config si falta la base (lo captará el ErrorBoundary)', () => {
    vi.stubEnv('VITE_SALON_OS_API_URL', '');
    useSalonMock.mockReturnValue(brandingWithSlug('jotabarber'));
    // React vuelca a console.error el throw de render aunque el test lo capture;
    // lo silenciamos para no ensuciar la salida (el assert sigue verificando el throw).
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => renderHook(() => useSalonOsConfig())).toThrow(SalonOsConfigError);

    errSpy.mockRestore();
  });
});

// ── useSalonOsApi: cliente tipado ligado a (base de env, slug reutilizado) ────────
describe('useSalonOsApi', () => {
  it('construye el cliente con la base de env y el slug reutilizado del runtime', () => {
    vi.stubEnv('VITE_SALON_OS_API_URL', 'https://app.salonos.app/');
    useSalonMock.mockReturnValue(brandingWithSlug('jotabarber'));

    const { result } = renderHook(() => useSalonOsApi());

    expect(result.current.baseUrl).toBe('https://app.salonos.app');
    expect(result.current.slug).toBe('jotabarber');
    expect(typeof result.current.getBootstrap).toBe('function');
  });
});
