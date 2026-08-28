import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Minus } from 'lucide-react';
import { toast } from 'sonner';
import { isCocinaOpen } from '@/lib/kitchen-hours';
import { useCartStore } from '@/lib/cart-store';
import { getRueda, ruedaComponentes, ruedaAgotada, compLabel, type RuedaMontadito } from '@/lib/ruedas';
import { RuedaGourmetDialog } from './RuedaGourmetDialog';

interface RuedaProduct {
  id: string;
  nombre: string;
  descripcion: string | null;
  precio: number;
  numero?: string | null;
  foto_url: string | null;
}

interface Props {
  product: RuedaProduct;
  montaditos: RuedaMontadito[];
  isProductoAgotado: (id: string) => boolean;
  index: number;
}

export function MontyRuedaCard({ product, montaditos, isProductoAgotado, index }: Props) {
  const addItem = useCartStore((s) => s.addItem);
  const updateQuantity = useCartStore((s) => s.updateQuantity);
  const items = useCartStore((s) => s.items);
  const [selectorOpen, setSelectorOpen] = useState(false);

  const def = getRueda(product.numero);
  const comps = useMemo(() => (def ? ruedaComponentes(def, montaditos) : []), [def, montaditos]);

  if (!def) return null;

  const isGourmet = !!def.selectCount;
  const need = def.selectCount ?? 0;
  const agotado = ruedaAgotada(def, montaditos, isProductoAgotado);

  const cantidadEnCarrito = items
    .filter((i) => i.productoId === product.id)
    .reduce((s, i) => s + i.cantidad, 0);

  const addFija = () => {
    addItem({
      id: product.id,
      productoId: product.id,
      nombre: product.nombre,
      precio: product.precio,
      foto_url: product.foto_url,
      componentes: comps.map(compLabel),
    });
  };

  const onGourmetConfirm = (selected: RuedaMontadito[]) => {
    addItem({
      id: `${product.id}::${selected.map((m) => m.id).sort().join('-')}`,
      productoId: product.id,
      nombre: product.nombre,
      precio: product.precio,
      foto_url: product.foto_url,
      componentes: selected.map(compLabel),
    });
    setSelectorOpen(false);
    toast.success(`${product.nombre} añadida 🎡`);
  };

  const handleAdd = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (agotado) return;
    if (!isCocinaOpen()) {
      toast.error('La cocina está cerrada ahora mismo. Solo bebidas y aperitivos de barra.');
      return;
    }
    if (isGourmet) {
      setSelectorOpen(true);
      return;
    }
    addFija();
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.02, duration: 0.3 }}
        whileTap={{ scale: 0.98 }}
        className="relative glass-card flex items-center gap-3 p-3 group"
      >
        {def.img ? (
          <img
            src={def.img}
            alt={product.nombre}
            className="w-14 h-14 object-contain shrink-0 drop-shadow-sm"
            loading="lazy"
          />
        ) : (
          <span className="w-12 h-12 rounded-xl bg-accent/15 text-accent flex items-center justify-center text-2xl shrink-0 shadow-sm border border-border-subtle" aria-hidden>
            🎡
          </span>
        )}

        <div className="flex-1 min-w-0">
          <h3 className="font-display text-sm font-bold text-foreground leading-tight">{product.nombre}</h3>
          {product.descripcion && (
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{product.descripcion}</p>
          )}
          {!isGourmet && comps.length > 0 && (
            <p className="text-[11px] text-muted-foreground/80 mt-0.5 line-clamp-1">
              {comps.map((m) => `#${m.numero}`).join(' · ')}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="text-sm font-bold text-gold whitespace-nowrap">{product.precio.toFixed(2)} €</span>
          {agotado ? (
            <span className="text-[10px] font-black uppercase tracking-wide text-destructive border border-destructive/40 rounded-full px-2.5 py-1">
              Agotado
            </span>
          ) : (
            <AnimatePresence mode="wait" initial={false}>
              {cantidadEnCarrito === 0 || isGourmet ? (
                <motion.button
                  key="add"
                  type="button"
                  initial={{ opacity: 0, scale: 0.6 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.6 }}
                  whileTap={{ scale: 0.85 }}
                  onClick={handleAdd}
                  aria-label={isGourmet ? 'Elegir montaditos de la rueda' : 'Añadir rueda al carrito'}
                  className="relative w-8 h-8 rounded-full bg-primary flex items-center justify-center opacity-70 group-hover:opacity-100 transition-opacity"
                >
                  <Plus className="w-4 h-4 text-primary-foreground" />
                  {isGourmet && cantidadEnCarrito > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[1.1rem] h-[1.1rem] px-1 rounded-full bg-accent text-accent-foreground text-[10px] font-bold flex items-center justify-center tabular-nums">
                      {cantidadEnCarrito}
                    </span>
                  )}
                </motion.button>
              ) : (
                <motion.div
                  key="stepper"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  className="flex items-center gap-1 bg-primary/10 border border-primary/40 rounded-full p-0.5"
                >
                  <button
                    type="button"
                    onClick={() => updateQuantity(product.id, cantidadEnCarrito - 1)}
                    aria-label="Quitar uno"
                    className="w-7 h-7 rounded-full bg-surface-elevated flex items-center justify-center active:scale-90 transition-transform"
                  >
                    <Minus className="w-3.5 h-3.5 text-foreground" />
                  </button>
                  <span className="min-w-[1.25rem] text-center text-sm font-bold text-foreground tabular-nums">
                    {cantidadEnCarrito}
                  </span>
                  <button
                    type="button"
                    onClick={handleAdd}
                    aria-label="Añadir uno más"
                    className="w-7 h-7 rounded-full bg-primary flex items-center justify-center active:scale-90 transition-transform"
                  >
                    <Plus className="w-3.5 h-3.5 text-primary-foreground" />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          )}
        </div>
      </motion.div>

      {isGourmet && (
        <RuedaGourmetDialog
          open={selectorOpen}
          onOpenChange={setSelectorOpen}
          nombre={product.nombre}
          precio={product.precio}
          need={need}
          comps={comps}
          isProductoAgotado={isProductoAgotado}
          onConfirm={onGourmetConfirm}
        />
      )}
    </>
  );
}
