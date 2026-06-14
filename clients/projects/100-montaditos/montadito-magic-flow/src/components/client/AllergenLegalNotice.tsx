import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Info, X } from 'lucide-react';

interface Props {
  variant?: 'short' | 'full';
  className?: string;
}

export function AllergenLegalNotice({ variant = 'short', className = '' }: Props) {
  if (variant === 'short') {
    return (
      <p className={`text-[11px] text-muted-foreground leading-snug ${className}`}>
        Si tienes alguna alergia o intolerancia alimentaria consulta con el personal del local antes de realizar tu pedido.
      </p>
    );
  }
  return (
    <p className={`text-[11px] text-muted-foreground leading-snug ${className}`}>
      La información sobre alérgenos se proporciona de buena fe y está basada en la información facilitada por nuestros proveedores. Aunque tomamos todas las precauciones posibles, no podemos garantizar que los productos estén completamente libres de trazas de alérgenos. Si padeces una alergia o intolerancia grave, consulta siempre con el personal del local antes de realizar tu pedido. (Reglamento UE 1169/2011)
    </p>
  );
}

export function AllergenLegalNoticeFloat() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-4 z-30 w-10 h-10 rounded-full bg-surface-elevated border border-border-subtle shadow-lg flex items-center justify-center text-muted-foreground hover:bg-surface transition-colors"
        aria-label="Información sobre alérgenos"
      >
        <Info className="w-5 h-5" />
      </button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 z-40"
              onClick={() => setOpen(false)}
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="fixed bottom-0 left-0 right-0 z-50 max-h-[60vh] rounded-t-3xl bg-popover border-t border-border-subtle flex flex-col"
            >
              <div className="flex justify-center pt-3 pb-2">
                <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
              </div>

              <div className="flex items-center justify-between px-6 pb-2">
                <h2 className="font-display text-lg font-bold">Información sobre alérgenos</h2>
                <button
                  onClick={() => setOpen(false)}
                  className="p-2 rounded-full hover:bg-surface transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-6 py-4">
                <div className="rounded-2xl border border-border-subtle bg-surface/50 p-4 space-y-3">
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    La información sobre alérgenos se proporciona de buena fe y está basada en la información facilitada por nuestros proveedores. Aunque tomamos todas las precauciones posibles, no podemos garantizar que los productos estén completamente libres de trazas de alérgenos.
                  </p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Si padeces una alergia o intolerancia grave, consulta siempre con el personal del local antes de realizar tu pedido.
                  </p>
                  <p className="text-[11px] text-muted-foreground/70 leading-relaxed">
                    Reglamento UE 1169/2011 de información alimentaria facilitada al consumidor.
                  </p>
                </div>
              </div>

              <div className="p-4 border-t border-border-subtle">
                <button
                  onClick={() => setOpen(false)}
                  className="w-full py-3 rounded-2xl bg-primary text-primary-foreground font-bold text-base"
                >
                  Entendido
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
