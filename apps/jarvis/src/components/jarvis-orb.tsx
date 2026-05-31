'use client';
import { useState } from 'react';
import type { VoiceState } from '@/types/jarvis';

interface JarvisOrbProps { state: VoiceState }

const RING: Record<VoiceState, string> = {
  idle:       '#9b45ff',
  listening:  '#b855ff',
  processing: '#7070ff',
  speaking:   '#d070ff',
};

// CSS fallback mientras no esté la imagen
function CSSOrb({ state }: { state: VoiceState }) {
  const ring = RING[state];
  const fc = { idle: 'rgba(220,205,255,0.95)', listening: 'rgba(240,180,255,0.98)', processing: 'rgba(180,195,255,0.95)', speaking: 'rgba(250,200,255,0.98)' }[state];
  return (
    <div style={{ position: 'relative', width: 230, height: 230, borderRadius: '50%',
      background: 'radial-gradient(circle at 33% 26%, #ffffff 0%, #f2edfb 5%, #ddd0ef 16%, #bca8d8 30%, #9278b8 46%, #6048a0 62%, #3c2878 77%, #1e1050 100%)',
      boxShadow: 'inset -14px -14px 28px rgba(0,0,0,0.38), inset 8px 8px 22px rgba(255,255,255,0.52), 0 18px 60px rgba(36,12,80,0.85), 0 6px 18px rgba(0,0,0,0.85)' }}>
      <div style={{ position: 'absolute', top: '10%', left: '8%', width: '65%', height: '76%', borderRadius: '50%',
        background: 'radial-gradient(circle at 42% 36%, #0e0618 0%, #040108 100%)',
        boxShadow: `0 0 0 1.8px ${ring}, 0 0 8px 4px ${ring}cc, 0 0 24px 10px ${ring}70, 0 0 55px 18px ${ring}2e, inset 0 0 40px rgba(0,0,0,0.97)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg viewBox="0 0 100 100" style={{ width: '88%', height: '88%', overflow: 'visible' }}>
          <defs>
            <filter id="fg"><feGaussianBlur stdDeviation="2.8" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
          </defs>
          {state === 'idle' && (<><path d="M 24 52 Q 34 40 44 52" stroke={fc} strokeWidth="5" strokeLinecap="round" fill="none" filter="url(#fg)"/><path d="M 56 52 Q 66 40 76 52" stroke={fc} strokeWidth="5" strokeLinecap="round" fill="none" filter="url(#fg)"/><path d="M 36 67 Q 50 78 64 67" stroke={fc} strokeWidth="4.5" strokeLinecap="round" fill="none" filter="url(#fg)"/></>)}
          {state === 'listening' && (<><circle cx="34" cy="46" r="9" stroke={fc} strokeWidth="4" fill="none" filter="url(#fg)"/><circle cx="34" cy="46" r="3" fill={fc}/><circle cx="66" cy="46" r="9" stroke={fc} strokeWidth="4" fill="none" filter="url(#fg)"/><circle cx="66" cy="46" r="3" fill={fc}/><ellipse cx="50" cy="68" rx="8" ry="5" stroke={fc} strokeWidth="3.5" fill="none" filter="url(#fg)"/></>)}
          {state === 'processing' && (<><line x1="24" y1="47" x2="44" y2="47" stroke={fc} strokeWidth="5" strokeLinecap="round" filter="url(#fg)"/><line x1="56" y1="47" x2="76" y2="47" stroke={fc} strokeWidth="5" strokeLinecap="round" filter="url(#fg)"/><circle cx="36" cy="68" r="4.5" fill={fc} filter="url(#fg)" className="animate-dot-appear"/><circle cx="50" cy="68" r="4.5" fill={fc} filter="url(#fg)" className="animate-dot-appear-2"/><circle cx="64" cy="68" r="4.5" fill={fc} filter="url(#fg)" className="animate-dot-appear-3"/></>)}
          {state === 'speaking' && (<><path d="M 24 51 Q 34 40 44 51" stroke={fc} strokeWidth="5" strokeLinecap="round" fill="none" filter="url(#fg)"/><path d="M 56 51 Q 66 40 76 51" stroke={fc} strokeWidth="5" strokeLinecap="round" fill="none" filter="url(#fg)"/><ellipse cx="50" cy="67" rx="13" ry="9" stroke={fc} strokeWidth="3.5" fill="none" filter="url(#fg)" className="animate-orb-speak"/></>)}
        </svg>
      </div>
      <div style={{ position: 'absolute', top: '28%', right: '1%', width: '25%', height: '28%', borderRadius: '50%',
        background: 'radial-gradient(circle at 40% 35%, #140a20 0%, #060210 100%)',
        boxShadow: '0 0 0 1.8px #f97316dd, 0 0 8px 4px #f9731678, 0 0 22px 8px #f9731638',
        display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: 7.5, fontFamily: 'monospace', fontWeight: 800, color: '#f1f5f9' }}>HAT<span style={{ color: '#f97316' }}>3</span>X</span>
      </div>
      {state === 'listening' && (<><div className="absolute rounded-full animate-ring-1" style={{ inset: -8, border: `1.5px solid ${ring}80` }}/><div className="absolute rounded-full animate-ring-2" style={{ inset: -8, border: `1.5px solid ${ring}55` }}/><div className="absolute rounded-full animate-ring-3" style={{ inset: -8, border: `1px solid ${ring}30` }}/></>)}
      {state === 'processing' && (<><div className="absolute animate-spin-slow" style={{ inset: -5, borderRadius: '50%', border: '2.5px solid transparent', borderTopColor: ring, borderRightColor: `${ring}80` }}/><div className="absolute animate-spin-reverse" style={{ inset: -11, borderRadius: '50%', border: '1.5px solid transparent', borderBottomColor: `${ring}65`, borderLeftColor: `${ring}35` }}/></>)}
      {state === 'speaking' && (<><div className="absolute rounded-full speak-wave-1" style={{ inset: -4, border: `2px solid ${ring}90` }}/><div className="absolute rounded-full speak-wave-2" style={{ inset: -10, border: `1px solid ${ring}50` }}/></>)}
    </div>
  );
}

export function JarvisOrb({ state }: JarvisOrbProps) {
  const [imgError, setImgError] = useState(false);
  const ring = RING[state];

  return (
    <div className="relative flex flex-col items-center gap-2 select-none">

      {/* Floor glow */}
      <div style={{
        position: 'absolute', bottom: -36, left: '50%', transform: 'translateX(-50%)',
        width: 260, height: 44, borderRadius: '50%',
        background: 'linear-gradient(90deg, rgba(110,30,200,0.65) 0%, rgba(210,40,140,0.70) 45%, rgba(210,55,25,0.55) 100%)',
        filter: 'blur(18px)', pointerEvents: 'none',
      }} />

      <div
        className={state === 'idle' ? 'animate-orb-breathe' : ''}
        style={{ position: 'relative', width: 230, height: 230 }}
      >
        {/* Imagen real — si no existe, muestra el CSS fallback */}
        {!imgError ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/aiden-orb.png"
              alt="Aiden"
              onError={() => setImgError(true)}
              style={{
                width: '100%', height: '100%', objectFit: 'contain',
                filter: state === 'speaking'
                  ? `drop-shadow(0 0 28px ${ring})`
                  : state === 'listening'
                  ? `drop-shadow(0 0 20px ${ring})`
                  : state === 'processing'
                  ? `drop-shadow(0 0 12px #7070ff)`
                  : `drop-shadow(0 0 10px ${ring}88)`,
              }}
            />
            {state === 'listening' && (<><div className="absolute rounded-full animate-ring-1" style={{ inset: 10, border: `1.5px solid ${ring}80` }}/><div className="absolute rounded-full animate-ring-2" style={{ inset: 10, border: `1.5px solid ${ring}55` }}/><div className="absolute rounded-full animate-ring-3" style={{ inset: 10, border: `1px solid ${ring}30` }}/></>)}
            {state === 'processing' && (<><div className="absolute animate-spin-slow" style={{ inset: 6, borderRadius: '50%', border: '2.5px solid transparent', borderTopColor: ring, borderRightColor: `${ring}80` }}/><div className="absolute animate-spin-reverse" style={{ inset: -2, borderRadius: '50%', border: '1.5px solid transparent', borderBottomColor: `${ring}60`, borderLeftColor: `${ring}30` }}/></>)}
            {state === 'speaking' && (<><div className="absolute rounded-full speak-wave-1" style={{ inset: 8, border: `2px solid ${ring}90` }}/><div className="absolute rounded-full speak-wave-2" style={{ inset: 2, border: `1px solid ${ring}50` }}/></>)}
          </>
        ) : (
          <CSSOrb state={state} />
        )}
      </div>

      {/* State label */}
      <div style={{ height: 20, display: 'flex', alignItems: 'center' }}>
        {state === 'listening' && <span style={{ color: '#a855f7', fontSize: 11, fontFamily: 'monospace', letterSpacing: '0.2em' }}>escuchando<span className="animate-blink">_</span></span>}
        {state === 'processing' && <span style={{ color: '#818cf8', fontSize: 11, fontFamily: 'monospace', letterSpacing: '0.2em' }}>procesando<span className="animate-dot-appear">.</span><span className="animate-dot-appear-2">.</span><span className="animate-dot-appear-3">.</span></span>}
        {state === 'speaking' && <span style={{ color: '#c084fc', fontSize: 11, fontFamily: 'monospace', letterSpacing: '0.2em' }}>Aiden responde...</span>}
      </div>
    </div>
  );
}
