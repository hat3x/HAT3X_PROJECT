import { motion, AnimatePresence } from 'framer-motion';
import { X, Check } from 'lucide-react';
import { useAllergens } from '@/hooks/use-allergens';
import { useAllergenFilter } from '@/lib/allergen-filter';
import { AllergenIcon } from './AllergenIcon';
import { AllergenLegalNotice } from './AllergenLegalNotice';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function AllergenFilterSheet({ open, onClose }: Props) {
  const { data: alergenos = [] } = useAllergens();
  const excluded = useAllergenFilter((s) => s.excluded);
  const toggle = useAllergenFilter((s) => s.toggle);
  const clear = useAllergenFilter((s) => s.clear);
  const hideMode = useAllergenFilter((s) => s.hideMode);
  const setHideMode = useAllergenFilter((s) => s.setHideMode);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-40"
            onClick={onClose}
          />
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-50 max-h-[88vh] rounded-t-3xl bg-popover border-t border-border-subtle flex flex-col"
          >
            <div className="flex justify-center pt-3 pb-2">
              <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
            </div>

            <div className="flex items-center justify-between px-6 pb-2">
              <div>
                <h2 className="font-display text-xl font-bold">Filtrar alérgenos</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Selecciona los que quieres <span className="font-semibold text-destructive">excluir</span>.
                </p>
              </div>
              <button onClick={onClose} className="p-2 rounded-full hover:bg-surface transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-6 py-2 flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">Modo:</span>
              <button
                onClick={() => setHideMode('warn')}
                className={`px-2.5 py-1 rounded-full border ${hideMode === 'warn' ? 'bg-destructive/20 border-destructive text-destructive' : 'border-border text-muted-foreground'}`}
              >
                Avisar
              </button>
              <button
                onClick={() => setHideMode('hide')}
                className={`px-2.5 py-1 rounded-full border ${hideMode === 'hide' ? 'bg-destructive/20 border-destructive text-destructive' : 'border-border text-muted-foreground'}`}
              >
                Ocultar
              </button>
              <button
                onClick={clear}
                className="ml-auto text-xs text-muted-foreground hover:text-foreground underline"
              >
                Limpiar
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-3">
              <div className="grid grid-cols-3 gap-3">
                {alergenos.map((a) => {
                  const active = excluded.includes(a.codigo);
                  return (
                    <button
                      key={a.id}
                      onClick={() => toggle(a.codigo)}
                      className={`relative flex flex-col items-center gap-2 p-3 rounded-2xl border transition-all ${
                        active
                          ? 'border-destructive bg-destructive/10'
                          : 'border-border-subtle bg-surface hover:bg-surface-elevated'
                      }`}
                    >
                      {active && (
                        <span className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-destructive flex items-center justify-center">
                          <Check className="w-2.5 h-2.5 text-destructive-foreground" />
                        </span>
                      )}
                      <AllergenIcon codigo={a.codigo} nombre={a.nombre} icono={a.icono} size="md" />
                      <span className="text-[11px] font-semibold text-center leading-tight">{a.nombre}</span>
                    </button>
                  );
                })}
              </div>

              <div className="mt-5">
                <AllergenLegalNotice variant="full" />
              </div>
            </div>

            <div className="p-4 border-t border-border-subtle">
              <button
                onClick={onClose}
                className="w-full py-3 rounded-2xl bg-primary text-primary-foreground font-bold text-base"
              >
                Aplicar {excluded.length > 0 ? `(${excluded.length})` : ''}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
