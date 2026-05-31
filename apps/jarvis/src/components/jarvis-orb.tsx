'use client';
import type { VoiceState } from '@/types/jarvis';

interface JarvisOrbProps { state: VoiceState }

const RING: Record<VoiceState, string> = {
  idle:       '#7c3aed',
  listening:  '#a855f7',
  processing: '#6366f1',
  speaking:   '#c084fc',
};

const FACE: Record<VoiceState, string> = {
  idle:       '#ddd6fe',
  listening:  '#e879f9',
  processing: '#a5b4fc',
  speaking:   '#f0abfc',
};

export function JarvisOrb({ state }: JarvisOrbProps) {
  const ring = RING[state];
  const face = FACE[state];

  return (
    <div className="relative flex flex-col items-center gap-3 select-none">

      {/* ── Ambient floor glow ─────────────────────────────────────────── */}
      <div style={{
        position: 'absolute', bottom: -24, left: '50%', transform: 'translateX(-50%)',
        width: 200, height: 32,
        background: 'radial-gradient(ellipse, rgba(168,85,247,0.55) 0%, rgba(244,63,94,0.25) 55%, transparent 80%)',
        filter: 'blur(10px)',
        pointerEvents: 'none',
      }} />

      {/* ── Main sphere ────────────────────────────────────────────────── */}
      <div
        className={state === 'idle' ? 'animate-orb-breathe' : ''}
        style={{
          position: 'relative',
          width: 200, height: 200,
          borderRadius: '50%',
          background: `
            radial-gradient(circle at 38% 28%,
              #f4f0ff 0%,
              #ccc0e8 30%,
              #9e88cc 58%,
              #6a4fa8 80%,
              #3d2a78 100%
            )
          `,
          boxShadow: `
            inset -10px -10px 24px rgba(0,0,0,0.35),
            inset 6px 6px 18px rgba(255,255,255,0.45),
            0 12px 40px rgba(100,50,200,0.45),
            0 4px 12px rgba(0,0,0,0.7)
          `,
        }}
      >

        {/* ── Face screen ──────────────────────────────────────────────── */}
        <div style={{
          position: 'absolute',
          top: '11%', left: '11%',
          width: '72%', height: '72%',
          borderRadius: '50%',
          background: 'radial-gradient(circle at 45% 40%, #120a20 0%, #060310 100%)',
          boxShadow: `
            0 0 0 2.5px ${ring}ee,
            0 0 14px 5px ${ring}80,
            0 0 36px 10px ${ring}38,
            inset 0 0 24px rgba(0,0,0,0.9)
          `,
          overflow: 'hidden',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>

          {/* Screen sheen */}
          <div style={{
            position: 'absolute', inset: 0, borderRadius: '50%',
            background: 'linear-gradient(135deg, rgba(255,255,255,0.06) 0%, transparent 45%)',
            pointerEvents: 'none',
          }} />

          {/* ── Face SVG ─────────────────────────────────────────────── */}
          <svg viewBox="0 0 100 100" style={{ width: '80%', height: '80%', overflow: 'visible' }}>
            <defs>
              <filter id="aiden-glow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="2.5" result="blur" />
                <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
              </filter>
              <filter id="aiden-glow-strong" x="-60%" y="-60%" width="220%" height="220%">
                <feGaussianBlur stdDeviation="4" result="blur" />
                <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
              </filter>
            </defs>

            {/* IDLE — happy ^^ face */}
            {state === 'idle' && (
              <>
                <path d="M 28 46 Q 37 37 46 46" stroke={face} strokeWidth="4" strokeLinecap="round" fill="none" filter="url(#aiden-glow)" />
                <path d="M 54 46 Q 63 37 72 46" stroke={face} strokeWidth="4" strokeLinecap="round" fill="none" filter="url(#aiden-glow)" />
                <path d="M 34 64 Q 50 76 66 64" stroke={face} strokeWidth="3.5" strokeLinecap="round" fill="none" filter="url(#aiden-glow)" />
              </>
            )}

            {/* LISTENING — open circle eyes, alert */}
            {state === 'listening' && (
              <>
                <circle cx="35" cy="42" r="8" stroke={face} strokeWidth="3.5" fill="none" filter="url(#aiden-glow-strong)" />
                <circle cx="65" cy="42" r="8" stroke={face} strokeWidth="3.5" fill="none" filter="url(#aiden-glow-strong)" />
                <circle cx="35" cy="42" r="2.5" fill={face} filter="url(#aiden-glow)" />
                <circle cx="65" cy="42" r="2.5" fill={face} filter="url(#aiden-glow)" />
                <ellipse cx="50" cy="66" rx="9" ry="4.5" stroke={face} strokeWidth="2.5" fill="none" filter="url(#aiden-glow)" />
              </>
            )}

            {/* PROCESSING — dash eyes, thinking dots */}
            {state === 'processing' && (
              <>
                <line x1="27" y1="43" x2="45" y2="43" stroke={face} strokeWidth="4" strokeLinecap="round" filter="url(#aiden-glow)" />
                <line x1="55" y1="43" x2="73" y2="43" stroke={face} strokeWidth="4" strokeLinecap="round" filter="url(#aiden-glow)" />
                <circle cx="38" cy="67" r="4" fill={face} filter="url(#aiden-glow)" className="animate-dot-appear" />
                <circle cx="50" cy="67" r="4" fill={face} filter="url(#aiden-glow)" className="animate-dot-appear-2" />
                <circle cx="62" cy="67" r="4" fill={face} filter="url(#aiden-glow)" className="animate-dot-appear-3" />
              </>
            )}

            {/* SPEAKING — happy eyes, open mouth */}
            {state === 'speaking' && (
              <>
                <path d="M 28 45 Q 37 37 46 45" stroke={face} strokeWidth="4" strokeLinecap="round" fill="none" filter="url(#aiden-glow)" />
                <path d="M 54 45 Q 63 37 72 45" stroke={face} strokeWidth="4" strokeLinecap="round" fill="none" filter="url(#aiden-glow)" />
                <ellipse cx="50" cy="65" rx="12" ry="8" stroke={face} strokeWidth="3" fill={`${face}22`} filter="url(#aiden-glow-strong)" className="animate-orb-speak" />
              </>
            )}
          </svg>
        </div>

        {/* ── Side panel — HAT3X badge ────────────────────────────────── */}
        <div style={{
          position: 'absolute',
          top: '30%', right: '-7%',
          width: 52, height: 52,
          borderRadius: '50%',
          background: 'radial-gradient(circle at 40% 35%, #1a0f2e 0%, #0a0515 100%)',
          boxShadow: `
            0 0 0 2px #f97316cc,
            0 0 10px 4px #f9731660,
            0 0 22px 8px #f9731628,
            inset 0 0 10px rgba(0,0,0,0.8)
          `,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{ fontSize: 7.5, fontFamily: 'monospace', fontWeight: 800, letterSpacing: '0.02em', color: '#f1f5f9', textAlign: 'center', lineHeight: 1.1 }}>
            HAT<span style={{ color: '#f97316' }}>3</span>X
          </span>
        </div>

        {/* ── Listening: sonar rings ──────────────────────────────────── */}
        {state === 'listening' && (
          <>
            <div className="absolute rounded-full animate-ring-1" style={{ inset: -6, border: `1.5px solid ${ring}70` }} />
            <div className="absolute rounded-full animate-ring-2" style={{ inset: -6, border: `1.5px solid ${ring}50` }} />
            <div className="absolute rounded-full animate-ring-3" style={{ inset: -6, border: `1px solid ${ring}30` }} />
          </>
        )}

        {/* ── Processing: dual spinning arcs ─────────────────────────── */}
        {state === 'processing' && (
          <>
            <div className="absolute animate-spin-slow" style={{
              inset: -4, borderRadius: '50%',
              border: '2.5px solid transparent',
              borderTopColor: ring,
              borderRightColor: `${ring}70`,
            }} />
            <div className="absolute animate-spin-reverse" style={{
              inset: -10, borderRadius: '50%',
              border: '1.5px solid transparent',
              borderBottomColor: `${ring}60`,
              borderLeftColor: `${ring}30`,
            }} />
          </>
        )}

        {/* ── Speaking: glow pulse rings ──────────────────────────────── */}
        {state === 'speaking' && (
          <>
            <div className="absolute rounded-full speak-wave-1" style={{ inset: -4, border: `2px solid ${ring}80` }} />
            <div className="absolute rounded-full speak-wave-2" style={{ inset: -10, border: `1px solid ${ring}40` }} />
          </>
        )}
      </div>

      {/* ── State label ────────────────────────────────────────────────── */}
      <div style={{ height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {state === 'listening' && (
          <span style={{ color: '#a855f7', fontSize: 11, fontFamily: 'monospace', letterSpacing: '0.2em' }}>
            escuchando<span className="animate-blink">_</span>
          </span>
        )}
        {state === 'processing' && (
          <span style={{ color: '#818cf8', fontSize: 11, fontFamily: 'monospace', letterSpacing: '0.2em' }}>
            procesando
            <span className="animate-dot-appear">.</span>
            <span className="animate-dot-appear-2">.</span>
            <span className="animate-dot-appear-3">.</span>
          </span>
        )}
        {state === 'speaking' && (
          <span style={{ color: '#c084fc', fontSize: 11, fontFamily: 'monospace', letterSpacing: '0.2em' }}>
            Aiden responde...
          </span>
        )}
      </div>
    </div>
  );
}
