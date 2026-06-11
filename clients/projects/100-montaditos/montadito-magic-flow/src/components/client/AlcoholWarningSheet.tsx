import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle } from 'lucide-react';
import { useAgeGate } from '@/lib/cart-store';

export function AlcoholWarningSheet() {
  const pending = useAgeGate((s) => s.pending);
  const confirm = useAgeGate((s) => s.confirm);
  const cancel = useAgeGate((s) => s.cancel);
  const open = !!pending;

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 z-[60]"
            onClick={cancel}
          />
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-[61] rounded-t-3xl bg-popover border-t border-border-subtle p-6 pb-8"
            role="alertdialog"
            aria-labelledby="alcohol-title"
          >
            <div className="flex justify-center pt-1 pb-4">
              <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
            </div>
            <div className="flex flex-col items-center text-center max-w-sm mx-auto">
              <div className="w-16 h-16 rounded-full bg-destructive/15 flex items-center justify-center mb-4">
                <AlertTriangle className="w-8 h-8 text-destructive" />
              </div>
              <h2 id="alcohol-title" className="font-display text-xl font-bold mb-2">
                Verificación de edad
              </h2>
              <p className="text-sm text-muted-foreground leading-relaxed mb-6">
                La venta de alcohol a menores de 18 años está prohibida por ley en España.
              </p>
              <div className="flex flex-col gap-2 w-full">
                <button
                  onClick={confirm}
                  className="w-full py-3.5 rounded-2xl bg-destructive text-destructive-foreground font-bold text-sm"
                >
                  Confirmo que soy mayor de 18 años
                </button>
                <button
                  onClick={cancel}
                  className="w-full py-3 rounded-2xl bg-surface text-foreground font-semibold text-sm"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
