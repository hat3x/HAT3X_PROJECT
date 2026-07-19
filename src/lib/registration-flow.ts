// Lógica PURA del desenlace del paso final del registro por teléfono (sub-5).
//
// Contraparte pura del efecto `supabase.rpc('register_my_customer_account', …)` que
// dispara Register.tsx. Aquí NO se llama a Supabase ni a React: se recibe el resultado
// crudo de la RPC (`{ data, error }`) y se decide QUÉ debe hacer la UI, en una sola
// función determinista y testeable en aislamiento (misma filosofía de inyección de
// dependencias que src/lib/otp.ts y src/lib/phone-verification.ts).
//
// Cubre el encadenado que pide sub-5:
//   · éxito (created | linked | already_linked → los tres son un éxito para el usuario),
//   · PHONE_NOT_VERIFIED → el servidor exige el teléfono verificado por SMS y aún NO
//     consta como tal; NO es un error terminal: la UI debe reabrir la verificación
//     (sin callejón sin salida), y
//   · cualquier otro rechazo → mensaje claro y vuelta al formulario.

/**
 * Clave de i18n del gating "teléfono no verificado" de la RPC de Salón OS. Es el
 * pivote del encadenado de sub-5: cuando `mapRegisterError` devuelve ESTA clave, la
 * UI NO trata el resultado como un error terminal, sino que reabre la verificación.
 */
export const PHONE_NOT_VERIFIED_ERROR_KEY = 'auth.error.phoneNotVerified';

/**
 * Traduce el error crudo de la RPC `register_my_customer_account` (Salón OS) a una
 * clave de i18n. La RPC lanza EXCEPTION (SQLSTATE `P0001`) con un mensaje que
 * identifica el motivo:
 *   - `INVALID_PHONE`       → el teléfono no tiene un formato válido.
 *   - `PHONE_NOT_VERIFIED`  → el servidor exige el teléfono verificado por SMS ANTES
 *                             de enlazar la ficha (gating de sub-5). Debe comprobarse
 *                             ANTES del catch-all de `P0001`, o se confundiría con un
 *                             conflicto de teléfono y daría un mensaje engañoso.
 *   - `FEATURE_NOT_ENABLED` → el salón NO tiene contratado el add-on de app de cliente
 *                             / fidelización; la RPC hace el gating en servidor.
 *   - `PHONE_CONFLICT`      → el teléfono ya pertenece a otra cuenta/ficha.
 * Se comprueba primero el TEXTO del mensaje (más específico); como red de seguridad,
 * un `P0001` sin texto reconocible se trata como conflicto de teléfono (el fallo más
 * frecuente de esta RPC).
 *
 * IMPORTANTE: aquí SÓLO traducimos el motivo del rechazo; no lo sorteamos. El gating
 * es autoritativo en el servidor y la app se limita a mostrar un mensaje claro sin
 * conceder acceso al cliente.
 *
 * Devuelve siempre una clave existente en `translations` (fallback: `auth.error.generic`).
 */
export function mapRegisterError(error: unknown): string {
  if (!error) return 'auth.error.generic';

  const err = error as { code?: string; message?: string };
  const code = (err.code ?? '').toUpperCase();
  const message = (err.message ?? '').toUpperCase();

  if (message.includes('INVALID_PHONE')) return 'auth.error.invalidPhone';
  // Gating de teléfono verificado (sub-5). ANTES del catch-all de P0001.
  if (message.includes('PHONE_NOT_VERIFIED')) return PHONE_NOT_VERIFIED_ERROR_KEY;
  // Add-on no contratado por el salón. ANTES del catch-all de P0001 (también es P0001).
  if (message.includes('FEATURE_NOT_ENABLED')) return 'auth.error.featureNotEnabled';
  if (message.includes('PHONE_CONFLICT') || code === 'P0001') return 'auth.error.phoneConflict';
  return 'auth.error.generic';
}

/**
 * Desenlace del paso final del registro, ya clasificado para la UI:
 *   · `success`             → la ficha quedó creada/vinculada; `linked` elige el copy
 *                             ("ficha vinculada" vs "cuenta creada").
 *   · `phone-not-verified`  → el servidor exige verificar el teléfono; la UI reabre la
 *                             verificación (sin devolver al formulario).
 *   · `error`               → cualquier otro rechazo; `errorKey` es el mensaje a mostrar.
 */
export type RegisterOutcome =
  | { kind: 'success'; linked: boolean }
  | { kind: 'phone-not-verified' }
  | { kind: 'error'; errorKey: string };

/**
 * Clasifica el resultado crudo de la RPC de enlace en la ÚNICA acción que la UI debe
 * tomar en el paso final del alta. Concentrar aquí la decisión (en vez de esparcir
 * `if (error)` por el componente) permite probar el encadenado sin montar React ni
 * mockear Supabase.
 *
 *   · error con motivo PHONE_NOT_VERIFIED → `{ kind: 'phone-not-verified' }`.
 *   · cualquier otro error                → `{ kind: 'error', errorKey }`.
 *   · sin error                           → `{ kind: 'success', linked }`, donde
 *     `linked` es `true` si el desenlace de la RPC fue `'linked'` (se reutilizó una
 *     ficha existente) y `false` en cualquier otro éxito (`'created'`, `'already_linked'`
 *     o una respuesta escalar). La RPC puede devolver `{ outcome: '…' }` o un escalar;
 *     ambas formas se contemplan.
 */
export function classifyRegisterOutcome(result: { data?: unknown; error?: unknown }): RegisterOutcome {
  if (result.error) {
    const errorKey = mapRegisterError(result.error);
    if (errorKey === PHONE_NOT_VERIFIED_ERROR_KEY) return { kind: 'phone-not-verified' };
    return { kind: 'error', errorKey };
  }

  const data = result.data;
  const outcome =
    data && typeof data === 'object' && !Array.isArray(data)
      ? (data as Record<string, unknown>).outcome
      : data;
  return { kind: 'success', linked: outcome === 'linked' };
}

// ─────────────────────────────────────────────────────────────────────────────
// Reanudación de la verificación de teléfono (sub-6)
// ─────────────────────────────────────────────────────────────────────────────
//
// Si el usuario deja el alta a medias (signUp crea la cuenta y persiste la sesión,
// pero cierra la app ANTES de confirmar el teléfono), al volver a entrar la sesión se
// rehidrata pero el teléfono sigue sin verificar y —con el gating de sub-5— la ficha no
// llegó a enlazarse: la cuenta queda inservible. En vez de dejarle ahí, detectamos ese
// estado SOLO a partir de la sesión y ofrecemos terminar el MISMO paso de OTP.

/**
 * Subconjunto del `user` de Supabase Auth (`useAuth().user`) que necesita la detección
 * de reanudación. Tiparlo así (en vez de la clase `User`) permite:
 *   · pasar `useAuth().user` sin cast (es estructuralmente compatible: el `User` de
 *     @supabase/auth-js expone `phone_confirmed_at?`, `new_phone?` y `user_metadata`), y
 *   · construir dobles triviales en los tests (`{ phone_confirmed_at: null, … }`),
 * en la misma línea de inyección de dependencias que `PhoneOtpAuthClient` (phone-verification.ts).
 */
export interface SessionUserLike {
  /** Correo de la cuenta; lo reutiliza la RPC de enlace al reanudar (`p_email`). */
  email?: string | null;
  /** Sello de confirmación del teléfono. VACÍO ⇒ el teléfono aún NO está verificado. */
  phone_confirmed_at?: string | null;
  /** Teléfono pendiente (E.164) de un cambio en curso, si `updateUser({ phone })` ya se llamó. */
  new_phone?: string | null;
  /** Metadatos escritos por signUp: teléfono tecleado, nombre y apellidos. */
  user_metadata?: {
    phone?: unknown;
    first_name?: unknown;
    last_name?: unknown;
  } | null;
}

/**
 * Decisión de reanudación derivada ÚNICAMENTE de la sesión (sub-6):
 *   · `none`   → no hay nada que reanudar (sin sesión, o el teléfono ya está verificado).
 *   · `resume` → la cuenta existe pero el teléfono NO está confirmado: hay que ofrecer
 *     terminar el OTP. Incluye lo que `finishRegistration` necesita (`phone`, `fullName`,
 *     `email`), reconstruido de los metadatos del alta, para reutilizar el MISMO paso de
 *     verificación sin volver a pedir el formulario.
 */
export type PhoneVerificationResumption =
  | { kind: 'none' }
  | { kind: 'resume'; phone: string; fullName: string; email: string };

/** Devuelve una cadena saneada (recortada) de un valor `unknown`; si no lo es, `''`. */
function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Detecta, SOLO a partir de la sesión rehidratada, si el usuario dejó el registro a
 * medias (cuenta creada pero teléfono sin confirmar) y procede ofrecerle terminar la
 * verificación por SMS. NO consulta la base de datos ni toca Supabase: mira el `user`
 * de `useAuth()` y decide de forma pura y determinista.
 *
 * Reglas:
 *   · sin `user`, o con `phone_confirmed_at` sellado → `none` (nada que reanudar; es el
 *     mismo criterio de `isPhoneConfirmed`, ver phone-verification.ts).
 *   · teléfono sin confirmar Y con un teléfono conocido → `resume`, con los datos de la
 *     RPC reconstruidos de los metadatos.
 *
 * El teléfono preferido es el TECLEADO en el alta (`user_metadata.phone`), para que la
 * RPC reciba exactamente el mismo `p_phone` que en el alta normal; si faltara, se cae al
 * `new_phone` (E.164) del cambio en curso. Sin ningún teléfono conocido no hay forma de
 * reanudar el SMS → `none`.
 */
export function detectPhoneVerificationResumption(
  user: SessionUserLike | null | undefined
): PhoneVerificationResumption {
  if (!user) return { kind: 'none' };
  // Teléfono ya verificado (Supabase selló `phone_confirmed_at`) → nada que reanudar.
  // Inline del criterio de `isPhoneConfirmed` para que este módulo de decisiones puras
  // no dependa de la capa CON efectos (phone-verification.ts).
  if (readString(user.phone_confirmed_at)) return { kind: 'none' };

  const typedPhone = readString(user.user_metadata?.phone);
  const pendingPhone = readString(user.new_phone);
  const phone = typedPhone || pendingPhone;
  if (!phone) return { kind: 'none' };

  const fullName = `${readString(user.user_metadata?.first_name)} ${readString(
    user.user_metadata?.last_name
  )}`.trim();

  return { kind: 'resume', phone, fullName, email: readString(user.email) };
}
