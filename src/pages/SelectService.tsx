import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useSalonId } from '@/lib/salon-context';
import { supabase } from '@/integrations/supabase/client';
import { LoadingState } from '@/components/staff/LoadingState';
import { ServiceSelector, type SalonService } from '@/components/staff/ServiceSelector';
import { Scissors } from 'lucide-react';

// Una línea de la visita tal y como la espera la RPC staff_award_visit:
// importe en céntimos + etiqueta legible (el nombre del servicio).
export interface VisitLine {
  price_cents: number;
  label: string;
}

// El esquema de Salón OS guarda el precio en `price_cents`. Se contempla
// `base_price_cents` como alternativa defensiva por si algún despliegue lo usa.
function priceCentsOf(service: SalonService): number {
  const legacy = (service as { base_price_cents?: number | null }).base_price_cents;
  return service.price_cents ?? legacy ?? 0;
}

// Estado que llega por el router desde /verify-customer. Se reenvía tal cual a
// /confirm-visit, por eso se admite cualquier campo extra además de los conocidos.
interface SelectServiceState {
  customerName?: string;
  todayAppointment?: {
    id: string;
    services?: Array<{ service_id: string }>;
  } | null;
  [key: string]: unknown;
}

export default function SelectService() {
  const location = useLocation();
  const navigate = useNavigate();
  const salonId = useSalonId();
  const state = (location.state ?? {}) as SelectServiceState;
  const [services, setServices] = useState<SalonService[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchServices() {
      // Los servicios se leen SIEMPRE dentro de este salón (Salón OS es multi-tenant).
      const { data } = await supabase
        .from('services')
        .select('id, name, category, price_cents, duration_minutes')
        .eq('salon_id', salonId)
        .eq('active', true)
        .order('name');
      setServices((data as SalonService[]) ?? []);
      setLoading(false);
    }
    fetchServices();
  }, [salonId]);

  const handleSelect = (selected: SalonService[]) => {
    const lines: VisitLine[] = selected.map((s) => ({
      price_cents: priceCentsOf(s),
      label: s.name,
    }));
    const totalCents = lines.reduce((sum, l) => sum + l.price_cents, 0);

    navigate('/confirm-visit', {
      state: {
        ...state,
        lines,
        totalCents,
        serviceName: selected.map((s) => s.name).join(', '),
        serviceCount: selected.length,
        appointmentId: state?.todayAppointment?.id ?? null,
      },
    });
  };

  if (loading) return <LoadingState message="Cargando servicios..." />;

  const preSelectedIds: string[] = (state.todayAppointment?.services ?? []).map(
    (s) => s.service_id,
  );

  return (
    <div className="px-4 pt-6 pb-32">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
          <Scissors className="h-6 w-6 text-primary" />
          Seleccionar servicios
        </h1>
        {state?.customerName && (
          <p className="mt-1 text-sm text-muted-foreground">
            Cliente: <span className="font-medium text-foreground">{state.customerName}</span>
          </p>
        )}
        {preSelectedIds.length > 0 && (
          <p className="mt-1 text-xs text-primary">✓ Servicios de la cita pre-seleccionados</p>
        )}
      </div>

      {services.length === 0 ? (
        <p className="rounded-xl bg-card border border-border p-4 text-sm text-muted-foreground">
          Este salón no tiene servicios activos. Créalos desde la configuración para poder acreditar visitas.
        </p>
      ) : (
        <ServiceSelector services={services} onSelect={handleSelect} preSelectedIds={preSelectedIds} />
      )}
    </div>
  );
}
