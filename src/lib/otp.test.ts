// Tests de las utilidades PURAS del flujo OTP (src/lib/otp.ts).
//
// Todo es determinista: la normalización no toca red ni base de datos y el cooldown
// recibe el "ahora" por parámetro, así que no hace falta mockear relojes ni timers.
import { describe, it, expect } from 'vitest';
import {
  normalizePhoneToE164,
  isValidE164,
  phoneErrorMessageKey,
  startCooldown,
  cooldownRemainingSeconds,
  canResend,
  formatCountdown,
  IDLE_COOLDOWN,
  DEFAULT_RESEND_COOLDOWN_SECONDS,
  mapOtpError,
  sanitizeOtpCode,
  isOtpCodeComplete,
  DEFAULT_OTP_CODE_LENGTH,
} from './otp';

// ─────────────────────────────────────────────────────────────────────────────
// normalizePhoneToE164 — normalización a E.164 (por defecto España, +34, 9 dígitos)
// ─────────────────────────────────────────────────────────────────────────────
describe('normalizePhoneToE164 — formas de entrada válidas (España por defecto)', () => {
  it('normaliza un número nacional con espacios', () => {
    expect(normalizePhoneToE164('600 123 456')).toEqual({
      ok: true,
      e164: '+34600123456',
      callingCode: '34',
      nationalNumber: '600123456',
    });
  });

  it('normaliza un nacional pegado sin separadores', () => {
    expect(normalizePhoneToE164('600123456')).toMatchObject({ ok: true, e164: '+34600123456' });
  });

  it('acepta separadores variados: guiones, paréntesis, puntos y barras', () => {
    expect(normalizePhoneToE164('(600) 123-456')).toMatchObject({ ok: true, e164: '+34600123456' });
    expect(normalizePhoneToE164('600.123.456')).toMatchObject({ ok: true, e164: '+34600123456' });
    expect(normalizePhoneToE164('600/123/456')).toMatchObject({ ok: true, e164: '+34600123456' });
  });

  it('normaliza un internacional explícito con +34 y espacios/guiones', () => {
    expect(normalizePhoneToE164('+34 600-123-456')).toMatchObject({ ok: true, e164: '+34600123456' });
  });

  it('normaliza el prefijo internacional 00 (0034 → +34)', () => {
    expect(normalizePhoneToE164('0034 600123456')).toMatchObject({ ok: true, e164: '+34600123456' });
  });

  it('heurística: código de país sin + (34600123456) no se duplica', () => {
    expect(normalizePhoneToE164('34600123456')).toEqual({
      ok: true,
      e164: '+34600123456',
      callingCode: '34',
      nationalNumber: '600123456',
    });
  });

  it('recorta espacios al inicio/fin antes de normalizar', () => {
    expect(normalizePhoneToE164('  600123456  ')).toMatchObject({ ok: true, e164: '+34600123456' });
  });

  it('acepta un fijo español de 9 dígitos (no solo móviles 6/7)', () => {
    expect(normalizePhoneToE164('912345678')).toMatchObject({ ok: true, e164: '+34912345678' });
  });
});

describe('normalizePhoneToE164 — números internacionales (país distinto al por defecto)', () => {
  it('parte correctamente un +351 (Portugal) sin confundirlo con +34', () => {
    expect(normalizePhoneToE164('+351 912345678')).toEqual({
      ok: true,
      e164: '+351912345678',
      callingCode: '351',
      nationalNumber: '912345678',
    });
  });

  it('parte un +1 (Norteamérica)', () => {
    expect(normalizePhoneToE164('+1 415 555 0123')).toEqual({
      ok: true,
      e164: '+14155550123',
      callingCode: '1',
      nationalNumber: '4155550123',
    });
  });

  it('no aplica la longitud nacional española a un número no español', () => {
    // 8 dígitos tras +33: sería inválido como español, pero como francés respeta E.164.
    expect(normalizePhoneToE164('+33 123 456 78')).toMatchObject({ ok: true, e164: '+3312345678' });
  });
});

describe('normalizePhoneToE164 — entradas inválidas', () => {
  it('rechaza cadena vacía o solo espacios', () => {
    expect(normalizePhoneToE164('')).toEqual({ ok: false, reason: 'empty' });
    expect(normalizePhoneToE164('   ')).toEqual({ ok: false, reason: 'empty' });
    expect(normalizePhoneToE164(null)).toEqual({ ok: false, reason: 'empty' });
    expect(normalizePhoneToE164(undefined)).toEqual({ ok: false, reason: 'empty' });
  });

  it('rechaza caracteres no permitidos (letras)', () => {
    expect(normalizePhoneToE164('600 ABC 456')).toEqual({ ok: false, reason: 'invalid_chars' });
    expect(normalizePhoneToE164('teléfono')).toEqual({ ok: false, reason: 'invalid_chars' });
  });

  it('rechaza un nacional español demasiado corto', () => {
    expect(normalizePhoneToE164('600123')).toEqual({ ok: false, reason: 'too_short' });
  });

  it('rechaza un nacional español demasiado largo', () => {
    expect(normalizePhoneToE164('6001234567')).toEqual({ ok: false, reason: 'too_long' });
  });

  it('rechaza un E.164 que supera los 15 dígitos', () => {
    expect(normalizePhoneToE164('+3412345678901234')).toEqual({ ok: false, reason: 'too_long' });
  });

  it('rechaza un número por debajo del mínimo E.164 (8 dígitos)', () => {
    expect(normalizePhoneToE164('+34123')).toMatchObject({ ok: false });
  });

  it('rechaza un código de país que empieza por 0', () => {
    expect(normalizePhoneToE164('+0123456789')).toEqual({ ok: false, reason: 'invalid_country' });
  });
});

describe('normalizePhoneToE164 — opciones personalizadas', () => {
  it('permite cambiar el país por defecto (Portugal, +351)', () => {
    expect(
      normalizePhoneToE164('912345678', { defaultCallingCode: '351', defaultNationalNumberLength: 9 })
    ).toMatchObject({ ok: true, e164: '+351912345678', callingCode: '351' });
  });

  it('con defaultNationalNumberLength=null solo valida la longitud E.164 genérica', () => {
    expect(
      normalizePhoneToE164('12345678', { defaultCallingCode: '34', defaultNationalNumberLength: null })
    ).toMatchObject({ ok: true, e164: '+3412345678' });
  });
});

describe('isValidE164', () => {
  it('acepta un E.164 bien formado', () => {
    expect(isValidE164('+34600123456')).toBe(true);
    expect(isValidE164('+14155550123')).toBe(true);
  });
  it('rechaza formatos incorrectos', () => {
    expect(isValidE164('600123456')).toBe(false); // sin +
    expect(isValidE164('+0600123456')).toBe(false); // empieza por 0
    expect(isValidE164('+34 600 123 456')).toBe(false); // con espacios
    expect(isValidE164('')).toBe(false);
    expect(isValidE164(null)).toBe(false);
    expect(isValidE164(undefined)).toBe(false);
  });
});

describe('phoneErrorMessageKey', () => {
  it('mapea cualquier motivo a la clave de teléfono inválido', () => {
    expect(phoneErrorMessageKey('too_short')).toBe('auth.error.invalidPhone');
    expect(phoneErrorMessageKey('invalid_chars')).toBe('auth.error.invalidPhone');
    expect(phoneErrorMessageKey('empty')).toBe('auth.error.invalidPhone');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Cooldown de reenvío
// ─────────────────────────────────────────────────────────────────────────────
describe('cooldown de reenvío', () => {
  const T0 = 1_000_000; // "ahora" sintético (epoch ms)

  it('IDLE_COOLDOWN permite reenviar de inmediato', () => {
    expect(canResend(IDLE_COOLDOWN, T0)).toBe(true);
    expect(cooldownRemainingSeconds(IDLE_COOLDOWN, T0)).toBe(0);
  });

  it('startCooldown fija el fin en now + duración', () => {
    const state = startCooldown(T0, 60);
    expect(state.endsAt).toBe(T0 + 60_000);
  });

  it('cuenta atrás: 60s justo al arrancar, decrece con el tiempo y llega a 0', () => {
    const state = startCooldown(T0, 60);
    expect(cooldownRemainingSeconds(state, T0)).toBe(60);
    expect(cooldownRemainingSeconds(state, T0 + 1_000)).toBe(59);
    expect(cooldownRemainingSeconds(state, T0 + 59_500)).toBe(1); // redondeo hacia arriba
    expect(cooldownRemainingSeconds(state, T0 + 60_000)).toBe(0);
    expect(cooldownRemainingSeconds(state, T0 + 120_000)).toBe(0); // nunca negativo
  });

  it('canResend es false mientras queda tiempo y true al expirar', () => {
    const state = startCooldown(T0, 30);
    expect(canResend(state, T0)).toBe(false);
    expect(canResend(state, T0 + 29_000)).toBe(false);
    expect(canResend(state, T0 + 30_000)).toBe(true);
  });

  it('una duración <= 0 (o no finita) deja el cooldown inactivo', () => {
    expect(startCooldown(T0, 0)).toEqual({ endsAt: 0 });
    expect(startCooldown(T0, -5)).toEqual({ endsAt: 0 });
    expect(startCooldown(T0, Number.NaN)).toEqual({ endsAt: 0 });
    expect(canResend(startCooldown(T0, 0), T0)).toBe(true);
  });

  it('DEFAULT_RESEND_COOLDOWN_SECONDS es un valor sensato', () => {
    expect(DEFAULT_RESEND_COOLDOWN_SECONDS).toBeGreaterThan(0);
  });
});

describe('formatCountdown', () => {
  it('formatea como m:ss con segundos a dos dígitos', () => {
    expect(formatCountdown(0)).toBe('0:00');
    expect(formatCountdown(9)).toBe('0:09');
    expect(formatCountdown(59)).toBe('0:59');
    expect(formatCountdown(60)).toBe('1:00');
    expect(formatCountdown(65)).toBe('1:05');
    expect(formatCountdown(125)).toBe('2:05');
  });

  it('trata negativos y no finitos como 0:00', () => {
    expect(formatCountdown(-10)).toBe('0:00');
    expect(formatCountdown(Number.NaN)).toBe('0:00');
    expect(formatCountdown(Number.POSITIVE_INFINITY)).toBe('0:00');
  });

  it('trunca fracciones de segundo hacia abajo', () => {
    expect(formatCountdown(59.9)).toBe('0:59');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// mapOtpError — traducción de errores de Supabase Auth y de la RPC
// ─────────────────────────────────────────────────────────────────────────────
describe('mapOtpError', () => {
  it('PHONE_NOT_VERIFIED de la RPC → clave de teléfono no verificado', () => {
    expect(mapOtpError({ code: 'P0001', message: 'PHONE_NOT_VERIFIED' })).toBe('auth.error.phoneNotVerified');
    expect(mapOtpError({ message: 'register failed: PHONE_NOT_VERIFIED' })).toBe('auth.error.phoneNotVerified');
  });

  it('código caducado → otpExpired (incl. el mensaje ambiguo de gotrue)', () => {
    expect(mapOtpError({ code: 'otp_expired', message: 'Token has expired or is invalid' })).toBe(
      'auth.error.otpExpired'
    );
    expect(mapOtpError({ message: 'OTP code has expired' })).toBe('auth.error.otpExpired');
  });

  it('demasiados intentos / límite de frecuencia → otpTooManyAttempts', () => {
    expect(mapOtpError({ code: 'over_request_rate_limit', message: '' })).toBe('auth.error.otpTooManyAttempts');
    expect(mapOtpError({ message: 'For security purposes, you can only request this after 45 seconds.' })).toBe(
      'auth.error.otpTooManyAttempts'
    );
    expect(mapOtpError({ code: 'too_many_requests' })).toBe('auth.error.otpTooManyAttempts');
    expect(mapOtpError({ message: 'Too many attempts, try later' })).toBe('auth.error.otpTooManyAttempts');
  });

  it('fallo al enviar el SMS → otpSendFailed', () => {
    expect(mapOtpError({ code: 'sms_send_failed', message: 'Error sending sms' })).toBe('auth.error.otpSendFailed');
    expect(mapOtpError({ message: 'Error sending confirmation sms to number' })).toBe('auth.error.otpSendFailed');
  });

  it('teléfono inválido → invalidPhone', () => {
    expect(mapOtpError({ code: 'validation_failed', message: 'Invalid phone number' })).toBe(
      'auth.error.invalidPhone'
    );
    expect(mapOtpError({ message: 'invalid_phone' })).toBe('auth.error.invalidPhone');
  });

  it('código incorrecto (backend distingue de caducado) → otpInvalid', () => {
    expect(mapOtpError({ message: 'Invalid token' })).toBe('auth.error.otpInvalid');
    expect(mapOtpError({ message: 'Incorrect code' })).toBe('auth.error.otpInvalid');
    expect(mapOtpError({ code: 'invalid_otp', message: 'Token not found' })).toBe('auth.error.otpInvalid');
  });

  it('el límite de envío de SMS gana al fallo de envío (over_sms_send_rate_limit → too many)', () => {
    expect(mapOtpError({ code: 'over_sms_send_rate_limit', message: 'sms send rate' })).toBe(
      'auth.error.otpTooManyAttempts'
    );
  });

  it('acepta un error en forma de string', () => {
    expect(mapOtpError('Token has expired')).toBe('auth.error.otpExpired');
  });

  it('usa error_description cuando no hay message', () => {
    expect(mapOtpError({ error_description: 'Invalid token' })).toBe('auth.error.otpInvalid');
  });

  it('null/undefined/desconocido → clave genérica', () => {
    expect(mapOtpError(null)).toBe('auth.error.generic');
    expect(mapOtpError(undefined)).toBe('auth.error.generic');
    expect(mapOtpError({ message: 'algo raro sin pistas' })).toBe('auth.error.generic');
    expect(mapOtpError({})).toBe('auth.error.generic');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// sanitizeOtpCode / isOtpCodeComplete
// ─────────────────────────────────────────────────────────────────────────────
describe('sanitizeOtpCode', () => {
  it('descarta todo lo que no sean dígitos', () => {
    expect(sanitizeOtpCode('12 34 56')).toBe('123456');
    expect(sanitizeOtpCode('Tu código es 123456')).toBe('123456');
    expect(sanitizeOtpCode('abc')).toBe('');
  });

  it('recorta a la longitud máxima (por defecto 6)', () => {
    expect(sanitizeOtpCode('123456789')).toBe('123456');
    expect(sanitizeOtpCode('12345678', 4)).toBe('1234');
  });

  it('tolera null/undefined', () => {
    expect(sanitizeOtpCode(null)).toBe('');
    expect(sanitizeOtpCode(undefined)).toBe('');
  });
});

describe('isOtpCodeComplete', () => {
  it('true solo con exactamente N dígitos', () => {
    expect(isOtpCodeComplete('123456')).toBe(true);
    expect(isOtpCodeComplete('12345')).toBe(false);
    expect(isOtpCodeComplete('1234567')).toBe(false);
    expect(isOtpCodeComplete('1234', 4)).toBe(true);
  });

  it('DEFAULT_OTP_CODE_LENGTH es 6', () => {
    expect(DEFAULT_OTP_CODE_LENGTH).toBe(6);
  });
});
