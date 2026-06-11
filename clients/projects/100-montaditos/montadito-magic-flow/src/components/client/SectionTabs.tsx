import { motion } from 'framer-motion';

interface Props {
  sections: string[];
  active: string | null;
  onSelect: (section: string | null) => void;
}

const SECTION_COLORS: Record<string, string> = {
  // Montaditos
  'De la casa': 'bg-[#C8102E] text-white',
  'Clásicos': 'bg-[#1E3A5F] text-white',
  'Imprescindibles': 'bg-[#C9A84C] text-[#1a1a1a]',
  'Especiales': 'bg-[#2D6A4F] text-white',
  'MontyCookie': 'bg-[#D4A59A] text-[#1a1a1a]',
  'MontyDinas': 'bg-[#8B5A2B] text-white',
  'MontyPerros': 'bg-[#B8860B] text-white',
  'MontyBurgers': 'bg-[#CD7F32] text-white',
  'MontyPizzas': 'bg-[#8B4513] text-white',
  'MontyGourmet': 'bg-[#4A5568] text-white',
  // Bebidas
  'Clásicas': 'bg-[#C8102E] text-white',
  'Energéticas': 'bg-[#7CFC00] text-[#1a1a1a]',
  'Tardeo Chill': 'bg-[#6B5B95] text-white',
  'Tardeo Premium': 'bg-[#C9A84C] text-[#1a1a1a]',
  'Jarras Heladas': 'bg-[#F4A300] text-[#1a1a1a]',
  'Cerveza Premium': 'bg-[#B8860B] text-white',
  'Cerveza en Botella': 'bg-[#8B5A2B] text-white',
  'Vino': 'bg-[#722F37] text-white',
  'Café e Infusiones': 'bg-[#4A2C2A] text-white',
};


const DEFAULT_COLOR = 'bg-card text-muted-foreground border border-border';

export function SectionTabs({ sections, active, onSelect }: Props) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
      <motion.button
        whileTap={{ scale: 0.95 }}
        onClick={() => onSelect(null)}
        className={`shrink-0 px-4 py-2 rounded-full text-xs font-bold tracking-wide transition-all duration-300 ${
          active === null
            ? 'bg-primary text-primary-foreground shadow-md'
            : 'bg-card text-muted-foreground border border-border'
        }`}
      >
        Todas
      </motion.button>
      {sections.map((sec) => {
        const colorClass = SECTION_COLORS[sec] || DEFAULT_COLOR;
        const isActive = active === sec;
        return (
          <motion.button
            key={sec}
            whileTap={{ scale: 0.95 }}
            onClick={() => onSelect(sec)}
            className={`shrink-0 px-4 py-2 rounded-full text-xs font-bold tracking-wide transition-all duration-300 ${
              isActive ? `${colorClass} shadow-md ring-2 ring-primary/30` : 'bg-card text-muted-foreground border border-border hover:text-foreground'
            }`}
          >
            {sec}
          </motion.button>
        );
      })}
    </div>
  );
}
