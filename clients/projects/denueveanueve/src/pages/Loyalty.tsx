import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Star, Gift, ArrowUpRight, ArrowDownRight, Clock, Award, Ticket, QrCode, X, Maximize2 } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useI18n } from '@/lib/i18n';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';
import { motion, AnimatePresence } from 'framer-motion';
import BottomNav from '@/components/BottomNav';
import type { Tables } from '@/integrations/supabase/types';

type LoyaltyAccount = Tables<'loyalty_accounts'>;
type PointsMovement = Tables<'points_movements'>;
type Reward = Tables<'rewards'>;
type WelcomeCoupon = Tables<'welcome_coupons'>;

const MILESTONES = [
  { visits: 3, key: '3', icon: Award },
  { visits: 5, key: '5', icon: Gift },
  { visits: 8, key: '8', icon: Ticket },
  { visits: 10, key: '10', icon: Star },
];

const MOVEMENT_ICONS: Record<string, typeof ArrowUpRight> = {
  EARN: ArrowUpRight,
  REDEEM: ArrowDownRight,
  ADJUST: Clock,
  EXPIRE: Clock,
};

const Loyalty = () => {
  const navigate = useNavigate();
  const { t } = useI18n();
  const { user } = useAuth();

  const [tab, setTab] = useState<'overview' | 'movements' | 'rewards'>('overview');
  const [account, setAccount] = useState<LoyaltyAccount | null>(null);
  const [movements, setMovements] = useState<PointsMovement[]>([]);
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [coupon, setCoupon] = useState<WelcomeCoupon | null>(null);
  const [qrToken, setQrToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCode, setShowCode] = useState<string | null>(null);
  const [showQr, setShowQr] = useState(false);
  const [qrFullscreen, setQrFullscreen] = useState(false);
  const [pendingPoints, setPendingPoints] = useState(0);

  const [customerId, setCustomerId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Get customer id and qr_token once
  useEffect(() => {
    if (!user) return;
    supabase.from('customers').select('id, qr_token').eq('user_id', user.id).single().then(({ data }) => {
      if (data) {
        setCustomerId(data.id);
        setQrToken(data.qr_token);
      }
    });
  }, [user]);

  // Realtime: listen for loyalty_accounts and appointments changes to auto-refresh
  useEffect(() => {
    if (!customerId) return;
    const channel = supabase
      .channel(`loyalty-refresh-${customerId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'loyalty_accounts', filter: `customer_id=eq.${customerId}` }, () => {
        setRefreshKey((k) => k + 1);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments', filter: `customer_id=eq.${customerId}` }, () => {
        setRefreshKey((k) => k + 1);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'welcome_coupons', filter: `customer_id=eq.${customerId}` }, () => {
        setRefreshKey((k) => k + 1);
      })
      .subscribe();

    // Fallback: refresh when user returns to the app
    const onVisibility = () => {
      if (document.visibilityState === 'visible') setRefreshKey((k) => k + 1);
    };
    document.addEventListener('visibilitychange', onVisibility);

    // Periodic poll every 15s
    const interval = setInterval(() => setRefreshKey((k) => k + 1), 15000);

    return () => {
      supabase.removeChannel(channel);
      document.removeEventListener('visibilitychange', onVisibility);
      clearInterval(interval);
    };
  }, [customerId]);

  useEffect(() => {
    if (!customerId) return;
    const load = async () => {
      setLoading(true);

      const [loyaltyRes, movementsRes, rewardsRes, couponRes, pendingRes] = await Promise.all([
        supabase.from('loyalty_accounts').select('*').eq('customer_id', customerId).single(),
        supabase.from('points_movements').select('*').eq('customer_id', customerId).order('created_at', { ascending: false }).limit(50),
        supabase.from('rewards').select('*').eq('customer_id', customerId).order('created_at', { ascending: false }),
        supabase.from('welcome_coupons').select('*').eq('customer_id', customerId).single(),
        supabase.from('appointments').select('estimated_pending_points').eq('customer_id', customerId).in('status', ['CONFIRMED', 'RESCHEDULED']).gte('start_at', new Date().toISOString()),
      ]);

      setAccount(loyaltyRes.data);
      setMovements(movementsRes.data || []);
      setRewards(rewardsRes.data || []);
      setCoupon(couponRes.data);

      const total = (pendingRes.data || []).reduce((sum, a) => sum + (a.estimated_pending_points || 0), 0);
      setPendingPoints(total);

      setLoading(false);
    };
    load();
  }, [customerId, refreshKey]);

  const REWARD_STATUS_COLOR: Record<string, string> = {
    AVAILABLE: 'text-success',
    REDEEMED: 'text-muted-foreground',
    EXPIRED: 'text-destructive',
  };

  // Fullscreen QR overlay
  if (qrFullscreen && qrToken) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] bg-background flex flex-col items-center justify-center px-8"
      >
        <button onClick={() => setQrFullscreen(false)} className="absolute top-12 right-6 p-2 text-muted-foreground hover:text-foreground">
          <X size={24} />
        </button>
        <h2 className="font-display text-2xl text-foreground mb-2">{t('loyalty.myQr')}</h2>
        <p className="text-sm text-muted-foreground mb-8 text-center">{t('loyalty.showQrAtSalon')}</p>
        <div className="rounded-2xl bg-white p-6 shadow-elevated">
          <QRCodeSVG value={qrToken} size={280} level="H" fgColor="#1a1712" bgColor="#ffffff" />
        </div>
        <p className="mt-6 text-xs text-muted-foreground font-mono tracking-widest">{qrToken.substring(0, 8).toUpperCase()}</p>
      </motion.div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="px-6 pt-12 pb-4">
        <h1 className="font-display text-3xl text-foreground">{t('loyalty.title')}</h1>
      </div>

      {loading ? (
        <div className="px-6 space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-20 animate-pulse rounded-xl bg-muted" />)}
        </div>
      ) : (
        <>
          {/* QR Card */}
          <div className="px-6 mb-4">
            <motion.button
              onClick={() => setShowQr(!showQr)}
              className="w-full rounded-xl border border-gold/20 bg-gradient-to-r from-gold/10 to-gold/5 p-4 transition-colors"
              whileTap={{ scale: 0.98 }}
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gold/20">
                  <QrCode className="h-5 w-5 text-gold" />
                </div>
                <div className="flex-1 text-left">
                  <p className="text-sm font-medium text-foreground">{t('loyalty.myQr')}</p>
                  <p className="text-xs text-muted-foreground">{t('loyalty.myQrDesc')}</p>
                </div>
              </div>
            </motion.button>

            <AnimatePresence>
              {showQr && qrToken && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mt-3 flex flex-col items-center rounded-xl border border-border bg-card p-6"
                >
                  <div className="rounded-xl bg-white p-4">
                    <QRCodeSVG value={qrToken} size={200} level="H" fgColor="#1a1712" bgColor="#ffffff" />
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground text-center">{t('loyalty.showQrAtSalon')}</p>
                  <button
                    onClick={() => setQrFullscreen(true)}
                    className="mt-3 flex items-center gap-1.5 text-xs text-gold hover:opacity-80 transition-opacity"
                  >
                    <Maximize2 size={12} /> {t('loyalty.enlargeQr')}
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Stats Cards */}
          <div className="flex gap-3 px-6 mb-4">
            <div className="flex-1 rounded-xl border border-border bg-card p-4 text-center">
              <p className="font-display text-3xl text-gold">{account?.points_balance || 0}</p>
              <p className="text-xs text-muted-foreground">{t('loyalty.points')}</p>
            </div>
            <div className="flex-1 rounded-xl border border-border bg-card p-4 text-center">
              <p className="font-display text-3xl text-foreground">{account?.visits_total || 0}</p>
              <p className="text-xs text-muted-foreground">{t('loyalty.visits')}</p>
            </div>
          </div>

          {/* Pending points banner */}
          {pendingPoints > 0 && (
            <div className="mx-6 mb-4 rounded-xl border border-gold/20 bg-gold/5 p-3">
              <div className="flex items-center gap-2">
                <Clock size={14} className="text-gold" />
                <div>
                  <p className="text-sm text-gold font-medium">
                    {pendingPoints} {t('loyalty.pendingPoints')}
                  </p>
                  <p className="text-[10px] text-muted-foreground">{t('loyalty.pendingPointsDesc')}</p>
                </div>
              </div>
            </div>
          )}

          {/* Milestones */}
          <div className="px-6 mb-4">
            <h3 className="text-sm font-medium text-foreground mb-3">{t('loyalty.milestones')}</h3>
            <div className="flex items-start justify-between">
              {MILESTONES.map((m) => {
                const Icon = m.icon;
                const reached = (account?.visits_total || 0) >= m.visits;
                return (
                  <div key={m.key} className="flex flex-col items-center flex-1">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-full border-2 transition-colors ${reached ? 'border-gold bg-gold/20' : 'border-border bg-card'}`}>
                      <Icon size={18} className={reached ? 'text-gold' : 'text-muted-foreground'} />
                    </div>
                    <span className="text-[10px] text-muted-foreground mt-1">{m.visits}v</span>
                    <span className="text-[9px] text-muted-foreground text-center leading-tight h-[24px] flex items-start justify-center w-[60px]">
                      {t(`loyalty.milestone.${m.key}`)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mx-6 mb-4 rounded-lg bg-muted p-1">
            {(['overview', 'movements', 'rewards'] as const).map((t2) => (
              <button key={t2} onClick={() => setTab(t2)} className={`flex-1 rounded-md py-2 text-xs font-medium transition-all ${tab === t2 ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'}`}>
                {t2 === 'overview' ? t('loyalty.coupon') : t(`loyalty.${t2}`)}
              </button>
            ))}
          </div>

          <div className="px-6">
            {tab === 'overview' && (
              <div className="space-y-3">
                {coupon ? (
                  <div className={`rounded-xl border p-4 ${coupon.status === 'ACTIVE' ? 'border-gold/20 bg-gold/5' : 'border-border bg-card'}`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Gift className={`h-5 w-5 ${coupon.status === 'ACTIVE' ? 'text-gold' : 'text-muted-foreground'}`} />
                        <span className="text-sm font-medium text-foreground">3€ {t('loyalty.coupon')}</span>
                      </div>
                      <span className={`text-xs font-medium ${coupon.status === 'ACTIVE' ? 'text-gold' : 'text-muted-foreground'}`}>
                        {t(`loyalty.coupon${coupon.status === 'ACTIVE' ? 'Active' : coupon.status === 'USED' ? 'Used' : 'Expired'}`)}
                      </span>
                    </div>
                    {coupon.status === 'ACTIVE' && (
                      <p className="text-xs text-muted-foreground">
                        {t('loyalty.expiresAt')} {new Date(coupon.expires_at).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-8">{t('loyalty.noCoupon')}</p>
                )}
                {account?.last_visit_at && (
                  <div className="rounded-xl border border-border bg-card p-4">
                    <p className="text-xs text-muted-foreground">{t('loyalty.lastVisit')}</p>
                    <p className="text-sm text-foreground">{new Date(account.last_visit_at).toLocaleDateString()}</p>
                  </div>
                )}
              </div>
            )}

            {tab === 'movements' && (
              <div className="space-y-2">
                {movements.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">{t('loyalty.noMovements')}</p>
                ) : movements.map((m, i) => {
                  const Icon = MOVEMENT_ICONS[m.type] || Clock;
                  const isPositive = m.points > 0;
                  return (
                    <motion.div key={m.id} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
                      <Icon size={16} className={isPositive ? 'text-gold' : 'text-muted-foreground'} />
                      <div className="flex-1">
                        <p className="text-xs text-foreground">{m.reason}</p>
                        <p className="text-[10px] text-muted-foreground">{new Date(m.created_at).toLocaleDateString()}</p>
                      </div>
                      <span className={`text-sm font-medium ${isPositive ? 'text-gold' : 'text-muted-foreground'}`}>
                        {isPositive ? '+' : ''}{m.points}
                      </span>
                    </motion.div>
                  );
                })}
              </div>
            )}

            {tab === 'rewards' && (
              <div className="space-y-3">
                {rewards.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">{t('loyalty.noRewards')}</p>
                ) : rewards.map((r) => (
                  <div key={r.id} className="rounded-xl border border-border bg-card p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-foreground">
                        {t(`loyalty.milestone.${r.type === 'SCALP_DIAGNOSIS' ? '3' : r.type === 'EXPRESS_TREATMENT' ? '5' : r.type === 'RETAIL_VOUCHER' ? '8' : r.type === 'PACK_UPGRADE' ? '10' : '3'}`)}
                      </span>
                      <span className={`text-xs font-medium ${REWARD_STATUS_COLOR[r.status]}`}>
                        {t(`loyalty.reward${r.status === 'AVAILABLE' ? 'Available' : r.status === 'REDEEMED' ? 'Redeemed' : 'Expired'}`)}
                      </span>
                    </div>
                    {r.status === 'AVAILABLE' && (
                      <>
                        <p className="text-xs text-muted-foreground mb-2">
                          {t('loyalty.expiresAt')} {new Date(r.expires_at).toLocaleDateString()}
                        </p>
                        <button onClick={() => setShowCode(showCode === r.id ? null : r.id)} className="flex items-center gap-1.5 text-xs text-gold">
                          <QrCode size={14} /> {t('loyalty.showCode')}
                        </button>
                        {showCode === r.id && (
                          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="mt-3 rounded-lg bg-muted p-3 text-center">
                            <p className="font-mono text-lg tracking-widest text-foreground">{r.code}</p>
                          </motion.div>
                        )}
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      <BottomNav />
    </div>
  );
};

export default Loyalty;
