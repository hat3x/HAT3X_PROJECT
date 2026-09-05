import { afterEach, describe, expect, it } from 'vitest';
import { friendlyErrorMessage } from './friendly-error';

// `navigator.onLine` es de solo lectura en jsdom; se sobreescribe por test y se restaura al final.
function setOnline(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { value, configurable: true });
}

afterEach(() => {
  setOnline(true);
});

const OFFLINE = 'Parece que no hay conexión. Revisa tu internet y vuelve a intentarlo.';
const PERMISSION = 'No tienes permiso para ver esta información.';
const SESSION = 'Tu sesión ha caducado. Vuelve a iniciar sesión.';
const GENERIC = 'No se pudo completar la operación. Vuelve a intentarlo en unos segundos.';
const SCREEN_FALLBACK = 'No se pudo cargar la agenda. Vuelve a intentarlo.';

describe('friendlyErrorMessage — legibilidad (nunca filtra jerga técnica)', () => {
  it('con navigator.onLine === false devuelve el mensaje de sin conexión, sea cual sea el error', () => {
    setOnline(false);
    expect(friendlyErrorMessage({ code: '42501', message: 'permission denied' })).toBe(OFFLINE);
    expect(friendlyErrorMessage(new Error('cualquier cosa'), { fallback: SCREEN_FALLBACK })).toBe(
      OFFLINE,
    );
  });

  it('reconoce el TypeError de red del fetch («Failed to fetch») como sin conexión', () => {
    expect(friendlyErrorMessage(new TypeError('Failed to fetch'))).toBe(OFFLINE);
    expect(friendlyErrorMessage({ message: 'NetworkError when attempting to fetch resource' })).toBe(
      OFFLINE,
    );
    expect(friendlyErrorMessage({ message: 'Load failed' })).toBe(OFFLINE);
  });

  it('mapea sesión caducada (PGRST301 / HTTP 401 / «JWT expired») a reiniciar sesión', () => {
    expect(friendlyErrorMessage({ code: 'PGRST301', message: 'JWT expired' })).toBe(SESSION);
    expect(friendlyErrorMessage({ status: 401, message: 'Unauthorized' })).toBe(SESSION);
    expect(friendlyErrorMessage({ message: 'JWT expired' })).toBe(SESSION);
  });

  it('mapea permisos/RLS (42501 / HTTP 403 / «permission denied») a falta de permiso', () => {
    expect(
      friendlyErrorMessage({ code: '42501', message: 'permission denied for table appointments' }),
    ).toBe(PERMISSION);
    expect(friendlyErrorMessage({ status: 403, message: 'Forbidden' })).toBe(PERMISSION);
    expect(
      friendlyErrorMessage({ message: 'new row violates row-level security policy' }),
    ).toBe(PERMISSION);
  });

  it('para un error NO reconocido devuelve el fallback de pantalla, nunca el mensaje crudo', () => {
    const raw = 'fetchProfessionals: salonId es obligatorio (salón sin resolver).';
    const result = friendlyErrorMessage(new Error(raw), { fallback: SCREEN_FALLBACK });
    expect(result).toBe(SCREEN_FALLBACK);
    expect(result).not.toContain('salonId');
  });

  it('sin fallback de pantalla cae en la copia genérica legible', () => {
    expect(friendlyErrorMessage(new Error('boom'))).toBe(GENERIC);
  });

  it('tolera valores no-objeto (null, undefined, string) sin romperse', () => {
    expect(friendlyErrorMessage(null, { fallback: SCREEN_FALLBACK })).toBe(SCREEN_FALLBACK);
    expect(friendlyErrorMessage(undefined)).toBe(GENERIC);
    expect(friendlyErrorMessage('algo salió mal')).toBe(GENERIC);
  });
});
