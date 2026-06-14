import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import confetti from 'canvas-confetti';
import { toast } from 'sonner';
import { Clock, ChefHat, CheckCircle2, CreditCard, Beer, UtensilsCrossed, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Monty } from './Monty';
import { playBellSound } from '@/lib/bell-sound';
import { AllergenIcon } from './AllergenIcon';
import { AllergenLegalNotice } from './AllergenLegalNotice';


const fireReadyConfetti = () => {
  const defaults = {
    spread: 360,
    ticks: 120,
    gravity: 0.5,
    decay: 0.94,
    startVelocity: 35,
    colors: ['#E63946', '#F4A261', '#E9C46A', '#FFB703', '#06D6A0'],
  };
  const burst = (originY: number, count: number, scalar: number) =>
    confetti({ ...defaults, particleCount: count, scalar, origin: { x: 0.5, y: originY } });
  burst(0.55, 80, 1.3);
  setTimeout(() => burst(0.4, 50, 1), 250);
  setTimeout(() => burst(0.6, 60, 1.5), 500);
  setTimeout(() => burst(0.5, 40, 0.9), 800);
};

interface Props {
  pedidoId: string;
  numeroPedido: number;
  hasCocina: boolean;
  hasBebidas: boolean;
  sessionId?: string;
  onNewOrder: () => void;
  onRetryPayment?: () => void;
}

const STATUS_CONFIG = {
  pendiente_pago: { label: 'Esperando pago', color: 'text-warning', icon: CreditCard, step: 0 },
  pendiente: { label: 'Esperando caja', color: 'text-warning', icon: CreditCard, step: 0 },
  recibido: { label: 'Recibido', color: 'text-warning', icon: Clock, step: 1 },
  preparando: { label: 'En preparación', color: 'text-info', icon: ChefHat, step: 2 },
  listo: { label: 'Listo para recoger', color: 'text-success', icon: CheckCircle2, step: 3 },
  entregado: { label: 'Entregado', color: 'text-success', icon: CheckCircle2, step: 4 },
  cancelado: { label: 'Cancelado', color: 'text-destructive', icon: Clock, step: -1 },
};

type OrderStatus = keyof typeof STATUS_CONFIG;

interface TicketCardProps {
  kind: 'cocina' | 'bebidas';
  status: OrderStatus;
}

function TicketCard({ kind, status }: TicketCardProps) {
  const config = STATUS_CONFIG[status];
  const isReady = status === 'listo';
  const Icon = kind === 'cocina' ? UtensilsCrossed : Beer;
  const title = kind === 'cocina' ? 'Comida · Recoger en barra' : 'Bebida · Recoger en caja';
  const steps = ['pendiente', 'recibido', 'preparando', 'listo'] as const;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`w-full max-w-sm rounded-3xl border p-5 transition-colors ${
        isReady ? 'border-gold/60 bg-gold/5' : 'border-border-subtle bg-surface'
      }`}
    >
      <div className="flex items-center gap-3 mb-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
          isReady ? 'bg-gold/20 text-gold' : 'bg-surface-elevated text-foreground'
        }`}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="flex-1">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{title}</p>
          <p className={`font-display text-base font-bold ${config.color}`}>{config.label}</p>
        </div>
      </div>

      <div className="flex items-center justify-center w-full">
        {steps.map((step, i) => {
          const stepConfig = STATUS_CONFIG[step];
          const StepIcon = stepConfig.icon;
          const isActive = config.step >= stepConfig.step;
          const isCurrent = config.step === stepConfig.step;
          return (
            <div key={step} className={`flex items-center ${i < steps.length - 1 ? 'flex-1' : ''}`}>
              <motion.div
                className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center border-2 transition-all duration-500 ${
                  isActive
                    ? isCurrent ? 'border-gold bg-gold/20' : 'border-gold/50 bg-gold/10'
                    : 'border-border bg-surface'
                }`}
                animate={isCurrent ? { scale: [1, 1.1, 1] } : {}}
                transition={{ duration: 1.5, repeat: isCurrent ? Infinity : 0 }}
              >
                <StepIcon className={`w-4 h-4 ${isActive ? 'text-gold' : 'text-muted-foreground'}`} />
              </motion.div>
              {i < steps.length - 1 && (
                <div className="flex-1 h-0.5 mx-1">
                  <motion.div
                    className="h-full bg-gold rounded-full"
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: config.step > stepConfig.step ? 1 : 0 }}
                    transition={{ duration: 0.8, ease: 'easeOut' }}
                    style={{ transformOrigin: 'left' }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {isReady && (
        <p className="mt-3 text-xs text-center text-gold/90 font-medium">
          {kind === 'cocina'
            ? '¡Acércate a la barra!'
            : '¡Recoge tu bebida en caja!'}
        </p>
      )}
    </motion.div>
  );
}

export function OrderTracking({ pedidoId, numeroPedido, hasCocina, hasBebidas, sessionId, onNewOrder, onRetryPayment }: Props) {
  const [estadoCocina, setEstadoCocina] = useState<OrderStatus>('pendiente');
  const [estadoBebidas, setEstadoBebidas] = useState<OrderStatus>('pendiente');
  const [estadoGlobal, setEstadoGlobal] = useState<OrderStatus>('pendiente_pago');
  const [retrying, setRetrying] = useState(false);
  const [orderAllergens, setOrderAllergens] = useState<{ codigo: string; nombre: string; icono: string | null }[]>([]);
  const readyFiredCocina = useRef(false);
  const readyFiredBebidas = useRef(false);

  // Cargar alérgenos del pedido una vez
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('pedido_items')
        .select('producto_id, menu_productos!inner(producto_alergenos(alergenos(codigo, nombre, icono, orden)))')
        .eq('pedido_id', pedidoId)
        .setHeader('x-session-id', sessionId ?? '');
      if (!data) return;
      const seen = new Map<string, any>();
      (data as any[]).forEach((row) => {
        const pas = row?.menu_productos?.producto_alergenos ?? [];
        pas.forEach((pa: any) => {
          const a = pa?.alergenos;
          if (a && !seen.has(a.codigo)) seen.set(a.codigo, a);
        });
      });
      setOrderAllergens(
        Array.from(seen.values()).sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
      );
    })();
  }, [pedidoId, sessionId]);

  const refreshOrderStatus = useCallback(async () => {
    const { data, error } = await supabase
      .from('pedidos')
      .select('estado, estado_cocina, estado_bebidas')
      .eq('id', pedidoId)
      .setHeader('x-session-id', sessionId ?? '')
      .maybeSingle();

    if (error) return;
    // No rebotar al menú por una lectura nula/transitoria: las eliminaciones
    // reales llegan por la suscripción realtime DELETE. Perder el ticket aquí
    // equivale a perder un pedido ya pagado.
    if (!data) return;

    const d = data as any;
    setEstadoGlobal((d.estado ?? 'pendiente') as OrderStatus);
    setEstadoCocina((d.estado_cocina ?? d.estado) as OrderStatus);
    setEstadoBebidas((d.estado_bebidas ?? d.estado) as OrderStatus);
  }, [pedidoId, sessionId, onNewOrder]);

  // Initial fetch — bounce to menu if order missing
  useEffect(() => {
    refreshOrderStatus();
    const interval = window.setInterval(refreshOrderStatus, 2500);
    return () => window.clearInterval(interval);
  }, [refreshOrderStatus]);

  const handleRetryPayment = useCallback(() => {
    if (retrying) return;
    setRetrying(true);
    try {
      onRetryPayment?.();
    } finally {
      setRetrying(false);
    }
  }, [onRetryPayment, retrying]);

  const handleCancelOrder = useCallback(async () => {
    try {
      await supabase.rpc('cancel_own_pending_order', { _pedido_id: pedidoId } as any)
        .setHeader('x-session-id', sessionId ?? '');
      onNewOrder();
    } catch (e) {
      console.error('cancel_own_pending_order', e);
      toast.error('No se pudo cancelar el pedido. Inténtalo de nuevo.');
    }
  }, [onNewOrder, pedidoId, sessionId]);


  // Realtime updates + delete detection
  useEffect(() => {
    const channel = supabase
      .channel(`pedido-${pedidoId}`)
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'pedidos', filter: `id=eq.${pedidoId}` },
        (payload) => {
          const n = payload.new as any;
          if (n.estado) setEstadoGlobal(n.estado as OrderStatus);
          if (n.estado_cocina) setEstadoCocina(n.estado_cocina as OrderStatus);
          if (n.estado_bebidas) setEstadoBebidas(n.estado_bebidas as OrderStatus);
        })

      .on('postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'pedidos', filter: `id=eq.${pedidoId}` },
        () => { onNewOrder(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [pedidoId, onNewOrder]);

  // Confetti + bell when each part becomes ready
  useEffect(() => {
    if (hasCocina && estadoCocina === 'listo' && !readyFiredCocina.current) {
      readyFiredCocina.current = true;
      fireReadyConfetti();
      playBellSound(0.7);
      try { navigator.vibrate?.([300, 100, 300, 100, 600]); } catch {}
      toast.success('¡Tu pedido está listo! Pasa a recogerlo en la barra.');
    }
    if (estadoCocina !== 'listo') readyFiredCocina.current = false;
  }, [estadoCocina, hasCocina]);

  useEffect(() => {
    if (hasBebidas && estadoBebidas === 'listo' && !readyFiredBebidas.current) {
      readyFiredBebidas.current = true;
      fireReadyConfetti();
      playBellSound(0.7);
      try { navigator.vibrate?.([300, 100, 300, 100, 600]); } catch {}
      toast.success('¡Tu pedido está listo! Pasa a recogerlo en la barra.');
    }
    if (estadoBebidas !== 'listo') readyFiredBebidas.current = false;
  }, [estadoBebidas, hasBebidas]);

  const isFinal = (s: OrderStatus) => s === 'entregado' || s === 'cancelado';
  const allFinal =
    (!hasCocina || isFinal(estadoCocina)) &&
    (!hasBebidas || isFinal(estadoBebidas));

  const anyReady =
    (hasCocina && estadoCocina === 'listo') ||
    (hasBebidas && estadoBebidas === 'listo');

  // Pantalla especial: pago pendiente o cancelado por timeout
  if (estadoGlobal === 'pendiente_pago' || estadoGlobal === 'cancelado') {
    const isCancelled = estadoGlobal === 'cancelado';
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 py-10 gap-6 text-center">
        <div className={`w-16 h-16 rounded-full flex items-center justify-center ${isCancelled ? 'bg-destructive/15 text-destructive' : 'bg-warning/15 text-warning'}`}>
          <CreditCard className="w-7 h-7" />
        </div>
        <div>
          <p className="text-muted-foreground text-xs uppercase tracking-widest mb-1">Pedido</p>
          <h1 className="font-display font-black leading-none text-foreground text-5xl">
            #{String(numeroPedido).padStart(4, '0')}
          </h1>
        </div>
        <h2 className="font-display text-2xl font-bold">
          {isCancelled ? 'Pedido cancelado' : 'Pago pendiente'}
        </h2>
        <p className="text-sm text-muted-foreground max-w-xs">
          {isCancelled
            ? 'No se confirmó el pago a tiempo. Puedes hacer un pedido nuevo cuando quieras.'
            : 'Tu pedido se enviará a la cocina en cuanto Stripe confirme el cobro. Si no completaste el pago, vuelve a intentarlo.'}
        </p>
        <div className="flex flex-col gap-3 w-full max-w-xs">
          {!isCancelled && (
            <button
              onClick={handleRetryPayment}
              disabled={retrying}
              className="w-full px-6 py-3 rounded-2xl bg-primary text-primary-foreground font-semibold disabled:opacity-60"
            >
              {retrying ? 'Abriendo…' : 'Reintentar pago'}
            </button>
          )}
          <button
            onClick={handleCancelOrder}
            className="w-full px-6 py-3 rounded-2xl bg-surface border border-border-subtle text-foreground font-medium hover:bg-surface-elevated transition-colors"
          >
            {isCancelled ? 'Volver al menú' : 'Cancelar y volver al menú'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center px-6 py-10 gap-6 relative overflow-hidden">

      {/* Único número de ticket */}
      <motion.div
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', damping: 15 }}
        className="text-center"
      >
        <p className="text-muted-foreground text-xs uppercase tracking-widest mb-1">
          Tu número de pedido
        </p>
        <h1 className={`font-display font-black leading-none ${anyReady ? 'text-gold' : 'text-foreground'} text-[88px]`}>
          #{String(numeroPedido).padStart(4, '0')}
        </h1>
      </motion.div>

      <div className="flex flex-col items-center gap-4 w-full">
        {hasCocina && <TicketCard kind="cocina" status={estadoCocina} />}
        {hasBebidas && <TicketCard kind="bebidas" status={estadoBebidas} />}
      </div>

      {orderAllergens.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-sm rounded-2xl border border-[#FCD34D]/40 bg-[#FEF3C7]/10 p-4"
        >
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-[#92400E]" />
            <p className="text-xs font-bold uppercase tracking-wider text-foreground">
              Tu pedido contiene
            </p>
          </div>
          <div className="flex flex-wrap gap-2 mb-2">
            {orderAllergens.map((a) => (
              <div key={a.codigo} className="flex items-center gap-1.5 pr-2 pl-0.5 py-0.5 rounded-full bg-surface">
                <AllergenIcon codigo={a.codigo} nombre={a.nombre} icono={a.icono} size="sm" />
                <span className="text-[11px] font-semibold">{a.nombre}</span>
              </div>
            ))}
          </div>
          <AllergenLegalNotice variant="short" />
        </motion.div>
      )}

      {anyReady && (
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center"
        >
          <Monty pose="celebrating" size={120} animate="bounce" />
        </motion.div>
      )}

      {allFinal && (
        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          onClick={onNewOrder}
          className="mt-2 px-8 py-3 rounded-2xl bg-surface border border-border-subtle text-foreground font-medium hover:bg-surface-elevated transition-colors"
        >
          Hacer otro pedido
        </motion.button>
      )}

      {!allFinal && (
        <p className="mt-2 text-xs text-muted-foreground text-center max-w-xs">
          No cierres esta pantalla: es tu comprobante para recoger comida y bebida.
        </p>
      )}
    </div>
  );
}
