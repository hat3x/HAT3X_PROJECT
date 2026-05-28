'use client';
import type { VoiceState } from '@/types/jarvis';

interface JarvisOrbProps { state: VoiceState }

export function JarvisOrb({ state }: JarvisOrbProps) {
  const gradient = {
    idle: 'from-violet-900 via-purple-800 to-indigo-900',
    listening: 'from-violet-600 via-purple-500 to-indigo-600',
    processing: 'from-indigo-700 via-blue-600 to-violet-700',
    speaking: 'from-purple-500 via-violet-400 to-indigo-500',
  }[state];

  const coreAnim = {
    idle: 'animate-orb-idle',
    listening: 'animate-orb-pulse',
    processing: '',
    speaking: 'animate-orb-pulse',
  }[state];

  const shadowColor = {
    idle: '#4c1d95',
    listening: '#7c3aed',
    processing: '#1d4ed8',
    speaking: '#a855f7',
  }[state];

  return (
    <div className="relative flex items-center justify-center w-48 h-48">
      {state === 'listening' && (
        <>
          <div className="absolute w-48 h-48 rounded-full border border-violet-500/40 animate-ring-1" />
          <div className="absolute w-48 h-48 rounded-full border border-violet-400/30 animate-ring-2" />
          <div className="absolute w-48 h-48 rounded-full border border-violet-300/20 animate-ring-3" />
        </>
      )}
      {state === 'processing' && (
        <div className="absolute w-44 h-44 rounded-full border-2 border-transparent border-t-blue-400 border-r-violet-400 animate-spin-slow" />
      )}
      <div
        className={`relative w-36 h-36 rounded-full bg-gradient-to-br ${gradient} ${coreAnim} flex items-center justify-center transition-all duration-300`}
        style={{ boxShadow: `0 0 60px ${shadowColor}80, 0 0 20px ${shadowColor}40` }}
      >
        <div className="text-white/80 text-xs font-mono tracking-widest select-none">
          {state === 'idle' && 'JARVIS'}
          {state === 'listening' && (
            <span className="flex gap-1 items-end h-6">
              {[0, 100, 200, 300, 400].map((delay) => (
                <span
                  key={delay}
                  className="w-1 bg-white/90 rounded animate-bounce"
                  style={{ height: `${12 + (delay % 300 === 0 ? 8 : delay % 200 === 0 ? 4 : 0)}px`, animationDelay: `${delay}ms` }}
                />
              ))}
            </span>
          )}
          {state === 'processing' && <span className="animate-pulse">···</span>}
          {state === 'speaking' && '◈'}
        </div>
      </div>
    </div>
  );
}
