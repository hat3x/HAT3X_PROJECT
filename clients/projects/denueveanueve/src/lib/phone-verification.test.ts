import { describe, it, expect, vi } from 'vitest';
import {
  PHONE_CHANGE_OTP_TYPE,
  sendPhoneOtp,
  resendPhoneOtp,
  confirmPhoneOtp,
  isPhoneConfirmed,
  type PhoneOtpAuthClient,
} from './phone-verification';

// ─────────────────────────────────────────────────────────────────────────────
// Doble de test del cliente de auth de Supabase.
//
// El módulo recibe el cliente por parámetro (inyección de dependencias, igual que
// otp.ts recibe el "ahora" del reloj), así que NO necesitamos mockear el módulo
// del cliente real ni las variables de entorno de Vite: basta un objeto con las
// tres funciones que usamos. Cada helper devuelve la forma `{ data, error }` que
// devuelve gotrue-js.
// ─────────────────────────────────────────────────────────────────────────────

function makeAuthClient(overrides: Partial<PhoneOtpAuthClient> = {}): PhoneOtpAuthClient {
  return {
    updateUser: vi.fn(async () => ({ data: { user: null }, error: null })),
    verifyOtp: vi.fn(async () => ({ data: { user: null, session: null }, error: null })),
    resend: vi.fn(async () => ({ data: {}, error: null })),
    ...overrides,
  } as PhoneOtpAuthClient;
}

/** Error con la forma de un AuthError de gotrue (code + message). */
const authError = (code: string, message: string) => ({ data: { user: null }, error: { code, message } });

describe('PHONE_CHANGE_OTP_TYPE', () => {
  it('es exactamente "phone_change" (confirmar un teléfono AÑADIDO a una cuenta existente)', () => {
    // Guardia de regresión: NO debe volverse 'sms' (ese type crea/intercambia una
    // identidad de teléfono y rompería la sesión email+contraseña; ver auditoría sub-1 §9).
    expect(PHONE_CHANGE_OTP_TYPE).toBe('phone_change');
  });
});

describe('sendPhoneOtp', () => {
  it('normaliza el teléfono a E.164 y lo pasa a updateUser (dispara el SMS)', async () => {
    const client = makeAuthClient();
    const result = await sendPhoneOtp('600 123 456', client);

    expect(result).toEqual({ ok: true, e164: '+34600123456' });
    expect(client.updateUser).toHaveBeenCalledTimes(1);
    expect(client.updateUser).toHaveBeenCalledWith({ phone: '+34600123456' });
  });

  it('acepta un teléfono ya en E.164 internacional', async () => {
    const client = makeAuthClient();
    const result = await sendPhoneOtp('+34 600-123-456', client);

    expect(result).toEqual({ ok: true, e164: '+34600123456' });
    expect(client.updateUser).toHaveBeenCalledWith({ phone: '+34600123456' });
  });

  it('NO llama a Supabase si el teléfono no es válido y devuelve la clave de i18n', async () => {
    const client = makeAuthClient();
    const result = await sendPhoneOtp('123', client);

    expect(result).toEqual({ ok: false, errorKey: 'auth.error.invalidPhone' });
    expect(client.updateUser).not.toHaveBeenCalled();
  });

  it('traduce el error de Supabase al enviar el SMS a una clave de i18n', async () => {
    const client = makeAuthClient({
      updateUser: vi.fn(async () => authError('sms_send_failed', 'Error sending sms')),
    });
    const result = await sendPhoneOtp('600123456', client);

    expect(result).toEqual({ ok: false, errorKey: 'auth.error.otpSendFailed' });
  });

  it('mapea el límite de frecuencia de envío a la clave de "demasiados intentos"', async () => {
    const client = makeAuthClient({
      updateUser: vi.fn(async () =>
        authError('over_sms_send_rate_limit', 'For security purposes, you can only request this after 60 seconds.')
      ),
    });
    const result = await sendPhoneOtp('600123456', client);

    expect(result).toEqual({ ok: false, errorKey: 'auth.error.otpTooManyAttempts' });
  });

  it('respeta las opciones de país por defecto para normalizar (país no España)', async () => {
    const client = makeAuthClient();
    // Portugal: sin longitud nacional fija, número internacional explícito.
    const result = await sendPhoneOtp('+351 912345678', client, {
      defaultCallingCode: '351',
      defaultNationalNumberLength: null,
    });

    expect(result).toEqual({ ok: true, e164: '+351912345678' });
    expect(client.updateUser).toHaveBeenCalledWith({ phone: '+351912345678' });
  });
});

describe('resendPhoneOtp', () => {
  it('reenvía el SMS con resend({ type: "phone_change", phone })', async () => {
    const client = makeAuthClient();
    const result = await resendPhoneOtp('+34600123456', client);

    expect(result).toEqual({ ok: true, e164: '+34600123456' });
    expect(client.resend).toHaveBeenCalledWith({ type: 'phone_change', phone: '+34600123456' });
  });

  it('normaliza el teléfono antes de reenviar si llega en forma nacional', async () => {
    const client = makeAuthClient();
    const result = await resendPhoneOtp('600 123 456', client);

    expect(result).toEqual({ ok: true, e164: '+34600123456' });
    expect(client.resend).toHaveBeenCalledWith({ type: 'phone_change', phone: '+34600123456' });
  });

  it('NO reenvía si el teléfono no es válido', async () => {
    const client = makeAuthClient();
    const result = await resendPhoneOtp('abc', client);

    expect(result).toEqual({ ok: false, errorKey: 'auth.error.invalidPhone' });
    expect(client.resend).not.toHaveBeenCalled();
  });

  it('traduce el error de reenvío (límite de frecuencia) a i18n', async () => {
    const client = makeAuthClient({
      resend: vi.fn(async () => ({ data: {}, error: { code: 'over_request_rate_limit', message: 'Rate limit exceeded' } })),
    });
    const result = await resendPhoneOtp('+34600123456', client);

    expect(result).toEqual({ ok: false, errorKey: 'auth.error.otpTooManyAttempts' });
  });
});

describe('confirmPhoneOtp', () => {
  it('confirma el código con verifyOtp usando type "phone_change" y el teléfono E.164', async () => {
    const client = makeAuthClient();
    const result = await confirmPhoneOtp('+34600123456', '123456', client);

    expect(result).toEqual({ ok: true });
    expect(client.verifyOtp).toHaveBeenCalledTimes(1);
    expect(client.verifyOtp).toHaveBeenCalledWith({
      phone: '+34600123456',
      token: '123456',
      type: 'phone_change',
    });
  });

  it('sanea el código tecleado (descarta espacios/texto de un SMS pegado) antes de verificar', async () => {
    const client = makeAuthClient();
    await confirmPhoneOtp('+34600123456', 'Tu código es 123 456', client);

    expect(client.verifyOtp).toHaveBeenCalledWith({
      phone: '+34600123456',
      token: '123456',
      type: 'phone_change',
    });
  });

  it('NO llama a verifyOtp si el código está incompleto (menos de 6 dígitos)', async () => {
    const client = makeAuthClient();
    const result = await confirmPhoneOtp('+34600123456', '123', client);

    expect(result).toEqual({ ok: false, errorKey: 'auth.error.otpInvalid' });
    expect(client.verifyOtp).not.toHaveBeenCalled();
  });

  it('mapea un código caducado a la clave de i18n de caducado', async () => {
    const client = makeAuthClient({
      verifyOtp: vi.fn(async () => ({
        data: { user: null, session: null },
        error: { code: 'otp_expired', message: 'Token has expired or is invalid' },
      })),
    });
    const result = await confirmPhoneOtp('+34600123456', '123456', client);

    expect(result).toEqual({ ok: false, errorKey: 'auth.error.otpExpired' });
  });

  it('mapea un código incorrecto a la clave de i18n de código no válido', async () => {
    const client = makeAuthClient({
      verifyOtp: vi.fn(async () => ({
        data: { user: null, session: null },
        error: { code: 'otp_invalid', message: 'Invalid token' },
      })),
    });
    const result = await confirmPhoneOtp('+34600123456', '654321', client);

    expect(result).toEqual({ ok: false, errorKey: 'auth.error.otpInvalid' });
  });
});

describe('isPhoneConfirmed', () => {
  it('es false cuando no hay usuario', () => {
    expect(isPhoneConfirmed(null)).toBe(false);
    expect(isPhoneConfirmed(undefined)).toBe(false);
  });

  it('es false cuando el usuario aún no tiene phone_confirmed_at', () => {
    expect(isPhoneConfirmed({ phone_confirmed_at: undefined })).toBe(false);
    expect(isPhoneConfirmed({ phone_confirmed_at: null })).toBe(false);
  });

  it('es true cuando el usuario tiene phone_confirmed_at sellado', () => {
    expect(isPhoneConfirmed({ phone_confirmed_at: '2026-07-19T10:00:00Z' })).toBe(true);
  });
});
