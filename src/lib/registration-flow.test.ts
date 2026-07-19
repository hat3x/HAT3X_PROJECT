// Tests del desenlace PURO del paso final del registro (registration-flow.ts).
//
// El módulo no toca Supabase ni React (recibe el resultado crudo de la RPC por
// parámetro), así que se prueba en aislamiento sin mockear nada. Cubre las dos piezas
// del encadenado de sub-5: la traducción del error de la RPC (`mapRegisterError`) y la
// clasificación del desenlace que decide qué hace la UI (`classifyRegisterOutcome`).
import { describe, it, expect } from 'vitest';
import {
  mapRegisterError,
  classifyRegisterOutcome,
  detectPhoneVerificationResumption,
  PHONE_NOT_VERIFIED_ERROR_KEY,
} from './registration-flow';

/** Error con la forma de la EXCEPTION (P0001) que lanza la RPC de Salón OS. */
const rpcError = (message: string, code = 'P0001') => ({ code, message });

describe('mapRegisterError', () => {
  it('sin error → clave genérica', () => {
    expect(mapRegisterError(null)).toBe('auth.error.generic');
    expect(mapRegisterError(undefined)).toBe('auth.error.generic');
  });

  it('INVALID_PHONE → teléfono no válido', () => {
    expect(mapRegisterError(rpcError('INVALID_PHONE: bad number'))).toBe('auth.error.invalidPhone');
  });

  it('PHONE_NOT_VERIFIED → clave de teléfono no verificado (gating de sub-5)', () => {
    expect(mapRegisterError(rpcError('PHONE_NOT_VERIFIED'))).toBe(PHONE_NOT_VERIFIED_ERROR_KEY);
    expect(PHONE_NOT_VERIFIED_ERROR_KEY).toBe('auth.error.phoneNotVerified');
  });

  it('PHONE_NOT_VERIFIED gana al catch-all de P0001 (NO se confunde con conflicto)', () => {
    // Guardia de regresión: la RPC lanza PHONE_NOT_VERIFIED como P0001; sin la
    // comprobación específica se mapearía a "teléfono ya vinculado", un mensaje engañoso.
    expect(mapRegisterError({ code: 'P0001', message: 'PHONE_NOT_VERIFIED' })).toBe(
      'auth.error.phoneNotVerified'
    );
  });

  it('FEATURE_NOT_ENABLED → add-on no contratado (antes del catch-all de P0001)', () => {
    expect(mapRegisterError(rpcError('FEATURE_NOT_ENABLED'))).toBe('auth.error.featureNotEnabled');
  });

  it('PHONE_CONFLICT → teléfono ya vinculado', () => {
    expect(mapRegisterError(rpcError('PHONE_CONFLICT'))).toBe('auth.error.phoneConflict');
  });

  it('P0001 sin texto reconocible → conflicto de teléfono (red de seguridad)', () => {
    expect(mapRegisterError({ code: 'P0001', message: 'unexpected' })).toBe('auth.error.phoneConflict');
  });

  it('error desconocido → clave genérica', () => {
    expect(mapRegisterError({ code: '500', message: 'network down' })).toBe('auth.error.generic');
  });
});

describe('classifyRegisterOutcome', () => {
  it('error PHONE_NOT_VERIFIED → { kind: "phone-not-verified" } (reabrir verificación, NO error terminal)', () => {
    const outcome = classifyRegisterOutcome({ error: rpcError('PHONE_NOT_VERIFIED') });
    expect(outcome).toEqual({ kind: 'phone-not-verified' });
  });

  it('cualquier otro error → { kind: "error", errorKey } con el mensaje traducido', () => {
    const outcome = classifyRegisterOutcome({ error: rpcError('PHONE_CONFLICT') });
    expect(outcome).toEqual({ kind: 'error', errorKey: 'auth.error.phoneConflict' });
  });

  it('éxito con outcome "linked" → success + linked=true (copy de ficha vinculada)', () => {
    expect(classifyRegisterOutcome({ data: { outcome: 'linked' }, error: null })).toEqual({
      kind: 'success',
      linked: true,
    });
  });

  it('éxito con outcome "created" → success + linked=false (copy de cuenta creada)', () => {
    expect(classifyRegisterOutcome({ data: { outcome: 'created' }, error: null })).toEqual({
      kind: 'success',
      linked: false,
    });
  });

  it('éxito con outcome "already_linked" → success + linked=false (los tres son éxito)', () => {
    expect(classifyRegisterOutcome({ data: { outcome: 'already_linked' }, error: null })).toEqual({
      kind: 'success',
      linked: false,
    });
  });

  it('éxito con respuesta escalar → interpreta el escalar como outcome', () => {
    expect(classifyRegisterOutcome({ data: 'linked', error: null })).toEqual({ kind: 'success', linked: true });
    expect(classifyRegisterOutcome({ data: 'created', error: null })).toEqual({ kind: 'success', linked: false });
  });

  it('éxito sin datos (null) → success + linked=false (no rompe)', () => {
    expect(classifyRegisterOutcome({ data: null, error: null })).toEqual({ kind: 'success', linked: false });
  });
});

describe('detectPhoneVerificationResumption (reanudación de sub-6)', () => {
  /** Sesión de una cuenta creada por signUp que abandonó ANTES de verificar el teléfono. */
  const pendingUser = (overrides = {}) => ({
    email: 'ana@example.com',
    phone_confirmed_at: null,
    user_metadata: { phone: '600123456', first_name: 'Ana', last_name: 'García' },
    ...overrides,
  });

  it('sin sesión (null/undefined) → none (no hay nada que reanudar)', () => {
    expect(detectPhoneVerificationResumption(null)).toEqual({ kind: 'none' });
    expect(detectPhoneVerificationResumption(undefined)).toEqual({ kind: 'none' });
  });

  it('teléfono ya confirmado (phone_confirmed_at sellado) → none aunque haya teléfono', () => {
    expect(
      detectPhoneVerificationResumption(pendingUser({ phone_confirmed_at: '2026-07-19T10:00:00Z' }))
    ).toEqual({ kind: 'none' });
  });

  it('cuenta creada + teléfono sin confirmar → resume con los datos del alta (para la RPC)', () => {
    expect(detectPhoneVerificationResumption(pendingUser())).toEqual({
      kind: 'resume',
      phone: '600123456',
      fullName: 'Ana García',
      email: 'ana@example.com',
    });
  });

  it('prefiere el teléfono TECLEADO (metadata) sobre el new_phone pendiente (mismo p_phone que el alta)', () => {
    const user = pendingUser({ new_phone: '+34611000000' });
    expect(detectPhoneVerificationResumption(user)).toMatchObject({ kind: 'resume', phone: '600123456' });
  });

  it('sin teléfono en metadata pero con new_phone pendiente → reanuda con el E.164 pendiente', () => {
    const user = pendingUser({ user_metadata: { first_name: 'Ana', last_name: 'García' }, new_phone: '+34600123456' });
    expect(detectPhoneVerificationResumption(user)).toEqual({
      kind: 'resume',
      phone: '+34600123456',
      fullName: 'Ana García',
      email: 'ana@example.com',
    });
  });

  it('teléfono sin confirmar pero SIN ningún teléfono conocido → none (nada que reenviar)', () => {
    const user = pendingUser({ user_metadata: { first_name: 'Ana' }, new_phone: null });
    expect(detectPhoneVerificationResumption(user)).toEqual({ kind: 'none' });
  });

  it('nombre incompleto en metadata → fullName se recorta sin romper (solo el nombre disponible)', () => {
    const user = pendingUser({ user_metadata: { phone: '600123456', first_name: 'Ana' } });
    expect(detectPhoneVerificationResumption(user)).toMatchObject({ kind: 'resume', fullName: 'Ana' });
  });
});
