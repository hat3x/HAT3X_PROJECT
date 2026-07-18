import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, MapPin, Clock, Check, ChevronRight, CalendarDays, StickyNote, User, Scissors, Star, Zap } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import BottomNav from '@/components/BottomNav';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogAction } from '@/components/ui/alert-dialog';
import type { Tables } from '@/integrations/supabase/types';

type Location = Tables<'locations'>;
type Service = Tables<'services'>;
type StaffMember = Tables<'staff_members'>;
type ServiceCategory = Tables<'service_categories'>;

type SalonSection = 'CABALLEROS' | 'SENORAS' | 'ESTETICA';

// New order: location → section → services → staff → datetime → confirm
const STEPS = ['location', 'section', 'services', 'staff', 'datetime', 'confirm'] as const;
type Step = typeof STEPS[number];

const FIRST_AVAILABLE_ID = '__first_available__';

function getMadridOffset(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00Z');
  const month = d.getUTCMonth();
  if (month > 2 && month < 9) return '+02:00';
  if (month < 2 || month > 9) return '+01:00';
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), month + 1, 0));
  const lastSunday = lastDay.getUTCDate() - lastDay.getUTCDay();
  if (month === 2) return d.getUTCDate() >= lastSunday ? '+02:00' : '+01:00';
  return d.getUTCDate() < lastSunday ? '+02:00' : '+01:00';
}

const TIME_SLOTS = [
'09:00', '09:10', '09:20', '09:30', '09:40', '09:50',
'10:00', '10:10', '10:20', '10:30', '10:40', '10:50',
'11:00', '11:10', '11:20', '11:30', '11:40', '11:50',
'12:00', '12:10', '12:20', '12:30', '12:40', '12:50',
'13:00', '13:10', '13:20', '13:30', '13:40', '13:50',
'14:00', '14:10', '14:20', '14:30', '14:40', '14:50',
'15:00', '15:10', '15:20', '15:30', '15:40', '15:50',
'16:00', '16:10', '16:20', '16:30', '16:40', '16:50',
'17:00', '17:10', '17:20', '17:30', '17:40', '17:50',
'18:00', '18:10', '18:20', '18:30', '18:40', '18:50',
'19:00', '19:10', '19:20', '19:30', '19:40', '19:50',
'20:00', '20:10', '20:20', '20:30', '20:40', '20:50'];


const getClosingTime = (location: Location | null, date: Date | undefined): string | null => {
  if (!location || !date) return null;
  try {
    const hours = location.hours_json as Record<string, any>;
    if (!hours) return null;
    const dayIndex = date.getDay();
    const dayKeyMap: Record<number, string> = {
      0: 'sunday', 1: 'weekdays', 2: 'weekdays', 3: 'wednesday',
      4: 'weekdays', 5: 'weekdays', 6: 'saturday'
    };
    const dayKey = dayKeyMap[dayIndex];
    const dayHours = hours[dayKey];
    if (!dayHours || dayHours === null) return null;
    if (typeof dayHours === 'object' && dayHours.close) return dayHours.close;
    return null;
  } catch {
    return null;
  }
};

const formatLocalDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const calcPoints = (svc: Service) => svc.fixed_points || (svc.base_price ? Math.ceil(svc.base_price / 2) : 0);

const BookAppointment = () => {
  const navigate = useNavigate();
  const { t } = useI18n();
  const { user } = useAuth();

  const [step, setStep] = useState<Step>('location');
  const [locations, setLocations] = useState<Location[]>([]);
  const [staffMembers, setStaffMembers] = useState<StaffMember[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<Location | null>(null);
  const [selectedSection, setSelectedSection] = useState<SalonSection | null>(null);
  const [selectedStaff, setSelectedStaff] = useState<StaffMember | null>(null);
  const [isFirstAvailable, setIsFirstAvailable] = useState(false);
  const [selectedServices, setSelectedServices] = useState<Service[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [selectedHour, setSelectedHour] = useState<string | null>(null);
  const [selectedMinute, setSelectedMinute] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [busySlots, setBusySlots] = useState<{start: string;end: string;}[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [staffSchedules, setStaffSchedules] = useState<{entry_type: string;start_time: string | null;end_time: string | null;}[]>([]);
  const [monthSchedules, setMonthSchedules] = useState<Record<string, string>>({});
  const [hasActiveAppointment, setHasActiveAppointment] = useState(false);
  const [checkingAppointment, setCheckingAppointment] = useState(true);

  // For "first available" mode: track per-staff availability
  const [allStaffBusySlots, setAllStaffBusySlots] = useState<Record<string, {start: string;end: string;}[]>>({});
  const [allStaffSchedules, setAllStaffSchedules] = useState<Record<string, {entry_type: string;start_time: string | null;end_time: string | null;}[]>>({});
  const [allStaffMonthSchedules, setAllStaffMonthSchedules] = useState<Record<string, Record<string, string>>>({});
  // The staff member auto-assigned when "first available" finds a slot
  const [autoAssignedStaff, setAutoAssignedStaff] = useState<StaffMember | null>(null);

  const stepIndex = STEPS.indexOf(step);

  // Check if user already has an active appointment
  useEffect(() => {
    if (!user) return;
    const checkExisting = async () => {
      setCheckingAppointment(true);
      const { data: customer } = await supabase.
      from('customers').
      select('id').
      eq('user_id', user.id).
      single();
      if (!customer) {setCheckingAppointment(false);return;}
      const { data } = await supabase.
      from('appointments').
      select('id').
      eq('customer_id', customer.id).
      in('status', ['CONFIRMED', 'RESCHEDULED']).
      limit(1);
      setHasActiveAppointment((data?.length || 0) > 0);
      setCheckingAppointment(false);
    };
    checkExisting();
  }, [user]);

  // Computed totals
  const totals = useMemo(() => {
    const duration = selectedServices.reduce((sum, s) => sum + (s.duration_min || 0), 0);
    const points = selectedServices.reduce((sum, s) => sum + calcPoints(s), 0);
    const phasedSvcs = selectedServices.filter((s) => s.application_min && s.exposure_min);
    const hasPhases = phasedSvcs.length > 0;
    if (hasPhases) {
      const totalApp = phasedSvcs.reduce((sum, s) => sum + (s.application_min || 0), 0);
      const maxExposure = Math.max(...phasedSvcs.map((s) => s.exposure_min || 0));
      const totalPost = selectedServices.reduce((sum, s) => {
        if (s.post_exposure_min) return sum + s.post_exposure_min;
        if (!s.application_min) return sum + (s.duration_min || 0);
        return sum;
      }, 0);
      const nonPhasedDur = selectedServices.
      filter((s) => !s.application_min || !s.exposure_min).
      filter((s) => !s.post_exposure_min).
      reduce((sum, s) => sum + (s.duration_min || 0), 0);
      return { duration, points, hasPhases: true, applicationMin: totalApp + nonPhasedDur, exposureMin: maxExposure, postMin: totalPost };
    }
    return { duration, points, hasPhases: false, applicationMin: 0, exposureMin: 0, postMin: 0 };
  }, [selectedServices]);

  useEffect(() => {
    supabase.from('locations').select('*').then(({ data }) => {if (data) setLocations(data);});
  }, []);

  // Load staff & services when section is selected (needed for services step which now comes before staff)
  useEffect(() => {
    if (selectedLocation && selectedSection) {
      supabase.
      from('staff_members').
      select('*').
      eq('location_id', selectedLocation.id).
      eq('section', selectedSection).
      eq('active', true).
      then(({ data }) => {if (data) setStaffMembers(data);});
    }
  }, [selectedLocation, selectedSection]);

  useEffect(() => {
    if (selectedLocation && selectedSection) {
      Promise.all([
      supabase.
      from('services').
      select('*').
      eq('active', true).
      eq('section', selectedSection).
      or(`location_id.eq.${selectedLocation.id},location_id.is.null`),
      supabase.from('service_categories').select('*').order('sort_order')]
      ).then(([svcRes, catRes]) => {
        if (svcRes.data) setServices(svcRes.data);
        if (catRes.data) setCategories(catRes.data);
      });
    }
  }, [selectedLocation, selectedSection]);

  // Fetch monthly schedules for calendar (specific staff or all staff in first-available mode)
  useEffect(() => {
    if (isFirstAvailable && staffMembers.length > 0) {
      // Fetch schedules for ALL staff in the section
      const now = new Date();
      const startDate = formatLocalDate(now);
      const endDate = formatLocalDate(new Date(now.getFullYear(), now.getMonth() + 2, 0));
      const staffIds = staffMembers.map((s) => s.id);
      supabase.
      from('employee_schedules').
      select('staff_member_id, date, entry_type').
      in('staff_member_id', staffIds).
      gte('date', startDate).
      lte('date', endDate).
      then(({ data }) => {
        const perStaff: Record<string, Record<string, string>> = {};
        // Combined: a date is available if ANY staff has availability
        const combined: Record<string, string> = {};
        data?.forEach((e) => {
          if (!perStaff[e.staff_member_id]) perStaff[e.staff_member_id] = {};
          perStaff[e.staff_member_id][e.date] = e.entry_type;
          if (e.entry_type === 'availability') combined[e.date] = 'availability';
        });
        setAllStaffMonthSchedules(perStaff);
        setMonthSchedules(combined);
      });
      return;
    }

    if (!selectedStaff) {setMonthSchedules({});return;}
    const now = new Date();
    const startDate = formatLocalDate(now);
    const endDate = formatLocalDate(new Date(now.getFullYear(), now.getMonth() + 2, 0));
    supabase.
    from('employee_schedules').
    select('date, entry_type').
    eq('staff_member_id', selectedStaff.id).
    gte('date', startDate).
    lte('date', endDate).
    then(({ data }) => {
      const map: Record<string, string> = {};
      data?.forEach((e) => {map[e.date] = e.entry_type;});
      setMonthSchedules(map);
    });
  }, [selectedStaff, isFirstAvailable, staffMembers]);

  // Fetch staff schedule(s) for selected date
  useEffect(() => {
    if (!selectedDate) {setStaffSchedules([]);setAllStaffSchedules({});return;}
    const dateStr = formatLocalDate(selectedDate);

    if (isFirstAvailable && staffMembers.length > 0) {
      const staffIds = staffMembers.map((s) => s.id);
      supabase.
      from('employee_schedules').
      select('staff_member_id, entry_type, start_time, end_time').
      in('staff_member_id', staffIds).
      eq('date', dateStr).
      then(({ data }) => {
        const perStaff: Record<string, {entry_type: string;start_time: string | null;end_time: string | null;}[]> = {};
        data?.forEach((e) => {
          if (!perStaff[e.staff_member_id]) perStaff[e.staff_member_id] = [];
          perStaff[e.staff_member_id].push({ entry_type: e.entry_type, start_time: e.start_time, end_time: e.end_time });
        });
        setAllStaffSchedules(perStaff);
      });
      return;
    }

    if (!selectedStaff) {setStaffSchedules([]);return;}
    supabase.
    from('employee_schedules').
    select('entry_type, start_time, end_time').
    eq('staff_member_id', selectedStaff.id).
    eq('date', dateStr).
    then(({ data }) => setStaffSchedules(data || []));
  }, [selectedDate, selectedStaff, isFirstAvailable, staffMembers]);

  // Fetch busy slots when date or staff changes
  useEffect(() => {
    if (!selectedDate) {setBusySlots([]);setAllStaffBusySlots({});return;}

    if (isFirstAvailable && staffMembers.length > 0) {
      const dateStr = formatLocalDate(selectedDate);
      setLoadingSlots(true);
      Promise.all(
        staffMembers.map(async (member) => {
          const { data, error } = await supabase.functions.invoke('gcal-sync-appointments', {
            body: { action: 'check-availability', staff_member_id: member.id, date: dateStr }
          });
          return { staffId: member.id, slots: error ? [] : data?.busy_slots || [] };
        })
      ).then((results) => {
        const map: Record<string, {start: string;end: string;}[]> = {};
        results.forEach((r) => {map[r.staffId] = r.slots;});
        setAllStaffBusySlots(map);
        setLoadingSlots(false);
      });
      return;
    }

    if (!selectedStaff) {setBusySlots([]);return;}
    const fetchBusySlots = async () => {
      setLoadingSlots(true);
      try {
        const dateStr = formatLocalDate(selectedDate);
        const { data, error } = await supabase.functions.invoke('gcal-sync-appointments', {
          body: { action: 'check-availability', staff_member_id: selectedStaff.id, date: dateStr }
        });
        if (error) {setBusySlots([]);} else {setBusySlots(data?.busy_slots || []);}
      } catch (err) {
        console.error('Error fetching busy slots:', err);
      } finally {
        setLoadingSlots(false);
      }
    };
    fetchBusySlots();
  }, [selectedDate, selectedStaff, isFirstAvailable, staffMembers]);

  const closingTime = useMemo(() => getClosingTime(selectedLocation, selectedDate), [selectedLocation, selectedDate]);

  // Check if a time slot is available for a specific staff member
  const isSlotAvailableForStaff = (slot: string, staffId: string, schedules: {entry_type: string;start_time: string | null;end_time: string | null;}[], busy: {start: string;end: string;}[]): boolean => {
    if (!selectedDate) return true;
    const availBlocks = schedules.filter((s) => s.entry_type === 'availability');
    if (availBlocks.length === 0) return false;

    const [sh, sm] = slot.split(':').map(Number);
    const slotMinutes = sh * 60 + sm;
    const totalDur = totals.duration || 30;
    const endMinutes = slotMinutes + totalDur;

    const fitsAnyBlock = availBlocks.some((block) => {
      if (!block.start_time || !block.end_time) return false;
      const [bsh, bsm] = block.start_time.substring(0, 5).split(':').map(Number);
      const [beh, bem] = block.end_time.substring(0, 5).split(':').map(Number);
      const blockStart = bsh * 60 + bsm;
      const blockEnd = beh * 60 + bem;
      return slotMinutes >= blockStart && endMinutes <= blockEnd;
    });
    if (!fitsAnyBlock) return false;

    const dateStr = formatLocalDate(selectedDate);
    const madridOffset = getMadridOffset(dateStr);
    const slotStart = new Date(`${dateStr}T${slot}:00${madridOffset}`);
    const fullEnd = new Date(slotStart.getTime() + (totals.duration || 30) * 60000);

    if (closingTime) {
      const closingDate = new Date(`${dateStr}T${closingTime}:00${madridOffset}`);
      if (fullEnd > closingDate || slotStart >= closingDate) return false;
    }

    if (busy.length === 0) return true;

    const newWindows: {start: Date;end: Date;}[] = [];
    if (totals.hasPhases) {
      const appEnd = new Date(slotStart.getTime() + totals.applicationMin * 60000);
      newWindows.push({ start: slotStart, end: appEnd });
      if (totals.postMin > 0) {
        const postStart = new Date(appEnd.getTime() + totals.exposureMin * 60000);
        const postEnd = new Date(postStart.getTime() + totals.postMin * 60000);
        newWindows.push({ start: postStart, end: postEnd });
      }
    } else {
      newWindows.push({ start: slotStart, end: fullEnd });
    }

    return !newWindows.some((win) =>
    busy.some((b) => {
      const busyStart = new Date(b.start);
      const busyEnd = new Date(b.end);
      return win.start < busyEnd && win.end > busyStart;
    })
    );
  };

  // Standard slot availability check (for a specific selected staff)
  const isSlotAvailable = (slot: string): boolean => {
    if (!selectedStaff) return false;
    return isSlotAvailableForStaff(slot, selectedStaff.id, staffSchedules, busySlots);
  };

  // For first-available mode: check if a slot is available for ANY staff, return the first staff id that can do it
  const findFirstAvailableStaffForSlot = (slot: string): StaffMember | null => {
    for (const member of staffMembers) {
      const schedules = allStaffSchedules[member.id] || [];
      const busy = allStaffBusySlots[member.id] || [];
      if (isSlotAvailableForStaff(slot, member.id, schedules, busy)) {
        return member;
      }
    }
    return null;
  };

  const isSlotAvailableFirstAvailable = (slot: string): boolean => {
    return findFirstAvailableStaffForSlot(slot) !== null;
  };

  // Group services by category
  const servicesByCategory = useMemo(() => {
    const map = new Map<string, {category: ServiceCategory;services: Service[];}>();
    categories.forEach((cat) => {
      const catServices = services.filter((s) => s.category_id === cat.id);
      if (catServices.length > 0) map.set(cat.id, { category: cat, services: catServices });
    });
    const uncategorized = services.filter((s) => !s.category_id);
    if (uncategorized.length > 0) {
      map.set('uncategorized', { category: { id: 'uncategorized', name: t('book.otherCategory'), sort_order: 999, created_at: '' }, services: uncategorized });
    }
    return Array.from(map.values());
  }, [services, categories]);

  const handleConfirm = async () => {
    if (!selectedLocation || !selectedDate || !selectedTime || !user) return;

    const finalStaff = isFirstAvailable ? autoAssignedStaff : selectedStaff;
    if (!finalStaff) return;

    setLoading(true);
    try {
      const { data: customer } = await supabase.
      from('customers').
      select('id').
      eq('user_id', user.id).
      single();
      if (!customer) throw new Error('Customer not found');

      const dateStr = formatLocalDate(selectedDate);
      const madridOffset = getMadridOffset(dateStr);
      const startAt = new Date(`${dateStr}T${selectedTime}:00${madridOffset}`);
      const bookingDuration = totals.duration > 0 ? totals.duration : 30;
      const endAt = new Date(startAt.getTime() + bookingDuration * 60000);

      // Final availability re-check
      const { data: availabilityData, error: availabilityError } = await supabase.functions.invoke('gcal-sync-appointments', {
        body: { action: 'check-availability', staff_member_id: finalStaff.id, date: dateStr }
      });
      if (availabilityError) throw new Error(t('book.errorAvailability'));

      const newWindows: {start: Date;end: Date;}[] = [];
      if (totals.hasPhases) {
        const appEnd = new Date(startAt.getTime() + totals.applicationMin * 60000);
        newWindows.push({ start: startAt, end: appEnd });
        if (totals.postMin > 0) {
          const postStart = new Date(appEnd.getTime() + totals.exposureMin * 60000);
          const postEnd = new Date(postStart.getTime() + totals.postMin * 60000);
          newWindows.push({ start: postStart, end: postEnd });
        }
      } else {
        newWindows.push({ start: startAt, end: endAt });
      }

      const hasOverlap = newWindows.some((win) =>
      (availabilityData?.busy_slots || []).some((busy: {start: string;end: string;}) => {
        const busyStart = new Date(busy.start);
        const busyEnd = new Date(busy.end);
        return win.start < busyEnd && win.end > busyStart;
      })
      );

      if (hasOverlap) {
        toast.error(t('book.errorSlotTaken'));
        setSelectedTime(null);
        return;
      }

      const { data: appointment, error } = await supabase.
      from('appointments').
      insert({
        customer_id: customer.id,
        location_id: selectedLocation.id,
        staff_member_id: finalStaff.id,
        start_at: startAt.toISOString(),
        end_at: endAt.toISOString(),
        customer_notes: notes || null,
        estimated_total_price: null,
        estimated_total_duration: bookingDuration,
        estimated_pending_points: totals.points || null
      }).
      select().
      single();

      if (error) throw error;

      if (appointment && selectedServices.length > 0) {
        await supabase.from('appointment_services').insert(
          selectedServices.map((s) => ({
            appointment_id: appointment.id,
            service_id: s.id,
            service_name_snapshot: s.name,
            price_type_snapshot: s.price_type,
            unit_price_snapshot: s.base_price,
            duration_minutes_snapshot: s.duration_min,
            points_snapshot: calcPoints(s),
            quantity: 1,
            is_completed: false
          }))
        );
      }

      if (appointment?.staff_member_id) {
        supabase.functions.invoke('gcal-sync-appointments', {
          body: { action: 'create', appointment_id: appointment.id }
        }).catch((err) => console.warn('GCal sync failed (non-blocking):', err));
      }

      setSuccess(true);
    } catch (err) {
      console.error('Booking error:', err);
    } finally {
      setLoading(false);
    }
  };

  const canNext = () => {
    switch (step) {
      case 'location':return !!selectedLocation;
      case 'section':return !!selectedSection;
      case 'services':return selectedServices.length > 0;
      case 'staff':return !!selectedStaff || isFirstAvailable;
      case 'datetime':return !!selectedDate && !!selectedTime;
      case 'confirm':return true;
    }
  };

  const goNext = () => {const i = STEPS.indexOf(step);if (i < STEPS.length - 1) setStep(STEPS[i + 1]);};
  const goPrev = () => {
    const i = STEPS.indexOf(step);
    if (i > 0) {
      if (step === 'services') {setSelectedServices([]);}
      if (step === 'staff') {setSelectedStaff(null);setIsFirstAvailable(false);setAutoAssignedStaff(null);}
      if (step === 'section') {setSelectedSection(null);setSelectedStaff(null);setIsFirstAvailable(false);setSelectedServices([]);}
      if (step === 'datetime') {setSelectedDate(undefined);setSelectedTime(null);setSelectedHour(null);setSelectedMinute(null);setAutoAssignedStaff(null);}
      setStep(STEPS[i - 1]);
    }
  };

  const toggleService = (service: Service) => {
    setSelectedServices((prev) =>
    prev.find((s) => s.id === service.id) ?
    prev.filter((s) => s.id !== service.id) :
    [...prev, service]
    );
  };

  const handleSectionSelect = (section: SalonSection) => {
    setSelectedSection(section);
    setSelectedStaff(null);
    setIsFirstAvailable(false);
    setSelectedServices([]);
  };

  const handleStaffSelect = (member: StaffMember | null, firstAvailable: boolean) => {
    setSelectedStaff(member);
    setIsFirstAvailable(firstAvailable);
    setAutoAssignedStaff(null);
    setSelectedDate(undefined);
    setSelectedTime(null);
    setSelectedHour(null);
    setSelectedMinute(null);
  };

  // When user selects a time in first-available mode, auto-assign the staff
  const handleFirstAvailableTimeSelect = (time: string) => {
    const staff = findFirstAvailableStaffForSlot(time);
    setAutoAssignedStaff(staff);
    setSelectedTime(time);
  };

  const finalStaffForDisplay = isFirstAvailable ? autoAssignedStaff : selectedStaff;

  if (success) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 text-center pb-24">
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="mb-6 flex h-20 w-20 items-center justify-center rounded-full gradient-gold">
          <Check className="h-10 w-10 text-primary-foreground" />
        </motion.div>
        <h1 className="font-display text-3xl text-foreground mb-2">{t('book.success')}</h1>
        <p className="text-sm text-muted-foreground mb-2">{t('book.successDesc')}</p>
        <div className="rounded-xl border border-gold/20 bg-gold/5 p-3 mb-6">
          <p className="text-xs text-gold flex items-center gap-1.5">
            <Star size={12} /> {t('book.pendingPointsNote')}: <span className="font-medium">{totals.points} pts</span>
          </p>
        </div>
        <Button onClick={() => navigate('/appointments')} className="gradient-gold text-primary-foreground shadow-gold">
          {t('book.goToAppointments')}
        </Button>
        <BottomNav />
      </div>);

  }

  return (
    <div className="min-h-screen bg-background pb-48">
      {/* Active appointment warning dialog */}
      <AlertDialog open={hasActiveAppointment && !checkingAppointment}>
        <AlertDialogContent className="max-w-sm mx-auto">
          <AlertDialogHeader>
            <div className="flex justify-center mb-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-warning/20">
                <CalendarDays className="h-6 w-6 text-warning" />
              </div>
            </div>
            <AlertDialogTitle className="text-center">{t('book.existingAppointment')}</AlertDialogTitle>
            <AlertDialogDescription className="text-center">
              {t('book.existingAppointmentDesc')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-col">
            <AlertDialogAction onClick={() => navigate('/appointments')} className="gradient-gold text-primary-foreground shadow-gold">
              {t('book.goToMyAppointments')}
            </AlertDialogAction>
            <Button variant="ghost" onClick={() => navigate(-1)} className="text-muted-foreground">
              {t('book.previous')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Header */}
      <div className="px-6 pt-12 pb-4">
        <button onClick={() => stepIndex > 0 ? goPrev() : navigate(-1)} className="mb-4 flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft size={18} />
          <span className="text-sm">{stepIndex > 0 ? t('book.previous') : t('general.back')}</span>
        </button>
        <h1 className="font-display text-3xl text-foreground">{t('book.title')}</h1>
        <p className="text-xs text-muted-foreground mt-1">{t('book.step')} {stepIndex + 1} {t('book.of')} {STEPS.length}</p>
        <div className="mt-3 flex gap-1.5">
          {STEPS.map((_, i) =>
          <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${i <= stepIndex ? 'gradient-gold' : 'bg-muted'}`} />
          )}
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={step} initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} transition={{ duration: 0.2 }} className="px-6 py-4">

          {/* Step 1: Location */}
          {step === 'location' &&
          <div className="space-y-3">
              <h2 className="text-lg font-display text-foreground mb-4">{t('book.selectLocation')}</h2>
              {locations.map((loc) =>
            <button key={loc.id} onClick={() => setSelectedLocation(loc)} className={`w-full rounded-xl border p-4 text-left transition-all ${selectedLocation?.id === loc.id ? 'border-gold bg-gold/5' : 'border-border bg-card hover:border-gold/20'}`}>
                  <div className="flex items-center gap-3">
                    <MapPin className={`h-5 w-5 ${selectedLocation?.id === loc.id ? 'text-gold' : 'text-muted-foreground'}`} />
                    <div>
                      <p className="text-sm font-medium text-foreground">{loc.name}</p>
                      <p className="text-xs text-muted-foreground">{loc.address}</p>
                    </div>
                    {selectedLocation?.id === loc.id && <Check className="ml-auto h-4 w-4 text-gold" />}
                  </div>
                </button>
            )}
            </div>
          }

          {/* Step 2: Section */}
          {step === 'section' &&
          <div className="space-y-3">
              <h2 className="text-lg font-display text-foreground mb-4">{t('book.selectSection')}</h2>
              {(['CABALLEROS', 'SENORAS', 'ESTETICA'] as SalonSection[]).map((section) =>
            <button key={section} onClick={() => handleSectionSelect(section)} className={`w-full rounded-xl border p-5 text-left transition-all ${selectedSection === section ? 'border-gold bg-gold/5' : 'border-border bg-card hover:border-gold/20'}`}>
                  <div className="flex items-center gap-4">
                    <div className={`flex h-12 w-12 items-center justify-center rounded-full ${selectedSection === section ? 'gradient-gold' : 'bg-muted'}`}>
                      <Scissors className={`h-5 w-5 ${selectedSection === section ? 'text-primary-foreground' : 'text-muted-foreground'}`} />
                    </div>
                    <div>
                      <p className="text-base font-medium text-foreground">
                        {section === 'CABALLEROS' ? t('book.sectionMen') : section === 'SENORAS' ? t('book.sectionLadies') : t('book.sectionAesthetics')}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {section === 'CABALLEROS' ? t('book.sectionMenDesc') : section === 'SENORAS' ? t('book.sectionLadiesDesc') : t('book.sectionAestheticsDesc')}
                      </p>
                    </div>
                    {selectedSection === section && <Check className="ml-auto h-4 w-4 text-gold" />}
                  </div>
                </button>
            )}
            </div>
          }

          {/* Step 3: Services (moved before staff) */}
          {step === 'services' &&
          <div className="space-y-4">
              <h2 className="text-lg font-display text-foreground mb-2">{t('book.selectServices')}</h2>
              {servicesByCategory.length === 0 ?
            <p className="text-sm text-muted-foreground">{t('book.noServices')}</p> :

            servicesByCategory.map(({ category, services: catServices }) =>
            <div key={category.id}>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">{category.name}</p>
                    <div className="space-y-2">
                      {catServices.map((svc) => {
                  const isSelected = !!selectedServices.find((s) => s.id === svc.id);
                  return (
                    <button key={svc.id} onClick={() => toggleService(svc)} className={`w-full rounded-xl border p-3 text-left transition-all ${isSelected ? 'border-gold bg-gold/5' : 'border-border bg-card hover:border-gold/20'}`}>
                            <div className="flex items-start justify-between">
                              <div className="flex-1 min-w-0">
                                <p className="text-sm text-foreground">{svc.name}</p>
                                <div className="flex items-center gap-3 mt-1">
                                  {svc.duration_min &&
                            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                                      <Clock size={10} /> {svc.duration_min} min
                                    </span>
                            }
                                  <span className="flex items-center gap-1 text-[11px] text-gold">
                                    <Star size={10} /> {calcPoints(svc)} pts
                                  </span>
                                </div>
                              </div>
                              <div className="flex items-center gap-2 ml-2">
                                {isSelected && <Check className="h-4 w-4 text-gold" />}
                              </div>
                            </div>
                          </button>);

                })}
                    </div>
                  </div>
            )
            }

              {selectedServices.length > 0 &&
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl border border-gold/20 bg-gold/5 p-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground flex items-center gap-1.5"><Clock size={12} /> {t('book.totalDuration')}</span>
                    <span className="text-foreground font-medium">{totals.duration} min</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gold flex items-center gap-1.5"><Star size={12} /> {t('book.pendingPoints')}</span>
                    <span className="text-gold font-medium">{totals.points} pts</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground">{t('book.pendingPointsNote')}</p>
                </motion.div>
            }
            </div>
          }

          {/* Step 4: Staff (with "first available" option) */}
          {step === 'staff' &&
          <div className="space-y-3">
              <h2 className="text-lg font-display text-foreground mb-4">{t('book.selectStaff')}</h2>

              {/* First available option */}
              <button
              onClick={() => handleStaffSelect(null, true)}
              className={`w-full rounded-xl border p-4 text-left transition-all ${isFirstAvailable ? 'border-gold bg-gold/5' : 'border-border bg-card hover:border-gold/20'}`}>
              
                <div className="flex items-center gap-3">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-full ${isFirstAvailable ? 'gradient-gold' : 'bg-muted'}`}>
                    <Zap className={`h-5 w-5 ${isFirstAvailable ? 'text-primary-foreground' : 'text-muted-foreground'}`} />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{t('book.firstAvailable')}</p>
                    
                  </div>
                  {isFirstAvailable && <Check className="ml-auto h-4 w-4 text-gold" />}
                </div>
              </button>

              {staffMembers.length === 0 ?
            <p className="text-sm text-muted-foreground">{t('book.noStaff')}</p> :
            staffMembers.map((member) =>
            <button key={member.id} onClick={() => handleStaffSelect(member, false)} className={`w-full rounded-xl border p-4 text-left transition-all ${!isFirstAvailable && selectedStaff?.id === member.id ? 'border-gold bg-gold/5' : 'border-border bg-card hover:border-gold/20'}`}>
                  <div className="flex items-center gap-3">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-full ${!isFirstAvailable && selectedStaff?.id === member.id ? 'gradient-gold' : 'bg-muted'}`}>
                      {member.avatar_url ?
                  <img src={member.avatar_url} alt={member.name} className="h-10 w-10 rounded-full object-cover" /> :

                  <User className={`h-5 w-5 ${!isFirstAvailable && selectedStaff?.id === member.id ? 'text-primary-foreground' : 'text-muted-foreground'}`} />
                  }
                    </div>
                    <p className="text-sm font-medium text-foreground">{member.name}</p>
                    {!isFirstAvailable && selectedStaff?.id === member.id && <Check className="ml-auto h-4 w-4 text-gold" />}
                  </div>
                </button>
            )}
            </div>
          }

          {/* Step 5: Date & Time */}
          {step === 'datetime' &&
          <div className="space-y-4">
              <h2 className="text-lg font-display text-foreground mb-2">{t('book.selectDate')}</h2>
              <div className="flex justify-center rounded-xl border border-border bg-card p-2">
                <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={(d) => {setSelectedDate(d);setSelectedTime(null);setSelectedHour(null);setSelectedMinute(null);setAutoAssignedStaff(null);}}
                disabled={(date) => {
                  const today = new Date();
                  today.setHours(0, 0, 0, 0);
                  if (date < today || date.getDay() === 0) return true;
                  const ds = formatLocalDate(date);
                  if (isFirstAvailable) {
                    // A day is available if ANY staff has availability that day
                    return monthSchedules[ds] !== 'availability';
                  }
                  if (selectedStaff) {
                    return monthSchedules[ds] !== 'availability';
                  }
                  return false;
                }}
                className="text-foreground pointer-events-auto" />
              
              </div>
              {selectedDate &&
            <div className="space-y-3">
                  {loadingSlots &&
              <p className="text-xs text-muted-foreground animate-pulse text-center">{t('book.checkingAvailability')}</p>
              }
                  {!loadingSlots && (() => {
                const checkFn = isFirstAvailable ? isSlotAvailableFirstAvailable : isSlotAvailable;
                const availableSlots = TIME_SLOTS.filter((s) => checkFn(s));
                if (availableSlots.length === 0) {
                  return <p className="text-sm text-muted-foreground text-center py-4">{t('book.noSlots')}</p>;
                }
                const availableHours = [...new Set(availableSlots.map((s) => s.substring(0, 2)))];
                const availableMinutes = selectedHour ?
                availableSlots.filter((s) => s.substring(0, 2) === selectedHour).map((s) => s.substring(3, 5)) :
                [];

                return (
                  <div className="space-y-3">
                        <div className="flex gap-3">
                          <div className="flex-1">
                            <label className="text-xs text-muted-foreground mb-1 block">Hora</label>
                            <Select
                          value={selectedHour || ''}
                          onValueChange={(v) => {
                            setSelectedHour(v);
                            setSelectedMinute(null);
                            setSelectedTime(null);
                            setAutoAssignedStaff(null);
                          }}>
                          
                              <SelectTrigger className="w-full border-border bg-card text-foreground">
                                <SelectValue placeholder="HH" />
                              </SelectTrigger>
                              <SelectContent className="max-h-64">
                                {availableHours.map((h) =>
                            <SelectItem key={h} value={h}>{parseInt(h, 10)}</SelectItem>
                            )}
                              </SelectContent>
                            </Select>
                          </div>
                          <span className="flex items-end pb-2 text-lg font-semibold text-foreground">:</span>
                          <div className="flex-1">
                            <label className="text-xs text-muted-foreground mb-1 block">Min</label>
                            <Select
                          value={selectedMinute || ''}
                          disabled={!selectedHour}
                          onValueChange={(v) => {
                            setSelectedMinute(v);
                            const time = `${selectedHour}:${v}`;
                            if (isFirstAvailable) {
                              handleFirstAvailableTimeSelect(time);
                            } else {
                              setSelectedTime(time);
                            }
                          }}>
                          
                              <SelectTrigger className="w-full border-border bg-card text-foreground">
                                <SelectValue placeholder="MM" />
                              </SelectTrigger>
                              <SelectContent>
                                {availableMinutes.map((m) =>
                            <SelectItem key={m} value={m}>{m}</SelectItem>
                            )}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        {/* Show auto-assigned staff when first available */}
                        {isFirstAvailable && autoAssignedStaff &&
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl border border-gold/20 bg-gold/5 p-3">
                            <div className="flex items-center gap-3">
                              <div className="flex h-8 w-8 items-center justify-center rounded-full gradient-gold">
                                <User className="h-4 w-4 text-primary-foreground" />
                              </div>
                              <div>
                                <p className="text-[11px] text-muted-foreground">Profesional asignado</p>
                                <p className="text-sm font-medium text-foreground">{autoAssignedStaff.name}</p>
                              </div>
                            </div>
                          </motion.div>
                    }
                      </div>);

              })()}
                </div>
            }
            </div>
          }

          {/* Step 6: Confirm */}
          {step === 'confirm' &&
          <div className="space-y-4">
              <h2 className="text-lg font-display text-foreground mb-4">{t('book.confirm')}</h2>

              <div className="rounded-xl border border-border bg-card p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <MapPin className="h-4 w-4 text-gold" />
                  <div>
                    <p className="text-xs text-muted-foreground">{t('appointments.location')}</p>
                    <p className="text-sm text-foreground">{selectedLocation?.name}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Scissors className="h-4 w-4 text-gold" />
                  <div>
                    <p className="text-xs text-muted-foreground">{t('book.section')}</p>
                    <p className="text-sm text-foreground">
                      {selectedSection === 'CABALLEROS' ? t('book.sectionMen') : selectedSection === 'SENORAS' ? t('book.sectionLadies') : t('book.sectionAesthetics')}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <User className="h-4 w-4 text-gold" />
                  <div>
                    <p className="text-xs text-muted-foreground">{t('book.staff')}</p>
                    <p className="text-sm text-foreground">{finalStaffForDisplay?.name}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <CalendarDays className="h-4 w-4 text-gold" />
                  <div>
                    <p className="text-xs text-muted-foreground">{t('appointments.date')}</p>
                    <p className="text-sm text-foreground">{selectedDate?.toLocaleDateString()} — {selectedTime}</p>
                  </div>
                </div>
              </div>

              {/* Services breakdown */}
              <div className="rounded-xl border border-border bg-card p-4">
                <p className="text-xs text-muted-foreground mb-2">{t('appointments.services')}</p>
                <div className="space-y-2">
                  {selectedServices.map((s) =>
                <div key={s.id} className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-foreground">{s.name}</p>
                        <p className="text-[10px] text-muted-foreground">{s.duration_min ? `${s.duration_min} min` : ''}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] text-gold">{calcPoints(s)} pts</p>
                      </div>
                    </div>
                )}
                </div>
                <div className="border-t border-border mt-3 pt-3 space-y-1">
                  <div className="flex justify-between text-sm font-medium">
                    <span className="text-muted-foreground">{t('book.totalDuration')}</span>
                    <span className="text-foreground">{totals.duration} min</span>
                  </div>
                </div>
              </div>

              {/* Pending points callout */}
              <div className="rounded-xl border border-gold/20 bg-gold/5 p-3">
                <div className="flex items-center gap-2">
                  <Star className="h-4 w-4 text-gold" />
                  <div>
                    <p className="text-sm font-medium text-gold">{totals.points} {t('book.pointsToEarn')}</p>
                    <p className="text-[10px] text-muted-foreground">{t('book.pendingPointsNote')}</p>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  <StickyNote size={14} /> {t('book.notes')}
                </label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t('book.notesPlaceholder')} className="bg-card border-border" />
              </div>

              <Button onClick={handleConfirm} disabled={loading} className="w-full gradient-gold text-primary-foreground shadow-gold hover:opacity-90">
                {loading ? t('general.loading') : t('book.confirmBooking')}
              </Button>
            </div>
          }
        </motion.div>
      </AnimatePresence>

      {/* Next button */}
      {step !== 'confirm' &&
      <div className="fixed bottom-[7rem] left-0 right-0 px-6 z-40">
          <Button onClick={goNext} disabled={!canNext()} className="w-full gradient-gold text-primary-foreground shadow-gold hover:opacity-90 disabled:opacity-40">
            {t('book.next')} <ChevronRight size={16} />
          </Button>
        </div>
      }

      <BottomNav />
    </div>);

};

export default BookAppointment;