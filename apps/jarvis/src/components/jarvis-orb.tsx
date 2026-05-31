'use client';
import Image from 'next/image';
import type { VoiceState } from '@/types/jarvis';

interface JarvisOrbProps { state: VoiceState }

const RING: Record<VoiceState, string> = {
  idle:       '#9b45ff',
  listening:  '#b855ff',
  processing: '#7070ff',
  speaking:   '#d070ff',
};

export function JarvisOrb({ state }: JarvisOrbProps) {
  const ring = RING[state];

  return (
    <div className="relative flex flex-col items-center gap-2 select-none">

      {/* ── Orb image + state effects ──────────────────────────────────── */}
      <div
        className={state === 'idle' ? 'animate-orb-breathe' : ''}
        style={{ position: 'relative', width: 230, height: 230 }}
      >
        {/* The robot image — used as-is */}
        <Image
          src="/aiden-orb.png"
          alt="Aiden"
          width={230}
          height={230}
          priority
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            /* Extra drop-shadow for state feedback */
            filter: state === 'speaking'
              ? `drop-shadow(0 0 24px ${ring})`
              : state === 'listening'
              ? `drop-shadow(0 0 16px ${ring})`
              : state === 'processing'
              ? `drop-shadow(0 0 10px #7070ff)`
              : 'drop-shadow(0 0 8px #9b45ff66)',
          }}
        />

        {/* ── Listening: sonar rings ──────────────────────────────────── */}
        {state === 'listening' && (
          <>
            <div className="absolute rounded-full animate-ring-1"
              style={{ inset: 10, border: `1.5px solid ${ring}80` }} />
            <div className="absolute rounded-full animate-ring-2"
              style={{ inset: 10, border: `1.5px solid ${ring}55` }} />
            <div className="absolute rounded-full animate-ring-3"
              style={{ inset: 10, border: `1px solid ${ring}30` }} />
          </>
        )}

        {/* ── Processing: spinning arc ────────────────────────────────── */}
        {state === 'processing' && (
          <>
            <div className="absolute animate-spin-slow" style={{
              inset: 6, borderRadius: '50%',
              border: '2.5px solid transparent',
              borderTopColor: ring,
              borderRightColor: `${ring}80`,
            }} />
            <div className="absolute animate-spin-reverse" style={{
              inset: -2, borderRadius: '50%',
              border: '1.5px solid transparent',
              borderBottomColor: `${ring}60`,
              borderLeftColor: `${ring}30`,
            }} />
          </>
        )}

        {/* ── Speaking: pulse ring ────────────────────────────────────── */}
        {state === 'speaking' && (
          <>
            <div className="absolute rounded-full speak-wave-1"
              style={{ inset: 8, border: `2px solid ${ring}90` }} />
            <div className="absolute rounded-full speak-wave-2"
              style={{ inset: 2, border: `1px solid ${ring}50` }} />
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
