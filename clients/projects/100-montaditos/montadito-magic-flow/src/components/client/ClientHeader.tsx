import { MapPin, ShoppingBag, SlidersHorizontal } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCartStore } from '@/lib/cart-store';
import { useAllergenFilter } from '@/lib/allergen-filter';
import logo from '@/assets/logo-100montaditos.png';

interface Props {
  localName?: string;
  mesa?: number;
  onCartClick: () => void;
  onChangeLocal?: () => void;
  onFilterClick?: () => void;
}

export function ClientHeader({ localName, mesa, onCartClick, onChangeLocal, onFilterClick }: Props) {
  const itemCount = useCartStore((s) => s.itemCount);
  const excludedCount = useAllergenFilter((s) => s.excluded.length);

  return (
    <header className="sticky top-0 z-30 glass px-4 py-3">
      <div className="flex items-center justify-between gap-2 max-w-lg mx-auto">
        <img src={logo} alt="100 Montaditos" className="h-12 shrink-0" />

        {localName && (
          <button
            onClick={onChangeLocal}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface hover:bg-surface-elevated transition-colors min-w-0"
          >
            <MapPin className="w-3.5 h-3.5 text-primary shrink-0" />
            <span className="text-xs font-semibold truncate max-w-[110px]">
              {localName}
            </span>
            {mesa != null && (
              <span className="text-[10px] text-muted-foreground shrink-0">· M{mesa}</span>
            )}
          </button>
        )}

        {onFilterClick && (
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={onFilterClick}
            aria-label="Filtrar alérgenos"
            className="relative p-2.5 rounded-full bg-surface hover:bg-surface-elevated transition-colors shrink-0"
          >
            <SlidersHorizontal className="w-4 h-4" />
            {excludedCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold flex items-center justify-center">
                {excludedCount}
              </span>
            )}
          </motion.button>
        )}

        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={onCartClick}
          className="relative p-3 rounded-full bg-surface hover:bg-surface-elevated transition-colors shrink-0"
        >
          <ShoppingBag className="w-5 h-5" />
          <AnimatePresence>
            {itemCount() > 0 && (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
                className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center"
              >
                {itemCount()}
              </motion.span>
            )}
          </AnimatePresence>
        </motion.button>
      </div>
    </header>
  );
}
