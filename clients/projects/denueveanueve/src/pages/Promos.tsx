import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Tag, CalendarPlus, MessageCircle, Clock } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import BottomNav from '@/components/BottomNav';
import type { Tables } from '@/integrations/supabase/types';

type Campaign = Tables<'campaigns'>;

const Promos = () => {
  const navigate = useNavigate();
  const { t } = useI18n();
  const { user } = useAuth();

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      // Campaigns are managed by staff — we show SENT campaigns as promos to customers
      const { data } = await supabase
        .from('campaigns')
        .select('*')
        .eq('status', 'SENT')
        .order('sent_at', { ascending: false })
        .limit(20);

      setCampaigns(data || []);
      setLoading(false);
    };
    load();
  }, []);

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="px-6 pt-12 pb-4">
        <button onClick={() => navigate(-1)} className="mb-4 flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft size={18} />
          <span className="text-sm">{t('general.back')}</span>
        </button>
        <h1 className="font-display text-3xl text-foreground">{t('promos.title')}</h1>
      </div>

      <div className="px-6 space-y-3">
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <div key={i} className="h-32 animate-pulse rounded-xl bg-muted" />)}
          </div>
        ) : campaigns.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Tag className="mb-4 h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{t('promos.noPromos')}</p>
          </div>
        ) : (
          campaigns.map((c, i) => (
            <motion.div
              key={c.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="rounded-xl border border-border bg-card p-4"
            >
              <div className="flex items-start justify-between mb-2">
                <h3 className="text-sm font-medium text-foreground">{c.name}</h3>
                {c.scheduled_at && new Date(c.scheduled_at).getTime() - Date.now() < 7 * 86400000 && (
                  <span className="flex items-center gap-1 text-[10px] text-warning">
                    <Clock size={10} /> {t('promos.expiringSoon')}
                  </span>
                )}
              </div>
              {c.offer_text && (
                <p className="text-xs text-muted-foreground mb-3">{c.offer_text}</p>
              )}
              <div className="flex gap-2">
                <Button size="sm" onClick={() => navigate('/book')} className="gradient-gold text-primary-foreground text-xs">
                  <CalendarPlus size={14} /> {t('promos.bookNow')}
                </Button>
                {c.cta_url && (
                  <Button size="sm" variant="outline" className="text-xs" onClick={() => window.open(c.cta_url, '_blank')}>
                    <MessageCircle size={14} /> {t('promos.whatsapp')}
                  </Button>
                )}
              </div>
            </motion.div>
          ))
        )}
      </div>

      <BottomNav />
    </div>
  );
};

export default Promos;
