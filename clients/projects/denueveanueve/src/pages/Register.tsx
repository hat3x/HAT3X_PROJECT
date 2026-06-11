import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useI18n } from '@/lib/i18n';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';
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
    if (form.firstName.length < 2 || form.lastName.length < 2) {
      toast.error('Nombre y apellidos deben tener al menos 2 caracteres');
      return;
    }
    setLoading(true);

    // Check if email or phone already registered
    const { data: checkResult, error: checkError } = await supabase.rpc(
      'check_customer_exists' as any,
      { _email: form.email, _phone: form.phone }
    );

    if (!checkError && checkResult) {
      const result = checkResult as unknown as { email_exists: boolean; phone_exists: boolean };
      if (result.email_exists) {
        setLoading(false);
        toast.error('Este correo electrónico ya está registrado');
        return;
      }
      if (result.phone_exists) {
        setLoading(false);
        toast.error('Este número de teléfono ya está registrado');
        return;
      }
    }

    const { error } = await signUp(form.email, form.password, {
      first_name: form.firstName,
      last_name: form.lastName,
      phone: form.phone,
      date_of_birth: form.dateOfBirth || null,
      consent_marketing: form.marketing,
      consent_whatsapp: form.whatsapp,
    });
    setLoading(false);
    if (error) {
      if (error.message?.includes('already registered') || error.message?.includes('already been registered')) {
        toast.error('Este correo electrónico ya está registrado');
      } else {
        toast.error(error.message);
      }
    } else {
      toast.success('Cuenta creada. Revisa tu correo para verificar.');
      navigate('/login');
    }
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
