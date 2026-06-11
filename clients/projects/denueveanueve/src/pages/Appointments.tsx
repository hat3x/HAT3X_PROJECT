import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarDays, MapPin, Clock, MessageCircle, Star, Euro } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import BottomNav from '@/components/BottomNav';
import RescheduleDialog from '@/components/RescheduleDialog';
import { useCustomer } from '@/hooks/useCustomer';
import type { Tables } from '@/integrations/supabase/types';

type Appointment = Tables<'appointments'>;
type AppointmentService = Tables<'appointment_services'>;

type EnrichedAppointment = Appointment & {
  location_name?: string;
  services_list: AppointmentService[];
};

const STATUS_COLORS: Record<string, string> = {
  CONFIRMED: 'bg-success/20 text-success',
  RESCHEDULED: 'bg-warning/20 text-warning',
  CANCELLED: 'bg-destructive/20 text-destructive',
  COMPLETED: 'bg-muted text-muted-foreground',
  NO_SHOW: 'bg-destructive/20 text-destructive',
};

const Appointments = () => {
  const navigate = useNavigate();
  const { t } = useI18n();
  const { customerId } = useCustomer();

  const [tab, setTab] = useState<'upcoming' | 'history'>('upcoming');
  const [appointments, setAppointments] = useState<EnrichedAppointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [rescheduleApt, setRescheduleApt] = useState<Appointment | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Subscribe to realtime appointment changes to auto-refresh
  useEffect(() => {
    if (!customerId) return;
    const channel = supabase
      .channel(`appointments-${customerId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments', filter: `customer_id=eq.${customerId}` }, () => {
        setRefreshKey((k) => k + 1);
      })
      .subscribe();

    // Fallback: refresh when user returns to the app (e.g. after showing QR to staff)
    const onVisibility = () => {
      if (document.visibilityState === 'visible') setRefreshKey((k) => k + 1);
    };
    document.addEventListener('visibilitychange', onVisibility);

    // Periodic poll every 15s as extra fallback
    const interval = setInterval(() => setRefreshKey((k) => k + 1), 15000);

    return () => {
      supabase.removeChannel(channel);
      document.removeEventListener('visibilitychange', onVisibility);
      clearInterval(interval);
    };
  }, [customerId]);

  useEffect(() => {
    if (!customerId) return;
    const loadAppointments = async () => {
      setLoading(true);

      const now = new Date().toISOString();
      let query = supabase.from('appointments').select('*').eq('customer_id', customerId);

      if (tab === 'upcoming') {
        query = query.in('status', ['CONFIRMED', 'RESCHEDULED']).gte('start_at', now).order('start_at', { ascending: true });
      } else {
        query = query.in('status', ['COMPLETED', 'CANCELLED', 'NO_SHOW']).order('start_at', { ascending: false });
      }

      const { data } = await query;

      if (data && data.length > 0) {
        const aptIds = data.map((a) => a.id);
        const locIds = [...new Set(data.map((a) => a.location_id))];

        const [locsRes, servicesRes] = await Promise.all([
          supabase.from('locations').select('id, name').in('id', locIds),
          supabase.from('appointment_services').select('*').in('appointment_id', aptIds),
        ]);

        const locMap = new Map(locsRes.data?.map((l) => [l.id, l.name]) || []);
        const svcMap = new Map<string, AppointmentService[]>();
        (servicesRes.data || []).forEach((s) => {
          const list = svcMap.get(s.appointment_id) || [];
          list.push(s);
          svcMap.set(s.appointment_id, list);
        });

        setAppointments(
          data.map((a) => ({
            ...a,
            location_name: locMap.get(a.location_id) || '',
            services_list: svcMap.get(a.id) || [],
          }))
        );
      } else {
        setAppointments([]);
      }
      setLoading(false);
    };
    loadAppointments();
  }, [customerId, tab, refreshKey]);

  const handleCancel = async (id: string) => {
    if (!confirm(t('appointments.cancelConfirm'))) return;
    await supabase.from('appointments').update({ status: 'CANCELLED' }).eq('id', id);
    // Sync cancellation to Google Calendar
    supabase.functions.invoke('gcal-sync-appointments', {
      body: { action: 'delete', appointment_id: id },
    }).catch((err) => console.warn('GCal delete sync failed (non-blocking):', err));
    setAppointments((prev) => prev.filter((a) => a.id !== id));
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  };
  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="px-6 pt-12 pb-4">
        <h1 className="font-display text-3xl text-foreground">{t('appointments.title')}</h1>
      </div>

      <div className="flex gap-1 mx-6 mb-4 rounded-lg bg-muted p-1">
        {(['upcoming', 'history'] as const).map((t2) => (
          <button key={t2} onClick={() => setTab(t2)} className={`flex-1 rounded-md py-2 text-xs font-medium transition-all ${tab === t2 ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'}`}>
            {t(`appointments.${t2}`)}
          </button>
        ))}
      </div>

      <div className="px-6 space-y-3">
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <div key={i} className="h-24 animate-pulse rounded-xl bg-muted" />)}
          </div>
        ) : appointments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <CalendarDays className="mb-4 h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground mb-4">
              {tab === 'upcoming' ? t('appointments.noUpcoming') : t('appointments.noHistory')}
            </p>
            {tab === 'upcoming' && (
              <Button onClick={() => navigate('/book')} className="gradient-gold text-primary-foreground shadow-gold">
                {t('appointments.bookFirst')}
              </Button>
            )}
          </div>
        ) : (
          appointments.map((apt, i) => (
            <motion.div key={apt.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="text-sm font-medium text-foreground">{formatDate(apt.start_at)}</p>
                  <p className="text-xs text-muted-foreground">{formatTime(apt.start_at)} — {formatTime(apt.end_at)}</p>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_COLORS[apt.status] || ''}`}>
                  {t(`appointments.status.${apt.status}`)}
                </span>
              </div>

              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
                <MapPin size={12} /> {apt.location_name}
              </div>

              {/* Services */}
              {apt.services_list.length > 0 && (
                <div className="mb-2 space-y-1">
                  {apt.services_list.map((s) => (
                    <div key={s.id} className="flex items-center justify-between text-[11px]">
                      <span className="text-muted-foreground">{s.service_name_snapshot || 'Servicio'}</span>
                      <div className="flex items-center gap-2">
                        {s.unit_price_snapshot && (
                          <span className="text-muted-foreground">{Number(s.unit_price_snapshot).toFixed(2)} €</span>
                        )}
                        {s.points_snapshot && (
                          <span className="text-gold">{s.points_snapshot} pts</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Totals */}
              <div className="flex items-center gap-4 text-xs border-t border-border pt-2 mb-2">
                {apt.estimated_total_price && (
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <Euro size={10} /> {Number(apt.estimated_total_price).toFixed(2)} €
                  </span>
                )}
                {apt.estimated_total_duration && (
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <Clock size={10} /> {apt.estimated_total_duration} min
                  </span>
                )}
                {apt.estimated_pending_points && !apt.points_awarded && ['CONFIRMED', 'RESCHEDULED'].includes(apt.status) && (
                  <span className="flex items-center gap-1 text-gold">
                    <Star size={10} /> {apt.estimated_pending_points} pts {t('appointments.pending')}
                  </span>
                )}
                {apt.points_awarded && apt.final_total_points && (
                  <span className="flex items-center gap-1 text-gold">
                    <Star size={10} /> +{apt.final_total_points} pts
                  </span>
                )}
              </div>

              {tab === 'upcoming' && (
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => handleCancel(apt.id)} className="text-xs">
                    {t('appointments.cancel')}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setRescheduleApt(apt)} className="text-xs text-gold border-gold/40 hover:bg-gold/10">
                    {t('appointments.reschedule')}
                  </Button>
                  <Button size="sm" variant="ghost" className="text-xs text-muted-foreground" onClick={() => {}}>
                    <MessageCircle size={14} /> {t('appointments.whatsappManage')}
                  </Button>
                </div>
              )}
            </motion.div>
          ))
        )}
      </div>

      <BottomNav />

      {rescheduleApt && (
        <RescheduleDialog
          appointment={rescheduleApt}
          open={!!rescheduleApt}
          onClose={() => setRescheduleApt(null)}
          onRescheduled={() => setRefreshKey((k) => k + 1)}
        />
      )}
    </div>
  );
};

export default Appointments;
