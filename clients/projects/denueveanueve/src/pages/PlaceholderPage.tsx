import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Clock3 } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { useI18n } from '@/lib/i18n';
import BottomNav from '@/components/BottomNav';

interface PlaceholderPageProps {
  /** Page heading — reuse the feature's own title so the section keeps its identity. */
  title: string;
  /** Optional supporting copy explaining what is coming. Falls back to a generic line. */
  description?: string;
  /** Optional feature icon shown inside the gold badge. Defaults to a clock. */
  icon?: ReactNode;
  /** Show the "back" affordance in the header (default: true). */
  showBack?: boolean;
  /** Render the bottom navigation bar (default: true). */
  showNav?: boolean;
}

/**
 * PlaceholderPage — graceful "Próximamente" state for features that are out of
 * scope for the current Salon OS migration phase (see sub-fase 3B-2).
 *
 * It intentionally has NO data dependencies (no Supabase types/queries), so it
 * keeps compiling regardless of database schema changes.
 */
const PlaceholderPage = ({
  title,
  description,
  icon,
  showBack = true,
  showNav = true,
}: PlaceholderPageProps) => {
  const navigate = useNavigate();
  const { t } = useI18n();
  const reduceMotion = useReducedMotion();

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="px-6 pt-12 pb-4">
        {showBack && (
          <button
            onClick={() => navigate(-1)}
            className="mb-4 flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft size={18} aria-hidden="true" />
            <span className="text-sm">{t('general.back')}</span>
          </button>
        )}
        <h1 className="font-display text-3xl text-foreground">{title}</h1>
      </div>

      <div
        role="status"
        className="flex flex-col items-center justify-center px-6 py-16 text-center"
      >
        <motion.div
          initial={reduceMotion ? false : { scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 20 }}
          className="mb-6 flex h-20 w-20 items-center justify-center rounded-full gradient-gold shadow-gold"
        >
          <span className="text-primary-foreground" aria-hidden="true">
            {icon ?? <Clock3 size={34} />}
          </span>
        </motion.div>

        <span className="mb-3 inline-flex items-center rounded-full border border-gold/30 bg-gold/10 px-3 py-1 text-[11px] font-medium uppercase tracking-wider text-gold">
          {t('comingSoon.badge')}
        </span>

        <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">
          {description ?? t('comingSoon.default')}
        </p>
      </div>

      {showNav && <BottomNav />}
    </div>
  );
};

export default PlaceholderPage;
