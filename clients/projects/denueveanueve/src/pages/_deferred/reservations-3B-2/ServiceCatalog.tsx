import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Clock, Star, ChevronDown, ChevronUp } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { supabase } from '@/integrations/supabase/client';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import BottomNav from '@/components/BottomNav';
import type { Tables } from '@/integrations/supabase/types';

type Service = Tables<'services'>;
type ServiceCategory = Tables<'service_categories'>;

// Prices removed from catalog

const ServiceCatalog = () => {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [expandedCat, setExpandedCat] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const [catRes, svcRes] = await Promise.all([
        supabase.from('service_categories').select('*').order('sort_order'),
        supabase.from('services').select('*').eq('active', true).order('name'),
      ]);
      setCategories(catRes.data || []);
      setServices(svcRes.data || []);
      setLoading(false);
      if (catRes.data && catRes.data.length > 0) {
        setExpandedCat(catRes.data[0].id);
      }
    };
    load();
  }, []);

  const servicesByCategory = (catId: string) =>
    services.filter((s) => s.category_id === catId);

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="px-6 pt-12 pb-4">
        <button
          onClick={() => navigate(-1)}
          className="mb-4 flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft size={18} />
          <span className="text-sm">{t('general.back')}</span>
        </button>
        <h1 className="font-display text-3xl text-foreground">{t('catalog.title')}</h1>
        <p className="text-xs text-muted-foreground mt-1">{t('catalog.subtitle')}</p>
      </div>

      {loading ? (
        <div className="px-6 space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      ) : (
        <div className="px-6 space-y-3">
          {categories.map((cat) => {
            const isExpanded = expandedCat === cat.id;
            const catServices = servicesByCategory(cat.id);
            return (
              <div key={cat.id} className="rounded-xl border border-border bg-card overflow-hidden">
                <button
                  onClick={() => setExpandedCat(isExpanded ? null : cat.id)}
                  className="w-full flex items-center justify-between p-4"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-foreground">{cat.name}</span>
                    <span className="text-[10px] text-muted-foreground bg-muted rounded-full px-2 py-0.5">
                      {catServices.length}
                    </span>
                  </div>
                  {isExpanded ? (
                    <ChevronUp size={16} className="text-muted-foreground" />
                  ) : (
                    <ChevronDown size={16} className="text-muted-foreground" />
                  )}
                </button>

                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="divide-y divide-border border-t border-border">
                        {catServices.map((svc) => (
                          <div key={svc.id} className="px-4 py-3">
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <p className="text-sm text-foreground">{svc.name}</p>
                                {svc.description && (
                                  <p className="text-[11px] text-muted-foreground mt-0.5">{svc.description}</p>
                                )}
                                <div className="flex items-center gap-3 mt-1.5">
                                  {svc.duration_min && (
                                    <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                                      <Clock size={10} /> {svc.duration_min} min
                                    </span>
                                  )}
                                  {svc.fixed_points && (
                                    <span className="flex items-center gap-1 text-[11px] text-gold">
                                      <Star size={10} /> {svc.fixed_points} pts
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                        {catServices.length === 0 && (
                          <p className="px-4 py-3 text-xs text-muted-foreground">
                            {t('catalog.noServices')}
                          </p>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}

          <div className="pt-4">
            <Button
              onClick={() => navigate('/book')}
              className="w-full gradient-gold text-primary-foreground shadow-gold"
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
