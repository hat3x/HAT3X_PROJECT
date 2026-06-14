import { useEffect, useState } from 'react';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { ArrowLeft, Lock } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { getStripe } from '@/lib/stripe';
import { toast } from 'sonner';

interface Props {
  pedidoId: string;
  sessionId: string;
  numeroPedido: number;
  hasCocina: boolean;
  hasBebidas: boolean;
  total: number;
  onSuccess: () => void;
  onCancel: () => void;
}

function PayForm({ total, pedidoId, sessionId, numeroPedido, hasCocina, hasBebidas, onSuccess, onCancel }: { total: number; pedidoId: string; sessionId: string; numeroPedido: number; hasCocina: boolean; hasBebidas: boolean; onSuccess: () => void; onCancel: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setSubmitting(true);
    setError(null);

    const { error: submitError } = await elements.submit();
    if (submitError) {
      setError(submitError.message ?? 'Error al validar el formulario');
      setSubmitting(false);
      return;
    }

    // Codificamos los datos del pedido en el return_url como fallback:
    // iOS Safari a veces borra localStorage durante el redirect cross-domain de Apple Pay.
    const returnParams = new URLSearchParams({
      pago: 'ok',
      pid: pedidoId,
      num: String(numeroPedido),
      sid: sessionId,
      cocina: hasCocina ? '1' : '0',
      bebidas: hasBebidas ? '1' : '0',
    });
    const { error: confirmError, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: `${window.location.origin}/?${returnParams.toString()}` },
      redirect: 'if_required',
    });

    if (confirmError) {
      setError(confirmError.message ?? 'El pago no se ha podido procesar');
      setSubmitting(false);
      return;
    }

    if (paymentIntent && (paymentIntent.status === 'succeeded' || paymentIntent.status === 'processing')) {
      try {
        await supabase.functions.invoke('confirm-payment', {
          body: { pedido_id: pedidoId, session_id: sessionId, payment_intent_id: paymentIntent.id },
        });
      } catch (e) {
        console.error('confirm-payment fallback failed', e);
      }
      toast.success('¡Pago realizado!');
      onSuccess();
    } else {
      setError('Estado de pago inesperado. Inténtalo de nuevo.');
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <PaymentElement options={{ layout: 'tabs', paymentMethodOrder: ['apple_pay', 'google_pay', 'card'] }} />
      {error && (
        <p className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-xl px-3 py-2">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={!stripe || submitting}
        className="w-full py-4 rounded-2xl bg-primary text-primary-foreground font-bold text-lg disabled:opacity-50"
      >
        {submitting ? 'Procesando…' : `Pagar ${total.toFixed(2)} €`}
      </button>
      <button
        type="button"
        onClick={onCancel}
        disabled={submitting}
        className="w-full py-3 rounded-2xl bg-surface border border-border-subtle text-foreground font-medium hover:bg-surface-elevated transition-colors disabled:opacity-50"
      >
        Cancelar y volver al menú
      </button>
      <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
        <Lock className="w-3 h-3" />
        Pago seguro procesado por Stripe
      </div>
    </form>
  );
}

export function EmbeddedCheckout({ pedidoId, sessionId, numeroPedido, hasCocina, hasBebidas, total, onSuccess, onCancel }: Props) {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setClientSecret(null);
    setLoadError(null);

    const timeout = window.setTimeout(() => {
      if (!cancelled) setLoadError('La conexión tarda más de lo esperado. Comprueba tu conexión e inténtalo de nuevo.');
    }, 20000);

    (async () => {
      const { data, error } = await supabase.functions.invoke('create-payment-intent', {
        body: { pedido_id: pedidoId, session_id: sessionId },
      });
      if (cancelled) return;
      clearTimeout(timeout);
      if (data?.already_paid) {
        onSuccess();
        return;
      }
      if (error || !data?.client_secret) {
        console.error(error);
        setLoadError('No se pudo inicializar el pago. Inténtalo de nuevo.');
        return;
      }
      setClientSecret(data.client_secret);
    })();
    return () => { cancelled = true; clearTimeout(timeout); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedidoId, sessionId, retryCount]);

  return (
    <div className="min-h-screen bg-background px-5 py-8 flex flex-col">
      <div className="max-w-md mx-auto w-full flex flex-col flex-1">
        <button
          onClick={onCancel}
          className="self-start flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
        >
          <ArrowLeft className="w-4 h-4" /> Volver
        </button>

        <div className="text-center mb-6">
          <p className="text-muted-foreground text-[10px] uppercase tracking-widest mb-1">Pedido</p>
          <h1 className="font-display font-black text-4xl text-foreground">
            #{String(numeroPedido).padStart(4, '0')}
          </h1>
          <p className="mt-3 text-gold font-display text-2xl font-bold">{total.toFixed(2)} €</p>
        </div>

        {loadError && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-xl px-3 py-2 text-center">
              {loadError}
            </p>
            <button
              onClick={() => setRetryCount((c) => c + 1)}
              className="w-full py-3 rounded-2xl bg-primary text-primary-foreground font-semibold"
            >
              Reintentar
            </button>
          </div>
        )}

        {!clientSecret && !loadError && (
          <div className="flex-1 flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {clientSecret && (
          <Elements
            stripe={getStripe()}
            options={{
              clientSecret,
              appearance: {
                theme: 'night',
                variables: {
                  colorPrimary: '#E63946',
                  colorBackground: '#1a1a1a',
                  colorText: '#f5f5f5',
                  colorDanger: '#ef4444',
                  fontFamily: 'DM Sans, system-ui, sans-serif',
                  borderRadius: '12px',
                },
              },
            }}
          >
            <PayForm total={total} pedidoId={pedidoId} sessionId={sessionId} numeroPedido={numeroPedido} hasCocina={hasCocina} hasBebidas={hasBebidas} onSuccess={onSuccess} onCancel={onCancel} />
          </Elements>
        )}
      </div>
    </div>
  );
}
