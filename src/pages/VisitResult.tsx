import { useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import type { LucideIcon } from 'lucide-react';
import {
  CheckCircle2,
  Sparkles,
  TrendingUp,
  Wallet,
  User,
  Scissors,
  Ticket,
  Gift,
  Crown,
  Microscope,
  Droplets,
  ShoppingBag,
  PartyPopper,
  ArrowRight,
  RotateCcw,
  Target,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatEuros } from '@/lib/utils';

/**
 * Respuesta de la RPC `staff_award_visit` (Salón OS).
 * La RPC devuelve `Json`, así que aquí la tipamos con la forma real que consume
 * esta pantalla. `ConfirmVisit` reenvía el objeto crudo en `state.result`.
 */
type RewardType = 'SCALP_DIAGNOSIS' | 'EXPRESS_TREATMENT' | 'RETAIL_VOUCHER' | 'PACK_UPGRADE';

interface AwardReward {
  type?: string;
  code?: string | null;
  expires_at?: string | null;
}

interface AwardResult {
  points_earned?: number | null;
  points_balance?: number | null;
  visits_total?: number | null;
  redeemed_coupon?: boolean | null;
  discount_cents?: number | null;
  reward?: AwardReward | null;
  already_awarded?: boolean | null;
}

// Estado que llega por el router desde /confirm-visit.
interface VisitResultState {
  success?: boolean;
  result?: AwardResult | null;
  customerName?: string;
  serviceName?: string;
  amountCents?: number;
  // Claves legadas que aún mapea ConfirmVisit; se usan como respaldo.
  pointsAdded?: number | null;
  pointsBalance?: number | null;
  visitsTotal?: number | null;
  couponRedeemed?: boolean;
}

// Recompensas del programa de fidelidad y la visita en la que se desbloquean.
const REWARD_MILESTONES = [3, 5, 8, 10] as const;

const REWARD_CONFIG: Record<RewardType, {
  label: string;
  description: string;
  milestone: number;
  Icon: LucideIcon;
}> = {
  SCALP_DIAGNOSIS: {
    label: 'Diagnóstico capilar',
    description: 'Análisis profesional del cuero cabelludo',
    milestone: 3,
    Icon: Microscope,
  },
  EXPRESS_TREATMENT: {
    label: 'Tratamiento exprés',
    description: 'Tratamiento capilar de cortesía',
    milestone: 5,
    Icon: Droplets,
  },
  RETAIL_VOUCHER: {
    label: 'Vale de producto',
    description: 'Descuento en la tienda de productos',
    milestone: 8,
    Icon: ShoppingBag,
  },
  PACK_UPGRADE: {
    label: 'Mejora de pack',
    description: 'Subida de categoría en el pack del cliente',
    milestone: 10,
    Icon: Crown,
  },
};

function formatExpiry(iso?: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return format(date, "d 'de' MMMM 'de' yyyy", { locale: es });
}

export default function VisitResult() {
  const location = useLocation();
  const navigate = useNavigate();
  const state = (location.state ?? {}) as VisitResultState;
  const result = state.result ?? null;

  // Campos canónicos de la RPC, con respaldo en las claves legadas del router.
  const pointsEarned = result?.points_earned ?? state.pointsAdded ?? 0;
  const pointsBalance = result?.points_balance ?? state.pointsBalance ?? null;
  const visitsTotal = result?.visits_total ?? state.visitsTotal ?? null;
  const redeemedCoupon = result?.redeemed_coupon ?? Boolean(state.couponRedeemed);
  const discountCents = result?.discount_cents ?? null;
  const reward = result?.reward ?? null;
  const alreadyAwarded = result?.already_awarded ?? false;

  const rewardType = reward?.type as RewardType | undefined;
  const rewardConfig = rewardType && rewardType in REWARD_CONFIG ? REWARD_CONFIG[rewardType] : null;
  const rewardExpiry = formatExpiry(reward?.expires_at);

  // Cuántas visitas faltan para la próxima recompensa (solo cuando no se
  // desbloquea ninguna en esta visita).
  const nextMilestone = useMemo(() => {
    if (visitsTotal == null) return null;
    return REWARD_MILESTONES.find((m) => m > visitsTotal) ?? null;
  }, [visitsTotal]);
  const visitsToNext =
    nextMilestone != null && visitsTotal != null ? nextMilestone - visitsTotal : null;

  // Navegación directa sin datos: nada que mostrar.
  if (!state.success && !result) {
    return (
      <div className="flex min-h-[80vh] items-center justify-center px-6">
        <div className="text-center">
          <p className="text-muted-foreground">No hay ningún resultado que mostrar.</p>
          <Button
            variant="outline"
            className="mt-4 border-border text-foreground"
            onClick={() => navigate('/dashboard')}
          >
            Volver al inicio
          </Button>
        </div>
      </div>
    );
  }

  const RewardIcon = rewardConfig?.Icon ?? Gift;
  const celebrating = Boolean(rewardConfig) && !alreadyAwarded;

  return (
    <div className="flex flex-col items-center px-6 pb-28 pt-8">
      <section
        role="status"
        aria-live="polite"
        className="w-full max-w-sm text-center motion-safe:animate-slide-up"
      >
        {/* ── Cabecera / momento hero ───────────────────────────── */}
        <header className="relative mb-7">
          {celebrating && (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 mx-auto h-24 w-24 -translate-y-2 rounded-full bg-primary/25 blur-2xl"
            />
          )}

          <div
            className={[
              'relative mx-auto mb-5 flex h-24 w-24 items-center justify-center rounded-full motion-safe:animate-check-bounce',
              celebrating
                ? 'gradient-gold shadow-gold'
                : alreadyAwarded
                  ? 'bg-muted ring-1 ring-border'
                  : 'bg-success/15 ring-1 ring-success/30',
            ].join(' ')}
          >
            {celebrating ? (
              <RewardIcon className="h-11 w-11 text-primary-foreground" aria-hidden />
            ) : alreadyAwarded ? (
              <RotateCcw className="h-10 w-10 text-muted-foreground" aria-hidden />
            ) : (
              <CheckCircle2 className="h-12 w-12 text-success" aria-hidden />
            )}

            {celebrating && (
              <PartyPopper
                className="absolute -right-1 -top-1 h-6 w-6 text-primary drop-shadow"
                aria-hidden
              />
            )}
          </div>

          <h1 className="font-display text-2xl font-semibold text-foreground">
            {celebrating
              ? '¡Recompensa desbloqueada!'
              : alreadyAwarded
                ? 'Esta visita ya estaba acreditada'
                : '¡Visita acreditada!'}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {celebrating
              ? `Visita registrada${visitsTotal != null ? ` · Nº ${visitsTotal}` : ''}`
              : alreadyAwarded
                ? 'No se han sumado puntos de nuevo para evitar duplicados.'
                : 'Los puntos se han sumado a la cuenta del cliente.'}
          </p>
        </header>

        {/* ── Cliente + servicio ────────────────────────────────── */}
        {(state.customerName || state.serviceName) && (
          <div
            className="mb-4 rounded-xl border border-border bg-card p-4 text-left motion-safe:animate-slide-up"
            style={{ animationDelay: '60ms', animationFillMode: 'both' }}
          >
            {state.customerName && (
              <div className="flex items-center gap-3">
                <User className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
                <span className="font-medium text-foreground">{state.customerName}</span>
              </div>
            )}
            {state.serviceName && (
              <div className={`flex items-center gap-3 ${state.customerName ? 'mt-3' : ''}`}>
                <Scissors className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
                <span className="text-foreground">{state.serviceName}</span>
                {state.amountCents != null && (
                  <span className="ml-auto text-sm font-medium tabular-nums text-muted-foreground">
                    {formatEuros(state.amountCents)}
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Puntos ganados (dato principal) ────────────────────── */}
        <div
          className="mb-4 flex items-center gap-4 rounded-xl border border-primary/25 bg-primary/10 p-5 text-left motion-safe:animate-slide-up"
          style={{ animationDelay: '120ms', animationFillMode: 'both' }}
        >
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/15">
            <Sparkles className="h-6 w-6 text-primary" aria-hidden />
          </div>
          <div className="min-w-0">
            <p className="text-3xl font-bold leading-none tabular-nums text-primary">
              {pointsEarned > 0 ? `+${pointsEarned}` : pointsEarned}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {pointsEarned > 0
                ? 'Puntos ganados en esta visita'
                : 'Sin puntos nuevos en esta visita'}
            </p>
          </div>
        </div>

        {/* ── Saldo y visitas totales ───────────────────────────── */}
        {(pointsBalance != null || visitsTotal != null) && (
          <div
            className="mb-4 grid grid-cols-2 gap-3 motion-safe:animate-slide-up"
            style={{ animationDelay: '160ms', animationFillMode: 'both' }}
          >
            {pointsBalance != null && (
              <div className="rounded-xl border border-border bg-card p-4 text-left">
                <Wallet className="mb-2 h-4 w-4 text-primary" aria-hidden />
                <p className="text-xl font-bold tabular-nums text-foreground">{pointsBalance}</p>
                <p className="text-xs text-muted-foreground">Saldo de puntos</p>
              </div>
            )}
            {visitsTotal != null && (
              <div className="rounded-xl border border-border bg-card p-4 text-left">
                <TrendingUp className="mb-2 h-4 w-4 text-accent-foreground" aria-hidden />
                <p className="text-xl font-bold tabular-nums text-foreground">{visitsTotal}</p>
                <p className="text-xs text-muted-foreground">Visitas totales</p>
              </div>
            )}
          </div>
        )}

        {/* ── Recompensa desbloqueada ───────────────────────────── */}
        {rewardConfig && !alreadyAwarded && (
          <div
            className="mb-4 overflow-hidden rounded-xl border border-primary/40 bg-gradient-to-br from-primary/15 to-primary/5 p-4 text-left motion-safe:animate-slide-up"
            style={{ animationDelay: '200ms', animationFillMode: 'both' }}
          >
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg gradient-gold shadow-gold">
                <RewardIcon className="h-6 w-6 text-primary-foreground" aria-hidden />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-display text-base font-semibold text-primary">
                    {rewardConfig.label}
                  </p>
                  <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-medium text-primary">
                    Visita {rewardConfig.milestone}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">{rewardConfig.description}</p>

                {(reward?.code || rewardExpiry) && (
                  <dl className="mt-3 space-y-1.5 border-t border-primary/20 pt-3 text-xs">
                    {reward?.code && (
                      <div className="flex items-center justify-between gap-2">
                        <dt className="text-muted-foreground">Código</dt>
                        <dd className="rounded bg-background/60 px-2 py-0.5 font-mono font-medium tracking-wide text-foreground">
                          {reward.code}
                        </dd>
                      </div>
                    )}
                    {rewardExpiry && (
                      <div className="flex items-center justify-between gap-2">
                        <dt className="text-muted-foreground">Válida hasta</dt>
                        <dd className="font-medium text-foreground">{rewardExpiry}</dd>
                      </div>
                    )}
                  </dl>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Cupón canjeado con descuento ──────────────────────── */}
        {redeemedCoupon && (
          <div
            className="mb-4 flex items-center gap-3 rounded-xl border border-success/25 bg-success/10 p-4 text-left motion-safe:animate-slide-up"
            style={{ animationDelay: '230ms', animationFillMode: 'both' }}
          >
            <Ticket className="h-5 w-5 shrink-0 text-success" aria-hidden />
            <div>
              <p className="text-sm font-semibold text-success">Cupón canjeado</p>
              <p className="text-xs text-muted-foreground">
                {discountCents != null && discountCents > 0
                  ? `Descuento de ${formatEuros(discountCents)} aplicado`
                  : 'Descuento de bienvenida aplicado'}
              </p>
            </div>
          </div>
        )}

        {/* ── Progreso a la próxima recompensa ──────────────────── */}
        {!celebrating && visitsToNext != null && visitsToNext > 0 && (
          <div
            className="mb-4 flex items-center gap-3 rounded-xl border border-border bg-muted/40 p-3 text-left motion-safe:animate-slide-up"
            style={{ animationDelay: '250ms', animationFillMode: 'both' }}
          >
            <Target className="h-4 w-4 shrink-0 text-primary" aria-hidden />
            <p className="text-xs text-muted-foreground">
              {visitsToNext === 1
                ? 'Falta 1 visita para la próxima recompensa'
                : `Faltan ${visitsToNext} visitas para la próxima recompensa`}
            </p>
          </div>
        )}

        {/* ── Acciones ──────────────────────────────────────────── */}
        <div
          className="mt-6 space-y-3 motion-safe:animate-slide-up"
          style={{ animationDelay: '280ms', animationFillMode: 'both' }}
        >
          <Button
            onClick={() => navigate('/scan')}
            className="h-12 w-full gradient-gold font-semibold text-primary-foreground shadow-gold"
          >
            Escanear otro cliente
            <ArrowRight className="ml-1 h-4 w-4" aria-hidden />
          </Button>
          <Button
            variant="outline"
            className="h-12 w-full border-border text-foreground"
            onClick={() => navigate('/dashboard')}
          >
            Volver al inicio
          </Button>
        </div>
      </section>
    </div>
  );
}
