import { motion } from 'framer-motion';
import { SECTION_IMAGES } from '@/lib/section-images';

interface Category {
  id: string;
  nombre: string;
  logo_url?: string | null;
  imagen_url?: string | null;
}

interface Props {
  categories: Category[];
  onSelect: (id: string) => void;
}

const CATEGORY_BG: Record<string, { bg: string; text: string }> = {
  Montaditos:   { bg: 'bg-[#962d1e]', text: 'text-white' },
  MontyRuedas:  { bg: 'bg-[#C9B99A]', text: 'text-[#2D2926]' },
  Ensaladas:    { bg: 'bg-[#2D6A4F]', text: 'text-white' },
  Aperitivos:   { bg: 'bg-[#B8C5D0]', text: 'text-[#2D2926]' },
  Raciones:     { bg: 'bg-[#D4A59A]', text: 'text-[#2D2926]' },
  Bebidas:      { bg: 'bg-[#1B4332]', text: 'text-white' },
};

const DEFAULT = { bg: 'bg-primary', text: 'text-primary-foreground' };

export function CategoryGrid({ categories, onSelect }: Props) {
  return (
    <div className="grid grid-cols-2 gap-4 px-4 max-w-lg mx-auto">
      {categories.map((cat, i) => {
        const s = CATEGORY_BG[cat.nombre] || DEFAULT;
        const logo = SECTION_IMAGES[cat.nombre] || cat.logo_url || cat.imagen_url;
        return (
          <motion.button
            key={cat.id}
            onClick={() => onSelect(cat.id)}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06, type: 'spring', damping: 18 }}
            whileTap={{ scale: 0.95 }}
            whileHover={{ y: -4 }}
            className={`aspect-square rounded-3xl ${s.bg} ${s.text} shadow-lg flex flex-col items-center justify-center gap-2 p-4 transition-shadow hover:shadow-xl`}
          >
            {logo ? (
              <img
                src={logo}
                alt={cat.nombre}
                className="w-20 h-20 object-contain drop-shadow-md"
                loading="lazy"
              />
            ) : (
              <span className="text-5xl" aria-hidden>📋</span>
            )}
            <span className="font-display text-xl font-black tracking-tight text-center leading-tight">
              {cat.nombre}
            </span>
          </motion.button>
        );
      })}
    </div>
  );
}
