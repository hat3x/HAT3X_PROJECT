import { Scissors } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import PlaceholderPage from '@/pages/PlaceholderPage';

/**
 * The service catalog is out of scope for the current Salon OS migration phase.
 *
 * The original catalog (category accordions backed by the legacy
 * `service_categories` / `services` tables) is preserved verbatim in
 * `src/pages/_deferred/reservations-3B-2/ServiceCatalog.tsx` and will be rebuilt
 * against the Salon OS `services` schema in sub-fase 3B-2.
 *
 * Until then this route renders a graceful "Próximamente" state so the build
 * stays green against the new Salon OS database schema.
 */
const ServiceCatalog = () => {
  const { t } = useI18n();

  return (
    <PlaceholderPage
      title={t('catalog.title')}
      description={t('comingSoon.services')}
      icon={<Scissors size={34} />}
    />
  );
};

export default ServiceCatalog;
