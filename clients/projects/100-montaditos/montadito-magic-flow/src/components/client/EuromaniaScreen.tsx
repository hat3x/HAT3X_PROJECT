import { motion } from 'framer-motion';
import montyEuromaniaWebm from '@/assets/monty-euromania.webm';
import montyEuromaniaVideo from '@/assets/monty-euromania.mp4';

const COLORS = ['#D72B2B', '#FFD700', '#FF6B35', '#4CAF50', '#2196F3', '#FF69B4', '#FF1493', '#FFA500', '#FFFFFF', '#9C27B0'];

// Genera piezas de confeti con posición y propiedades aleatorias pero fijas
const rand = (min: number, max: number) => min + Math.random() * (max - min);

type Piece = {
  id: number;
  startX: number;
  endX: number;
  delay: number;
  duration: number;
  size: number;
  color: string;
  rotations: number;
  isRect: boolean;
  wave: number; // 0 = primera ráfaga, 1 = segunda ráfaga
};

const makePieces = (): Piece[] => {
  const pieces: Piece[] = [];
  let id = 0;

  const add = (count: number, xMin: number, xMax: number, driftMin: number, driftMax: number, delayOffset: number, wave: number) => {
    for (let i = 0; i < count; i++) {
      const startX = rand(xMin, xMax);
      pieces.push({
        id: id++,
        startX,
        endX: startX + rand(driftMin, driftMax),
        delay: delayOffset + rand(0, 0.6),
        duration: rand(2.2, 3.8),
        size: rand(7, 14),
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        rotations: rand(2, 5) * (Math.random() > 0.5 ? 1 : -1),
        isRect: Math.random() > 0.4,
        wave,
      });
    }
  };

  // Ráfaga 1
  add(35, 0, 15,   10, 50,  0.05, 0); // cañón izquierdo
  add(35, 85, 100, -50, -10, 0.05, 0); // cañón derecho
  add(50, 20, 80,  -20, 20,  0.1, 0);  // lluvia central

  // Ráfaga 2 (1.4 s después)
  add(35, 0, 15,   10, 50,  1.4, 1);
  add(35, 85, 100, -50, -10, 1.4, 1);
  add(50, 20, 80,  -20, 20,  1.45, 1);

  return pieces;
};

const PIECES = makePieces();

function Confetti() {
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 9999 }}>
      {PIECES.map((p) => (
        <motion.div
          key={p.id}
          style={{
            position: 'absolute',
            left: `${p.startX}%`,
            top: -16,
            width: p.isRect ? p.size : p.size * 0.7,
            height: p.isRect ? p.size * 0.5 : p.size * 0.7,
            backgroundColor: p.color,
            borderRadius: p.isRect ? 2 : '50%',
          }}
          initial={{ y: -20, x: 0, rotate: 0, opacity: 1 }}
          animate={{
            y: '105vh',
            x: `${p.endX - p.startX}vw`,
            rotate: 360 * p.rotations,
            opacity: [1, 1, 1, 0.8, 0],
          }}
          transition={{
            delay: p.delay,
            duration: p.duration,
            ease: 'easeIn',
          }}
        />
      ))}
    </div>
  );
}

export function EuromaniaScreen() {

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-background px-6">
      <Confetti />
      {/* Vídeo de Monty — WebM con alpha (transparencia real), MP4 como fallback */}
      <motion.video
        autoPlay
        loop
        muted
        playsInline
        initial={{ opacity: 0, scale: 0.5, y: 60 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{
          delay: 0.15,
          type: 'spring',
          stiffness: 180,
          damping: 14,
          mass: 1.1,
        }}
        className="w-72 max-w-[78vw] select-none pointer-events-none"
      >
        <source src={montyEuromaniaWebm} type="video/webm" />
        <source src={montyEuromaniaVideo} type="video/mp4" />
      </motion.video>

      {/* Texto */}
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6, duration: 0.45, ease: 'easeOut' }}
        className="mt-2 text-center max-w-xs"
      >
        <p className="font-display font-bold text-foreground text-xl leading-snug">
          ¡Hoy toca fiesta! 🎉 Es día de Euromanía y todos los montaditos
          están a <span className="text-primary">1 €</span>. ¡Ven y aprovecha
          la promoción!
        </p>
        <p className="mt-3 text-muted-foreground text-xs font-body">
          (Promoción válida solo en barra)
        </p>
      </motion.div>
    </div>
  );
}
