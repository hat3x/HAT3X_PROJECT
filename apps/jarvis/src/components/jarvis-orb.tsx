'use client';
import type { VoiceState } from '@/types/jarvis';

interface JarvisOrbProps { state: VoiceState }

// ── Face element colors per state ──────────────────────────────────────────
const FACE_COLOR: Record<VoiceState, string> = {
  idle:       'rgba(220,205,255,0.95)',
  listening:  'rgba(240,180,255,0.98)',
  processing: 'rgba(180,195,255,0.95)',
  speaking:   'rgba(250,200,255,0.98)',
};

// ── Ring neon color per state ──────────────────────────────────────────────
const RING_COLOR: Record<VoiceState, string> = {
  idle:       '#9b45ff',
  listening:  '#b855ff',
  processing: '#7070ff',
  speaking:   '#d070ff',
};

export function JarvisOrb({ state }: JarvisOrbProps) {
  const fc   = FACE_COLOR[state];
  const ring = RING_COLOR[state];
  const isIdle = state === 'idle';

  return (
    <div className="relative select-none flex flex-col items-center gap-2">

      {/* ── Floor glow — purple · pink · red (matches image exactly) ──── */}
      <div style={{
        position: 'absolute',
        bottom: -36, left: '50%', transform: 'translateX(-50%)',
        width: 260, height: 44,
        borderRadius: '50%',
        background: 'linear-gradient(90deg, rgba(110,30,200,0.65) 0%, rgba(210,40,140,0.70) 45%, rgba(210,55,25,0.55) 100%)',
        filter: 'blur(18px)',
        pointerEvents: 'none',
      }} />

      {/* ── Outer sphere shell ─────────────────────────────────────────── */}
      <div
        className={isIdle ? 'animate-orb-breathe' : ''}
        style={{
          position: 'relative',
          width: 230,
          height: 230,
          borderRadius: '50%',

          /*
           * Pearl-white shell with realistic 3-D lighting:
           *   - Bright specular highlight top-left (white)
           *   - Soft lavender mid-tones
           *   - Deep purple-dark at bottom-right edge
           */
          background: `
            radial-gradient(circle at 33% 26%,
              #ffffff      0%,
              #f2edfb      5%,
              #ddd0ef     16%,
              #bca8d8     30%,
              #9278b8     46%,
              #6048a0     62%,
              #3c2878     77%,
              #1e1050     100%
            )
          `,

          boxShadow: `
            inset -14px -14px 28px rgba(0,0,0,0.38),
            inset  8px   8px 22px rgba(255,255,255,0.52),
            0 18px 60px rgba(36,12,80,0.85),
            0  6px 18px rgba(0,0,0,0.85)
          `,
        }}
      >

        {/* ── Face screen ─────────────────────────────────────────────── */}
        {/*
         *  Positioned slightly left of center to leave room for the
         *  HAT3X side panel on the right — matches the image composition.
         *  Width: 65% of sphere. Height: 76% of sphere.
         */}
        <div style={{
          position: 'absolute',
          top:    '10%',
          left:   '8%',
          width:  '65%',
          height: '76%',
          borderRadius: '50%',

          /* Deep-black interior with subtle inner glow from ring */
          background: 'radial-gradient(circle at 42% 36%, #0e0618 0%, #040108 100%)',

          /*
           * The neon ring — layered box-shadows simulate the LED tube:
           *   1. Crisp 1.5px ring edge
           *   2. Close bloom
           *   3. Medium bloom
           *   4. Wide ambient glow
           */
          boxShadow: `
            0 0 0 1.8px ${ring},
            0 0  8px  4px ${ring}cc,
            0 0 24px 10px ${ring}70,
            0 0 55px 18px ${ring}2e,
            inset 0 0 40px rgba(0,0,0,0.97)
          `,

          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}>

          {/* Screen glass sheen */}
          <div style={{
            position: 'absolute', inset: 0, borderRadius: '50%',
            background: 'linear-gradient(138deg, rgba(255,255,255,0.07) 0%, transparent 42%)',
            pointerEvents: 'none',
          }} />

          {/* ── Face expressions ─────────────────────────────────────── */}
          <svg
            viewBox="0 0 100 100"
            style={{ width: '88%', height: '88%', overflow: 'visible' }}
          >
            <defs>
              {/* Soft neon glow — mimics the LED glow in the image */}
              <filter id="f-glow" x="-60%" y="-60%" width="220%" height="220%">
                <feGaussianBlur in="SourceGraphic" stdDeviation="2.8" result="b1"/>
                <feGaussianBlur in="SourceGraphic" stdDeviation="1.2" result="b2"/>
                <feMerge>
                  <feMergeNode in="b1"/>
                  <feMergeNode in="b2"/>
                  <feMergeNode in="SourceGraphic"/>
                </feMerge>
              </filter>
              <filter id="f-glow-strong" x="-80%" y="-80%" width="260%" height="260%">
                <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="b1"/>
                <feGaussianBlur in="SourceGraphic" stdDeviation="1.8" result="b2"/>
                <feMerge>
                  <feMergeNode in="b1"/>
                  <feMergeNode in="b2"/>
                  <feMergeNode in="SourceGraphic"/>
                </feMerge>
              </filter>
            </defs>

            {/*
             * IDLE — two soft ^^ arcs (happy squinting eyes) + smile arc
             * Matches the image exactly: arcs open downward at the ends,
             * thinner than full circles, glowing neon lavender.
             */}
            {state === 'idle' && (
              <>
                {/* Left eye — arc curving up in center */}
                <path
                  d="M 24 52 Q 34 40 44 52"
                  stroke={fc} strokeWidth="5" strokeLinecap="round" fill="none"
                  filter="url(#f-glow)"
                />
                {/* Right eye */}
                <path
                  d="M 56 52 Q 66 40 76 52"
                  stroke={fc} strokeWidth="5" strokeLinecap="round" fill="none"
                  filter="url(#f-glow)"
                />
                {/* Smile — shorter, centered, gentle arc */}
                <path
                  d="M 36 67 Q 50 78 64 67"
                  stroke={fc} strokeWidth="4.5" strokeLinecap="round" fill="none"
                  filter="url(#f-glow)"
                />
              </>
            )}

            {/* LISTENING — wide open eyes with iris + attentive O mouth */}
            {state === 'listening' && (
              <>
                <circle cx="34" cy="46" r="9" stroke={fc} strokeWidth="4" fill="none" filter="url(#f-glow-strong)" />
                <circle cx="34" cy="46" r="3" fill={fc} filter="url(#f-glow)" />
                <circle cx="66" cy="46" r="9" stroke={fc} strokeWidth="4" fill="none" filter="url(#f-glow-strong)" />
                <circle cx="66" cy="46" r="3" fill={fc} filter="url(#f-glow)" />
                <ellipse cx="50" cy="68" rx="8" ry="5" stroke={fc} strokeWidth="3.5" fill="none" filter="url(#f-glow)" />
              </>
            )}

            {/* PROCESSING — dash eyes + three bouncing dots */}
            {state === 'processing' && (
              <>
                <line x1="24" y1="47" x2="44" y2="47" stroke={fc} strokeWidth="5" strokeLinecap="round" filter="url(#f-glow)" />
                <line x1="56" y1="47" x2="76" y2="47" stroke={fc} strokeWidth="5" strokeLinecap="round" filter="url(#f-glow)" />
                <circle cx="36" cy="68" r="4.5" fill={fc} filter="url(#f-glow)" className="animate-dot-appear" />
                <circle cx="50" cy="68" r="4.5" fill={fc} filter="url(#f-glow)" className="animate-dot-appear-2" />
                <circle cx="64" cy="68" r="4.5" fill={fc} filter="url(#f-glow)" className="animate-dot-appear-3" />
              </>
            )}

            {/* SPEAKING — happy eyes + animated open mouth */}
            {state === 'speaking' && (
              <>
                <path d="M 24 51 Q 34 40 44 51" stroke={fc} strokeWidth="5" strokeLinecap="round" fill="none" filter="url(#f-glow)" />
                <path d="M 56 51 Q 66 40 76 51" stroke={fc} strokeWidth="5" strokeLinecap="round" fill="none" filter="url(#f-glow)" />
                <ellipse cx="50" cy="67" rx="13" ry="9"
                  stroke={fc} strokeWidth="3.5" fill={`${fc.replace('0.98', '0.12').replace('0.95', '0.10')}`}
                  filter="url(#f-glow-strong)"
                  className="animate-orb-speak"
                />
              </>
            )}
          </svg>
        </div>

        {/* ── HAT3X side panel ─────────────────────────────────────────── */}
        {/*
         *  Circular inset on the right side of the sphere.
         *  Has an orange neon ring that mirrors the purple ring on the face.
         *  "HAT3X" text with "3" in orange, matching the image font weight.
         */}
        <div style={{
          position: 'absolute',
          top:   '28%',
          right: '1%',
          width:  '25%',
          height: '28%',
          borderRadius: '50%',
          background: 'radial-gradient(circle at 40% 35%, #140a20 0%, #060210 100%)',
          boxShadow: `
            0 0 0 1.8px #f97316dd,
            0 0  8px  4px #f9731678,
            0 0 22px  8px #f9731638,
            inset 0 0 16px rgba(0,0,0,0.9)
          `,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <span style={{
            fontSize: 7.5,
            fontFamily: "'SF Mono', 'Fira Code', monospace",
            fontWeight: 800,
            letterSpacing: '0.04em',
            color: '#f1f5f9',
            textAlign: 'center',
            lineHeight: 1.1,
            textShadow: '0 0 6px rgba(249,115,22,0.4)',
          }}>
            HAT<span style={{ color: '#f97316', textShadow: '0 0 8px #f97316' }}>3</span>X
          </span>
        </div>

        {/* ── Listening: sonar rings ─────────────────────────────────── */}
        {state === 'listening' && (
          <>
            <div className="absolute rounded-full animate-ring-1"
              style={{ inset: -8, border: `1.5px solid ${ring}80` }} />
            <div className="absolute rounded-full animate-ring-2"
              style={{ inset: -8, border: `1.5px solid ${ring}55` }} />
            <div className="absolute rounded-full animate-ring-3"
              style={{ inset: -8, border: `1px solid ${ring}30` }} />
          </>
        )}

        {/* ── Processing: dual counter-rotating arcs ────────────────── */}
        {state === 'processing' && (
          <>
            <div className="absolute animate-spin-slow" style={{
              inset: -5, borderRadius: '50%',
              border: '2.5px solid transparent',
              borderTopColor: ring,
              borderRightColor: `${ring}80`,
            }} />
            <div className="absolute animate-spin-reverse" style={{
              inset: -11, borderRadius: '50%',
              border: '1.5px solid transparent',
              borderBottomColor: `${ring}65`,
              borderLeftColor: `${ring}35`,
            }} />
          </>
        )}

        {/* ── Speaking: pulsing ring ─────────────────────────────────── */}
        {state === 'speaking' && (
          <>
            <div className="absolute rounded-full speak-wave-1"
              style={{ inset: -4, border: `2px solid ${ring}90` }} />
            <div className="absolute rounded-full speak-wave-2"
              style={{ inset: -10, border: `1px solid ${ring}50` }} />
          </>
        )}
      </div>

      {/* ── State label ────────────────────────────────────────────────── */}
      <div style={{ height: 20, display: 'flex', alignItems: 'center' }}>
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
