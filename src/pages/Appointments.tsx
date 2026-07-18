import { CalendarDays } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import PlaceholderPage from '@/pages/PlaceholderPage';

/**
 * Appointment management is out of scope for the current Salon OS migration phase.
 *
 * The original screen (upcoming/history tabs, realtime updates, cancel and
 * reschedule flows backed by the legacy `appointments` / `appointment_services`
 * tables and `RescheduleDialog`) is preserved verbatim in
 * `src/pages/_deferred/reservations-3B-2/` and will be re-integrated with the
 * Salon OS booking engine in sub-fase 3B-2.
 *
 * Until then this route renders a graceful "Próximamente" state so the build
 * stays green against the new Salon OS database schema.
 */
const Appointments = () => {
  const { t } = useI18n();

  return (
    <PlaceholderPage
      title={t('appointments.title')}
      description={t('comingSoon.appointments')}
      icon={<CalendarDays size={34} />}
    />
  );
};

export default Appointments;
