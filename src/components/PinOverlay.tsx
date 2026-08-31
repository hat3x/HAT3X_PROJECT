import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldCheck, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useI18n } from '@/lib/i18n';
import { useCustomer } from '@/hooks/useCustomer';

const PinOverlay = () => {
  const { t } = useI18n();
  const { customerId } = useCustomer();
  const [pin, setPin] = useState<string | null>(null);

  // Subscribe to Realtime visit_pins changes
  useEffect(() => {
    if (!customerId) return;

    const channel = supabase
      .channel(`visit-pin-${customerId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'visit_pins',
          filter: `customer_id=eq.${customerId}`,
        },
        (payload) => {
          const row = payload.new as { pin: string; status: string };
          if (row.status === 'PENDING') {
            setPin(row.pin);
            setTimeout(() => setPin(null), 120_000);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'visit_pins',
          filter: `customer_id=eq.${customerId}`,
        },
        (payload) => {
          const row = payload.new as { used: boolean };
          if (row.used) {
            setPin(null);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [customerId]);

  return (
    <AnimatePresence>
      {pin && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="pin-overlay-title"
          className="fixed inset-0 z-[200] flex items-center justify-center bg-background/95 backdrop-blur-sm px-8"
        >
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            transition={{ type: 'spring', damping: 20, stiffness: 300 }}
            className="relative w-full max-w-sm rounded-2xl border border-gold/30 bg-card p-8 shadow-elevated text-center"
          >
            <button
              onClick={() => setPin(null)}
              aria-label={t('general.close')}
              className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X size={20} />
            </button>

            <div className="flex justify-center mb-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gold/20">
                <ShieldCheck className="h-7 w-7 text-gold" />
              </div>
            </div>

            <h2 id="pin-overlay-title" className="font-display text-xl text-foreground mb-1">
              {t('pin.title')}
            </h2>
            <p className="text-sm text-muted-foreground mb-6">
              {t('pin.description')}
            </p>

            <div className="flex justify-center gap-3 mb-6">
              {pin.split('').map((digit, i) => (
                <motion.div
                  key={i}
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: i * 0.1 }}
                  className="flex h-16 w-14 items-center justify-center rounded-xl border-2 border-gold/40 bg-gold/10"
                >
                  <span className="font-display text-3xl text-gold">{digit}</span>
                </motion.div>
              ))}
            </div>

            <p className="text-xs text-muted-foreground">
              {t('pin.showToStaff')}
            </p>

            {/* Pulsing indicator */}
            <div className="mt-4 flex items-center justify-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-gold opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-gold" />
              </span>
              <span className="text-[10px] text-muted-foreground">{t('pin.active')}</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default PinOverlay;
