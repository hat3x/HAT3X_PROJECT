import { useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Calendar } from '@/components/ui/calendar';
import { toast } from 'sonner';
import { addDays, format, isBefore, startOfDay, differenceInMinutes } from 'date-fns';
import type { Tables } from '@/integrations/supabase/types';

type Appointment = Tables<'appointments'>;

const MAX_RESCHEDULES = 3;

const HOURS = Array.from({ length: 13 }, (_, i) => i + 9); // 9..21

interface Props {
  appointment: Appointment;
  open: boolean;
  onClose: () => void;
  onRescheduled: () => void;
}

const RescheduleDialog = ({ appointment, open, onClose, onRescheduled }: Props) => {
  const { t } = useI18n();

  const durationMin = differenceInMinutes(
    new Date(appointment.end_at),
    new Date(appointment.start_at)
  );

  const [date, setDate] = useState<Date | undefined>(undefined);
  const [hour, setHour] = useState<number>(10);
  const [minute, setMinute] = useState<0 | 30>(0);
  const [saving, setSaving] = useState(false);

  const rescheduleCount = appointment.reschedule_count ?? 0;
  const limitReached = rescheduleCount >= MAX_RESCHEDULES;

  const handleConfirm = async () => {
    if (!date) return;

    const newStart = new Date(date);
    newStart.setHours(hour, minute, 0, 0);
    const newEnd = new Date(newStart.getTime() + durationMin * 60 * 1000);

    setSaving(true);
    const { error } = await supabase
      .from('appointments')
      .update({
        start_at: newStart.toISOString(),
        end_at: newEnd.toISOString(),
        status: 'RESCHEDULED',
        reschedule_count: rescheduleCount + 1,
      })
      .eq('id', appointment.id);
    setSaving(false);

    if (error) {
      toast.error(t('appointments.rescheduleError'));
    } else {
      toast.success(t('appointments.rescheduleSuccess'));
      // Non-blocking GCal sync
      supabase.functions
        .invoke('gcal-sync-appointments', {
          body: { action: 'update', appointment_id: appointment.id },
        })
        .catch(() => {});
      onRescheduled();
      onClose();
    }
  };

  const today = startOfDay(new Date());
  const maxDate = addDays(today, 90);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="bg-card border-border max-w-sm mx-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-foreground">{t('appointments.rescheduleTitle')}</DialogTitle>
          <DialogDescription className="text-muted-foreground text-sm">
            {limitReached ? t('appointments.rescheduleLimitReached') : t('appointments.rescheduleDesc')}
          </DialogDescription>
        </DialogHeader>

        {!limitReached && (
          <div className="space-y-4">
            {/* Calendar */}
            <div>
              <p className="text-xs text-muted-foreground mb-2">{t('appointments.rescheduleDate')}</p>
              <Calendar
                mode="single"
                selected={date}
                onSelect={setDate}
                disabled={(d) => isBefore(startOfDay(d), addDays(today, 1)) || d > maxDate}
                className="rounded-lg border border-border bg-background p-2"
              />
            </div>

            {/* Time picker */}
            <div>
              <p className="text-xs text-muted-foreground mb-2">{t('appointments.rescheduleTime')}</p>
              <div className="flex gap-2 flex-wrap">
                {HOURS.map((h) => (
                  [0, 30].map((m) => {
                    const isSelected = hour === h && minute === m;
                    return (
                      <button
                        key={`${h}-${m}`}
                        onClick={() => { setHour(h); setMinute(m as 0 | 30); }}
                        className={`rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                          isSelected
                            ? 'gradient-gold text-primary-foreground shadow-gold'
                            : 'bg-secondary text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        {String(h).padStart(2, '0')}:{String(m).padStart(2, '0')}
                      </button>
                    );
                  })
                ))}
              </div>
            </div>

            {/* Summary */}
            {date && (
              <p className="text-xs text-gold">
                {format(date, 'EEEE d MMM')} · {String(hour).padStart(2, '0')}:{String(minute).padStart(2, '0')} — {String(Math.floor((hour * 60 + minute + durationMin) / 60)).padStart(2, '0')}:{String((minute + durationMin) % 60).padStart(2, '0')}
              </p>
            )}

            <Button
              disabled={!date || saving}
              onClick={handleConfirm}
              className="w-full h-11 gradient-gold text-primary-foreground font-semibold shadow-gold hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {saving ? t('general.loading') : t('appointments.rescheduleConfirm')}
            </Button>
          </div>
        )}

        {limitReached && (
          <Button variant="outline" onClick={onClose} className="w-full">
            {t('general.close')}
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default RescheduleDialog;
