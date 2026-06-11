import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useI18n } from '@/lib/i18n';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowLeft, CheckCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';

const ForgotPassword = () => {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/login`,
    });
    setLoading(false);
    if (error) {
      toast.error(error.message);
    } else {
      setSent(true);
    }
  };

  return (
    <div className="min-h-screen bg-background px-6 py-8">
      <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="mb-8">
        <button
          onClick={() => navigate('/login')}
          className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft size={18} />
          <span className="text-sm">{t('auth.backToLogin')}</span>
        </button>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        {sent ? (
          <div className="flex flex-col items-center text-center gap-4 pt-12">
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 200 }}>
              <CheckCircle size={56} className="text-gold" />
            </motion.div>
            <h1 className="font-display text-2xl text-foreground">{t('auth.resetPasswordSent')}</h1>
            <p className="text-sm text-muted-foreground max-w-xs">{t('auth.resetPasswordSentDesc')}</p>
            <Button
              onClick={() => navigate('/login')}
              className="mt-4 h-12 w-full gradient-gold text-primary-foreground font-semibold tracking-wide shadow-gold hover:opacity-90 transition-opacity"
            >
              {t('auth.backToLogin')}
            </Button>
          </div>
        ) : (
          <>
            <h1 className="mb-1 font-display text-3xl text-foreground">{t('auth.resetPassword')}</h1>
            <p className="mb-8 text-sm text-muted-foreground">de<span className="text-gold">nueve</span>a<span className="text-gold">nueve</span></p>
            <p className="mb-6 text-sm text-muted-foreground">{t('auth.resetPasswordDesc')}</p>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-xs text-muted-foreground">{t('auth.email')}</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="h-11 bg-secondary border-border focus:border-gold focus:ring-gold/20"
                />
              </div>

              <Button
                type="submit"
                disabled={loading}
                className="h-12 w-full gradient-gold text-primary-foreground font-semibold tracking-wide shadow-gold hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {loading ? t('general.loading') : t('auth.sendResetLink')}
              </Button>
            </form>
          </>
        )}
      </motion.div>
    </div>
  );
};

export default ForgotPassword;
