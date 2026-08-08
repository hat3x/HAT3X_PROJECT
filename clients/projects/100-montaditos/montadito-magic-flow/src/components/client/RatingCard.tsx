import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Star, X } from 'lucide-react';
import { useActiveLocal } from '@/lib/active-local';
import { shouldAskRating, markRatingAsked, submitValoracion } from '@/lib/valoraciones';

/**
 * Tarjeta de valoración (5 estrellas + comentario opcional) que aparece en la
 * pantalla de seguimiento del pedido. Se muestra como máximo 1 vez al día por
 * móvil (tras el primer pedido del día). Si ya se valoró/cerró hoy, no renderiza.
 */
export function RatingCard({ pedidoId }: { pedidoId: string }) {
  const localId = useActiveLocal((s) => s.local?.id ?? null);
  // Decisión estable en el primer render.
  const [visible, setVisible] = useState(() => shouldAskRating());
  const [stars, setStars] = useState(0);
  const [hover, setHover] = useState(0);
  const [comentario, setComentario] = useState('');
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);

  if (!visible) return null;

  const enviar = async () => {
    if (stars < 1 || sending) return;
    setSending(true);
    await submitValoracion({ estrellas: stars, comentario, pedidoId, localId });
    markRatingAsked();
    setSending(false);
    setDone(true);
  };

  const cerrar = () => {
    markRatingAsked(); // no volver a pedir hoy aunque no valore
    setVisible(false);
  };

  const activo = hover || stars;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative w-full max-w-sm rounded-3xl border border-gold/50 bg-gold/5 p-5"
    >
      {!done && (
        <button
          onClick={cerrar}
          aria-label="Cerrar"
          className="absolute right-3 top-3 text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      )}

      {done ? (
        <div className="py-2 text-center">
          <p className="mb-1 text-3xl">🙏</p>
          <p className="font-display font-bold text-foreground">¡Gracias por tu valoración!</p>
        </div>
      ) : (
        <>
          <p className="text-center font-display text-lg font-bold text-foreground">¿Qué te ha parecido?</p>
          <p className="mb-3 text-center text-xs text-muted-foreground">Tu opinión nos ayuda a mejorar</p>

          <div className="mb-3 flex items-center justify-center gap-1.5">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setStars(n)}
                onMouseEnter={() => setHover(n)}
                onMouseLeave={() => setHover(0)}
                className="p-1 transition-transform active:scale-90"
                aria-label={`${n} estrella${n > 1 ? 's' : ''}`}
              >
                <Star className={`h-9 w-9 ${activo >= n ? 'fill-gold text-gold' : 'text-muted-foreground/40'}`} />
              </button>
            ))}
          </div>

          <AnimatePresence>
            {stars > 0 && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <textarea
                  value={comentario}
                  onChange={(e) => setComentario(e.target.value)}
                  maxLength={500}
                  rows={2}
                  placeholder="¿Algún comentario? (opcional)"
                  className="mb-3 w-full resize-none rounded-2xl border border-border-subtle bg-surface p-3 text-sm focus:border-gold focus:outline-none"
                />
                <button
                  onClick={enviar}
                  disabled={sending}
                  className="w-full rounded-2xl bg-primary py-3 font-bold text-primary-foreground disabled:opacity-60"
                >
                  {sending ? 'Enviando…' : 'Enviar valoración'}
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
    </motion.div>
  );
}
