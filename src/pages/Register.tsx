import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useI18n } from '@/lib/i18n';
import { useAuth, mapAuthError, mapRegisterError } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';
import { useSalon } from '@/lib/salon-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { ArrowLeft, Eye, EyeOff } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';

const Register = () => {
  const navigate = useNavigate();
  const { t } = useI18n();
  const { signUp } = useAuth();
  // salon_id derivado del salón resuelto en runtime (no de VITE_SALON_ID).
  const { id: salonId } = useSalon();
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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

    // 3) Enlace por teléfono. Confiamos en la RPC para resolver el desenlace:
    //      - created        → se creó la cuenta de cliente para este teléfono.
    //      - linked          → se enlazó una ficha existente creada por el salón.
    //      - already_linked  → el teléfono ya estaba enlazado a esta cuenta.
    //    Los tres desenlaces son un éxito para el usuario.
    // TODO(OTP · fase posterior): verificar el teléfono por SMS (OTP) ANTES de
    //   confiar en el enlace, para impedir que alguien reclame la ficha de otra
    //   persona registrándose con un teléfono ajeno.
    const { data: rpcData, error: rpcError } = await supabase.rpc('register_my_customer_account', {
      p_salon_id: salonId,
      p_phone: phone,
      p_full_name: fullName,
      p_email: form.email,
    });

    setLoading(false);

    if (rpcError) {
      // PHONE_CONFLICT/P0001 → teléfono ya vinculado; INVALID_PHONE → no válido.
      toast.error(t(mapRegisterError(rpcError)));
      return;
    }

    const outcome =
      rpcData && typeof rpcData === 'object' && !Array.isArray(rpcData)
        ? (rpcData as Record<string, unknown>).outcome
        : rpcData;
    toast.success(t(outcome === 'linked' ? 'auth.register.successLinked' : 'auth.register.successCreated'));
    navigate('/home');
  };

  const update = (key: string, value: unknown) => setForm((f) => ({ ...f, [key]: value }));

  return (
    <div className="min-h-screen bg-background px-6 py-8">
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        className="mb-8"
      >
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft size={18} />
          <span className="text-sm">{t('general.back')}</span>
        </button>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <h1 className="mb-1 font-display text-3xl text-foreground">{t('auth.register')}</h1>
        <p className="mb-8 text-sm text-muted-foreground">de<span className="text-gold">nueve</span>a<span className="text-gold">nueve</span></p>

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
    </div>
  );
};

export default Register;
