// Verificación de teléfono por SMS (OTP) sobre Supabase Auth — capa CON EFECTOS.
//
// Esta es la contraparte efectful de `src/lib/otp.ts` (que es 100% pura). Aquí
// viven las tres llamadas a Supabase Auth del flujo de verificación de teléfono:
//
//   1) sendPhoneOtp    → supabase.auth.updateUser({ phone })            (dispara el SMS)
//   2) resendPhoneOtp  → supabase.auth.resend({ type:'phone_change', … }) (reenvía el SMS)
//   3) confirmPhoneOtp → supabase.auth.verifyOtp({ phone, token, type }) (confirma el código)
//
// ── Por qué `type: 'phone_change'` y NO `'sms'` (crítico) ─────────────────────
// El usuario YA tiene una sesión email+contraseña activa (ver auditoría sub-1 §5).
// Añadir/confirmar un teléfono sobre esa MISMA identidad es un "cambio de teléfono":
//   · `updateUser({ phone })` deja el teléfono como `new_phone` pendiente y envía el SMS.
//   · `verifyOtp({ …, type: 'phone_change' })` lo confirma → sella `auth.users.phone_confirmed_at`
//     SIN cambiar `auth.uid()`, conservando la sesión y el enlace con la ficha del cliente.
// Usar `type: 'sms'` (o `signInWithOtp`) crearía/intercambiaría una identidad de
// teléfono nueva, re-apuntando `auth.uid()` y rompiendo login/fidelización/reservas
// (auditoría sub-1 §9, "Restricción de mecanismo"). Por eso el type es inamovible.
//
// Verificado contra los tipos instalados de @supabase/supabase-js (^2.98.0 →
// @supabase/auth-js): `MobileOtpType = 'sms' | 'phone_change'` y
// `VerifyMobileOtpParams = { phone; token; type: MobileOtpType }`.
//
// ── Inyección de dependencias ────────────────────────────────────────────────
// Las funciones reciben el cliente de auth por parámetro (no importan el cliente
// real de Supabase). Así el módulo es import-safe y testeable sin las variables de
// entorno de Vite, igual que otp.ts recibe el "ahora" del reloj. En producción,
// `Register.tsx` pasa `supabase.auth` (ver el hueco `TODO(OTP)` en Register.tsx:88).

import {
  normalizePhoneToE164,
  phoneErrorMessageKey,
  sanitizeOtpCode,
  isOtpCodeComplete,
  mapOtpError,
  DEFAULT_OTP_CODE_LENGTH,
  type NormalizePhoneOptions,
  type NormalizePhoneResult,
  type PhoneErrorReason,
} from './otp';

/**
 * Tipo de OTP para confirmar un teléfono AÑADIDO a una cuenta existente.
 * Es el valor correcto de `MobileOtpType` para este flujo (NO `'sms'`). Ver el
 * bloque "Por qué phone_change" arriba y la auditoría sub-1 §9.
 */
export const PHONE_CHANGE_OTP_TYPE = 'phone_change' as const;

/**
 * Solo lo que ESTE módulo lee del error de gotrue-js: `code`/`message`. El resto
 * lo ignora `mapOtpError` (que acepta `unknown`). Tiparlo así (en vez de la clase
 * `AuthError`) deja que `supabase.auth` sea asignable a `PhoneOtpAuthClient` sin
 * cast y que los dobles de test usen errores simples `{ code, message }`.
 */
export type OtpAuthErrorLike = { code?: string; message?: string };

/** Respuesta cruda `{ error }` que devuelven los métodos de gotrue-js que usamos. */
type AuthResult = { error: OtpAuthErrorLike | null };

/**
 * Subconjunto del cliente de auth de Supabase que este módulo necesita. Tipar solo
 * lo que usamos (a) documenta el contrato, (b) permite pasar `supabase.auth` en
 * producción sin cast, y (c) hace triviales los dobles de test.
 */
export interface PhoneOtpAuthClient {
  /** Establece el teléfono pendiente en la sesión actual y envía el SMS de confirmación. */
  updateUser(attributes: { phone: string }): Promise<AuthResult>;
  /** Confirma el código recibido por SMS para el cambio de teléfono. */
  verifyOtp(params: { phone: string; token: string; type: typeof PHONE_CHANGE_OTP_TYPE }): Promise<AuthResult>;
  /** Reenvía el SMS del cambio de teléfono en curso. */
  resend(credentials: { type: typeof PHONE_CHANGE_OTP_TYPE; phone: string }): Promise<AuthResult>;
}

/** Resultado del envío/reenvío: éxito con el E.164 usado, o fallo con la clave de i18n. */
export type SendOtpResult = { ok: true; e164: string } | { ok: false; errorKey: string };

/** Resultado de la confirmación: éxito, o fallo con la clave de i18n. */
export type ConfirmOtpResult = { ok: true } | { ok: false; errorKey: string };

/**
 * Clave de i18n para un teléfono que no se pudo normalizar a E.164.
 *
 * El proyecto compila con `strictNullChecks: false` (ver tsconfig), donde el
 * estrechamiento del miembro de FALLO de un union discriminado por booleano no
 * expone `reason`; por eso lo leemos con un cast acotado. `phoneErrorMessageKey`
 * mapea cualquier motivo a la misma clave (`auth.error.invalidPhone`).
 */
function invalidPhoneErrorKey(result: NormalizePhoneResult): string {
  return phoneErrorMessageKey((result as { reason: PhoneErrorReason }).reason);
}

/**
 * Envía el SMS con el código de verificación para el teléfono indicado.
 *
 * Normaliza el teléfono a E.164 (lo que `updateUser({ phone })` exige) ANTES de
 * llamar a Supabase; si no es válido, ni siquiera contacta con el servidor. En
 * caso de éxito devuelve el `e164` exacto que se usó: el llamador DEBE reutilizarlo
 * para `confirmPhoneOtp`/`resendPhoneOtp` (deben coincidir con el `new_phone` pendiente).
 */
export async function sendPhoneOtp(
  rawPhone: string,
  authClient: PhoneOtpAuthClient,
  phoneOptions?: NormalizePhoneOptions
): Promise<SendOtpResult> {
  const normalized = normalizePhoneToE164(rawPhone, phoneOptions);
  if (!normalized.ok) {
    return { ok: false, errorKey: invalidPhoneErrorKey(normalized) };
  }

  const { error } = await authClient.updateUser({ phone: normalized.e164 });
  if (error) return { ok: false, errorKey: mapOtpError(error) };

  return { ok: true, e164: normalized.e164 };
}

/**
 * Reenvía el SMS del cambio de teléfono en curso (para el botón "reenviar código").
 * Acepta tanto el E.164 devuelto por `sendPhoneOtp` como una forma nacional; en
 * ambos casos normaliza antes de llamar para garantizar que coincide con el pendiente.
 */
export async function resendPhoneOtp(
  phone: string,
  authClient: PhoneOtpAuthClient,
  phoneOptions?: NormalizePhoneOptions
): Promise<SendOtpResult> {
  const normalized = normalizePhoneToE164(phone, phoneOptions);
  if (!normalized.ok) {
    return { ok: false, errorKey: invalidPhoneErrorKey(normalized) };
  }

  const { error } = await authClient.resend({ type: PHONE_CHANGE_OTP_TYPE, phone: normalized.e164 });
  if (error) return { ok: false, errorKey: mapOtpError(error) };

  return { ok: true, e164: normalized.e164 };
}

/**
 * Confirma el código tecleado por el usuario para el teléfono `e164`.
 *
 * `e164` debe ser el que devolvió `sendPhoneOtp` (el `new_phone` pendiente). El
 * código se sanea (descarta espacios/letras, tolera un SMS pegado) y se valida su
 * longitud ANTES de llamar a Supabase: un código incompleto se rechaza localmente
 * sin gastar una verificación del servidor. En éxito, `auth.users.phone_confirmed_at`
 * queda sellado y la sesión de la MISMA identidad se refresca (auth.uid() intacto).
 */
export async function confirmPhoneOtp(
  e164: string,
  rawToken: string,
  authClient: PhoneOtpAuthClient,
  codeLength: number = DEFAULT_OTP_CODE_LENGTH
): Promise<ConfirmOtpResult> {
  const token = sanitizeOtpCode(rawToken, codeLength);
  if (!isOtpCodeComplete(token, codeLength)) {
    return { ok: false, errorKey: 'auth.error.otpInvalid' };
  }

  const { error } = await authClient.verifyOtp({ phone: e164, token, type: PHONE_CHANGE_OTP_TYPE });
  if (error) return { ok: false, errorKey: mapOtpError(error) };

  return { ok: true };
}

/**
 * `true` cuando el teléfono del usuario ya está verificado por Supabase
 * (`phone_confirmed_at` sellado). Útil para no re-pedir el OTP si ya se confirmó
 * (p.ej. un reintento tras cerrar la app). Acepta el `user` de `useAuth()`.
 */
export function isPhoneConfirmed(
  user: { phone_confirmed_at?: string | null } | null | undefined
): boolean {
  return Boolean(user?.phone_confirmed_at);
}
