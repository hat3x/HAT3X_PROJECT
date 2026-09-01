import { useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, Tag, Star } from 'lucide-react';
import { toast } from 'sonner';
import { useCartStore, useAgeGate } from '@/lib/cart-store';
import { isCocinaOpen, isBebidasOpen, MSG_LOCAL_CERRADO } from '@/lib/kitchen-hours';
import { PRODUCT_IMAGES } from '@/lib/product-images';
import { PROMO_JARRAS, promoPrice, type PromoJarra } from '@/lib/promo';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

interface Product {
  id: string;
  nombre: string;
  descripcion?: string | null;
  precio: number;
  foto_url?: string | null;
  contiene_alcohol?: boolean;
}

interface Props {
  product: Product;
  index: number;
  /** Id del producto interno "Nachos Salséo Guacamole" (línea de cocina). Null si aún no existe en BD. */
  nachosId?: string | null;
}

export function PromoCard({ product, index, nachosId }: Props) {
  const addItem = useCartStore((s) => s.addItem);
  const requestAlcohol = useAgeGate((s) => s.request);
  const img = PRODUCT_IMAGES[product.nombre] ?? product.foto_url ?? null;

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0); // 0 = 1ª jarra, 1 = 2ª jarra
  const [first, setFirst] = useState<PromoJarra | null>(null);

  const start = () => {
    if (!isBebidasOpen()) {
      toast.error(MSG_LOCAL_CERRADO);
      return;
    }
    if (!isCocinaOpen()) {
      toast.error('La cocina está cerrada ahora mismo. La promo incluye nachos, no se puede pedir.');
      return;
    }
    setStep(0);
    setFirst(null);
    setOpen(true);
  };

  const finish = (j1: PromoJarra, j2: PromoJarra) => {
    const precio = promoPrice([j1, j2]);
    const componentes = [
      `Jarra ${j1.nombre} (Quijote)`,
      `Jarra ${j2.nombre} (Quijote)`,
    ];
    const payload = {
      id: `${product.id}::${j1.nombre}|${j2.nombre}`,
      productoId: product.id,
      nombre: product.nombre,
      precio,
      foto_url: img ?? null,
      contiene_alcohol: true,
      componentes, // 2 jarras → a caja (variante de la línea de bebidas)
      destino: 'bebidas' as const,
      // La ración Nachos Salséo Guacamole va a cocina como línea aparte (solo si el producto existe en BD).
      extraCocina: nachosId ? { producto_id: nachosId } : undefined,
    };
    setOpen(false);
    requestAlcohol(payload); // promo con alcohol → verificación de edad
    toast.success('Promoción añadida');
  };

  const pick = (j: PromoJarra) => {
    if (step === 0) {
      setFirst(j);
      setStep(1);
    } else if (first) {
      finish(first, j);
    }
  };

  const heladas = PROMO_JARRAS.filter((j) => !j.premium);
  const premium = PROMO_JARRAS.filter((j) => j.premium);

  const JarraBtn = ({ j }: { j: PromoJarra }) => (
    <button
      onClick={() => pick(j)}
      className="flex items-center justify-between gap-2 w-full px-4 py-3 rounded-2xl bg-card border-2 border-border hover:border-primary hover:bg-primary/5 transition-all active:scale-[0.98] text-left"
    >
      <span className="font-display font-bold text-sm text-foreground leading-tight">{j.nombre}</span>
      {j.premium && (
        <span className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gold/15 text-gold text-[11px] font-bold">
          <Star className="w-3 h-3 fill-current" /> +0,50€
        </span>
      )}
    </button>
  );

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.05, duration: 0.35 }}
        className="glass-card overflow-hidden"
      >
        {img ? (
          <img src={img} alt={product.nombre} className="w-full h-auto object-cover" loading="lazy" />
        ) : (
          <div className="relative h-32 bg-gradient-to-br from-primary to-accent flex items-center justify-center">
            <Tag className="w-10 h-10 text-white/90" />
            <span className="absolute top-3 right-3 bg-white/90 text-primary font-black text-lg px-3 py-1 rounded-full shadow">
              {product.precio.toFixed(2)} €
            </span>
          </div>
        )}
        <div className="p-4">
          <div className="flex items-start justify-between gap-3">
            <h3 className="font-display text-lg font-black text-foreground leading-tight">{product.nombre}</h3>
          </div>
          {product.descripcion && (
            <p className="text-xs text-muted-foreground mt-2 leading-relaxed">{product.descripcion}</p>
          )}
          <button
            onClick={start}
            className="mt-3 w-full flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-primary text-primary-foreground text-sm font-bold shadow-primary active:scale-95 transition-transform"
          >
            <Plus className="w-4 h-4" /> Elegir mis jarras
          </button>
        </div>
      </motion.div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-display text-lg">
              {step === 0 ? 'Elige tu 1ª jarra' : 'Elige tu 2ª jarra'}
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground pt-1">
              Siempre tamaño Quijote · paso {step + 1}/2
              {step === 1 && first ? ` · 1ª: ${first.nombre}` : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="pt-1 space-y-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Jarras heladas</p>
              <div className="space-y-2">
                {heladas.map((j) => (
                  <JarraBtn key={j.nombre} j={j} />
                ))}
              </div>
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Cerveza premium · +0,50€</p>
              <div className="space-y-2">
                {premium.map((j) => (
                  <JarraBtn key={j.nombre} j={j} />
                ))}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
