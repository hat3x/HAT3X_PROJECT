import { Users } from 'lucide-react';
import { ComingSoon } from '@/components/staff/ComingSoon';

/**
 * Out of scope for the Salón OS build. Listing/managing employees relied on
 * the old locations / staff_members model. Salón OS uses professionals and a
 * multi-tenant salon model instead, so this screen is disabled gracefully
 * until it is rebuilt against the new schema.
 */
export default function AdminEmployees() {
  return (
    <ComingSoon
      icon={<Users className="h-9 w-9" />}
      title="Empleados"
      description="La administración del personal del salón llegará próximamente a la app de Salón OS."
    />
  );
}
