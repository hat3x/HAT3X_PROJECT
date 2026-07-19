// Utilidades PURAS del flujo de verificación de teléfono (OTP) de la app de cliente.
//
// Este módulo NO depende de React, de Supabase ni de `window`: recibe todo por
// parámetro (incluido el "ahora" del reloj) para poder probarse en aislamiento
// (ver otp.test.ts), igual que src/lib/salon.ts. Aquí vive la lógica que el
// cliente SÍ decide sin efectos secundarios:
//
//   1) normalizePhoneToE164  → normaliza el teléfono libre a formato E.164
//                              (lo que `supabase.auth.updateUser({ phone })` exige).
//   2) Cooldown de reenvío   → estado/temporizador puro para el botón "reenviar código".
//   3) mapOtpError           → traduce los errores de Supabase Auth (envío/verificación
//                              del OTP) y de la RPC de enlace (PHONE_NOT_VERIFIED) a
//                              claves de i18n estables (ver src/lib/i18n.tsx).
//   4) sanitizeOtpCode       → limpia lo tecleado en el input del código.
//
// La parte con efectos (llamar a updateUser/verifyOtp, arrancar intervalos, pintar
// la UI) vive en el componente de registro. Ver la auditoría sub-1:
// docs/AUDITORIA-sub1-flujo-auth-verificacion-telefono.md (§9, mecánica recomendada).

// ─────────────────────────────────────────────────────────────────────────────
// 1) Normalización de teléfono a E.164
// ─────────────────────────────────────────────────────────────────────────────

/** Motivo por el que un teléfono no se pudo normalizar a E.164. */
export type PhoneErrorReason =
  | 'empty' // no hay ningún dígito que normalizar
  | 'invalid_chars' // contiene caracteres que no son dígitos ni separadores de teléfono
  | 'too_short' // faltan dígitos (por debajo del mínimo E.164 o de la longitud nacional)
  | 'too_long' // sobran dígitos (por encima del máximo E.164 o de la longitud nacional)
  | 'invalid_country'; // el número resultante no es un E.164 bien formado (código de país inválido)

/** Resultado de normalizar un teléfono: éxito con el E.164 o fallo con el motivo. */
export type NormalizePhoneResult =
  | {
      ok: true;
      /** Teléfono en E.164, p.ej. `+34600123456`. Listo para `updateUser({ phone })`. */
      e164: string;
      /** Código de país sin `+` (best-effort para países no por defecto), p.ej. `34`. */
      callingCode: string;
      /** Número nacional (sin código de país), p.ej. `600123456`. */
      nationalNumber: string;
    }
  | { ok: false; reason: PhoneErrorReason };

export interface NormalizePhoneOptions {
  /**
   * Código de país por defecto (sin `+`) que se asume cuando el usuario teclea un
   * número NACIONAL (sin prefijo internacional). Cliente denueveanueve → España (`34`).
   */
  defaultCallingCode?: string;
  /**
   * Longitud exacta del número nacional del país por defecto, para validar con
   * precisión (España: 9). `null` desactiva esta comprobación y solo se valida la
   * longitud genérica de E.164.
   */
  defaultNationalNumberLength?: number | null;
}

/** Opciones por defecto: España (`+34`, 9 dígitos nacionales). */
export const DEFAULT_PHONE_OPTIONS: Required<NormalizePhoneOptions> = {
  defaultCallingCode: '34',
  defaultNationalNumberLength: 9,
};

// E.164 admite entre 8 y 15 dígitos en total (código de país + número nacional).
const E164_MIN_DIGITS = 8;
const E164_MAX_DIGITS = 15;

// Solo dígitos y separadores visuales habituales de teléfono (`+`, espacios, guiones,
// paréntesis, puntos, barras). Cualquier otra cosa (letras, etc.) es inválida.
const PHONE_ALLOWED_RE = /^[+()\-.\s/\d]+$/;

// Códigos de país conocidos para poder partir un E.164 internacional en
// (código de país, número nacional). Es un best-effort: no es la lista completa de
// la UIT, pero cubre España, sus vecinos y los mercados habituales. Si no hay
// coincidencia, el E.164 sigue siendo correcto; solo el desglose queda vacío.
const KNOWN_CALLING_CODES = [
  '1', '7', '20', '27', '30', '31', '32', '33', '34', '36', '39', '40', '41',
  '43', '44', '45', '46', '47', '48', '49', '51', '52', '54', '55', '56', '57',
  '58', '60', '61', '63', '64', '65', '66', '81', '82', '84', '86', '90', '91',
  '212', '213', '216', '218', '351', '352', '353', '354', '355', '356', '357',
  '358', '359', '380', '385', '386', '420', '421', '971', '972', '973', '974',
];

/**
 * Parte un E.164 (solo dígitos) en (código de país, número nacional) por
 * coincidencia de prefijo más largo. Prioriza el código por defecto y luego la
 * lista conocida. Si nada coincide, devuelve el número entero como nacional.
 */
function splitCallingCode(
  fullDigits: string,
  defaultCallingCode: string
): { callingCode: string; nationalNumber: string } {
  const candidates = [...new Set([defaultCallingCode, ...KNOWN_CALLING_CODES].filter(Boolean))].sort(
    (a, b) => b.length - a.length
  );
  for (const code of candidates) {
    if (fullDigits.startsWith(code) && fullDigits.length > code.length) {
      return { callingCode: code, nationalNumber: fullDigits.slice(code.length) };
    }
  }
  return { callingCode: '', nationalNumber: fullDigits };
}

/**
 * Normaliza un teléfono tecleado libremente a formato E.164 (`+<código><nacional>`).
 *
 * Acepta las formas más comunes y las unifica:
 *   · nacional              `600 123 456`         → `+34600123456`
 *   · internacional con `+` `+34 600-123-456`     → `+34600123456`
 *   · internacional con `00``0034 600123456`      → `+34600123456`
 *   · código de país sin `+``34600123456`          → `+34600123456` (heurística)
 *
 * Es PURA y determinista: no consulta ninguna base de datos de numeración; valida
 * la longitud E.164 genérica (8–15 dígitos) y, para el país por defecto, la longitud
 * nacional exacta configurada. Devuelve un resultado discriminado por `ok`.
 */
export function normalizePhoneToE164(
  raw: string | null | undefined,
  options: NormalizePhoneOptions = {}
): NormalizePhoneResult {
  const defaultCallingCode = options.defaultCallingCode ?? DEFAULT_PHONE_OPTIONS.defaultCallingCode;
  const defaultNationalNumberLength =
    options.defaultNationalNumberLength === undefined
      ? DEFAULT_PHONE_OPTIONS.defaultNationalNumberLength
      : options.defaultNationalNumberLength;

  const trimmed = (raw ?? '').trim();
  if (!trimmed) return { ok: false, reason: 'empty' };
  if (!PHONE_ALLOWED_RE.test(trimmed)) return { ok: false, reason: 'invalid_chars' };

  const hasPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return { ok: false, reason: 'empty' };

  // Determina el número completo (código de país + nacional) según la forma de entrada.
  let fullDigits: string;
  if (hasPlus) {
    // Internacional explícito: los dígitos ya incluyen el código de país.
    fullDigits = digits;
  } else if (digits.startsWith('00')) {
    // Prefijo internacional `00` → equivale a `+`.
    fullDigits = digits.slice(2);
  } else {
    // Nacional. Heurística: si el usuario incluyó el código de país sin `+`
    // (p.ej. `34600123456`), no lo dupliquemos.
    let national = digits;
    if (
      defaultNationalNumberLength != null &&
      national.length === defaultCallingCode.length + defaultNationalNumberLength &&
      national.startsWith(defaultCallingCode)
    ) {
      national = national.slice(defaultCallingCode.length);
    }
    fullDigits = defaultCallingCode + national;
  }

  // E.164 nunca empieza por 0 (los códigos de país van de 1 a 9).
  if (fullDigits.startsWith('0')) return { ok: false, reason: 'invalid_country' };

  // Longitud genérica de E.164.
  if (fullDigits.length < E164_MIN_DIGITS) return { ok: false, reason: 'too_short' };
  if (fullDigits.length > E164_MAX_DIGITS) return { ok: false, reason: 'too_long' };

  const { callingCode, nationalNumber } = splitCallingCode(fullDigits, defaultCallingCode);

  // Validación nacional precisa para el país por defecto (p.ej. España = 9 dígitos),
  // tanto si el número entró como nacional como si entró como `+34…`.
  if (
    defaultNationalNumberLength != null &&
    callingCode === defaultCallingCode &&
    nationalNumber.length !== defaultNationalNumberLength
  ) {
    return {
      ok: false,
      reason: nationalNumber.length < defaultNationalNumberLength ? 'too_short' : 'too_long',
    };
  }

  return { ok: true, e164: `+${fullDigits}`, callingCode, nationalNumber };
}

/** Comprueba si una cadena ya está en E.164 estricto (`+` y de 8 a 15 dígitos, sin 0 inicial). */
export function isValidE164(value: string | null | undefined): boolean {
  return typeof value === 'string' && /^\+[1-9]\d{7,14}$/.test(value);
}

/** Traduce el motivo de fallo de normalización a una clave de i18n legible. */
export function phoneErrorMessageKey(_reason: PhoneErrorReason): string {
  // Todos los motivos comparten el mismo mensaje de cara al usuario ("teléfono no
  // válido"): el detalle interno (`too_short`, `invalid_chars`, …) sirve para logs
  // o para una UX más fina si en el futuro se quiere diferenciar.
  return 'auth.error.invalidPhone';
}

// ─────────────────────────────────────────────────────────────────────────────
// 2) Cooldown de reenvío del código
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Estado PURO del temporizador de "reenviar código". Guardamos SOLO el instante en
 * que expira el cooldown (epoch ms); el componente calcula los segundos restantes en
 * cada tick pasando `Date.now()`. Así el estado es serializable y trivial de testear.
 */
export interface CooldownState {
  /** Epoch (ms) en el que termina el cooldown. `0` = inactivo (se puede reenviar ya). */
  endsAt: number;
}

/** Estado inicial: sin cooldown activo. */
export const IDLE_COOLDOWN: CooldownState = { endsAt: 0 };

/** Segundos de cooldown por defecto entre reenvíos de SMS (alineado con los límites de Supabase Auth). */
export const DEFAULT_RESEND_COOLDOWN_SECONDS = 60;

/**
 * Arranca un cooldown de `durationSeconds` a partir de `nowMs`. Una duración <= 0
 * deja el cooldown inactivo (se puede reenviar de inmediato).
 */
export function startCooldown(nowMs: number, durationSeconds: number): CooldownState {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return { endsAt: 0 };
  return { endsAt: nowMs + durationSeconds * 1000 };
}

/**
 * Segundos que faltan para poder reenviar, redondeados hacia arriba y nunca
 * negativos (`0` significa "ya se puede reenviar").
 */
export function cooldownRemainingSeconds(state: CooldownState, nowMs: number): number {
  const remainingMs = state.endsAt - nowMs;
  if (remainingMs <= 0) return 0;
  return Math.ceil(remainingMs / 1000);
}

/** `true` cuando el cooldown ha terminado y se puede volver a enviar el código. */
export function canResend(state: CooldownState, nowMs: number): boolean {
  return cooldownRemainingSeconds(state, nowMs) <= 0;
}

/**
 * Formatea unos segundos restantes como `m:ss` (p.ej. 65 → `1:05`, 9 → `0:09`).
 * Los valores negativos o no finitos se tratan como `0:00`.
 */
export function formatCountdown(totalSeconds: number): string {
  const safe = Number.isFinite(totalSeconds) && totalSeconds > 0 ? Math.floor(totalSeconds) : 0;
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3) Mapeo de errores de OTP a claves de i18n
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Traduce el error crudo del flujo OTP a una clave de i18n estable. Cubre dos orígenes:
 *
 *   · Supabase Auth (envío con `updateUser({ phone })` y verificación con
 *     `verifyOtp({ type: 'phone_change' })`): código caducado/incorrecto, límite de
 *     envío/verificación, teléfono inválido, fallo al enviar el SMS.
 *   · La RPC de enlace `register_my_customer_account` (Salón OS), que puede rechazar
 *     el enlace con `PHONE_NOT_VERIFIED` si el servidor exige el teléfono verificado.
 *
 * El orden importa: se comprueba primero lo MÁS específico. En particular, gotrue
 * (Supabase) suele devolver el MISMO mensaje —"Token has expired or is invalid"— tanto
 * para un código caducado como para uno incorrecto; por eso `expired` se comprueba
 * antes que `invalid` y el mapper es capaz de distinguirlos cuando el backend sí lo hace.
 *
 * Devuelve siempre una clave existente en `translations` (fallback: `auth.error.generic`).
 */
export function mapOtpError(error: unknown): string {
  if (!error) return 'auth.error.generic';

  const err =
    typeof error === 'string'
      ? { code: '', message: error }
      : (error as { code?: string; message?: string; error_description?: string });

  const code = (err.code ?? '').toLowerCase();
  const message = (err.message ?? err.error_description ?? '').toLowerCase();
  const has = (needle: string) => code.includes(needle) || message.includes(needle);

  // 1) La RPC de Salón OS exige teléfono verificado (motivo textual en la EXCEPTION).
  if (has('phone_not_verified')) return 'auth.error.phoneNotVerified';

  // 2) Código caducado. Se comprueba ANTES que "incorrecto": el mensaje de gotrue
  //    "Token has expired or is invalid" contiene ambas palabras.
  if (code === 'otp_expired' || has('expired')) return 'auth.error.otpExpired';

  // 3) Demasiados intentos / límite de frecuencia (verificación o reenvío del SMS).
  if (
    has('rate') ||
    has('too many') ||
    has('for security purposes') ||
    has('over_request') ||
    code === 'too_many_requests'
  ) {
    return 'auth.error.otpTooManyAttempts';
  }

  // 4) Fallo al ENVIAR el SMS (proveedor). Va tras el límite de frecuencia, que ya
  //    habría capturado los `over_sms_send_rate_limit`.
  if ((has('sms') && has('send')) || has('sms_send_failed') || has('error sending')) {
    return 'auth.error.otpSendFailed';
  }

  // 5) Teléfono inválido (validación de Supabase o de la RPC).
  if (has('invalid_phone') || (has('phone') && has('invalid')) || has('invalid number')) {
    return 'auth.error.invalidPhone';
  }

  // 6) Código incorrecto / token no válido (cuando el backend NO dice "expired").
  if (has('invalid') || has('incorrect') || has('token') || has('bad_code')) {
    return 'auth.error.otpInvalid';
  }

  return 'auth.error.generic';
}

// ─────────────────────────────────────────────────────────────────────────────
// 4) Saneado del código tecleado
// ─────────────────────────────────────────────────────────────────────────────

/** Longitud por defecto del código OTP de Supabase (6 dígitos). */
export const DEFAULT_OTP_CODE_LENGTH = 6;

/**
 * Limpia lo que el usuario teclea/pega en el input del código: descarta todo lo que
 * no sean dígitos y recorta a `maxLength`. Útil para tolerar espacios o un SMS pegado
 * ("Tu código es 123456") sin dejar entrar letras.
 */
export function sanitizeOtpCode(raw: string | null | undefined, maxLength: number = DEFAULT_OTP_CODE_LENGTH): string {
  return (raw ?? '').replace(/\D/g, '').slice(0, Math.max(0, maxLength));
}

/** `true` cuando el código saneado tiene exactamente `length` dígitos (listo para verificar). */
export function isOtpCodeComplete(code: string, length: number = DEFAULT_OTP_CODE_LENGTH): boolean {
  return new RegExp(`^\\d{${length}}$`).test(code);
}
