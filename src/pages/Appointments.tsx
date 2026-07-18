// Pantalla "Mis Citas" (autoservicio del cliente · Salón OS).
//
// Lista las citas del cliente autenticado leídas de public.appointments con la
// política RLS SELF de solo lectura de sub-7 (solo ve las suyas). Toda la lógica de
// datos vive en useAppointments (efectos) y en lib/appointments (transformación
// pura); esta capa es SOLO presentación: pestañas próximas/historial y los tres
// estados legibles que pide la subtarea —carga, vacío y error—.
//
// Sin acciones de escritura (cancelar/reprogramar): la política de sub-7 es de SOLO
// LECTURA para el cliente. Reservar/cancelar desde la app, si algún día se abre, irá
// por una RPC controlada (fuera del alcance de esta subtarea).
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  CalendarDays,
  CalendarPlus,
  Clock,
  RefreshCw,
} from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { useI18n } from '@/lib/i18n';
import { useAppointments } from '@/hooks/useAppointments';
import BottomNav from '@/components/BottomNav';
import {
  formatDateParts,
  formatDuration,
  formatLongDate,
  formatPrice,
  formatTimeRange,
  statusLabelKey,
  STATUS_BADGE_CLASS,
  type AppointmentTab,
  type EnrichedAppointment,
} from '@/lib/appointments';

const TABS: readonly AppointmentTab[] = ['upcoming', 'history'];

/** Contexto de formateo: locale de la app + zona horaria del salón (del catálogo). */
interface Fmt {
  locale: string;
  timeZone: string | null;
}

// ── Tarjeta de una cita ──────────────────────────────────────────────────────────

const AppointmentCard = ({
  appointment,
  fmt,
  catalogPending,
  index,
  reduceMotion,
}: {
  appointment: EnrichedAppointment;
  fmt: Fmt;
  catalogPending: boolean;
  index: number;
  reduceMotion: boolean;
}) => {
  const { t } = useI18n();
  const { day, month, weekday } = formatDateParts(appointment.starts_at, fmt);
  const timeRange = formatTimeRange(appointment.starts_at, appointment.ends_at, fmt);
  const duration = formatDuration(appointment.durationMinutes);
  const price = formatPrice(appointment.price_cents, appointment.currency, fmt.locale);
  // Título: el servicio; mientras el catálogo carga mostramos un placeholder en vez
  // de un genérico que luego "salte" al nombre real. Sin catálogo → rótulo genérico.
  const title = appointment.serviceName ?? (catalogPending ? null : t('appointments.generic'));

  return (
    <motion.li
      initial={reduceMotion ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        delay: reduceMotion ? 0 : index * 0.05,
        type: 'spring',
        stiffness: 300,
        damping: 30,
      }}
      className="rounded-2xl border border-border bg-card p-4"
    >
      {/* Fecha completa para lectores de pantalla (la regleta visual es decorativa). */}
      <span className="sr-only">{formatLongDate(appointment.starts_at, fmt)}. </span>

      <div className="flex gap-4">
        {/* Regleta de fecha (decorativa) */}
        <div
          aria-hidden="true"
          className="flex shrink-0 flex-col items-center justify-center rounded-xl bg-gold/10 px-3 py-2 ring-1 ring-gold/15"
        >
          <span className="text-[10px] font-medium uppercase tracking-wider text-gold/70">
            {weekday}
          </span>
          <span className="font-display text-2xl leading-none text-gold">{day}</span>
          <span className="text-[10px] font-medium uppercase tracking-wider text-gold/70">
            {month}
          </span>
        </div>

        {/* Contenido */}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            {title === null ? (
              <span className="mt-1 block h-4 w-32 animate-pulse rounded bg-muted" aria-hidden="true" />
            ) : (
              <h3 className="truncate font-display text-base text-foreground">{title}</h3>
            )}
            <span
              className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${STATUS_BADGE_CLASS[appointment.status]}`}
            >
              {t(statusLabelKey(appointment.status))}
            </span>
          </div>

          {appointment.professionalName && (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {t('appointments.with')} {appointment.professionalName}
            </p>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Clock size={12} aria-hidden="true" />
              <time dateTime={appointment.starts_at}>{timeRange}</time>
            </span>
            {duration && (
              <>
                <span aria-hidden="true">·</span>
                <span>{duration}</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Pie: precio de la cita (snapshot guardado en la propia cita) */}
      {appointment.price_cents > 0 && (
        <div className="mt-3 flex items-center justify-end border-t border-border/60 pt-2.5">
          <span className="text-sm font-semibold text-foreground">{price}</span>
        </div>
      )}
    </motion.li>
  );
};

// ── Estados: carga / error / vacío ───────────────────────────────────────────────

const LoadingSkeleton = () => {
  const { t } = useI18n();
  return (
    <div role="status" aria-live="polite" className="space-y-3">
      <span className="sr-only">{t('appointments.loadingLabel')}</span>
      {[0, 1, 2].map((i) => (
        <div key={i} className="rounded-2xl border border-border bg-card p-4">
          <div className="flex gap-4">
            <div className="h-14 w-14 shrink-0 animate-pulse rounded-xl bg-muted" />
            <div className="flex-1 space-y-2 py-1">
              <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
              <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
              <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

const ErrorState = ({ onRetry }: { onRetry: () => void }) => {
  const { t } = useI18n();
  return (
    <div role="alert" className="flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
        <AlertTriangle className="h-7 w-7 text-destructive" aria-hidden="true" />
      </div>
      <h2 className="mb-2 font-display text-xl text-foreground">{t('appointments.error.title')}</h2>
      <p className="mb-6 max-w-xs text-sm leading-relaxed text-muted-foreground">
        {t('appointments.error.body')}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex h-11 items-center justify-center gap-2 rounded-lg gradient-gold px-6 text-sm font-semibold text-primary-foreground shadow-gold transition-opacity hover:opacity-90"
      >
        <RefreshCw className="h-4 w-4" aria-hidden="true" />
        {t('general.retry')}
      </button>
    </div>
  );
};

const EmptyState = ({ tab, onBook }: { tab: AppointmentTab; onBook: () => void }) => {
  const { t } = useI18n();
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-gold/10 ring-1 ring-gold/15">
        <CalendarDays className="h-7 w-7 text-gold" aria-hidden="true" />
      </div>
      <p className="mb-6 max-w-xs text-sm leading-relaxed text-muted-foreground">
        {tab === 'upcoming' ? t('appointments.noUpcoming') : t('appointments.noHistory')}
      </p>
      {tab === 'upcoming' && (
        <button
          type="button"
          onClick={onBook}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-lg gradient-gold px-6 text-sm font-semibold text-primary-foreground shadow-gold transition-opacity hover:opacity-90"
        >
          <CalendarPlus className="h-4 w-4" aria-hidden="true" />
          {t('appointments.bookCta')}
        </button>
      )}
    </div>
  );
};

// ── Pantalla ─────────────────────────────────────────────────────────────────────

const Appointments = () => {
  const navigate = useNavigate();
  const { t, locale } = useI18n();
  const reduceMotion = useReducedMotion() ?? false;
  const {
    isLoading,
    isError,
    refetch,
    upcoming,
    history,
    catalogPending,
    timezone,
  } = useAppointments();

  const [tab, setTab] = useState<AppointmentTab>('upcoming');
  const active = tab === 'upcoming' ? upcoming : history;
  const fmt: Fmt = { locale, timeZone: timezone };

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="px-6 pt-12 pb-4">
        <h1 className="font-display text-3xl text-foreground">{t('appointments.title')}</h1>
      </div>

      {/* Pestañas */}
      <div
        role="tablist"
        aria-label={t('appointments.title')}
        className="mx-6 mb-4 flex gap-1 rounded-lg bg-muted p-1"
      >
        {TABS.map((tabKey) => {
          const selected = tab === tabKey;
          const count = tabKey === 'upcoming' ? upcoming.length : history.length;
          return (
            <button
              key={tabKey}
              type="button"
              role="tab"
              id={`tab-${tabKey}`}
              aria-selected={selected}
              aria-controls={`panel-${tabKey}`}
              onClick={() => setTab(tabKey)}
              className={`flex-1 rounded-md py-2 text-xs font-medium transition-all ${
                selected ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
              }`}
            >
              {t(tabKey === 'upcoming' ? 'appointments.upcoming' : 'appointments.history')}
              {!isLoading && !isError && count > 0 && (
                <span className="ml-1.5 text-gold">{count}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Panel de la pestaña activa */}
      <div id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`} className="px-6">
        {isLoading ? (
          <LoadingSkeleton />
        ) : isError ? (
          <ErrorState onRetry={refetch} />
        ) : active.length === 0 ? (
          <EmptyState tab={tab} onBook={() => navigate('/book')} />
        ) : (
          <ul className="space-y-3">
            {active.map((appointment, i) => (
              <AppointmentCard
                key={appointment.id}
                appointment={appointment}
                fmt={fmt}
                catalogPending={catalogPending}
                index={i}
                reduceMotion={reduceMotion}
              />
            ))}
          </ul>
        )}
      </div>

      <BottomNav />
    </div>
  );
};

export default Appointments;
