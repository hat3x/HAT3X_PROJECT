import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase, SALON_ID } from '@/integrations/supabase/client';
import type { Json } from '@/types/database';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { formatEuros } from '@/lib/utils';
import { CheckCircle2, User, Scissors, TrendingUp, Receipt, Ticket, Loader2 } from 'lucide-react';

interface VisitLine {
  price_cents: number;
  label: string;
}

// Estado que llega por el router desde /select-service.
interface ConfirmVisitState {
  lines?: VisitLine[];
  customerId?: string;
  qrToken?: string;
  totalCents?: number;
  customerName?: string;
  serviceName?: string;
  loyalty?: { visits_total?: number } | null;
  [key: string]: unknown;
}

// Códigos de error de negocio que devuelve/lanza la RPC staff_award_visit.
type AwardErrorCode = 'FORBIDDEN' | 'CUSTOMER_NOT_FOUND' | 'NO_LINES' | 'UNKNOWN';

const ERROR_MESSAGES: Record<AwardErrorCode, string> = {
  FORBIDDEN: 'No tienes permiso para acreditar visitas en este salón.',
  CUSTOMER_NOT_FOUND: 'No se ha encontrado el cliente. Vuelve a escanear su QR e inténtalo de nuevo.',
  NO_LINES: 'Añade al menos un servicio antes de acreditar la visita.',
  UNKNOWN: 'No se ha podido acreditar la visita. Vuelve a intentarlo.',
};

// Clasifica el error mirando el texto (mensaje/código/detalle) que devuelve Supabase.
function classifyAwardError(text: string): AwardErrorCode {
  const t = (text ?? '').toUpperCase();
  if (t.includes('FORBIDDEN')) return 'FORBIDDEN';
  if (t.includes('CUSTOMER_NOT_FOUND')) return 'CUSTOMER_NOT_FOUND';
  if (t.includes('NO_LINES')) return 'NO_LINES';
  return 'UNKNOWN';
}

export default function ConfirmVisit() {
  const location = useLocation();
  const navigate = useNavigate();
  const state = (location.state ?? {}) as ConfirmVisitState;

  const lines: VisitLine[] = state.lines ?? [];
  const customerId: string | undefined = state.customerId;
  const qrToken: string | undefined = state.qrToken;
  const totalCents: number =
    state.totalCents ?? lines.reduce((sum, l) => sum + (l.price_cents ?? 0), 0);
  const currentVisits: number = state.loyalty?.visits_total ?? 0;
  const newVisits = currentVisits + 1;

  // `p_ref_id`: UUID único de ESTA visita. Se genera una sola vez (lazy init) y se
  // reutiliza en cada reintento del botón para que la RPC sea idempotente y no
  // acredite la visita dos veces si el primer intento falla o se queda a medias.
  const [refId] = useState(() => crypto.randomUUID());

  const [couponPercent, setCouponPercent] = useState<number | null>(null);
  const [redeemCoupon, setRedeemCoupon] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Busca un cupón de bienvenida activo del cliente para ofrecer aplicarlo en la visita.
  useEffect(() => {
    if (!customerId) return;
    let active = true;
    supabase
      .from('welcome_coupons')
      .select('percent_off, expires_at')
      .eq('customer_id', customerId)
      .eq('salon_id', SALON_ID)
      .eq('status', 'ACTIVE')
      .gt('expires_at', new Date().toISOString())
      .order('percent_off', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (!active || !data) return;
        setCouponPercent(data.percent_off);
        setRedeemCoupon(true); // por defecto se aplica el descuento de bienvenida
      });
    return () => {
      active = false;
    };
  }, [customerId]);

  const handleConfirm = async () => {
    if (lines.length === 0) {
      setError(ERROR_MESSAGES.NO_LINES);
      return;
    }
    if (!customerId && !qrToken) {
      setError(ERROR_MESSAGES.CUSTOMER_NOT_FOUND);
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      // Se identifica al cliente por su ID si lo tenemos; si no, por el token del QR.
      const identifier = customerId ? { p_customer_id: customerId } : { p_qr_token: qrToken };

      const { data, error: rpcError } = await supabase.rpc('staff_award_visit', {
        p_salon_id: SALON_ID,
        ...identifier,
        p_line_items: lines as unknown as Json,
        p_redeem_coupon: redeemCoupon,
        p_ref_type: 'visit',
        p_ref_id: refId,
      });

      // Error lanzado por la RPC (RAISE EXCEPTION -> PostgrestError).
      if (rpcError) {
        const combined = [rpcError.message, rpcError.details, rpcError.hint, rpcError.code]
          .filter(Boolean)
          .join(' ');
        setError(ERROR_MESSAGES[classifyAwardError(combined)]);
        setSubmitting(false);
        return;
      }

      // Error de negocio devuelto dentro del JSON (ok:false / error: 'NO_LINES' ...).
      const result = (data ?? {}) as Record<string, unknown>;
      if (result.ok === false || typeof result.error === 'string') {
        const combined = [result.error, result.code, result.message].filter(Boolean).join(' ');
        setError(ERROR_MESSAGES[classifyAwardError(String(combined))]);
        setSubmitting(false);
        return;
      }

      navigate('/visit-result', {
        replace: true,
        state: {
          success: true,
          customerName: state?.customerName,
          serviceName: state?.serviceName,
          amountCents: totalCents,
          pointsAdded: result.points_added ?? result.points_awarded ?? result.points ?? null,
          visitsTotal: result.visits_total ?? newVisits,
          pointsBalance: result.points_balance ?? null,
          unlockedReward: result.unlocked_reward ?? result.reward ?? null,
          couponRedeemed: result.coupon_redeemed ?? (redeemCoupon && couponPercent != null),
          hasActiveCoupon: false, // el cupón ya se ha resuelto en esta misma llamada
          result,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      setError(ERROR_MESSAGES[classifyAwardError(message)]);
      setSubmitting(false);
    }
  };

  // Sin líneas (p. ej. navegación directa): no se puede acreditar nada.
  if (lines.length === 0) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center px-6 text-center">
        <Receipt className="mb-3 h-10 w-10 text-muted-foreground" />
        <p className="text-muted-foreground">No hay servicios seleccionados para acreditar.</p>
        <Button
          variant="outline"
          className="mt-4 border-border text-foreground"
          onClick={() => navigate('/select-service', { state, replace: true })}
        >
          Seleccionar servicios
        </Button>
      </div>
    );
  }

  return (
    <div className="px-4 pt-6 pb-28">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
          <CheckCircle2 className="h-6 w-6 text-primary" />
          Confirmar visita
        </h1>
      </div>

      <div className="rounded-xl bg-card border border-border p-4 space-y-4">
        {/* Cliente */}
        {state?.customerName && (
          <div className="flex items-center gap-3">
            <User className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Cliente</p>
              <p className="font-medium text-foreground">{state.customerName}</p>
            </div>
          </div>
        )}

        <hr className="border-border" />

        {/* Detalle de líneas */}
        <div>
          <p className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
            <Scissors className="h-4 w-4" />
            Servicio{lines.length > 1 ? 's' : ''}
          </p>
          <ul className="space-y-2">
            {lines.map((line, i) => (
              <li key={`${line.label}-${i}`} className="flex items-center justify-between gap-3">
                <span className="text-sm text-foreground">{line.label}</span>
                <span className="text-sm font-medium text-foreground tabular-nums">
                  {formatEuros(line.price_cents)}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <hr className="border-border" />

        {/* Total + visitas */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg bg-muted p-3 text-center">
            <Receipt className="mx-auto mb-1 h-4 w-4 text-primary" />
            <p className="text-lg font-bold text-primary tabular-nums">{formatEuros(totalCents)}</p>
            <p className="text-xs text-muted-foreground">Total</p>
          </div>
          <div className="rounded-lg bg-muted p-3 text-center">
            <TrendingUp className="mx-auto mb-1 h-4 w-4 text-accent" />
            <p className="text-lg font-bold text-foreground tabular-nums">{newVisits}</p>
            <p className="text-xs text-muted-foreground">Visitas totales</p>
          </div>
        </div>

        {/* Cupón de bienvenida (solo si hay uno activo) */}
        {couponPercent != null && (
          <>
            <hr className="border-border" />
            <div className="flex items-center justify-between gap-3 rounded-lg bg-primary/10 p-3">
              <Label htmlFor="redeem-coupon" className="flex items-center gap-2 cursor-pointer">
                <Ticket className="h-5 w-5 text-primary" />
                <span>
                  <span className="block text-sm font-semibold text-primary">Cupón de bienvenida</span>
                  <span className="block text-xs text-muted-foreground">
                    Aplicar −{couponPercent}% en esta visita
                  </span>
                </span>
              </Label>
              <Switch id="redeem-coupon" checked={redeemCoupon} onCheckedChange={setRedeemCoupon} />
            </div>
          </>
        )}

        {error && (
          <div role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <Button
          onClick={handleConfirm}
          disabled={submitting}
          className="w-full h-14 gradient-gold text-primary-foreground font-semibold text-base shadow-gold"
        >
          {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Acreditar visita'}
        </Button>
      </div>
    </div>
  );
}
