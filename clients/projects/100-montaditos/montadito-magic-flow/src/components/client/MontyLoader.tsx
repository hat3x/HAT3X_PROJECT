import { motion } from 'framer-motion';
import { Monty } from './Monty';

interface Props {
  message?: string;
  fullscreen?: boolean;
}

export function MontyLoader({ message = 'Preparando el menú...', fullscreen = true }: Props) {
  return (
    <div
      className={
        fullscreen
          ? 'fixed inset-0 z-[55] bg-background flex flex-col items-center justify-center px-6'
          : 'flex flex-col items-center justify-center py-12 px-6'
      }
    >
      <motion.div
        animate={{ y: [0, -20, 0] }}
        transition={{ duration: 0.7, repeat: Infinity, ease: 'easeOut' }}
      >
        <Monty pose="waving" size={140} animate="none" />
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="mt-6 flex items-center gap-1.5"
      >
        <p className="font-display text-sm text-muted-foreground">{message}</p>
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="w-1.5 h-1.5 rounded-full bg-primary"
            animate={{ y: [0, -4, 0], opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15 }}
          />
        ))}
      </motion.div>
    </div>
  );
}
