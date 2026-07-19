// Paso de UI de verificación de teléfono por SMS (OTP) dentro del registro (sub-4).
//
// Responsabilidad ÚNICA: la interacción de "mete el código que te ha llegado por SMS".
// NO habla con Supabase directamente: recibe las tres acciones por PROP (enviar,
// reenviar, verificar) como funciones async que devuelven los resultados discriminados
// de `src/lib/phone-verification.ts`. Así el componente:
//   · es testeable sin mockear Supabase ni las variables de entorno de Vite
//     (misma filosofía de inyección de dependencias que otp.ts / phone-verification.ts), y
//   · reutiliza TODO el mapeo de errores y las utilidades PURAS de cooldown/saneo
//     de `src/lib/otp.ts` (no reimplementa nada).
//
// Cubre, según la subtarea:
//   · campo para el código (shadcn <InputOTP>, auto-verifica al completar 6 dígitos),
//   · botón de "reenviar" con espera mínima anti-spam (cooldown + cuenta atrás m:ss),
//   · estados de carga (enviando / verificando / completando),
//   · errores LEGIBLES reutilizando `mapOtpError` (las props ya devuelven la clave i18n), y
//   · un mensaje HONESTO y una salida cuando el SMS no se puede enviar porque el
//     proyecto no tiene proveedor Phone configurado (clave `auth.error.otpProviderUnavailable`).

import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { REGEXP_ONLY_DIGITS } from 'input-otp';
import { AlertTriangle, Check, Loader2, ShieldCheck, Smartphone } from 'lucide-react';

import { useI18n } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import {
  cooldownRemainingSeconds,
  formatCountdown,
  isOtpCodeComplete,
  sanitizeOtpCode,
  startCooldown,
  DEFAULT_OTP_CODE_LENGTH,
  DEFAULT_RESEND_COOLDOWN_SECONDS,
  IDLE_COOLDOWN,
  type CooldownState,
} from '@/lib/otp';
import type { ConfirmOtpResult, SendOtpResult } from '@/lib/phone-verification';

/** Clave i18n que `mapOtpError` devuelve cuando el proyecto no tiene proveedor Phone. */
const OTP_PROVIDER_UNAVAILABLE_KEY = 'auth.error.otpProviderUnavailable';

export interface PhoneOtpStepProps {
  /** Teléfono al que se envía el SMS (E.164 o tal cual lo tecleó el usuario). Solo se muestra. */
  phone: string;
  /** Envía el SMS por primera vez. Debe resolver el resultado discriminado de `sendPhoneOtp`. */
  onSendCode: () => Promise<SendOtpResult>;
  /** Reenvía el SMS (botón "reenviar código"). Resuelve como `resendPhoneOtp`. */
  onResendCode: () => Promise<SendOtpResult>;
  /** Verifica el código tecleado. Resuelve como `confirmPhoneOtp`. */
  onVerifyCode: (code: string) => Promise<ConfirmOtpResult>;
  /** Se invoca cuando el teléfono queda verificado (el padre enlaza la ficha y navega). */
  onVerified?: () => void;
  /** Continuar sin verificar (salida honesta cuando el SMS no está disponible). */
  onContinueWithoutVerification?: () => void;
  /** Volver al formulario para corregir el número. */
  onChangeNumber?: () => void;
  /** Longitud del código (por defecto 6, el de Supabase). */
  codeLength?: number;
  /** Segundos de espera entre reenvíos (anti-spam de SMS; por defecto 60). */
  resendCooldownSeconds?: number;
  /** Enviar el SMS automáticamente al montar (por defecto `true`). `false` en tests. */
  autoSend?: boolean;
  /** Reloj inyectable (por defecto `Date.now`). Permite tests deterministas del cooldown. */
  now?: () => number;
}

/** Lee la clave i18n del error de un resultado de fallo, sea de envío o de verificación.
 *  El proyecto compila con `strictNullChecks: false`, donde el estrechamiento del miembro
 *  de FALLO de un union discriminado por booleano no expone `errorKey`; por eso el cast. */
function readErrorKey(result: SendOtpResult | ConfirmOtpResult): string {
  return (result as { errorKey?: string }).errorKey ?? 'auth.error.generic';
}

type SendState = 'sending' | 'sent' | 'send-error';
type Finishing = 'verified' | 'proceeding' | null;

const PhoneOtpStep = ({
  phone,
  onSendCode,
  onResendCode,
  onVerifyCode,
  onVerified,
  onContinueWithoutVerification,
  onChangeNumber,
  codeLength = DEFAULT_OTP_CODE_LENGTH,
  resendCooldownSeconds = DEFAULT_RESEND_COOLDOWN_SECONDS,
  autoSend = true,
  now,
}: PhoneOtpStepProps) => {
  const { t } = useI18n();

  // Reloj en un ref para no re-suscribir efectos si el padre pasa un `now` en línea.
  const nowRef = useRef<() => number>(now ?? (() => Date.now()));
  nowRef.current = now ?? (() => Date.now());

  const [code, setCode] = useState('');
  // Con `autoSend` (producción) arrancamos en "enviando" y disparamos el SMS al montar.
  // Sin él (uso controlado/tests) asumimos que el código ya se envió y mostramos el campo.
  const [sendState, setSendState] = useState<SendState>(autoSend ? 'sending' : 'sent');
  const [hasSentOnce, setHasSentOnce] = useState(!autoSend);
  const [providerUnavailable, setProviderUnavailable] = useState(false);
  const [sendErrorKey, setSendErrorKey] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [verifyErrorKey, setVerifyErrorKey] = useState<string | null>(null);
  const [finishing, setFinishing] = useState<Finishing>(null);
  const [cooldown, setCooldown] = useState<CooldownState>(IDLE_COOLDOWN);
  const [remaining, setRemaining] = useState(0);
  const [resentNotice, setResentNotice] = useState(false);

  const busy = sendState === 'sending' || verifying || finishing !== null;

  // ── Envío / reenvío del SMS ────────────────────────────────────────────────
  const runSend = async (kind: 'initial' | 'resend') => {
    setSendState('sending');
    setSendErrorKey(null);
    setProviderUnavailable(false);
    setResentNotice(false);
    const result = kind === 'resend' ? await onResendCode() : await onSendCode();
    if (result.ok === true) {
      setHasSentOnce(true);
      setSendState('sent');
      // Arranca el cooldown SOLO en éxito: no penalizamos un envío que ni siquiera salió.
      setCooldown(startCooldown(nowRef.current(), resendCooldownSeconds));
      if (kind === 'resend') setResentNotice(true);
    } else {
      const key = readErrorKey(result);
      setSendState('send-error');
      setSendErrorKey(key);
      if (key === OTP_PROVIDER_UNAVAILABLE_KEY) setProviderUnavailable(true);
    }
  };

  // Envío automático al montar, UNA sola vez (el ref sobrevive al doble montaje de
  // React StrictMode en desarrollo, evitando un segundo SMS).
  const didAutoSendRef = useRef(false);
  useEffect(() => {
    if (!autoSend || didAutoSendRef.current) return;
    didAutoSendRef.current = true;
    void runSend('initial');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Cuenta atrás del cooldown de reenvío ───────────────────────────────────
  // El estado PURO es solo `endsAt`; aquí recalculamos los segundos restantes cada
  // segundo con el reloj inyectado y paramos el intervalo al llegar a 0.
  useEffect(() => {
    if (cooldown.endsAt <= 0) {
      setRemaining(0);
      return undefined;
    }
    let id = 0;
    const tick = () => {
      const r = cooldownRemainingSeconds(cooldown, nowRef.current());
      setRemaining(r);
      if (r <= 0 && id) window.clearInterval(id);
    };
    id = window.setInterval(tick, 1000);
    tick();
    return () => window.clearInterval(id);
  }, [cooldown]);

  // El aviso de "código reenviado" se desvanece solo tras unos segundos.
  useEffect(() => {
    if (!resentNotice) return undefined;
    const id = window.setTimeout(() => setResentNotice(false), 5000);
    return () => window.clearTimeout(id);
  }, [resentNotice]);

  // ── Verificación del código ────────────────────────────────────────────────
  const runVerify = async (fullCode: string) => {
    if (busy) return;
    setVerifying(true);
    setVerifyErrorKey(null);
    const result = await onVerifyCode(fullCode);
    setVerifying(false);
    if (result.ok === true) {
      setFinishing('verified');
      onVerified?.();
    } else {
      setVerifyErrorKey(readErrorKey(result));
      setCode(''); // limpia el campo para reintroducir sin borrar a mano
    }
  };

  const handleCodeChange = (value: string) => {
    const clean = sanitizeOtpCode(value, codeLength);
    setCode(clean);
    if (verifyErrorKey) setVerifyErrorKey(null);
    // Auto-verifica al completar; el botón explícito es un respaldo accesible.
    if (isOtpCodeComplete(clean, codeLength)) void runVerify(clean);
  };

  const handleContinueWithout = () => {
    setFinishing('proceeding');
    onContinueWithoutVerification?.();
  };

  const resendReady = remaining <= 0;
  const codeComplete = isOtpCodeComplete(code, codeLength);

  // ── Estado terminal: verificado o completando el registro ──────────────────
  if (finishing) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center py-6 text-center"
        role="status"
        aria-live="polite"
      >
        {finishing === 'verified' ? (
          <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-success/15">
            <Check className="h-7 w-7 text-success" aria-hidden="true" />
          </span>
        ) : (
          <Loader2 className="mb-4 h-8 w-8 animate-spin text-gold" aria-hidden="true" />
        )}
        {finishing === 'verified' && (
          <p className="mb-1 font-display text-xl text-foreground">{t('auth.otp.verified')}</p>
        )}
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          {finishing === 'verified' && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          {t('auth.otp.finishing')}
        </p>
      </motion.div>
    );
  }

  // ── SMS no disponible (sin proveedor Phone): mensaje honesto + salida ───────
  if (providerUnavailable) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-6"
      >
        <div className="rounded-xl border border-warning/30 bg-warning/10 p-4" role="alert">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-hidden="true" />
            <div>
              <p className="mb-1 font-medium text-foreground">{t('auth.otp.providerTitle')}</p>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {t('auth.error.otpProviderUnavailable')}
              </p>
            </div>
          </div>
        </div>
        <div className="space-y-3">
          {/* "Continuar sin verificar" solo si el padre lo permite: cuando el servidor YA
              exige verificación (gate activo) el padre no pasa el callback y esta salida
              desaparece, evitando un bucle (RPC → PHONE_NOT_VERIFIED → aquí → …). */}
          {onContinueWithoutVerification && (
            <Button
              type="button"
              onClick={handleContinueWithout}
              disabled={busy}
              className="h-12 w-full gradient-gold font-semibold tracking-wide text-primary-foreground shadow-gold transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {t('auth.otp.continueWithout')}
            </Button>
          )}
          {onChangeNumber && (
            <Button type="button" variant="ghost" onClick={onChangeNumber} disabled={busy} className="w-full text-muted-foreground hover:text-foreground">
              {t('auth.otp.changeNumber')}
            </Button>
          )}
        </div>
      </motion.div>
    );
  }

  // ── Enviando el primer código (aún no ha salido ninguno) ───────────────────
  if (sendState === 'sending' && !hasSentOnce) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center" role="status" aria-live="polite">
        <Loader2 className="h-8 w-8 animate-spin text-gold" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">{t('auth.otp.sending')}</p>
      </div>
    );
  }

  // ── Falló el PRIMER envío (no era falta de proveedor): reintentar o continuar ─
  if (sendState === 'send-error' && !hasSentOnce) {
    return (
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4" role="alert">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden="true" />
            <p className="text-sm leading-relaxed text-foreground">{t(sendErrorKey ?? 'auth.error.generic')}</p>
          </div>
        </div>
        <div className="space-y-3">
          <Button
            type="button"
            onClick={() => runSend('initial')}
            disabled={busy}
            className="h-12 w-full gradient-gold font-semibold tracking-wide text-primary-foreground shadow-gold transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {t('auth.otp.retrySend')}
          </Button>
          {onContinueWithoutVerification && (
            <Button type="button" variant="outline" onClick={handleContinueWithout} disabled={busy} className="h-11 w-full">
              {t('auth.otp.continueWithout')}
            </Button>
          )}
          {onChangeNumber && (
            <Button type="button" variant="ghost" onClick={onChangeNumber} disabled={busy} className="w-full text-muted-foreground hover:text-foreground">
              {t('auth.otp.changeNumber')}
            </Button>
          )}
        </div>
      </motion.div>
    );
  }

  // ── Flujo principal: código enviado, el usuario introduce los dígitos ──────
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="text-center">
        <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-gold/10">
          <ShieldCheck className="h-7 w-7 text-gold" aria-hidden="true" />
        </span>
        <h2 className="mb-2 font-display text-2xl text-foreground">{t('auth.otp.title')}</h2>
        <p className="text-sm text-muted-foreground">{t('auth.otp.sentTo')}</p>
        <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1 text-sm font-medium text-gold-light">
          <Smartphone className="h-3.5 w-3.5" aria-hidden="true" />
          <span dir="ltr">{phone}</span>
        </p>
      </div>

      <div className="flex justify-center">
        <InputOTP
          maxLength={codeLength}
          value={code}
          onChange={handleCodeChange}
          pattern={REGEXP_ONLY_DIGITS}
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          disabled={busy}
          aria-label={t('auth.otp.codeLabel')}
          containerClassName="justify-center"
          // Sin insignia de gestor de contraseñas sobre un código de un solo uso.
          pushPasswordManagerStrategy="none"
        >
          <InputOTPGroup className="gap-2">
            {Array.from({ length: codeLength }).map((_, i) => (
              <InputOTPSlot
                key={i}
                index={i}
                className="h-14 w-11 rounded-md border-border bg-secondary text-lg first:rounded-l-md last:rounded-r-md"
              />
            ))}
          </InputOTPGroup>
        </InputOTP>
      </div>

      {verifyErrorKey && (
        <p
          className="flex items-center justify-center gap-2 text-center text-sm text-destructive"
          role="alert"
          aria-live="assertive"
        >
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
          {t(verifyErrorKey)}
        </p>
      )}

      {/* Reenvío con espera mínima anti-spam. */}
      <div className="text-center text-sm">
        <span className="text-muted-foreground">{t('auth.otp.noCode')} </span>
        {resendReady ? (
          <button
            type="button"
            onClick={() => runSend('resend')}
            disabled={busy}
            className="font-medium text-gold underline-offset-4 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t('auth.otp.resend')}
          </button>
        ) : (
          <span className="text-muted-foreground">
            {t('auth.otp.resendIn')} <span className="tabular-nums text-foreground">{formatCountdown(remaining)}</span>
          </span>
        )}
        {resentNotice && (
          <p className="mt-2 flex items-center justify-center gap-1.5 text-success" aria-live="polite">
            <Check className="h-4 w-4" aria-hidden="true" />
            {t('auth.otp.resent')}
          </p>
        )}
        {/* Un fallo al REENVIAR (ya había un código previo) no oculta el campo: se avisa aquí. */}
        {sendState === 'send-error' && hasSentOnce && sendErrorKey && (
          <p className="mt-2 text-destructive" role="alert">
            {t(sendErrorKey)}
          </p>
        )}
      </div>

      <div className="space-y-3">
        <Button
          type="button"
          onClick={() => runVerify(code)}
          disabled={busy || !codeComplete}
          className="h-12 w-full gradient-gold font-semibold tracking-wide text-primary-foreground shadow-gold transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {verifying ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              {t('auth.otp.verifying')}
            </>
          ) : (
            t('auth.otp.verify')
          )}
        </Button>
        {onChangeNumber && (
          <Button
            type="button"
            variant="ghost"
            onClick={onChangeNumber}
            disabled={busy}
            className="w-full text-muted-foreground hover:text-foreground"
          >
            {t('auth.otp.changeNumber')}
          </Button>
        )}
      </div>
    </motion.div>
  );
};

export default PhoneOtpStep;
