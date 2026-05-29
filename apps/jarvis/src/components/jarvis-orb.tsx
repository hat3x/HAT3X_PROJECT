'use client';
import type { VoiceState } from '@/types/jarvis';

interface JarvisOrbProps { state: VoiceState }

/* ── Per-state design tokens ───────────────────────────────────────────── */
const STATE_CONFIG = {
  idle: {
    gradient:  'from-violet-900 via-purple-800 to-indigo-900',
    outerGlow: '#4c1d9580',
    midGlow:   '#6d28d940',
    innerGlow: '#7c3aed25',
    coreColor: '#a78bfa',
    orbAnim:   'animate-orb-breathe',
    coreAnim:  'animate-core-pulse',
  },
  listening: {
    gradient:  'from-violet-600 via-purple-500 to-indigo-600',
    outerGlow: '#7c3aed90',
    midGlow:   '#a855f760',
    innerGlow: '#c084fc35',
    coreColor: '#ddd6fe',
    orbAnim:   'animate-orb-lean',
    coreAnim:  'animate-core-pulse',
  },
  processing: {
    gradient:  'from-indigo-700 via-blue-600 to-violet-700',
    outerGlow: '#1d4ed880',
    midGlow:   '#3b82f650',
    innerGlow: '#818cf830',
    coreColor: '#a5b4fc',
    orbAnim:   'animate-orb-think',
    coreAnim:  'animate-core-think',
  },
  speaking: {
    gradient:  'from-purple-500 via-violet-400 to-indigo-500',
    outerGlow: '#a855f790',
    midGlow:   '#c084fc60',
    innerGlow: '#e879f935',
    coreColor: '#f0abfc',
    orbAnim:   'animate-orb-speak',
    coreAnim:  'animate-core-speak',
  },
} as const;

/* ── Sound bar stagger delays ───────────────────────────────────────────── */
const BAR_CONFIG: { delay: string; duration: string }[] = [
  { delay: '0ms',   duration: '0.4s' },
  { delay: '100ms', duration: '0.5s' },
  { delay: '200ms', duration: '0.45s' },
  { delay: '50ms',  duration: '0.55s' },
  { delay: '150ms', duration: '0.42s' },
  { delay: '80ms',  duration: '0.48s' },
  { delay: '120ms', duration: '0.5s' },
];

export function JarvisOrb({ state }: JarvisOrbProps) {
  const cfg = STATE_CONFIG[state];

  const boxShadow = [
    `0 0 80px 8px  ${cfg.outerGlow}`,
    `0 0 40px 4px  ${cfg.midGlow}`,
    `0 0 16px 2px  ${cfg.innerGlow}`,
    `inset 0 0 30px rgba(255,255,255,0.06)`,
  ].join(', ');

  return (
    <div className="relative flex flex-col items-center gap-4">
      {/* ── Orb container ─────────────────────────────────────────────── */}
      <div className="relative flex items-center justify-center w-48 h-48">

        {/* ── Speaking: staggered wave glow ───────────────────────────── */}
        {state === 'speaking' && (
          <>
            <div
              className="absolute w-44 h-44 rounded-full speak-wave-1"
              style={{ background: `radial-gradient(circle, ${cfg.outerGlow} 0%, transparent 70%)` }}
            />
            <div
              className="absolute w-44 h-44 rounded-full speak-wave-2"
              style={{ background: `radial-gradient(circle, ${cfg.midGlow} 0%, transparent 70%)` }}
            />
            <div
              className="absolute w-44 h-44 rounded-full speak-wave-3"
              style={{ background: `radial-gradient(circle, ${cfg.innerGlow} 0%, transparent 70%)` }}
            />
          </>
        )}

        {/* ── Listening: dramatic expanding rings ─────────────────────── */}
        {state === 'listening' && (
          <>
            <div
              className="absolute w-48 h-48 rounded-full animate-ring-1"
              style={{ border: `1px solid ${cfg.coreColor}55` }}
            />
            <div
              className="absolute w-48 h-48 rounded-full animate-ring-2"
              style={{ border: `1px solid ${cfg.coreColor}40` }}
            />
            <div
              className="absolute w-48 h-48 rounded-full animate-ring-3"
              style={{ border: `1px solid ${cfg.coreColor}25` }}
            />
          </>
        )}

        {/* ── Processing: dual counter-rotating orbital arcs ──────────── */}
        {state === 'processing' && (
          <>
            <div
              className="absolute w-44 h-44 rounded-full animate-spin-reverse"
              style={{
                border: '1.5px solid transparent',
                borderTopColor: '#818cf8',
                borderRightColor: '#6366f160',
              }}
            />
            <div
              className="absolute w-36 h-36 rounded-full animate-spin-medium"
              style={{
                border: '1.5px solid transparent',
                borderBottomColor: '#a78bfa',
                borderLeftColor: '#7c3aed60',
              }}
            />
          </>
        )}

        {/* ── Core orb sphere ─────────────────────────────────────────── */}
        <div
          className={`relative w-36 h-36 rounded-full bg-gradient-to-br ${cfg.gradient} ${cfg.orbAnim} flex items-center justify-center transition-all duration-500 overflow-hidden`}
          style={{ boxShadow }}
        >
          {/* Holographic sheen overlay */}
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background:
                'linear-gradient(135deg, rgba(255,255,255,0.18) 0%, transparent 40%, rgba(255,255,255,0.06) 60%, transparent 100%)',
              pointerEvents: 'none',
              opacity: 0.22,
            }}
          />

          {/* Inner core glow */}
          <div
            className={`absolute w-14 h-14 rounded-full ${cfg.coreAnim}`}
            style={{
              background: `radial-gradient(circle, ${cfg.coreColor}cc 0%, ${cfg.coreColor}40 55%, transparent 80%)`,
              filter: 'blur(5px)',
            }}
          />

          {/* Listening: dynamic sound bars */}
          {state === 'listening' && (
            <span className="relative z-10 flex gap-[3px] items-end h-6">
              {BAR_CONFIG.map((bar, i) => (
                <span
                  key={i}
                  className="w-[3px] bg-white/85 rounded-full animate-bar-dance origin-bottom"
                  style={{ height: '100%', animationDelay: bar.delay, animationDuration: bar.duration }}
                />
              ))}
            </span>
          )}

          {/* Speaking: pulsing icon */}
          {state === 'speaking' && (
            <span
              className="relative z-10 text-white/80 text-xl font-light select-none animate-orb-speak"
              style={{ textShadow: `0 0 12px ${cfg.coreColor}` }}
            >
              ◈
            </span>
          )}

          {/* Processing: glowing energy dot */}
          {state === 'processing' && (
            <span
              className="relative z-10 w-2 h-2 rounded-full animate-core-think"
              style={{ background: cfg.coreColor, boxShadow: `0 0 10px ${cfg.coreColor}` }}
            />
          )}
        </div>
      </div>

      {/* ── State label below the orb ──────────────────────────────────── */}
      <div className="h-5 flex items-center justify-center">
        {state === 'listening' && (
          <span className="text-violet-400 text-xs font-mono tracking-widest">
            escuchando
            <span className="animate-blink ml-0.5 text-violet-300">_</span>
          </span>
        )}
        {state === 'processing' && (
          <span className="text-indigo-400 text-xs font-mono tracking-widest">
            procesando
            <span className="animate-dot-appear ml-0.5">.</span>
            <span className="animate-dot-appear-2">.</span>
            <span className="animate-dot-appear-3">.</span>
          </span>
        )}
        {state === 'speaking' && (
          <span className="text-purple-300 text-xs font-mono tracking-widest">
            respondiendo
            <span className="animate-dot-appear ml-0.5">.</span>
            <span className="animate-dot-appear-2">.</span>
            <span className="animate-dot-appear-3">.</span>
          </span>
        )}
      </div>
    </div>
  );
}
