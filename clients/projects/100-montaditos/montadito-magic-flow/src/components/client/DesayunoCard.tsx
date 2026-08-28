import { useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, Minus, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useCartStore } from '@/lib/cart-store';
import {
  MERMELADAS,
  PANES,
  tostadaLlevaMermelada,
  DESAYUNO_PRODUCT_IMAGES,
  PAN_IMAGES,
  CROISSANT_MERMELADA_IMAGES,
} from '@/lib/desayunos';
import { AllergenIcon } from './AllergenIcon';
import { AllergenLegalNotice } from './AllergenLegalNotice';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

interface ProductAllergen {
  codigo: string;
  nombre: string;
  icono?: string | null;
}

interface Product {
  id: string;
  nombre: string;
  descripcion?: string | null;
  precio: number;
  numero?: string | null;
  seccion?: string | null;
  foto_url?: string | null;
  alergenos?: ProductAllergen[];
}

interface Props {
  product: Product;
  index: number;
}

const ICON: Record<string, string> = { Tostadas: '🍞', Croissant: '🥐', 'Bollería': '🧁', MontyCookie: '🍪' };

export function DesayunoCard({ product, index }: Props) {
  const addItem = useCartStore((s) => s.addItem);
  const updateQuantity = useCartStore((s) => s.updateQuantity);
  const items = useCartStore((s) => s.items);
  const [open, setOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [merm, setMerm] = useState<string | null>(null);

  const sec = product.seccion ?? '';
  // Imagen por nombre; robusto a si el producto ya viene renombrado con prefijo "Tostada ".
  const img = DESAYUNO_PRODUCT_IMAGES[product.nombre] ?? DESAYUNO_PRODUCT_IMAGES[product.nombre.replace(/^Tostada\s+/i, '')];
  // La bollería y las MontyCookie se entregan desde barra (igual que bebidas/aperitivos) → va a CAJA.
  const destino: 'bebidas' | undefined = (sec === 'Bollería' || sec === 'MontyCookie') ? 'bebidas' : undefined;
  // Las tostadas se muestran con el prefijo "Tostada" (carta, detalle y carrito).
  const displayName =
    sec === 'Tostadas' && !product.nombre.toLowerCase().startsWith('tostada')
      ? `Tostada ${product.nombre}`
      : product.nombre;
  const alergenos = product.alergenos ?? [];
  const needsMerm = (sec === 'Tostadas' && tostadaLlevaMermelada(product.nombre)) || sec === 'Croissant';
  const needsPan = sec === 'Tostadas';
  const isCroissant = sec === 'Croissant';
  const steps: ('mermelada' | 'pan')[] = [
    ...(needsMerm ? (['mermelada'] as const) : []),
    ...(needsPan ? (['pan'] as const) : []),
  ];

  const cantidad = items.filter((i) => i.productoId === product.id).reduce((s, i) => s + i.cantidad, 0);

  const add = (mermelada: string | null, pan: string | null) => {
    const parts = [
      pan ? `Pan ${pan.toLowerCase()}` : null,
      mermelada ? `Mermelada de ${mermelada.toLowerCase()}` : null,
    ].filter(Boolean) as string[];
    const label = parts.join(' · ');
    addItem({
      id: label ? `${product.id}::${label}` : product.id,
      productoId: product.id,
      nombre: displayName, // "Tostada …" en el carrito si es tostada
      numero: product.numero ?? null,
      precio: product.precio,
      foto_url: img ?? product.foto_url ?? null, // imagen del mapa para que se vea en la cesta
      componentes: parts.length ? parts : undefined, // pan/mermelada → cesta + cocina
      variantLabel: label || undefined,
      destino, // bollería → caja; tostadas/croissant → cocina (por defecto)
    });
    toast.success(`${product.nombre} añadido`);
  };

  const handleAdd = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (steps.length === 0) { add(null, null); return; }
    setStep(0); setMerm(null); setOpen(true);
  };

  // Quitar una unidad de este producto (la última variante añadida).
  const decOne = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    const mine = items.filter((i) => i.productoId === product.id);
    const last = mine[mine.length - 1];
    if (last) updateQuantity(last.id, last.cantidad - 1);
  };

  const pick = (val: string) => {
    if (steps[step] === 'mermelada') {
      if (step + 1 < steps.length) { setMerm(val); setStep(step + 1); }
      else { add(val, null); setOpen(false); }   // croissant: solo mermelada
    } else {
      add(merm, val); setOpen(false);             // pan (último paso)
    }
  };

  const stepKey = steps[step];

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.02, duration: 0.3 }}
        className="relative glass-card flex items-center gap-3 p-3 group"
      >
        {/* Zona pulsable → detalle (descripción + alérgenos) */}
        <button type="button" onClick={() => setDetailOpen(true)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
          {img ? (
            <img src={img} alt={product.nombre} className="w-14 h-14 object-contain shrink-0" loading="lazy" />
          ) : (
            <span className="w-12 h-12 rounded-xl bg-accent/15 flex items-center justify-center text-2xl shrink-0 border border-border-subtle" aria-hidden>
              {ICON[sec] ?? '🍽️'}
            </span>
          )}
          <div className="flex-1 min-w-0">
            <h3 className="font-display text-sm font-bold text-foreground leading-tight">{displayName}</h3>
            {product.descripcion && <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{product.descripcion}</p>}
          </div>
        </button>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-sm font-bold text-gold whitespace-nowrap">{product.precio.toFixed(2)} €</span>
          {cantidad === 0 ? (
            <button
              type="button"
              onClick={handleAdd}
              aria-label="Añadir"
              className="w-8 h-8 rounded-full bg-primary flex items-center justify-center opacity-70 group-hover:opacity-100 transition-opacity active:scale-90"
            >
              <Plus className="w-4 h-4 text-primary-foreground" />
            </button>
          ) : (
            <div className="flex items-center gap-1 bg-primary/10 border border-primary/40 rounded-full p-0.5">
              <button type="button" onClick={decOne} aria-label="Quitar uno" className="w-7 h-7 rounded-full bg-surface-elevated flex items-center justify-center active:scale-90">
                <Minus className="w-3.5 h-3.5 text-foreground" />
              </button>
              <span className="min-w-[1.25rem] text-center text-sm font-bold text-foreground tabular-nums">{cantidad}</span>
              <button type="button" onClick={handleAdd} aria-label="Añadir uno más" className="w-7 h-7 rounded-full bg-primary flex items-center justify-center active:scale-90">
                <Plus className="w-3.5 h-3.5 text-primary-foreground" />
              </button>
            </div>
          )}
        </div>
      </motion.div>

      {/* Selección (mermelada / pan) */}
      {steps.length > 0 && (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-w-sm rounded-2xl">
            <DialogHeader>
              <DialogTitle className="font-display text-lg">
                {stepKey === 'mermelada' ? '¿Qué mermelada?' : '¿Qué pan prefieres?'}
              </DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground pt-1">
                {product.nombre}{steps.length > 1 ? ` · paso ${step + 1}/${steps.length}` : ''}
              </DialogDescription>
            </DialogHeader>
            <div className={`grid gap-3 pt-2 ${stepKey === 'mermelada' ? 'grid-cols-2' : 'grid-cols-3'}`}>
              {(stepKey === 'mermelada' ? MERMELADAS : PANES).map((opt) => (
                <button
                  key={opt}
                  onClick={() => pick(opt)}
                  className="flex flex-col items-center justify-center gap-1 p-3 rounded-2xl bg-card border-2 border-border hover:border-primary hover:bg-primary/5 transition-all active:scale-95 min-h-[64px]"
                >
                  {stepKey === 'mermelada' && isCroissant && CROISSANT_MERMELADA_IMAGES[opt] ? (
                    <img src={CROISSANT_MERMELADA_IMAGES[opt]} alt={`Croissant con mermelada de ${opt}`} className="w-20 h-16 object-contain" />
                  ) : stepKey === 'pan' && PAN_IMAGES[opt] ? (
                    <img src={PAN_IMAGES[opt]} alt={opt} className="w-16 h-12 object-contain" />
                  ) : (
                    <span className="text-2xl" aria-hidden>{stepKey === 'mermelada' ? (opt === 'Fresa' ? '🍓' : '🍑') : '🍞'}</span>
                  )}
                  <span className="font-display font-bold text-sm text-foreground text-center leading-tight">{opt}</span>
                </button>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Detalle: imagen + descripción + alérgenos */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-sm rounded-2xl p-0 gap-0 overflow-hidden max-h-[85vh] border-border-subtle">
          <div className="relative flex items-center justify-center bg-gradient-to-b from-secondary/60 to-muted/30 pt-6 pb-4 px-6">
            <div className="absolute w-48 h-48 rounded-full bg-[#F5F0E0]/80 blur-xl" />
            {img ? (
              <img src={img} alt={product.nombre} className="relative z-10 h-40 w-auto object-contain drop-shadow-lg" loading="lazy" />
            ) : (
              <span className="relative z-10 w-28 h-28 rounded-2xl bg-card flex items-center justify-center text-5xl shadow-gold">{ICON[sec] ?? '🍽️'}</span>
            )}
          </div>
          <div className="px-5 pb-5 pt-3 max-h-[55vh] overflow-y-auto">
            <DialogTitle className="font-display text-2xl font-black text-foreground leading-tight">{displayName}</DialogTitle>
            <p className="text-gold font-black mt-1">{product.precio.toFixed(2)} €</p>
            {product.descripcion && (
              <DialogDescription className="text-sm text-muted-foreground mt-2 leading-relaxed">
                {product.descripcion}
              </DialogDescription>
            )}
            {alergenos.length > 0 ? (
              <div className="mt-4 pt-4 border-t border-border-subtle">
                <h4 className="font-display text-sm font-bold mb-3 flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4 text-muted-foreground" /> Alérgenos
                </h4>
                <div className="flex flex-wrap gap-3">
                  {alergenos.map((a) => (
                    <AllergenIcon key={a.codigo} codigo={a.codigo} nombre={a.nombre} icono={a.icono} size="md" showLabel />
                  ))}
                </div>
                <div className="mt-3"><AllergenLegalNotice variant="short" /></div>
              </div>
            ) : (
              <div className="mt-4 pt-4 border-t border-border-subtle">
                <AllergenLegalNotice variant="short" />
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
