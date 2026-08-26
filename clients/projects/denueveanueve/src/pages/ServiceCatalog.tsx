// Catálogo de servicios del cliente sobre la API PÚBLICA de Salón OS.
//
// Lee el catálogo con el endpoint anónimo `bootstrap` (mismo cache que el asistente de
// reserva y "Mis Citas": queryKey ['salon-bootstrap', slug]). Salón OS dejó el catálogo
// PLANO (sin tabla de categorías): se agrupa por el texto libre `category` con la lógica
// pura groupServicesByCategory (los servicios sin categoría caen en "Otros", al final).
//
// Es sólo lectura: cada servicio enlaza al asistente de reserva preseleccionado
// (/book?serviceId=…) y hay un CTA general para reservar. Ninguna aritmética de negocio
// vive aquí; duración y precio se muestran tal cual los da el catálogo.
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, ChevronDown, ChevronUp, Clock, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useI18n } from '@/lib/i18n';
import { useSalonOsApi } from '@/config/salon-os';
import { groupServicesByCategory } from '@/lib/booking';
import { formatDuration, formatPrice } from '@/lib/appointments';
import { Button } from '@/components/ui/button';
import BottomNav from '@/components/BottomNav';

const ServiceCatalog = () => {
  const navigate = useNavigate();
  const { t, locale } = useI18n();
  const api = useSalonOsApi();
  const slug = api.slug;

  const bootstrapQuery = useQuery({
    queryKey: ['salon-bootstrap', slug],
    queryFn: ({ signal }) => api.getBootstrap(signal),
    staleTime: 1000 * 60 * 30,
    gcTime: 1000 * 60 * 60,
    retry: 1,
  });

  const groups = useMemo(
    () =>
      bootstrapQuery.data
        ? groupServicesByCategory(bootstrapQuery.data.services, t('book.otherCategory'))
        : [],
    [bootstrapQuery.data, t],
  );

  // Primera categoría abierta por defecto (se fija tras cargar, sin efecto: derivado).
  const [expanded, setExpanded] = useState<string | null>(null);
  const activeCategory = expanded ?? groups[0]?.category ?? null;

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="px-6 pt-12 pb-4">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="mb-4 flex items-center gap-2 text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft size={18} aria-hidden="true" />
          <span className="text-sm">{t('general.back')}</span>
        </button>
        <h1 className="font-display text-3xl text-foreground">{t('catalog.title')}</h1>
        <p className="mt-1 text-xs text-muted-foreground">{t('catalog.subtitle')}</p>
      </div>

      {bootstrapQuery.isPending ? (
        <div className="space-y-3 px-6">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      ) : bootstrapQuery.isError ? (
        <div role="alert" className="flex flex-col items-center justify-center px-6 py-16 text-center">
          <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
            <AlertTriangle className="h-7 w-7 text-destructive" aria-hidden="true" />
          </div>
          <p className="mb-6 max-w-xs text-sm leading-relaxed text-muted-foreground">{t('catalog.loadError')}</p>
          <button
            type="button"
            onClick={() => void bootstrapQuery.refetch()}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-lg gradient-gold px-6 text-sm font-semibold text-primary-foreground shadow-gold transition-opacity hover:opacity-90"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            {t('general.retry')}
          </button>
        </div>
      ) : groups.length === 0 ? (
        <p className="px-6 py-10 text-center text-sm text-muted-foreground">{t('book.noServices')}</p>
      ) : (
        <div className="space-y-3 px-6">
          {groups.map(({ category, services }) => {
            const isOpen = activeCategory === category;
            return (
              <div key={category} className="overflow-hidden rounded-xl border border-border bg-card">
                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? '' : category)}
                  aria-expanded={isOpen}
                  className="flex w-full items-center justify-between p-4"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-foreground">{category}</span>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                      {services.length}
                    </span>
                  </div>
                  {isOpen ? (
                    <ChevronUp size={16} className="text-muted-foreground" aria-hidden="true" />
                  ) : (
                    <ChevronDown size={16} className="text-muted-foreground" aria-hidden="true" />
                  )}
                </button>

                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <ul className="divide-y divide-border border-t border-border">
                        {services.map((svc) => (
                          <li key={svc.id}>
                            <button
                              type="button"
                              onClick={() => navigate(`/book?serviceId=${encodeURIComponent(svc.id)}`)}
                              className="w-full px-4 py-3 text-left transition-colors hover:bg-muted/40"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="text-sm text-foreground">{svc.name}</p>
                                  {svc.description && (
                                    <p className="mt-0.5 text-[11px] text-muted-foreground">{svc.description}</p>
                                  )}
                                  <div className="mt-1.5 flex items-center gap-3 text-[11px] text-muted-foreground">
                                    {svc.durationMinutes > 0 && (
                                      <span className="inline-flex items-center gap-1">
                                        <Clock size={10} aria-hidden="true" /> {formatDuration(svc.durationMinutes)}
                                      </span>
                                    )}
                                  </div>
                                </div>
                                {svc.priceCents > 0 && (
                                  <span className="shrink-0 text-sm font-medium text-gold">
                                    {formatPrice(svc.priceCents, svc.currency, locale)}
                                  </span>
                                )}
                              </div>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}

          <div className="pt-4">
            <Button
              onClick={() => navigate('/book')}
              className="w-full gradient-gold text-primary-foreground shadow-gold hover:opacity-90"
            >
              {t('catalog.bookNow')}
            </Button>
          </div>
        </div>
      )}

      <BottomNav />
    </div>
  );
};

export default ServiceCatalog;
