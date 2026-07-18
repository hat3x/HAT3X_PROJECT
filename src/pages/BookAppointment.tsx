import { CalendarPlus } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import PlaceholderPage from '@/pages/PlaceholderPage';

/**
 * Booking is out of scope for the current Salon OS migration phase.
 *
 * The full multi-step booking flow (location → section → services → staff →
 * datetime → confirm, with availability checks and Google Calendar sync) is
 * preserved verbatim in `src/pages/_deferred/reservations-3B-2/BookAppointment.tsx`
 * and will be re-integrated with the Salon OS booking engine in sub-fase 3B-2.
 *
 * Until then this route renders a graceful "Próximamente" state so the build
 * stays green against the new Salon OS database schema.
 */
const BookAppointment = () => {
  const { t } = useI18n();

  return (
    <PlaceholderPage
      title={t('book.title')}
      description={t('comingSoon.book')}
      icon={<CalendarPlus size={34} />}
    />
  );
};

export default BookAppointment;
