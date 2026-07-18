import { CalendarDays } from 'lucide-react';
import { ComingSoon } from '@/components/staff/ComingSoon';

/**
 * Out of scope for the Salón OS build. The old staff-scheduling model
 * (staff_members / employee_schedules) does not map to Salón OS, which
 * manages availability through professionals / professional_schedules.
 * Rendered as a graceful placeholder until that flow is rebuilt.
 */
export default function EmployeeCalendar() {
  return (
    <ComingSoon
      icon={<CalendarDays className="h-9 w-9" />}
      title="Mi calendario"
      description="La gestión de tu horario y turnos llegará próximamente a la app de Salón OS."
    />
  );
}
