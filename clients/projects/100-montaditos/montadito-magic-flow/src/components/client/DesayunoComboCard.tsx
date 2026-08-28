import { useState } from 'react';
import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { toast } from 'sonner';
import { useCartStore } from '@/lib/cart-store';
import { MONTADITO_IMAGES_BY_NUMERO, PRODUCT_IMAGES } from '@/lib/product-images';
import {
  DESAYUNO_COMBOS,
  DESAYUNO_ZUMOS,
  DESAYUNO_ZUMO_EXTRA,
  DESAYUNO_COCINA_PRODUCT_ID,
  DESAYUNO_PRODUCT_IMAGES,
  CROISSANT_MERMELADA_IMAGES,
  MERMELADAS,
  type DesayunoComboTipo,
} from '@/lib/desayunos';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { getDrinkImage } from '@/lib/drink-image';

const CAFE_IMG = getDrinkImage('café');
const INFUSION_IMG = getDrinkImage('infusión');

interface Gourmet {
  id: string;
  numero: string | null;
  nombre: string;
}

interface Props {
  tipo: DesayunoComboTipo;
  /** MontyCookies (68–70) para el Desayuno Dulce. */
  gourmets?: Gourmet[];
  isProductoAgotado?: (id: string) => boolean;
  /** true si los productos del combo existen en BD (si no, el banner es solo visual). */
  ready?: boolean;
  index: number;
}

const CAFE_TIPOS = ['Solo', 'Cortado', 'Con leche', 'Bombón'] as const;

type Step = 'comida' | 'mermelada' | 'montadito' | 'bebida' | 'cafe' | 'zumo';

const CROISSANT_IMG = DESAYUNO_PRODUCT_IMAGES['Croissant de mantequilla y mermelada'];
const TOSTADA_CLASICA_IMG = DESAYUNO_PRODUCT_IMAGES['Jamón Gran Reserva y tomate'];

export function DesayunoComboCard({ tipo, gourmets = [], isProductoAgotado, ready = true, index }: Props) {
  const addItem = useCartStore((s) => s.addItem);
  const def = DESAYUNO_COMBOS[tipo];

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>(tipo === 'clasico' ? 'comida' : 'montadito');
  const [comida, setComida] = useState<'tostada' | 'croissant' | null>(null);
  const [mermelada, setMermelada] = useState<string | null>(null);
  const [gourmet, setGourmet] = useState<Gourmet | null>(null);
  const [bebida, setBebida] = useState<'cafe' | 'infusion' | null>(null);
  const [cafeTipo, setCafeTipo] = useState<typeof CAFE_TIPOS[number] | null>(null);
  const [cafeDescafeinado, setCafeDescafeinado] = useState(false);

  const start = () => {
    if (!ready) {
      toast('Este desayuno estará disponible muy pronto');
      return;
    }
    setStep(tipo === 'clasico' ? 'comida' : 'montadito');
    setComida(null);
    setMermelada(null);
    setGourmet(null);
    setBebida(null);
    setCafeTipo(null);
    setCafeDescafeinado(false);
    setOpen(true);
  };

  const foodLabel = (merm: string | null): string => {
    if (tipo === 'clasico') {
      return comida === 'croissant'
        ? `Croissant de mantequilla y mermelada de ${(merm ?? '').toLowerCase()}`
        : 'Tostada con tomate y jamón';
    }
    const g = gourmet!;
    // Incluye el nº de la cookie (#68/#69/#70) para que cocina y caja lo vean.
    return `MontyCookie${g.numero ? ` #${g.numero}` : ''}: ${g.nombre}`;
  };

  const bebidaLabel = (b: 'cafe' | 'infusion' | null, tipo2: typeof cafeTipo, descaf: boolean): string => {
    if (b === 'infusion') return 'Infusión';
    if (b === 'cafe' && tipo2) return descaf ? `Café ${tipo2.toLowerCase()} descafeinado` : `Café ${tipo2.toLowerCase()}`;
    return 'Café';
  };

  const finish = (zumo: string | null, merm: string | null = mermelada, b: 'cafe' | 'infusion' | null = bebida, tipo2: typeof cafeTipo = cafeTipo, descaf: boolean = cafeDescafeinado) => {
    const precio = def.precio + (zumo ? DESAYUNO_ZUMO_EXTRA : 0);
    const food = foodLabel(merm);
    const drinkLabel = bebidaLabel(b, tipo2, descaf);
    const componentes = [food, drinkLabel, ...(zumo ? [zumo] : [])];
    addItem({
      id: `${def.productoId}::${food}|${drinkLabel}|${zumo ?? 'sin-zumo'}`,
      productoId: def.productoId,
      nombre: def.nombre,
      precio,
      foto_url: def.banner,
      componentes,
      destino: 'bebidas', // café/infusión/zumo → barra/caja; aquí se cobra el desayuno
      extraCocina: { producto_id: DESAYUNO_COCINA_PRODUCT_ID, label: food }, // comida → cocina
    });
    setOpen(false);
    toast.success(`${def.nombre} añadido`);
  };

  const pickComida = (key: 'tostada' | 'croissant') => {
    setComida(key);
    setStep(key === 'croissant' ? 'mermelada' : 'bebida'); // la tostada no lleva mermelada
  };
  const pickMermelada = (m: string) => { setMermelada(m); setStep('bebida'); };
  const pickGourmet = (g: Gourmet) => { setGourmet(g); setStep('bebida'); };
  const pickBebida = (b: 'cafe' | 'infusion') => {
    setBebida(b);
    if (b === 'cafe') setStep('cafe');
    else setStep('zumo'); // la infusión no tiene sub-opciones
  };
  const pickCafe = (t: typeof CAFE_TIPOS[number]) => { setCafeTipo(t); setStep('zumo'); };

  const title =
    step === 'comida' ? '¿Tostada o croissant?'
    : step === 'mermelada' ? '¿Qué mermelada para el croissant?'
    : step === 'montadito' ? 'Elige tu MontyCookie'
    : step === 'bebida' ? '¿Café o infusión?'
    : step === 'cafe' ? '¿Cómo te gusta el café?'
    : '¿Quieres añadir zumo?';

  return (
    <>
      <motion.button
        type="button"
        onClick={start}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.05, duration: 0.3 }}
        className="block w-full active:scale-[0.98] transition-transform"
      >
        <img src={def.banner} alt={def.nombre} className="w-full h-auto" loading="lazy" />
      </motion.button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-display text-lg">{title}</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground pt-1">{def.nombre}</DialogDescription>
          </DialogHeader>

          {/* Paso comida (clásico) */}
          {step === 'comida' && (
            <div className="grid grid-cols-2 gap-3 pt-1">
              {[
                { key: 'tostada' as const, label: 'Tostada con tomate y jamón', img: TOSTADA_CLASICA_IMG },
                { key: 'croissant' as const, label: 'Croissant de mantequilla y mermelada', img: CROISSANT_IMG },
              ].map((o) => (
                <button
                  key={o.key}
                  onClick={() => pickComida(o.key)}
                  className="flex flex-col items-center gap-2 p-3 rounded-2xl bg-card border-2 border-border hover:border-primary hover:bg-primary/5 transition-all active:scale-95"
                >
                  <img src={o.img} alt={o.label} className="w-24 h-20 object-contain" />
                  <span className="font-display font-bold text-xs text-center text-foreground leading-tight">{o.label}</span>
                </button>
              ))}
            </div>
          )}

          {/* Paso mermelada (croissant) */}
          {step === 'mermelada' && (
            <div className="grid grid-cols-2 gap-3 pt-1">
              {MERMELADAS.map((m) => (
                <button
                  key={m}
                  onClick={() => pickMermelada(m)}
                  className="flex flex-col items-center gap-2 p-3 rounded-2xl bg-card border-2 border-border hover:border-primary hover:bg-primary/5 transition-all active:scale-95"
                >
                  <img src={CROISSANT_MERMELADA_IMAGES[m]} alt={`Croissant con mermelada de ${m}`} className="w-24 h-20 object-contain" />
                  <span className="font-display font-bold text-sm text-center text-foreground leading-tight">{m}</span>
                </button>
              ))}
            </div>
          )}

          {/* Paso montadito (dulce): elige 1 MontyCookie */}
          {step === 'montadito' && (
            <div className="grid grid-cols-1 gap-2 pt-1 max-h-[55vh] overflow-y-auto">
              {gourmets.map((m) => {
                const ag = isProductoAgotado?.(m.id);
                const gimg = (m.numero ? MONTADITO_IMAGES_BY_NUMERO[m.numero] : undefined) ?? PRODUCT_IMAGES[m.nombre];
                return (
                  <button
                    key={m.id}
                    disabled={ag}
                    onClick={() => pickGourmet(m)}
                    className={`flex items-center gap-3 p-2 rounded-xl border-2 text-left transition-all active:scale-[0.98] ${ag ? 'opacity-40 border-border' : 'border-border hover:border-primary hover:bg-primary/5'}`}
                  >
                    {gimg && <img src={gimg} alt={m.nombre} className="w-12 h-12 object-contain shrink-0" />}
                    <span className="flex-1 min-w-0">
                      {m.numero && <span className="text-muted-foreground font-mono text-xs mr-1">#{m.numero}</span>}
                      <span className="font-display font-bold text-sm text-foreground">{m.nombre}</span>
                      {ag && <span className="block text-[11px] text-destructive font-semibold">Agotado</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Paso bebida caliente: café o infusión */}
          {step === 'bebida' && (
            <div className="grid grid-cols-2 gap-3 pt-1">
              {[
                { key: 'cafe' as const, label: 'Café', img: CAFE_IMG },
                { key: 'infusion' as const, label: 'Infusión', img: INFUSION_IMG },
              ].map((o) => (
                <button
                  key={o.key}
                  onClick={() => pickBebida(o.key)}
                  className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-card border-2 border-border hover:border-primary hover:bg-primary/5 transition-all active:scale-95"
                >
                  {o.img && <img src={o.img} alt={o.label} className="w-20 h-20 object-contain" />}
                  <span className="font-display font-bold text-base text-center text-foreground">{o.label}</span>
                </button>
              ))}
            </div>
          )}

          {/* Paso café */}
          {step === 'cafe' && (
            <div className="pt-1 space-y-3">
              <label
                className={`flex items-center justify-between px-4 py-2.5 rounded-xl border-2 transition-all cursor-pointer ${cafeDescafeinado ? 'border-primary bg-primary/5' : 'border-border'}`}
              >
                <span className="font-display font-bold text-sm text-foreground">Descafeinado</span>
                <Switch checked={cafeDescafeinado} onCheckedChange={setCafeDescafeinado} />
              </label>
              <div className="grid grid-cols-2 gap-3">
                {CAFE_TIPOS.map((t) => (
                  <button
                    key={t}
                    onClick={() => pickCafe(t)}
                    className="flex flex-col items-center justify-center gap-1 p-4 rounded-2xl bg-card border-2 border-border hover:border-primary hover:bg-primary/5 transition-all active:scale-95 min-h-[64px]"
                  >
                    <span className="font-display font-bold text-sm text-foreground text-center">{t}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Paso zumo */}
          {step === 'zumo' && (
            <div className="grid grid-cols-1 gap-2 pt-1">
              <button
                onClick={() => finish(null)}
                className="flex items-center justify-between p-3 rounded-2xl bg-card border-2 border-border hover:border-primary hover:bg-primary/5 transition-all active:scale-[0.98]"
              >
                <span className="font-display font-bold text-sm text-foreground">Sin zumo</span>
                <Check className="w-4 h-4 text-muted-foreground" />
              </button>
              {DESAYUNO_ZUMOS.map((z) => (
                <button
                  key={z}
                  onClick={() => finish(z)}
                  className="flex items-center justify-between gap-2 p-3 rounded-2xl bg-card border-2 border-border hover:border-primary hover:bg-primary/5 transition-all active:scale-[0.98]"
                >
                  <span className="font-display font-bold text-sm text-foreground">{z}</span>
                  <span className="shrink-0 px-2 py-0.5 rounded-full bg-gold/15 text-gold text-[11px] font-bold">
                    +{DESAYUNO_ZUMO_EXTRA.toFixed(2)}€
                  </span>
                </button>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
