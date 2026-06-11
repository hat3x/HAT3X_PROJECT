import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useI18n } from '@/lib/i18n';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { CalendarPlus, Star, Crown, Tag, ChevronRight, Gift, Clock, MapPin } from 'lucide-react';
import { motion } from 'framer-motion';
import BottomNav from '@/components/BottomNav';
import logoImg from '@/assets/logo.png';
import type { Tables } from '@/integrations/supabase/types';

type Appointment = Tables<'appointments'> & { location_name?: string };

const cardVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.1, duration: 0.4 },
  }),
};

const Home = () => {
  const navigate = useNavigate();
  const { t } = useI18n();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [points, setPoints] = useState(0);
  const [visits, setVisits] = useState(0);
  const [isClubMember, setIsClubMember] = useState(false);
  const [nextAppointment, setNextAppointment] = useState<Appointment | null | undefined>(undefined);
  const [couponStatus, setCouponStatus] = useState<'active' | 'used' | 'expired' | null>(null);

  const rawName = user?.user_metadata?.first_name || 'Cliente';
  const firstName = rawName
    .toLowerCase()
    .replace(/\b\w/g, (c: string) => c.toUpperCase());

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

      const now = new Date().toISOString();

      const [accountRes, subRes, aptRes, couponRes] = await Promise.all([
        supabase
          .from('loyalty_accounts')
          .select('points_balance, visits_total')
          .eq('customer_id', customer.id)
          .single(),
        supabase
          .from('subscriptions')
          .select('status')
          .eq('customer_id', customer.id)
          .in('status', ['ACTIVE', 'CANCELLED_END_OF_PERIOD'])
          .maybeSingle(),
        supabase
          .from('appointments')
          .select('*, locations(name)')
          .eq('customer_id', customer.id)
          .in('status', ['CONFIRMED', 'RESCHEDULED'])
          .gte('start_at', now)
          .order('start_at', { ascending: true })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('welcome_coupons')
          .select('status, expires_at')
          .eq('customer_id', customer.id)
          .maybeSingle(),
      ]);

      if (accountRes.data) {
        setPoints(accountRes.data.points_balance);
        setVisits(accountRes.data.visits_total);
      }
      setIsClubMember(!!subRes.data);

      if (aptRes.data) {
        const apt = aptRes.data as Appointment & { locations: { name: string } | null };
        setNextAppointment({ ...apt, location_name: apt.locations?.name });
      } else {
        setNextAppointment(null);
      }

      if (couponRes.data) {
        const c = couponRes.data;
        if (c.status === 'USED') setCouponStatus('used');
        else if (c.expires_at && new Date(c.expires_at) < new Date()) setCouponStatus('expired');
        else setCouponStatus('active');
      }

      setLoading(false);
    };
    load();
  }, [user]);

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <div className="relative overflow-hidden px-6 pt-12 pb-8">
        <div className="absolute inset-0 bg-gradient-to-b from-gold/5 to-transparent" />
        <div className="relative flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{t('home.greeting')},</p>
            <div className="flex items-center gap-1.5">
              <h1 className="font-display text-xl text-foreground">{firstName}</h1>
              {isClubMember && (
                <Crown className="h-4 w-4 text-gold" />
              )}
            </div>
          </div>
          <img src={logoImg} alt="denueveanueve" className="h-5 w-auto opacity-70" />
        </div>
      </div>

      {/* Premium Banner */}
      {isClubMember && (
        <div className="px-6 mb-4">
          <motion.button
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            onClick={() => navigate('/premium')}
            className="w-full rounded-xl gradient-gold p-3.5 flex items-center justify-center gap-2 shadow-gold hover:opacity-90 transition-opacity"
          >
            <Crown className="h-5 w-5 text-primary-foreground" />
            <span className="font-display text-base text-primary-foreground tracking-wide">
              de<span className="opacity-90">nueve</span>a<span className="opacity-90">nueve</span> Premium
            </span>
          </motion.button>
        </div>
      )}

      <div className="space-y-4 px-6">
        {/* Welcome Coupon — only show if active */}
        {couponStatus === 'active' && (
          <motion.div
            custom={0}
            variants={cardVariants}
            initial="hidden"
            animate="visible"
            className="relative overflow-hidden rounded-xl border border-gold/20 bg-gradient-to-r from-gold/10 to-gold/5 p-4"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gold/20">
                <Gift className="h-5 w-5 text-gold" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">{t('home.welcomeCoupon')}</p>
                <p className="text-xs text-gold-light">{t('home.couponDesc')}</p>
              </div>
              <ChevronRight className="h-4 w-4 text-gold/50" />
            </div>
          </motion.div>
        )}

        {/* Next Appointment */}
        <motion.div
          custom={1}
          variants={cardVariants}
          initial="hidden"
          animate="visible"
          className="rounded-xl border border-border bg-card p-4"
        >
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-foreground">{t('home.nextAppointment')}</h3>
            <CalendarPlus className="h-4 w-4 text-muted-foreground" />
          </div>

          {loading || nextAppointment === undefined ? (
            <div className="space-y-2">
              <div className="h-3 w-32 animate-pulse rounded bg-muted" />
              <div className="h-3 w-20 animate-pulse rounded bg-muted" />
            </div>
          ) : nextAppointment ? (
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">
                {new Date(nextAppointment.start_at).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}
              </p>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Clock size={11} />
                  {new Date(nextAppointment.start_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                </span>
                {nextAppointment.location_name && (
                  <span className="flex items-center gap-1">
                    <MapPin size={11} />
                    {nextAppointment.location_name}
                  </span>
                )}
              </div>
              <Button
                onClick={() => navigate('/appointments')}
                size="sm"
                variant="outline"
                className="mt-1 border-gold/40 text-gold hover:bg-gold/10 text-xs"
              >
                {t('home.viewAppointment')}
              </Button>
            </div>
          ) : (
            <>
              <p className="text-xs text-muted-foreground mb-3">{t('home.noAppointments')}</p>
              <Button
                onClick={() => navigate('/book')}
                size="sm"
                className="gradient-gold text-primary-foreground shadow-gold hover:opacity-90"
              >
                {t('home.bookNow')}
              </Button>
            </>
          )}
        </motion.div>

        {/* Loyalty */}
        <motion.div
          custom={2}
          variants={cardVariants}
          initial="hidden"
          animate="visible"
          onClick={() => navigate('/loyalty')}
          className="cursor-pointer rounded-xl border border-border bg-card p-4 transition-colors hover:border-gold/20"
        >
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-foreground">{t('home.loyalty')}</h3>
            <Star className="h-4 w-4 text-gold" />
          </div>
          {loading ? (
            <div className="flex gap-6">
              <div className="space-y-1">
                <div className="h-7 w-12 animate-pulse rounded bg-muted" />
                <div className="h-3 w-10 animate-pulse rounded bg-muted" />
              </div>
              <div className="space-y-1">
                <div className="h-7 w-8 animate-pulse rounded bg-muted" />
                <div className="h-3 w-10 animate-pulse rounded bg-muted" />
              </div>
            </div>
          ) : (
            <div className="flex gap-6">
              <div>
                <p className="font-display text-2xl text-gold">{points}</p>
                <p className="text-xs text-muted-foreground">{t('home.points')}</p>
              </div>
              <div>
                <p className="font-display text-2xl text-foreground">{visits}</p>
                <p className="text-xs text-muted-foreground">{t('home.visits')}</p>
              </div>
            </div>
          )}
        </motion.div>

        {/* Quick actions */}
        <div className={`grid ${isClubMember ? 'grid-cols-1' : 'grid-cols-2'} gap-3`}>
          {!isClubMember && (
            <motion.div
              custom={3}
              variants={cardVariants}
              initial="hidden"
              animate="visible"
              onClick={() => navigate('/club')}
              className="cursor-pointer rounded-xl border border-border bg-card p-4 transition-colors hover:border-gold/20"
            >
              <Crown className="mb-2 h-5 w-5 text-gold" />
              <p className="text-sm font-medium text-foreground">{t('home.club')}</p>
            </motion.div>
          )}

          <motion.div
            custom={4}
            variants={cardVariants}
            initial="hidden"
            animate="visible"
            onClick={() => navigate('/promos')}
            className="cursor-pointer rounded-xl border border-border bg-card p-4 transition-colors hover:border-gold/20"
          >
            <Tag className="mb-2 h-5 w-5 text-gold" />
            <p className="text-sm font-medium text-foreground">{t('home.promos')}</p>
          </motion.div>
        </div>
      </div>

      <BottomNav />
    </div>
  );
};

export default Home;
