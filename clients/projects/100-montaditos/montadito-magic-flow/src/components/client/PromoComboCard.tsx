import { useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, Tag, Star, Check } from 'lucide-react';
import { toast } from 'sonner';
import { useCartStore, useAgeGate } from '@/lib/cart-store';
import { isCocinaOpen, isBebidasOpen, MSG_LOCAL_CERRADO } from '@/lib/kitchen-hours';
import { useAgotados } from '@/hooks/use-agotados';
import { useProducts } from '@/hooks/use-menu';
import { MONTADITO_IMAGES_BY_NUMERO, PRODUCT_IMAGES } from '@/lib/product-images';
import {
  JARRAS_5E,
  COMBO5_COCINA_PRODUCT_ID,
  combo5Price,
  type Combo5Def,
  type ComboStep,
  type Jarra5e,
} from '@/lib/promos-5e';
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
}

interface Props {
  product: Product;
  def: Combo5Def;
  index: number;
}

const ACEITUNA_OPCIONES = [
  { key: 'abuela', label: 'De la abuela' },
  { key: 'manzanilla', label: 'Manzanilla' },
] as const;

const GILDA_OPCIONES = [
  { key: 'boqueron', label: 'Boquerón' },
  { key: 'anchoa', label: 'Anchoa' },
] as const;

function JarraBtn({ j, onClick }: { j: Jarra5e; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
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
}

export function PromoComboCard({ product, def, index }: Props) {
  const addItem = useCartStore((s) => s.addItem);
  const requestAlcohol = useAgeGate((s) => s.request);
  const { isProductoAgotado } = useAgotados();
  const { data: allProducts = [] } = useProducts();

  const [open, setOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [jarraChoices, setJarraChoices] = useState<Jarra5e[]>([]);
  const [componentes, setComponentes] = useState<string[]>([]);
  const [extraCocina, setExtraCocina] = useState<{ producto_id: string; label: string } | null>(null);
  const [seccionSelected, setSeccionSelected] = useState<string[]>([]);

  const start = () => {
    if (!isBebidasOpen()) {
      toast.error(MSG_LOCAL_CERRADO);
      return;
    }
    const necesitaCocina = def.destino === 'cocina' || def.extraCocinaStepIndex !== undefined;
    if (necesitaCocina && !isCocinaOpen()) {
      toast.error('La cocina está cerrada ahora mismo. Este combo incluye comida de cocina.');
      return;
    }
    setStepIndex(0);
    setJarraChoices([]);
    setComponentes([]);
    setExtraCocina(null);
    setSeccionSelected([]);
    setOpen(true);
  };

  const finish = (finalComponentes: string[], finalJarras: Jarra5e[], finalExtraCocina: typeof extraCocina) => {
    const precio = combo5Price(finalJarras);
    const payload = {
      id: `${def.productoId}::${finalComponentes.join('|')}`,
      productoId: def.productoId,
      nombre: def.nombre,
      precio,
      foto_url: null,
      componentes: [...def.fijos, ...finalComponentes],
      destino: def.destino,
      extraCocina: finalExtraCocina ?? undefined,
      contiene_alcohol: def.contieneAlcohol,
    };
    setOpen(false);
    if (def.contieneAlcohol) requestAlcohol(payload);
    else addItem(payload);
    toast.success('Combo añadido al carrito');
  };

  const advance = (label: string, opts?: { jarra?: Jarra5e; cocinaChoice?: { producto_id: string; label: string } }) => {
    const nextComponentes = [...componentes, label];
    const nextJarras = opts?.jarra ? [...jarraChoices, opts.jarra] : jarraChoices;
    const nextExtraCocina = opts?.cocinaChoice ?? extraCocina;
    if (stepIndex + 1 >= def.steps.length) {
      finish(nextComponentes, nextJarras, nextExtraCocina);
      return;
    }
    setComponentes(nextComponentes);
    setJarraChoices(nextJarras);
    setExtraCocina(nextExtraCocina);
    setSeccionSelected([]);
    setStepIndex((i) => i + 1);
  };

  const step: ComboStep | undefined = def.steps[stepIndex];

  const seccionCandidatos = (s: Extract<ComboStep, { type: 'seccion' }>) => {
    const secciones = s.seccion.split('|');
    return allProducts
      .filter((p: any) => {
        if (!p.seccion || !secciones.includes(p.seccion)) return false;
        if (s.precioMax !== undefined && Math.abs(Number(p.precio) - s.precioMax) > 0.01) return false;
        return true;
      })
      // Ordenar por número de montadito ascendente (#11, #12, #13…); los que no
      // tienen número (p. ej. "Para picar") van al final conservando su orden.
      .sort((a: any, b: any) => {
        const na = parseInt(a.numero ?? '', 10);
        const nb = parseInt(b.numero ?? '', 10);
        if (isNaN(na) && isNaN(nb)) return 0;
        if (isNaN(na)) return 1;
        if (isNaN(nb)) return -1;
        return na - nb;
      });
  };

  const toggleSeccion = (id: string, need: number) =>
    setSeccionSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : prev.length < need ? [...prev, id] : prev,
    );

  const confirmSeccion = (s: Extract<ComboStep, { type: 'seccion' }>, candidatos: any[]) => {
    if (seccionSelected.length !== s.need) return;
    const elegidos = candidatos.filter((p) => seccionSelected.includes(p.id));
    const labels = elegidos.map((p) => (p.numero ? `#${p.numero} ${p.nombre}` : p.nombre));
    const cocinaChoice =
      def.extraCocinaStepIndex === stepIndex && elegidos[0]
        ? { producto_id: COMBO5_COCINA_PRODUCT_ID, label: labels[0] }
        : undefined;
    advance(labels.join(', '), { cocinaChoice });
  };

  const img = def.banner ?? PRODUCT_IMAGES[product.nombre] ?? product.foto_url ?? null;

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.05, duration: 0.35 }}
        className="glass-card overflow-hidden h-full flex flex-col"
      >
        {img ? (
          <img src={img} alt={def.nombre} className="w-full h-auto" loading="lazy" />
        ) : (
          <div className="relative h-20 bg-gradient-to-br from-primary to-accent flex items-center justify-center">
            <Tag className="w-7 h-7 text-white/90" />
            <span className="absolute top-2 right-2 bg-white/90 text-primary font-black text-sm px-2 py-0.5 rounded-full shadow">
              5,00 €
            </span>
          </div>
        )}
        <div className="p-2.5 flex flex-col flex-1">
          <h3 className="font-display text-xs font-black text-foreground leading-tight">{def.nombre}</h3>
          {product.descripcion && (
            <p className="text-[10px] text-muted-foreground mt-1 leading-snug line-clamp-2">{product.descripcion}</p>
          )}
          <button
            onClick={start}
            className="mt-auto pt-2 w-full flex items-center justify-center gap-1 px-2 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold shadow-primary active:scale-95 transition-transform"
          >
            <Plus className="w-3 h-3" /> Elegir
          </button>
        </div>
      </motion.div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm rounded-2xl">
          {step?.type === 'jarra' && (
            <>
              <DialogHeader>
                <DialogTitle className="font-display text-lg">Elige tu jarra {step.tamano}</DialogTitle>
                <DialogDescription className="text-sm text-muted-foreground pt-1">
                  Paso {stepIndex + 1}/{def.steps.length}
                </DialogDescription>
              </DialogHeader>
              <div className="pt-1 space-y-3">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Cervezas heladas</p>
                  <div className="space-y-2">
                    {JARRAS_5E.filter((j) => !j.premium).map((j) => (
                      <JarraBtn key={j.nombre} j={j} onClick={() => advance(`Jarra ${j.nombre} (${step.tamano})`, { jarra: j })} />
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Cerveza premium · +0,50€</p>
                  <div className="space-y-2">
                    {JARRAS_5E.filter((j) => j.premium).map((j) => (
                      <JarraBtn key={j.nombre} j={j} onClick={() => advance(`Jarra ${j.nombre} (${step.tamano})`, { jarra: j })} />
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}

          {step?.type === 'aceituna' && (
            <>
              <DialogHeader>
                <DialogTitle className="font-display text-lg">¿Qué aceitunas prefieres?</DialogTitle>
                <DialogDescription className="text-sm text-muted-foreground pt-1">
                  Paso {stepIndex + 1}/{def.steps.length}
                </DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-3 pt-2">
                {ACEITUNA_OPCIONES.map((o) => (
                  <button
                    key={o.key}
                    onClick={() => advance(`Aceitunas · ${o.label}`)}
                    className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-card border-2 border-border hover:border-primary hover:bg-primary/5 transition-all active:scale-95"
                  >
                    <span className="font-display font-bold text-base text-foreground text-center">{o.label}</span>
                  </button>
                ))}
              </div>
            </>
          )}

          {step?.type === 'gilda' && (
            <>
              <DialogHeader>
                <DialogTitle className="font-display text-lg">¿Qué gilda prefieres?</DialogTitle>
                <DialogDescription className="text-sm text-muted-foreground pt-1">
                  Paso {stepIndex + 1}/{def.steps.length}
                </DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-3 pt-2">
                {GILDA_OPCIONES.map((o) => (
                  <button
                    key={o.key}
                    onClick={() => advance(`Gilda de ${o.label.toLowerCase()}`)}
                    className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-card border-2 border-border hover:border-primary hover:bg-primary/5 transition-all active:scale-95"
                  >
                    <span className="font-display font-bold text-base text-foreground text-center">{o.label}</span>
                  </button>
                ))}
              </div>
            </>
          )}

          {step?.type === 'seccion' && (() => {
            const candidatos = seccionCandidatos(step);
            const need = step.need;
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="font-display text-lg">{step.label}</DialogTitle>
                  <DialogDescription className="text-sm text-muted-foreground pt-1">
                    Seleccionados {seccionSelected.length}/{need} · Paso {stepIndex + 1}/{def.steps.length}
                  </DialogDescription>
                </DialogHeader>
                <div className="grid grid-cols-1 gap-2 pt-1 max-h-[55vh] overflow-y-auto">
                  {candidatos.map((m: any) => {
                    const ag = isProductoAgotado(m.id);
                    const sel = seccionSelected.includes(m.id);
                    const full = seccionSelected.length >= need && !sel;
                    const image = (m.numero ? MONTADITO_IMAGES_BY_NUMERO[m.numero] : undefined) ?? PRODUCT_IMAGES[m.nombre];
                    return (
                      <button
                        key={m.id}
                        type="button"
                        disabled={ag || full}
                        onClick={() => toggleSeccion(m.id, need)}
                        className={`flex items-center gap-2 p-2.5 rounded-xl border-2 text-left transition-all ${
                          ag
                            ? 'border-destructive/40 opacity-50'
                            : sel
                              ? 'border-primary bg-primary/10'
                              : full
                                ? 'border-border opacity-40'
                                : 'border-border hover:border-primary hover:bg-primary/5 active:scale-[0.98]'
                        }`}
                      >
                        {image ? (
                          <span className="relative w-12 h-12 shrink-0">
                            <img src={image} alt={m.nombre} className="w-full h-full object-contain" loading="lazy" />
                          </span>
                        ) : (
                          <span className="w-7 h-7 rounded-lg bg-accent/20 text-accent flex items-center justify-center text-xs font-bold shrink-0">
                            {m.numero}
                          </span>
                        )}
                        <span className="flex-1 text-sm font-medium text-foreground leading-tight">
                          {m.numero ? `#${m.numero} ` : ''}
                          {m.nombre}
                        </span>
                        {ag ? (
                          <span className="text-[10px] font-black uppercase text-destructive shrink-0">Agotado</span>
                        ) : sel ? (
                          <span className="w-5 h-5 rounded-full bg-primary flex items-center justify-center shrink-0">
                            <Check className="w-3.5 h-3.5 text-primary-foreground" />
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
                <button
                  type="button"
                  disabled={seccionSelected.length !== need}
                  onClick={() => confirmSeccion(step, candidatos)}
                  className="mt-2 w-full py-3 rounded-full bg-primary text-primary-foreground text-sm font-bold shadow-primary active:scale-95 transition-transform disabled:opacity-40 disabled:active:scale-100"
                >
                  {seccionSelected.length === need ? 'Confirmar' : `Elige ${need - seccionSelected.length} más`}
                </button>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </>
  );
}
