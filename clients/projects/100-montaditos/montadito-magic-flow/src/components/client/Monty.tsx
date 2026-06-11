import { motion } from 'framer-motion';
import waving from '@/assets/monty-waving.png';
import celebrating from '@/assets/monty-celebrating.png';
import thinking from '@/assets/monty-thinking.png';
import cooking from '@/assets/monty-cooking.png';

const POSES = {
  waving,
  celebrating,
  thinking,
  cooking,
} as const;

export type MontyPose = keyof typeof POSES;

interface MontyProps {
  pose?: MontyPose;
  size?: number;
  className?: string;
  animate?: 'float' | 'bounce' | 'wiggle' | 'none';
  alt?: string;
}

const ANIMATIONS = {
  float: {
    animate: { y: [0, -8, 0] },
    transition: { duration: 2.5, repeat: Infinity, ease: 'easeInOut' as const },
  },
  bounce: {
    animate: { y: [0, -14, 0] },
    transition: { duration: 0.9, repeat: Infinity, ease: 'easeOut' as const },
  },
  wiggle: {
    animate: { rotate: [-3, 3, -3] },
    transition: { duration: 2, repeat: Infinity, ease: 'easeInOut' as const },
  },
  none: { animate: {}, transition: {} },
};

/**
 * Monty — la mascota oficial de la app.
 * Sustituible: cuando subas la versión definitiva, reemplaza los png en src/assets/.
 */
export function Monty({
  pose = 'waving',
  size = 120,
  className = '',
  animate = 'float',
  alt = 'Monty',
}: MontyProps) {
  const anim = ANIMATIONS[animate];
  return (
    <motion.img
      src={POSES[pose]}
      alt={alt}
      width={size}
      height={size}
      loading="lazy"
      className={`object-contain drop-shadow-md select-none pointer-events-none ${className}`}
      style={{ width: size, height: size }}
      animate={anim.animate}
      transition={anim.transition}
    />
  );
}
