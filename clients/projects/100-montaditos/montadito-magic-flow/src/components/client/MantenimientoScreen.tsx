import { motion } from 'framer-motion';
import montyMantenimiento from '@/assets/monty-mantenimiento.png';

// Mensaje por defecto si en la BD no hay `mensaje_mantenimiento`.
// La app siempre intenta usar el mensaje de la BD; esto es solo la red de seguridad.
const MENSAJE_FALLBACK =
  '¡Estamos en mantenimiento! 🔧 Monty se ha metido en la cocina a estrenar carta ' +
  'nueva y ha colgado el cartel de «ahora vuelvo». Pásate en un ratito, que esto va a ' +
  'estar de escándalo 😋';

export function MantenimientoScreen({ mensaje }: { mensaje?: string | null }) {
  const texto = mensaje?.trim() ? mensaje : MENSAJE_FALLBACK;

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-background px-6">
      {/* Monty con la llave inglesa y la carta nueva */}
      <motion.img
        src={montyMantenimiento}
        alt="Monty"
        initial={{ opacity: 0, scale: 0.5, y: 60 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ delay: 0.1, type: 'spring', stiffness: 180, damping: 14, mass: 1.1 }}
        className="w-64 max-w-[70vw] select-none pointer-events-none"
      />

      {/* Mensaje */}
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.45, duration: 0.45, ease: 'easeOut' }}
        className="mt-4 text-center max-w-xs"
      >
        <p className="font-display font-bold text-foreground text-xl leading-snug">
          {texto}
        </p>
        <p className="mt-4 text-muted-foreground text-xs font-body">
          Volvemos hoy mismo · Gracias por la paciencia 🧡
        </p>
      </motion.div>
    </div>
  );
}
