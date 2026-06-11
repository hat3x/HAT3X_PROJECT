import { motion } from 'framer-motion';

interface Category {
  id: string;
  nombre: string;
}

interface Props {
  categories: Category[];
  activeId: string | null;
  onSelect: (id: string | null) => void;
}

const CATEGORY_COLORS: Record<string, { bg: string; text: string; icon: string }> = {
  Montaditos:  { bg: 'bg-[#C8102E]', text: 'text-white', icon: '🥖' },
  Aperitivos:  { bg: 'bg-[#B8C5D0]', text: 'text-[#2D2926]', icon: '🧀' },
  Raciones:    { bg: 'bg-[#D4A59A]', text: 'text-[#2D2926]', icon: '🍖' },
  Montyahorro: { bg: 'bg-[#C9B99A]', text: 'text-[#2D2926]', icon: '💰' },
  Ensaladas:   { bg: 'bg-[#2D6A4F]', text: 'text-white', icon: '🥗' },
  Bebidas:     { bg: 'bg-[#2D6A4F]', text: 'text-white', icon: '🍺' },
};

const DEFAULT_COLOR = { bg: 'bg-primary', text: 'text-primary-foreground', icon: '📋' };

export function CategoryTabs({ categories, activeId, onSelect }: Props) {
  return (
    <div className="flex gap-3 overflow-x-auto pb-2 px-4 scrollbar-hide">
      {categories.map((cat) => {
        const colors = CATEGORY_COLORS[cat.nombre] || DEFAULT_COLOR;
        const isActive = activeId === cat.id;
        return (
          <motion.button
            key={cat.id}
            onClick={() => onSelect(cat.id)}
            whileTap={{ scale: 0.95 }}
            className={`shrink-0 px-5 py-2.5 rounded-full text-sm font-semibold tracking-wide transition-all duration-300 ${
              isActive
                ? `${colors.bg} ${colors.text} shadow-md`
                : 'bg-card text-muted-foreground hover:text-foreground border border-border'
            }`}
          >
            {colors.icon} {cat.nombre}
          </motion.button>
        );
      })}
    </div>
  );
}
