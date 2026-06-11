import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';
import { Monty } from './Monty';

interface Props {
  open: boolean;
  onClose: () => void;
}

const fireConfetti = () => {
  const defaults = {
    spread: 360,
    ticks: 100,
    gravity: 0.6,
    decay: 0.94,
    startVelocity: 30,
    colors: ['#E63946', '#F4A261', '#E9C46A', '#F1FAEE', '#FFB703'],
  };

  const burst = (originY: number, particleCount: number, scalar: number) =>
    confetti({
      ...defaults,
      particleCount,
      scalar,
      origin: { x: 0.5, y: originY },
    });

  burst(0.6, 50, 1.2);
  setTimeout(() => burst(0.55, 30, 0.9), 200);
  setTimeout(() => burst(0.5, 40, 1.4), 400);
};

export function WelcomeScreen({ open, onClose }: Props) {
  const fired = useRef(false);

  useEffect(() => {
    if (open && !fired.current) {
      fired.current = true;
      // small delay so confetti syncs with Monty's bounce
      setTimeout(fireConfetti, 350);
    }
    if (!open) fired.current = false;
  }, [open]);

  const handleClose = () => {
    fireConfetti();
    setTimeout(onClose, 250);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 z-[60] flex flex-col items-center justify-center px-6 overflow-hidden"
          style={{
            background:
              'radial-gradient(ellipse at top, hsl(var(--primary) / 0.15), transparent 60%), hsl(var(--background))',
          }}
        >
          {/* Animated background glow */}
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: [0, 1.2, 1], opacity: [0, 0.6, 0.3] }}
            transition={{ duration: 1.2, ease: 'easeOut' }}
            className="absolute w-[500px] h-[500px] rounded-full bg-primary/10 blur-3xl"
          />

          {/* Monty with dramatic entrance: drop + bounce + wiggle */}
          <motion.div
            initial={{ y: -400, opacity: 0, rotate: -25, scale: 0.5 }}
            animate={{
              y: [-400, 30, -20, 10, -8, 0],
              opacity: 1,
              rotate: [-25, 5, -3, 2, -1, 0],
              scale: [0.5, 1.05, 0.95, 1.02, 0.99, 1],
            }}
            transition={{
              duration: 1.6,
              times: [0, 0.45, 0.65, 0.8, 0.92, 1],
              ease: 'easeOut',
            }}
            className="relative z-10"
          >
            <motion.div
              animate={{ y: [0, -10, 0] }}
              transition={{
                duration: 1.8,
                repeat: Infinity,
                ease: 'easeInOut',
                delay: 1.6,
              }}
            >
              <Monty pose="waving" size={240} animate="none" />
            </motion.div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.2, duration: 0.5 }}
            className="text-center mt-6 max-w-xs relative z-10"
          >
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-2">
              ¡Hola! Soy Monty
            </p>
            <h1 className="font-display text-3xl font-black leading-tight text-foreground">
              Pide tus <span className="text-primary italic">montaditos</span> favoritos sin esperar colas
            </h1>
            <p className="text-sm text-muted-foreground mt-3">
              Yo te ayudo a elegir, tú disfrutas.
            </p>
          </motion.div>

          <motion.button
            initial={{ opacity: 0, y: 30, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ delay: 1.5, type: 'spring', damping: 12 }}
            whileTap={{ scale: 0.94 }}
            whileHover={{ scale: 1.05 }}
            onClick={handleClose}
            className="mt-10 px-10 py-3.5 rounded-full bg-primary text-primary-foreground font-bold shadow-lg shadow-primary/30 relative z-10"
          >
            ¡Vamos allá!
          </motion.button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
