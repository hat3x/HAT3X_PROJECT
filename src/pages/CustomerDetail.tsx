import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase, SALON_ID } from '@/integrations/supabase/client';
import { LoadingState } from '@/components/staff/LoadingState';
import { ErrorState } from '@/components/staff/ErrorState';
import { CustomerSummaryCard } from '@/components/staff/CustomerSummaryCard';
import { EmptyState } from '@/components/staff/EmptyState';
import { Button } from '@/components/ui/button';
import { ScanLine, Star, ArrowLeft } from 'lucide-react';

// Etiqueta legible por tipo cuando el movimiento no trae `reason`.
const MOVEMENT_LABELS: Record<string, string> = {
  EARN: 'Puntos ganados',
  REDEEM: 'Canje de puntos',
  ADJUST: 'Ajuste de puntos',
  EXPIRE: 'Puntos caducados',
};

export default function CustomerDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [customer, setCustomer] = useState<any>(null);
  const [movements, setMovements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetch() {
      if (!id) return;
      const nowISO = new Date().toISOString();
      const [custRes, loyRes, rewRes, coupRes, movRes] = await Promise.all([
        supabase.from('customers').select('*').eq('id', id).eq('salon_id', SALON_ID).maybeSingle(),
        supabase.from('loyalty_accounts').select('visits_total, points_balance, last_visit_at').eq('customer_id', id).eq('salon_id', SALON_ID).maybeSingle(),
        supabase.from('rewards').select('id', { count: 'exact', head: true }).eq('customer_id', id).eq('salon_id', SALON_ID).eq('status', 'AVAILABLE').gt('expires_at', nowISO),
        supabase.from('welcome_coupons').select('percent_off, expires_at').eq('customer_id', id).eq('salon_id', SALON_ID).eq('status', 'ACTIVE').gt('expires_at', nowISO).order('percent_off', { ascending: false }).order('expires_at', { ascending: true }),
        supabase.from('points_movements').select('*').eq('customer_id', id).eq('salon_id', SALON_ID).order('created_at', { ascending: false }).limit(20),
      ]);

      if (custRes.error || !custRes.data) {
        setError('Cliente no encontrado');
        setLoading(false);
        return;
      }

      setCustomer({
        ...custRes.data,
        loyalty: loyRes.data,
        rewards_available: rewRes.count ?? 0,
        welcomeCoupon: coupRes.data && coupRes.data.length > 0 ? coupRes.data[0] : null,
      });
      setMovements(movRes.data ?? []);
      setLoading(false);
    }
    fetch();
  }, [id]);

  if (loading) return <LoadingState message="Cargando perfil..." />;
  if (error || !customer) return <ErrorState message={error ?? 'No encontrado'} />;

  const formatDate = (d: string) => new Date(d).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  return (
    <div className="px-4 pt-6 pb-6">
      <button
        onClick={() => navigate(-1)}
        className="mb-4 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Volver
      </button>

      <CustomerSummaryCard customer={customer} />

      <div className="mt-4">
        <Button
          className="w-full h-12 gradient-gold text-primary-foreground font-semibold shadow-gold"
          onClick={() => navigate('/select-service', {
            state: {
              customerId: customer.id,
              customerName: customer.full_name,
              qrToken: customer.qr_token,
              verificationMethod: 'MANUAL',
              loyalty: customer.loyalty,
            },
          })}
        >
          <ScanLine className="mr-2 h-5 w-5" />
          Acreditar visita
        </Button>
      </div>

      {/* Points history */}
      <div className="mt-6">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          Historial de puntos
        </h3>
        {movements.length === 0 ? (
          <EmptyState title="Sin movimientos" message="Aún no hay movimientos de puntos" />
        ) : (
          <div className="space-y-2">
            {movements.map((m) => {
              const positive = m.type === 'EARN' || (m.type === 'ADJUST' && m.points >= 0);
              const magnitude = Math.abs(m.points);
              return (
                <div key={m.id} className="flex items-center justify-between rounded-lg bg-card border border-border p-3">
                  <div className="flex items-center gap-2">
                    <Star className={`h-4 w-4 ${positive ? 'text-primary' : 'text-destructive'}`} />
                    <div>
                      <p className="text-sm text-foreground">{m.reason ?? MOVEMENT_LABELS[m.type] ?? 'Movimiento'}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(m.created_at)}</p>
                    </div>
                  </div>
                  <span className={`font-bold ${positive ? 'text-primary' : 'text-destructive'}`}>
                    {positive ? '+' : '−'}{magnitude}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
