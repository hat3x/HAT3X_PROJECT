import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useI18n } from '@/lib/i18n';
import { useAuth, mapAuthError } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';
import { useSalon } from '@/lib/salon-context';
import { normalizePhoneToE164 } from '@/lib/otp';
import {
  classifyRegisterOutcome,
  detectPhoneVerificationResumption,
  PHONE_NOT_VERIFIED_ERROR_KEY,
} from '@/lib/registration-flow';
import { sendPhoneOtp, resendPhoneOtp, confirmPhoneOtp } from '@/lib/phone-verification';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import PhoneOtpStep from '@/components/PhoneOtpStep';
import { ArrowLeft, Eye, EyeOff, PartyPopper, ShieldAlert } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';

const Register = () => {
  const navigate = useNavigate();
  const { t } = useI18n();
  const { signUp, user, loading: authLoading } = useAuth();
  // salon_id y nombre derivados del salón resuelto en runtime (no de VITE_SALON_ID).
  const { id: salonId, name: salonName } = useSalon();
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  // Máquina de dos fases: primero el formulario, luego (con sesión activa) la
  // verificación del teléfono por SMS (OTP). `pending` guarda lo que necesita el
  // enlace posterior + el E.164 exacto que usan enviar/reenviar/verificar (debe
  // coincidir con el `new_phone` pendiente en Supabase Auth).
  const [phase, setPhase] = useState<'form' | 'verify'>('form');
  const [pending, setPending] = useState<{
    phone: string;
    e164: string;
    fullName: string;
    email: string;
  } | null>(null);
  // El servidor ya exigió el teléfono verificado (la RPC devolvió PHONE_NOT_VERIFIED):
  // muestra el aviso de "verificación obligatoria" y retira la salida "continuar sin
  // verificar" (que ahora sería una salida falsa y crearía un bucle). Ver finishRegistration.
  const [phoneGateRequired, setPhoneGateRequired] = useState(false);
  // Clave de remontaje del paso OTP: al incrementarla, <PhoneOtpStep> se reinicia por
  // completo (sale de su estado terminal "completando" y reenvía un código nuevo). Así,
  // tras un PHONE_NOT_VERIFIED, el usuario reintenta la verificación en el sitio.
  const [verifyAttempt, setVerifyAttempt] = useState(0);
  // Reanudación (sub-6): `resuming` distingue el "termina tu verificación" (sesión ya
  // existente, sin formulario de por medio) del alta normal, para ajustar copy y el atrás.
  const [resuming, setResuming] = useState(false);
  // La reanudación se resuelve UNA sola vez; y nunca debe secuestrar un alta manual en curso.
  const resumeHandledRef = useRef(false);
  const manualSignupRef = useRef(false);
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    phone: '',
    email: '',
    password: '',
    dateOfBirth: '',
    terms: false,
    marketing: false,
    whatsapp: false,
  });

  // ── Reanudación de un registro a medias (sub-6) ────────────────────────────
  // Al entrar con una sesión ya existente cuyo teléfono NO está confirmado (cuenta creada
  // pero verificación abandonada), saltamos directos al MISMO paso de OTP en vez de dejar
  // una cuenta inservible. La decisión es PURA (detectPhoneVerificationResumption mira solo
  // la sesión) y se resuelve UNA vez: cuando la sesión ya está rehidratada (authLoading=false),
  // sin secuestrar un alta manual en curso ni pisar un paso de verificación ya abierto.
  useEffect(() => {
    if (resumeHandledRef.current || manualSignupRef.current || authLoading) return;
    if (phase !== 'form' || pending) return;

    const resumption = detectPhoneVerificationResumption(user);
    if (resumption.kind !== 'resume') return;

    // El SMS se envía/verifica en E.164; si el teléfono guardado no normaliza, no forzamos
    // la reanudación (el usuario se queda en el formulario, sin bloquearse en un paso imposible).
    const norm = normalizePhoneToE164(resumption.phone);
    if (!norm.ok) return;

    resumeHandledRef.current = true;
    setPending({
      phone: resumption.phone,
      e164: (norm as { e164: string }).e164,
      fullName: resumption.fullName,
      email: resumption.email,
    });
    setResuming(true);
    setPhase('verify');
  }, [user, authLoading, phase, pending]);

  /**
   * Paso final del registro: enlaza la ficha del cliente por teléfono vía la RPC de
   * Salón OS y navega a la app. Lo invocan tanto el paso OTP (tras verificar el
   * teléfono, o al continuar sin verificar cuando el SMS no está disponible) como el
   * atajo de `handleSubmit` cuando el teléfono no es normalizable a E.164. Confiamos en
   * la RPC para resolver el desenlace (created | linked | already_linked; los tres son
   * un éxito para el usuario).
   *
   * El desenlace lo clasifica `classifyRegisterOutcome` (módulo PURO), que separa tres
   * caminos: éxito → navegar; PHONE_NOT_VERIFIED → REABRIR la verificación (el servidor
   * exige el teléfono confirmado); cualquier otro error → avisar y volver al formulario.
   */
  const finishRegistration = async ({ phone, fullName, email }: { phone: string; fullName: string; email: string }) => {
    setLoading(true);
    const result = await supabase.rpc('register_my_customer_account', {
      p_salon_id: salonId,
      p_phone: phone,
      p_full_name: fullName,
      p_email: email,
    });
    setLoading(false);

    const outcome = classifyRegisterOutcome(result);

    // El servidor exige el teléfono verificado por SMS y aún NO consta como tal. NO
    // devolvemos al usuario al formulario (callejón sin salida): dejamos activo el paso
    // de verificación, encendemos el aviso de "verificación obligatoria" y REMONTAMOS
    // <PhoneOtpStep> (bump de verifyAttempt) para que reenvíe un código nuevo y el
    // usuario reintente la verificación en el sitio.
    if (outcome.kind === 'phone-not-verified') {
      setPhoneGateRequired(true);
      setVerifyAttempt((n) => n + 1);
      setPhase('verify');
      toast.error(t(PHONE_NOT_VERIFIED_ERROR_KEY));
      return;
    }

    if (outcome.kind === 'error') {
      // Motivo del rechazo ya traducido (sin sortear el gating): INVALID_PHONE →
      // teléfono no válido; PHONE_CONFLICT/P0001 → ya vinculado; FEATURE_NOT_ENABLED →
      // el salón no tiene contratado el add-on. Se avisa y se vuelve al formulario.
      toast.error(t(outcome.errorKey));
      setPhase('form');
      return;
    }

    toast.success(t(outcome.linked ? 'auth.register.successLinked' : 'auth.register.successCreated'));
    navigate('/home');
  };

  /**
   * Vuelve al formulario desde el paso de verificación (botón "atrás" o "cambiar
   * número"), apagando el gate de verificación obligatoria para no arrastrarlo a un
   * nuevo intento con otro número.
   */
  const backToForm = () => {
    setPhoneGateRequired(false);
    setPhase('form');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Un alta manual manda: bloquea la reanudación automática para que el efecto de sub-6
    // no pise este flujo si la sesión se rehidrata a mitad del signUp.
    manualSignupRef.current = true;
    if (!form.terms) {
      toast.error('Debes aceptar los términos y condiciones');
      return;
    }
    const firstName = form.firstName.trim();
    const lastName = form.lastName.trim();
    if (firstName.length < 2 || lastName.length < 2) {
      toast.error('Nombre y apellidos deben tener al menos 2 caracteres');
      return;
    }

    const phone = form.phone.trim();
    const fullName = `${firstName} ${lastName}`.trim();

    setLoading(true);

    // 1) Alta en Supabase Auth. El trigger `handle_new_user` de Salón OS crea la
    //    ficha base del cliente a partir de estos metadatos. Ya no hacemos un
    //    pre-check de email/teléfono: la unicidad y el enlace por teléfono los
    //    resuelve la RPC del paso 3 de forma atómica (sin condición de carrera).
    const { data: signUpData, error: signUpError } = await signUp(form.email, form.password, {
      first_name: firstName,
      last_name: lastName,
      phone,
      date_of_birth: form.dateOfBirth || null,
      consent_marketing: form.marketing,
      consent_whatsapp: form.whatsapp,
    });

    if (signUpError) {
      setLoading(false);
      toast.error(t(mapAuthError(signUpError)));
      return;
    }

    // 2) La RPC de enlace por teléfono necesita una sesión activa (se ejecuta con
    //    auth.uid()). Si el proyecto exige confirmación de correo, todavía no hay
    //    sesión: informamos y aplazamos el enlace hasta el primer inicio de sesión.
    const session = signUpData.session ?? (await supabase.auth.getSession()).data.session;
    if (!session) {
      setLoading(false);
      toast.success(t('auth.register.checkEmail'));
      navigate('/login');
      return;
    }

    // 3) Verificación del teléfono por SMS (OTP) ANTES de confiar en el enlace: impide
    //    que alguien reclame la ficha de otra persona registrándose con un teléfono
    //    ajeno (cierra el TODO de la auditoría sub-1 §9). Necesitamos el E.164 exacto,
    //    así que normalizamos UNA vez aquí y lo reutilizan enviar/reenviar/verificar
    //    (deben coincidir con el `new_phone` pendiente en Supabase Auth). El enlace por
    //    RPC se ejecuta después, en `finishRegistration`, cuando el paso OTP termina.
    const norm = normalizePhoneToE164(phone);
    if (norm.ok) {
      setPending({ phone, e164: (norm as { e164: string }).e164, fullName, email: form.email });
      setLoading(false);
      setPhase('verify');
      return;
    }

    // Teléfono no normalizable a E.164 → no hay forma de verificarlo por SMS. Seguimos
    // con el enlace: la RPC valida el teléfono y, si procede, lo rechaza con su propio
    // mensaje (INVALID_PHONE), en vez de atascar al usuario en un paso imposible.
    await finishRegistration({ phone, fullName, email: form.email });
  };

  const update = (key: string, value: unknown) => setForm((f) => ({ ...f, [key]: value }));

  return (
    <div className="min-h-screen bg-background px-6 py-8">
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        className="mb-8"
      >
        <button
          onClick={() => {
            // Al reanudar no hay formulario al que "volver": el usuario YA tiene cuenta, así
            // que el atrás lo lleva a casa (podrá retomar la verificación luego desde el aviso).
            if (resuming) return navigate('/home');
            return phase === 'verify' ? backToForm() : navigate(-1);
          }}
          className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft size={18} />
          <span className="text-sm">{t('general.back')}</span>
        </button>
      </motion.div>

      {phase === 'verify' && pending ? (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          {phoneGateRequired && (
            <div className="mb-6 rounded-xl border border-warning/30 bg-warning/10 p-4" role="alert">
              <div className="flex items-start gap-3">
                <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-hidden="true" />
                <div>
                  <p className="mb-1 font-medium text-foreground">{t('auth.register.phoneRequiredTitle')}</p>
                  <p className="text-sm leading-relaxed text-muted-foreground">{t('auth.register.phoneRequired')}</p>
                </div>
              </div>
            </div>
          )}
          {/* Aviso cálido de reanudación (sub-6): recuerda que retomamos un registro a medias,
              sin dramatismo. Si el servidor pasa a EXIGIR la verificación (phoneGateRequired),
              cede el sitio al aviso más firme de arriba para no duplicar mensajes. */}
          {resuming && !phoneGateRequired && (
            <div className="mb-6 rounded-xl border border-gold/25 bg-gold/5 p-4">
              <div className="flex items-start gap-3">
                <PartyPopper className="mt-0.5 h-5 w-5 shrink-0 text-gold" aria-hidden="true" />
                <div>
                  <p className="mb-1 font-medium text-foreground">{t('auth.resume.title')}</p>
                  <p className="text-sm leading-relaxed text-muted-foreground">{t('auth.resume.body')}</p>
                </div>
              </div>
            </div>
          )}
          <PhoneOtpStep
            // Remontar (key) al reintentar tras PHONE_NOT_VERIFIED: reinicia el estado
            // interno del paso y reenvía un código nuevo.
            key={verifyAttempt}
            phone={pending.phone}
            onSendCode={() => sendPhoneOtp(pending.e164, supabase.auth)}
            onResendCode={() => resendPhoneOtp(pending.e164, supabase.auth)}
            onVerifyCode={(code) => confirmPhoneOtp(pending.e164, code, supabase.auth)}
            onVerified={() => finishRegistration(pending)}
            // Solo se ofrece "continuar sin verificar" MIENTRAS el servidor no haya
            // exigido la verificación. Una vez devuelve PHONE_NOT_VERIFIED, esa salida
            // sería falsa (la RPC volvería a rechazar) y crearía un bucle: la retiramos.
            onContinueWithoutVerification={phoneGateRequired ? undefined : () => finishRegistration(pending)}
            // Al reanudar no ofrecemos "cambiar número": la cuenta ya se creó con ese teléfono
            // (cambiarlo es un flujo de perfil aparte, fuera de sub-6). El atrás de arriba lleva a casa.
            onChangeNumber={resuming ? undefined : backToForm}
          />
        </motion.div>
      ) : (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <h1 className="mb-1 font-display text-3xl text-foreground">{t('auth.register')}</h1>
        <p className="mb-8 text-sm text-muted-foreground">{salonName}</p>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="firstName" className="text-xs text-muted-foreground">{t('auth.name')}</Label>
              <Input id="firstName" value={form.firstName} onChange={(e) => update('firstName', e.target.value)} required className="h-11 bg-secondary border-border focus:border-gold focus:ring-gold/20" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lastName" className="text-xs text-muted-foreground">{t('auth.surname')}</Label>
              <Input id="lastName" value={form.lastName} onChange={(e) => update('lastName', e.target.value)} required className="h-11 bg-secondary border-border focus:border-gold focus:ring-gold/20" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="phone" className="text-xs text-muted-foreground">{t('auth.phone')}</Label>
            <Input id="phone" type="tel" value={form.phone} onChange={(e) => update('phone', e.target.value)} required className="h-11 bg-secondary border-border focus:border-gold focus:ring-gold/20" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-xs text-muted-foreground">{t('auth.email')}</Label>
            <Input id="email" type="email" value={form.email} onChange={(e) => update('email', e.target.value)} required className="h-11 bg-secondary border-border focus:border-gold focus:ring-gold/20" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="dateOfBirth" className="text-xs text-muted-foreground">{t('auth.dateOfBirth')}</Label>
            <Input id="dateOfBirth" type="date" value={form.dateOfBirth} onChange={(e) => update('dateOfBirth', e.target.value)} required className="h-11 bg-secondary border-border focus:border-gold focus:ring-gold/20" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password" className="text-xs text-muted-foreground">{t('auth.password')}</Label>
            <div className="relative">
              <Input id="password" type={showPassword ? 'text' : 'password'} value={form.password} onChange={(e) => update('password', e.target.value)} required minLength={8} className="h-11 bg-secondary border-border focus:border-gold focus:ring-gold/20 pr-10" />
              <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div className="space-y-3 pt-2">
            <label className="flex items-start gap-3 cursor-pointer">
              <Checkbox checked={form.terms} onCheckedChange={(v) => update('terms', v)} className="mt-0.5 border-border data-[state=checked]:bg-gold data-[state=checked]:border-gold" />
              <span className="text-xs text-muted-foreground leading-relaxed">{t('auth.terms')} *</span>
            </label>
            <label className="flex items-start gap-3 cursor-pointer">
              <Checkbox checked={form.marketing} onCheckedChange={(v) => update('marketing', v)} className="mt-0.5 border-border data-[state=checked]:bg-gold data-[state=checked]:border-gold" />
              <span className="text-xs text-muted-foreground leading-relaxed">{t('auth.marketing')}</span>
            </label>
            <label className="flex items-start gap-3 cursor-pointer">
              <Checkbox checked={form.whatsapp} onCheckedChange={(v) => update('whatsapp', v)} className="mt-0.5 border-border data-[state=checked]:bg-gold data-[state=checked]:border-gold" />
              <span className="text-xs text-muted-foreground leading-relaxed">{t('auth.whatsapp')}</span>
            </label>
          </div>

          <Button
            type="submit"
            disabled={loading}
            className="h-12 w-full gradient-gold text-primary-foreground font-semibold tracking-wide shadow-gold hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {loading ? t('general.loading') : t('auth.submit')}
          </Button>

          <p className="text-center text-xs text-muted-foreground">
            {t('auth.hasAccount')}{' '}
            <button type="button" onClick={() => navigate('/login')} className="text-gold hover:underline">
              {t('auth.login')}
            </button>
          </p>
        </form>
      </motion.div>
      )}
    </div>
  );
};

export default Register;
