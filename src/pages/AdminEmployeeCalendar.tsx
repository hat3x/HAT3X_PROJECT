import { CalendarClock } from 'lucide-react';
import { ComingSoon } from '@/components/staff/ComingSoon';

/**
 * Out of scope for the Salón OS build. Editing employee shifts/holidays
 * relied on the old staff_members / employee_schedules model, which does
 * not exist in Salón OS (staffing is modelled via professionals /
 * professional_schedules). Rendered as a graceful placeholder for now.
 */
export default function AdminEmployeeCalendar() {
  return (
    <ComingSoon
      icon={<CalendarClock className="h-9 w-9" />}
      title="Calendario del empleado"
      description="La edición de horarios, vacaciones y bajas del personal llegará próximamente."
      backTo="/dashboard"
    />
  );
}
