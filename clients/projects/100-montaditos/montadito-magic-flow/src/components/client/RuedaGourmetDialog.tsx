import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { MONTADITO_IMAGES_BY_NUMERO, PRODUCT_IMAGES } from '@/lib/product-images';
import type { RuedaMontadito } from '@/lib/ruedas';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  nombre: string;
  precio: number;
  need: number;
  comps: RuedaMontadito[];
  isProductoAgotado: (id: string) => boolean;
  onConfirm: (selected: RuedaMontadito[]) => void;
}

/** Selector "elige N montaditos" de la MontyRueda Gourmets (carta y chat de Monty). */
export function RuedaGourmetDialog({ open, onOpenChange, nombre, precio, need, comps, isProductoAgotado, onConfirm }: Props) {
  const [selected, setSelected] = useState<string[]>([]);

  // Reinicia la selección cada vez que se abre.
  useEffect(() => {
    if (open) setSelected([]);
  }, [open]);

  const toggle = (id: string) =>
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : prev.length < need ? [...prev, id] : prev,
    );

  const confirm = () => {
    if (selected.length !== need) return;
    onConfirm(comps.filter((m) => selected.includes(m.id)));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm rounded-2xl">
        <DialogHeader>
          <DialogTitle className="font-display text-lg">{nombre} · elige {need}</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground pt-1">
            Seleccionados {selected.length}/{need} · {precio.toFixed(2)} €
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-2 pt-1 max-h-[55vh] overflow-y-auto">
          {comps.map((m) => {
            const ag = isProductoAgotado(m.id);
            const sel = selected.includes(m.id);
            const full = selected.length >= need && !sel;
            const img = (m.numero ? MONTADITO_IMAGES_BY_NUMERO[m.numero] : undefined) ?? PRODUCT_IMAGES[m.nombre];
            return (
              <button
                key={m.id}
                type="button"
                disabled={ag || full}
                onClick={() => toggle(m.id)}
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
                {img ? (
                  <span className="relative w-12 h-12 shrink-0">
                    <img src={img} alt={m.nombre} className="w-full h-full object-contain" loading="lazy" />
                    {m.numero && (
                      <span className="absolute bottom-0 right-0 min-w-[1.15rem] h-[1.15rem] px-1 rounded-full bg-muted text-muted-foreground text-[9px] font-bold flex items-center justify-center border border-border leading-none tabular-nums">
                        {m.numero}
                      </span>
                    )}
                  </span>
                ) : (
                  <span className="w-7 h-7 rounded-lg bg-accent/20 text-accent flex items-center justify-center text-xs font-bold shrink-0">
                    {m.numero}
                  </span>
                )}
                <span className="flex-1 text-sm font-medium text-foreground leading-tight">{m.nombre}</span>
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
          disabled={selected.length !== need}
          onClick={confirm}
          className="mt-2 w-full py-3 rounded-full bg-primary text-primary-foreground text-sm font-bold shadow-primary active:scale-95 transition-transform disabled:opacity-40 disabled:active:scale-100"
        >
          {selected.length === need ? `Añadir rueda · ${precio.toFixed(2)} €` : `Elige ${need - selected.length} más`}
        </button>
      </DialogContent>
    </Dialog>
  );
}
