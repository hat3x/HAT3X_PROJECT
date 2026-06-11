import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Crown, ArrowLeft, Check, X, Loader2, Scissors, Palette, CalendarCheck, Gift, Sparkles, PartyPopper, Tag, Ticket } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import BottomNav from '@/components/BottomNav';
import { toast } from 'sonner';
import type { Tables } from '@/integrations/supabase/types';

type Subscription = Tables<'subscriptions'>;

const LADIES_BENEFITS = [
  { icon: Sparkles, key: 'premium.expressTreatment' },
  { icon: Palette, key: 'premium.colorDiscount' },
  { icon: Palette, key: 'premium.highlightsDiscount' },
  { icon: Scissors, key: 'premium.cutDiscount' },
  { icon: Gift, key: 'premium.exclusiveBenefitsItem' },
];

const MEN_PREMIUM_BENEFITS = [
  { icon: Scissors, key: 'premium.cutIncludedPremium' },
  { icon: Gift, key: 'premium.extraCutDiscount' },
  { icon: CalendarCheck, key: 'premium.priorityAccess' },
  { icon: Gift, key: 'premium.exclusiveBenefitsItem' },
];

const MEN_BASIC_BENEFITS = [
  { icon: Scissors, key: 'premium.cutIncludedBasic' },
  { icon: Gift, key: 'premium.extraCutDiscount' },
  { icon: CalendarCheck, key: 'premium.priorityAccess' },
  { icon: Gift, key: 'premium.exclusiveBenefitsItem' },
];

const PremiumBenefits = () => {
  const navigate = useNavigate();
  const { t } = useI18n();
  const { user } = useAuth();
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCancel, setShowCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      setLoading(true);
      const { data: customer } = await supabase
        .from('customers')
        .select('id')
        .eq('user_id', user.id)
        .single();
      if (!customer) { setLoading(false); return; }

      const { data: sub } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('customer_id', customer.id)
        .in('status', ['ACTIVE', 'CANCELLED_END_OF_PERIOD'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      setSubscription(sub);
      setLoading(false);
    };
    load();
  }, [user]);

  const handleCancel = async () => {
    if (!subscription) return;
    setCancelling(true);
    try {
      const { error } = await supabase.functions.invoke('cancel-subscription', {
        body: { subscription_id: subscription.id },
      });
      if (error) throw error;
      toast.success(t('premium.cancelledSuccess'));
      setShowCancel(false);
      // Reload
      window.location.reload();
    } catch (err: any) {
      toast.error(err.message || 'Error');
    } finally {
      setCancelling(false);
    }
  };

  const benefits = subscription?.plan === 'LADIES_39' ? LADIES_BENEFITS : subscription?.plan === 'MEN_19' ? MEN_PREMIUM_BENEFITS : MEN_BASIC_BENEFITS;
  const isBirthday = false; // Could check user's DOB vs current date

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="px-6 pt-12 pb-4">
        <button onClick={() => navigate(-1)} className="mb-4 flex items-center gap-1 text-sm text-muted-foreground">
          <ArrowLeft size={16} /> {t('general.back')}
        </button>
        <div className="flex items-center gap-2 mb-1">
          <Crown className="h-6 w-6 text-gold" />
          <h1 className="font-display text-2xl text-foreground">
            {subscription?.plan === 'LADIES_39' ? t('club.ladies') : subscription?.plan === 'MEN_19' ? t('club.menPremium') : t('club.menBasic')}
          </h1>
        </div>
        <p className="text-sm text-muted-foreground">{t('premium.exclusiveBenefits')}</p>
      </div>

      {loading ? (
        <div className="px-6 space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-14 animate-pulse rounded-xl bg-muted" />)}
        </div>
      ) : !subscription ? (
        <div className="px-6 text-center py-12">
          <p className="text-muted-foreground mb-4">No tienes una suscripción activa</p>
          <Button onClick={() => navigate('/club')} className="gradient-gold text-primary-foreground">
            {t('club.subscribe')}
          </Button>
        </div>
      ) : (
        <div className="px-6 space-y-4">
          {/* Birthday alert */}
          {isBirthday && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="rounded-xl border border-gold/30 bg-gold/10 p-4"
            >
              <p className="text-sm font-medium text-gold">{t('premium.birthdayAlert')}</p>
              <p className="text-xs text-muted-foreground mt-1">{t('premium.birthdayAlertDesc')}</p>
            </motion.div>
          )}

          {/* Benefits list */}
          <div className="space-y-2">
            {benefits.map((b, i) => {
              const Icon = b.icon;
              return (
                <motion.div
                  key={b.key}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="flex items-center gap-3 rounded-xl border border-border bg-card p-4"
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gold/10">
                    <Icon size={16} className="text-gold" />
                  </div>
                  <span className="text-sm text-foreground">{t(b.key)}</span>
                </motion.div>
              );
            })}
          </div>

          {/* Subscription info */}
          {subscription.current_period_end && (
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground">
                {subscription.cancel_at_period_end ? t('club.endsAt') : t('club.nextRenewal')}{' '}
                {new Date(subscription.current_period_end).toLocaleDateString()}
              </p>
            </div>
          )}

          {/* Cancel section */}
          {!subscription.cancel_at_period_end && (
            <>
              {!showCancel ? (
                <button
                  onClick={() => setShowCancel(true)}
                  className="text-xs text-muted-foreground underline"
                >
                  {t('premium.cancelTitle')}
                </button>
              ) : (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 space-y-3"
                >
                  <p className="text-sm text-foreground">{t('premium.cancelDesc1')}</p>
                  {subscription.current_period_end && (
                    <p className="text-xs text-muted-foreground">
                      {t('premium.cancelDesc2')} {new Date(subscription.current_period_end).toLocaleDateString()}.
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">{t('premium.cancelDesc3')}</p>
                  <div className="flex gap-2">
                    <Button
                      onClick={handleCancel}
                      disabled={cancelling}
                      variant="destructive"
                      size="sm"
                      className="flex-1"
                    >
                      {cancelling ? <Loader2 className="h-4 w-4 animate-spin" /> : t('premium.cancelConfirm')}
                    </Button>
                    <Button
                      onClick={() => setShowCancel(false)}
                      variant="outline"
                      size="sm"
                      className="flex-1"
                    >
                      {t('premium.keepSubscription')}
                    </Button>
                  </div>
                </motion.div>
              )}
            </>
          )}
        </div>
      )}

      <BottomNav />
    </div>
  );
};

export default PremiumBenefits;
