import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Minus, Plus, AlertTriangle } from 'lucide-react';
import { useCartStore } from '@/lib/cart-store';
import { getDrinkImage } from '@/lib/drink-image';
import { Monty } from './Monty';
import { AllergenIcon } from './AllergenIcon';
import { AllergenLegalNotice } from './AllergenLegalNotice';


interface Props {
  open: boolean;
  onClose: () => void;
  onCheckout: (ageVerified: boolean) => void;
  isCheckingOut?: boolean;
}

export function CartSheet({ open, onClose, onCheckout, isCheckingOut = false }: Props) {
  const items = useCartStore((s) => s.items);
  const updateQuantity = useCartStore((s) => s.updateQuantity);
  const removeItem = useCartStore((s) => s.removeItem);
  const total = useCartStore((s) => s.total);
  const hasAlcohol = useCartStore((s) => s.hasAlcohol)();
  const [ageVerified, setAgeVerified] = useState(false);

  // Reset el checkbox si el carrito deja de tener alcohol
  useEffect(() => {
    if (!hasAlcohol) setAgeVerified(false);
  }, [hasAlcohol]);

  const cartAllergens = useMemo(() => {
    const map = new Map<string, { codigo: string; nombre: string; icono?: string | null }>();
    items.forEach((it) => {
      (it.alergenos ?? []).forEach((a) => {
        if (!map.has(a.codigo)) map.set(a.codigo, a);
      });
    });
    return Array.from(map.values());
  }, [items]);

  const canCheckout = !hasAlcohol || ageVerified;

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-40"
            onClick={onClose}
          />

          {/* Sheet */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-50 max-h-[85vh] rounded-t-3xl bg-popover border-t border-border-subtle flex flex-col"
          >
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-2">
              <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-6 pb-4">
              <h2 className="font-display text-2xl font-bold">Tu Pedido</h2>
              <button onClick={onClose} className="p-2 rounded-full hover:bg-surface transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Items */}
            <div className="flex-1 overflow-y-auto px-6 space-y-4">
              {items.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <Monty pose="thinking" size={140} animate="float" />
                  <p className="font-display text-lg mt-3 text-foreground">
                    Tu carrito está vacío
                  </p>
                  <p className="text-sm mt-1 text-muted-foreground max-w-xs">
                    Tu carrito está más vacío que una mesa antes del aperitivo 🍺
                  </p>
                </div>
              ) : (
                items.map((item) => {
                  // Prioriza la imagen ya resuelta del propio item (evita coger un montadito
                  // homónimo, p.ej. la tostada "Jamón Gran Reserva y tomate"). Si falta, resuelve por nombre.
                  const itemImage = item.foto_url ?? getDrinkImage(item.nombre, null);

                  return (
                    <motion.div
                      key={item.id}
                      layout
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                      className="flex items-center gap-4 glass-card p-3"
                    >
                      {itemImage && (
                        <img
                          src={itemImage}
                          alt={item.nombre}
                          className="w-16 h-16 rounded-lg object-contain bg-card border border-border-subtle"
                          loading="lazy"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <h4 className="font-display font-bold text-sm truncate">
                          {item.numero && (
                            <span className="text-muted-foreground font-mono mr-1">#{item.numero}</span>
                          )}
                          {item.nombre}
                        </h4>
                        <p className="text-gold text-sm font-semibold">{item.precio.toFixed(2)} €</p>
                        {item.componentes && item.componentes.length > 0 && (
                          <ul className="mt-1 space-y-0.5">
                            {item.componentes.map((c, ci) => (
                              <li key={ci} className="text-[11px] text-muted-foreground leading-tight">· {c}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => updateQuantity(item.id, item.cantidad - 1)}
                          className="w-8 h-8 rounded-full bg-surface flex items-center justify-center hover:bg-surface-elevated transition-colors"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <span className="font-bold text-sm w-5 text-center">{item.cantidad}</span>
                        <button
                          onClick={() => updateQuantity(item.id, item.cantidad + 1)}
                          className="w-8 h-8 rounded-full bg-surface flex items-center justify-center hover:bg-surface-elevated transition-colors"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </motion.div>
                  );
                })
              )}
            </div>

            {/* Footer */}
            {items.length > 0 && (
              <div className="p-6 border-t border-border-subtle">
                {cartAllergens.length > 0 && (
                  <div className="mb-3 p-3 rounded-xl bg-[#FEF3C7]/15 border border-[#FCD34D]/40">
                    <div className="flex items-center gap-2 mb-2">
                      <AlertTriangle className="w-3.5 h-3.5 text-[#92400E]" />
                      <p className="text-xs font-semibold text-foreground">
                        Revisa los alérgenos de tu pedido antes de confirmar
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {cartAllergens.map((a) => (
                        <AllergenIcon key={a.codigo} codigo={a.codigo} nombre={a.nombre} icono={a.icono} size="sm" />
                      ))}
                    </div>
                    <div className="mt-2">
                      <AllergenLegalNotice variant="short" />
                    </div>
                  </div>
                )}
                {hasAlcohol && (
                  <label className="flex items-start gap-3 mb-4 p-3 rounded-xl bg-destructive/10 border border-destructive/30 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={ageVerified}
                      onChange={(e) => setAgeVerified(e.target.checked)}
                      className="mt-0.5 w-4 h-4 accent-destructive shrink-0"
                    />
                    <span className="text-xs text-foreground leading-snug flex-1">
                      <AlertTriangle className="inline w-3.5 h-3.5 text-destructive mr-1 -mt-0.5" />
                      Confirmo que soy mayor de 18 años y acepto mostrar mi DNI si el personal me lo solicita al recoger el pedido.
                    </span>
                  </label>
                )}
                <div className="flex justify-between items-center mb-4">
                  <span className="text-muted-foreground">Total</span>
                  <span className="font-display text-2xl font-bold text-gold">
                    {total().toFixed(2)} €
                  </span>
                </div>
                <motion.button
                  whileTap={canCheckout && !isCheckingOut ? { scale: 0.97 } : undefined}
                  onClick={() => canCheckout && !isCheckingOut && onCheckout(hasAlcohol && ageVerified)}
                  disabled={!canCheckout || isCheckingOut}
                  className="w-full py-4 rounded-2xl bg-primary text-primary-foreground font-bold text-lg relative overflow-hidden group disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <span className="relative z-10 flex items-center justify-center gap-2">
                    {isCheckingOut && (
                      <span className="w-5 h-5 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                    )}
                    {isCheckingOut ? 'Creando pedido…' : 'Realizar Pedido'}
                  </span>
                  <div className="absolute inset-0 shimmer opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                </motion.button>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
