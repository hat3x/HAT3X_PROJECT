import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Crown, Check, ArrowLeft, Loader2, Info } from 'lucide-react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements } from '@stripe/react-stripe-js';
import { useI18n } from '@/lib/i18n';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { motion, AnimatePresence } from 'framer-motion';
import BottomNav from '@/components/BottomNav';
import CheckoutForm from '@/components/CheckoutForm';
import { toast } from 'sonner';
import type { Tables } from '@/integrations/supabase/types';

type Subscription = Tables<'subscriptions'>;

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);

const PLANS = [
  {
    key: 'ladies' as const,
    plan: 'LADIES_39' as const,
    price: 39,
    benefits: ['club.ladiesBenefits.1', 'club.ladiesBenefits.2', 'club.ladiesBenefits.3', 'club.ladiesBenefits.4', 'club.ladiesBenefits.6'],
    annualOnlyBenefits: ['club.ladiesBenefits.5'],
    detailKey: 'club.ladiesDetail',
    detailKeyAnnual: 'club.ladiesDetailAnnual',
  },
  {
    key: 'menPremium' as const,
    plan: 'MEN_19' as const,
    price: 19,
    benefits: ['club.menPremiumBenefits.1', 'club.menPremiumBenefits.2', 'club.menPremiumBenefits.3', 'club.menPremiumBenefits.4'],
    annualOnlyBenefits: ['club.menPremiumBenefits.birthday'],
    detailKey: 'club.menPremiumDetail',
    detailKeyAnnual: 'club.menPremiumDetailAnnual',
  },
  {
    key: 'menBasic' as const,
    plan: 'MEN_17' as const,
    price: 17,
    benefits: ['club.menBasicBenefits.1', 'club.menBasicBenefits.2', 'club.menBasicBenefits.3', 'club.menBasicBenefits.4'],
    annualOnlyBenefits: ['club.menBasicBenefits.birthday'],
    detailKey: 'club.menBasicDetail',
    detailKeyAnnual: 'club.menBasicDetailAnnual',
  },
];

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: 'text-success',
  PAYMENT_DUE: 'text-warning',
  CANCELLED_END_OF_PERIOD: 'text-muted-foreground',
  EXPIRED: 'text-destructive',
};

const Club = () => {
  const navigate = useNavigate();
  const { t } = useI18n();
  const { user } = useAuth();
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [subscribing, setSubscribing] = useState(false);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [expandedPlan, setExpandedPlan] = useState<string | null>(null);
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'annual'>('monthly');

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
      setCustomerId(customer.id);

      const { data: sub } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('customer_id', customer.id)
        .in('status', ['ACTIVE', 'CANCELLED_END_OF_PERIOD', 'PAYMENT_DUE'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      setSubscription(sub);
      setLoading(false);
    };
    load();
  }, [user]);

  // Check for checkout success in URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('checkout') === 'success') {
      toast.success(t('club.checkoutSuccess'), { description: t('club.checkoutSuccessDesc') });
      // Clean URL
      window.history.replaceState({}, '', '/club');
      // Reload subscription
      setTimeout(() => window.location.reload(), 1000);
    }
  }, []);

  const handleSubscribe = async (plan: string, priceCents: number) => {
    if (!user || !customerId) return;
    setSubscribing(true);
    setSelectedPlan(plan);
    try {
      const { data, error } = await supabase.functions.invoke('create-subscription-intent', {
        body: { plan, price_cents: priceCents, billing_period: billingPeriod },
      });
      if (error) throw error;
      if (data?.clientSecret) {
        setClientSecret(data.clientSecret);
      } else {
        throw new Error('No se recibió el secreto de pago');
      }
    } catch (err: any) {
      console.error('Subscribe error:', err);
      toast.error(err.message || 'Error al iniciar el pago');
      setSelectedPlan(null);
    } finally {
      setSubscribing(false);
    }
  };

  const handleManage = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('customer-portal');
      if (error) throw error;
      if (data?.url) {
        window.open(data.url, '_blank');
      }
    } catch (err: any) {
      toast.error(err.message || 'Error al abrir el portal');
    }
  };

  const handleCheckoutSuccess = () => {
    setClientSecret(null);
    setSelectedPlan(null);
    // Reload to show updated subscription
    setTimeout(() => window.location.reload(), 1500);
  };

  const handleCheckoutCancel = () => {
    setClientSecret(null);
    setSelectedPlan(null);
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'ACTIVE': return t('club.active');
      case 'PAYMENT_DUE': return t('club.paymentDue');
      case 'CANCELLED_END_OF_PERIOD': return t('club.cancelledEnd');
      case 'EXPIRED': return t('club.expired');
      default: return status;
    }
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="px-6 pt-12 pb-4">
        <button onClick={() => navigate(-1)} className="mb-4 flex items-center gap-1 text-sm text-muted-foreground">
          <ArrowLeft size={16} /> {t('general.back')}
        </button>
        <div className="flex items-center gap-2 mb-1">
          <Crown className="h-6 w-6 text-gold" />
          <h1 className="font-display text-3xl text-foreground">{t('club.title')}</h1>
        </div>
        <p className="text-sm text-muted-foreground">{t('club.subtitle')}</p>
      </div>

      {loading ? (
        <div className="px-6 space-y-3">
          {[1, 2].map((i) => <div key={i} className="h-48 animate-pulse rounded-xl bg-muted" />)}
        </div>
      ) : subscription && subscription.status !== 'PAYMENT_DUE' ? (
        <div className="px-6 space-y-4">
          {/* Active subscription card */}
          <div className="rounded-xl border border-gold/20 bg-gradient-to-br from-gold/10 to-gold/5 p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-display text-lg text-foreground">{t('club.currentPlan')}</h3>
              <span className={`text-xs font-medium ${STATUS_COLORS[subscription.status]}`}>
                {getStatusLabel(subscription.status)}
              </span>
            </div>
            <p className="text-2xl font-display text-gold mb-1">
              {subscription.plan === 'LADIES_39' ? t('club.ladies') : subscription.plan === 'MEN_19' ? t('club.menPremium') : t('club.menBasic')}
              <span className="text-sm text-muted-foreground ml-1">
                {subscription.price_cents / 100}€{t('club.perMonth')}
              </span>
            </p>
            {subscription.current_period_end && (
              <p className="text-xs text-muted-foreground mt-2">
                {subscription.cancel_at_period_end ? t('club.endsAt') : t('club.nextRenewal')}{' '}
                {new Date(subscription.current_period_end).toLocaleDateString()}
              </p>
            )}
            <div className="mt-4 space-y-2">
              <Button onClick={() => navigate('/premium')} className="w-full gradient-gold text-primary-foreground shadow-gold">
                {t('premium.yourBenefits')}
              </Button>
              <Button onClick={handleManage} variant="outline" className="w-full border-gold/20 text-foreground">
                {t('club.manageSubscription')}
              </Button>
            </div>
          </div>

          {/* Detail text */}
          <div className="rounded-xl border border-border bg-card p-4">
            <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-sans leading-relaxed">
              {t(subscription.plan === 'LADIES_39' ? 'club.ladiesDetail' : subscription.plan === 'MEN_19' ? 'club.menPremiumDetail' : 'club.menBasicDetail')}
            </pre>
          </div>
        </div>
      ) : (
        <div className="px-6 space-y-4">
          {/* Inline checkout form */}
          <AnimatePresence>
            {clientSecret && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="rounded-xl border border-gold/20 bg-card p-5"
              >
                <h3 className="font-display text-lg text-foreground mb-4">
                  {selectedPlan === 'LADIES_39' ? t('club.ladies') : selectedPlan === 'MEN_19' ? t('club.menPremium') : t('club.menBasic')} — {t('club.confirmPayment')}
                </h3>
                <Elements
                  stripe={stripePromise}
                  options={{
                    clientSecret,
                    appearance: {
                      theme: 'night',
                      variables: {
                        colorPrimary: '#c8a97e',
                        colorBackground: '#1a1712',
                        colorText: '#e8e0d4',
                        colorDanger: '#ef4444',
                        fontFamily: 'Josefin Sans, sans-serif',
                        borderRadius: '12px',
                      },
                    },
                  }}
                >
                  <CheckoutForm
                    onSuccess={handleCheckoutSuccess}
                    onCancel={handleCheckoutCancel}
                  />
                </Elements>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Billing period toggle */}
          {!clientSecret && (
            <div className="flex items-center justify-center gap-3 mb-2">
              <span className={`text-sm font-medium transition-colors ${billingPeriod === 'monthly' ? 'text-foreground' : 'text-muted-foreground'}`}>
                {t('club.monthly')}
              </span>
              <button
                onClick={() => setBillingPeriod(billingPeriod === 'monthly' ? 'annual' : 'monthly')}
                className={`relative w-14 h-7 rounded-full transition-colors duration-300 ${billingPeriod === 'annual' ? 'bg-emerald-500' : 'bg-muted-foreground/30'}`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-white shadow-md transition-transform duration-300 ${billingPeriod === 'annual' ? 'translate-x-7' : 'translate-x-0'}`}
                />
              </button>
              <span className={`text-sm font-medium transition-colors ${billingPeriod === 'annual' ? 'text-foreground' : 'text-muted-foreground'}`}>
                {t('club.annual')}
              </span>
              {billingPeriod === 'annual' && (
                <span className="text-xs font-semibold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                  -20% {t('club.discount')}
                </span>
              )}
            </div>
          )}

          {/* Plan cards (hidden when checkout is open) */}
          {!clientSecret && PLANS.map((plan, i) => {
            const monthlyPrice = plan.price;
            const annualFull = monthlyPrice * 12;
            const annualDiscounted = Math.round(annualFull * 0.8);
            const isAnnual = billingPeriod === 'annual';
            const displayPrice = isAnnual ? annualDiscounted : monthlyPrice;
            const priceCents = displayPrice * 100;

            return (
              <motion.div
                key={plan.key}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                className="rounded-xl border border-border bg-card p-5"
              >
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-display text-xl text-foreground">
                    {t(`club.${plan.key}`)}
                  </h3>
                  <div className="text-right">
                    {isAnnual ? (
                      <div className="flex flex-col items-end gap-0.5">
                        <span className="text-sm text-muted-foreground line-through">{annualFull}€{t('club.perYear')}</span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-semibold text-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                            -20%
                          </span>
                          <span className="font-display text-2xl text-gold">{annualDiscounted}€</span>
                          <span className="text-sm text-muted-foreground">{t('club.perYear')}</span>
                        </div>
                      </div>
                    ) : (
                      <p className="font-display text-2xl text-gold">
                        {monthlyPrice}€<span className="text-sm text-muted-foreground">{t('club.perMonth')}</span>
                      </p>
                    )}
                  </div>
                </div>

                <div className="space-y-2 mb-4">
                  {plan.benefits.map((b) => (
                    <div key={b} className="flex items-center gap-2">
                      <Check size={14} className="text-gold" />
                      <span className="text-sm text-muted-foreground">{t(b)}</span>
                    </div>
                  ))}
                  {isAnnual && plan.annualOnlyBenefits.map((b) => (
                    <div key={b} className="flex items-center gap-2">
                      <Crown size={14} className="text-gold" />
                      <span className="text-sm font-medium text-gold">{t(b)}</span>
                    </div>
                  ))}
                </div>

                {/* Detail text (collapsible) */}
                {expandedPlan === plan.key ? (
                  <div className="rounded-lg border border-border bg-muted/50 p-3 mb-3">
                    <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-sans leading-relaxed">
                      {t(isAnnual ? plan.detailKeyAnnual : plan.detailKey)}
                    </pre>
                  </div>
                ) : null}

                <div className="flex gap-2">
                  <Button
                    onClick={() => setExpandedPlan(expandedPlan === plan.key ? null : plan.key)}
                    variant="outline"
                    size="icon"
                    className="border-gold/20 text-muted-foreground shrink-0"
                  >
                    <Info size={18} />
                  </Button>
                  <Button
                    onClick={() => handleSubscribe(plan.plan, priceCents)}
                    disabled={subscribing}
                    className="w-full gradient-gold text-primary-foreground shadow-gold hover:opacity-90"
                  >
                    {subscribing && selectedPlan === plan.plan ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      t('club.subscribe')
                    )}
                  </Button>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      <BottomNav />
    </div>
  );
};

export default Club;
