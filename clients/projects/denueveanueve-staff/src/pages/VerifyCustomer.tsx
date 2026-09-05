import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useSalonId } from '@/lib/salon-context';
import { supabase } from '@/integrations/supabase/client';
import { LoadingState } from '@/components/staff/LoadingState';
import { ErrorState } from '@/components/staff/ErrorState';
import { CustomerSummaryCard } from '@/components/staff/CustomerSummaryCard';
import { IdentityVerificationForm } from '@/components/staff/IdentityVerificationForm';
import { UserCheck } from 'lucide-react';

interface WelcomeCoupon {
  percent_off: number;
  expires_at: string;
}

interface CustomerData {
  id: string;
  full_name: string;
  phone: string | null;
  qr_token: string;
  loyalty?: { visits_total: number; points_balance: number; last_visit_at: string | null } | null;
  rewards_available: number;
  welcomeCoupon: WelcomeCoupon | null;
  todayAppointment?: {
    id: string;
    location_id: string;
    services: Array<{ service_id: string; service_name_snapshot: string; points_snapshot: number | null }>;
  } | null;
}

export default function VerifyCustomer() {
  const location = useLocation();
  const navigate = useNavigate();
  const salonId = useSalonId();
  const qrToken = (location.state as any)?.qrToken;
  const customerId = (location.state as any)?.customerId;
  const [customer, setCustomer] = useState<CustomerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [verified, setVerified] = useState(false);
  const [, setVerificationMethod] = useState<string>('');

  useEffect(() => {
    async function fetchCustomer() {
      const nowISO = new Date().toISOString();

      // El cliente se busca SIEMPRE dentro de este salón (Salón OS es multi-tenant).
      let query = supabase
        .from('customers')
        .select('id, full_name, phone, qr_token')
        .eq('salon_id', salonId);

      if (qrToken) {
        query = query.eq('qr_token', qrToken);
      } else if (customerId) {
        query = query.eq('id', customerId);
      } else {
        setError('No se proporcionó token QR ni cliente');
        setLoading(false);
        return;
      }

      const { data: cust, error: custErr } = await query.maybeSingle();
      if (custErr || !cust) {
        setError('Cliente no encontrado');
        setLoading(false);
        return;
      }

      // Today's date range for appointment lookup
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);

      const [loyaltyRes, rewardsRes, couponsRes, appointmentsRes] = await Promise.all([
        supabase
          .from('loyalty_accounts')
          .select('visits_total, points_balance, last_visit_at')
          .eq('customer_id', cust.id)
          .eq('salon_id', salonId)
          .maybeSingle(),
        supabase
          .from('rewards')
          .select('id', { count: 'exact', head: true })
          .eq('customer_id', cust.id)
          .eq('salon_id', salonId)
          .eq('status', 'AVAILABLE')
          .gt('expires_at', nowISO),
        supabase
          .from('welcome_coupons')
          .select('percent_off, expires_at')
          .eq('customer_id', cust.id)
          .eq('salon_id', salonId)
          .eq('status', 'ACTIVE')
          .gt('expires_at', nowISO)
          .order('percent_off', { ascending: false })
          .order('expires_at', { ascending: true }),
        supabase.from('appointments' as any).select('id, start_at, location_id')
          .eq('customer_id', cust.id)
          .in('status', ['CONFIRMED', 'RESCHEDULED'])
          .gte('start_at', todayStart.toISOString())
          .lte('start_at', todayEnd.toISOString())
          .order('start_at', { ascending: true })
          .limit(1),
      ]);

      let todayAppointment: CustomerData['todayAppointment'] = null;
      const aptData = (appointmentsRes as any)?.data;
      if (aptData && aptData.length > 0) {
        const apt = aptData[0];
        const { data: aptServices } = await supabase
          .from('appointment_services' as any)
          .select('service_id, service_name_snapshot, points_snapshot')
          .eq('appointment_id', apt.id);
        todayAppointment = { ...apt, services: (aptServices as any[]) ?? [] };
      }

      const welcomeCoupon = couponsRes.data && couponsRes.data.length > 0 ? couponsRes.data[0] : null;

      setCustomer({
        ...cust,
        loyalty: loyaltyRes.data ?? undefined,
        rewards_available: rewardsRes.count ?? 0,
        welcomeCoupon,
        todayAppointment,
      });
      setLoading(false);
    }
    fetchCustomer();
  }, [qrToken, customerId, salonId]);

  const handleVerified = (method: string) => {
    setVerified(true);
    setVerificationMethod(method);
    navigate('/select-service', {
      state: {
        customerId: customer!.id,
        customerName: customer!.full_name,
        qrToken: qrToken ?? customer!.qr_token,
        verificationMethod: method,
        loyalty: customer!.loyalty,
        todayAppointment: customer!.todayAppointment ?? null,
      },
    });
  };

  if (loading) return <LoadingState message="Buscando cliente..." />;
  if (error) return <ErrorState title="Error" message={error} onRetry={() => navigate('/scan')} />;
  if (!customer) return <ErrorState message="Cliente no encontrado" />;

  return (
    <div className="px-4 pt-6">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
          <UserCheck className="h-6 w-6 text-primary" />
          Verificar cliente
        </h1>
      </div>

      <CustomerSummaryCard customer={customer} />

      {!verified && (
        <div className="mt-6">
          <IdentityVerificationForm
            customerId={customer.id}
            onVerified={handleVerified}
          />
        </div>
      )}
    </div>
  );
}
