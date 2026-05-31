'use client';

import type { VoiceState } from '@/types/jarvis';

interface VoiceButtonProps {
  voiceState: VoiceState;
  onPressStart: () => void;
  onPressEnd: () => void;
  disabled?: boolean;
}

export function VoiceButton({ voiceState, onPressStart, onPressEnd, disabled }: VoiceButtonProps) {
  const isActive = voiceState === 'listening';
  const isDisabled = disabled || voiceState === 'processing' || voiceState === 'speaking';

  return (
    <div className="flex flex-col items-center gap-3">
      <button
        onMouseDown={onPressStart}
        onMouseUp={onPressEnd}
        onTouchStart={(event) => {
          event.preventDefault();
          onPressStart();
        }}
        onTouchEnd={(event) => {
          event.preventDefault();
          onPressEnd();
        }}
        disabled={isDisabled}
        aria-label={isActive ? 'Enviar voz' : 'Activar microfono'}
        className={[
          'flex h-20 w-20 select-none items-center justify-center rounded-full transition-all duration-150',
          isActive
            ? 'scale-110 border border-cyan-200/70 bg-cyan-300/20 shadow-lg shadow-cyan-400/30 ring-4 ring-cyan-300/20'
            : 'border border-white/10 bg-slate-950/50 hover:border-cyan-300/40',
          isDisabled ? 'cursor-not-allowed opacity-40' : 'cursor-pointer active:scale-95',
        ].join(' ')}
      >
        <span className="font-mono text-sm uppercase tracking-[0.18em] text-cyan-100">mic</span>
      </button>
      <span className="text-xs font-mono text-slate-500">
        {voiceState === 'idle' && 'standby'}
        {voiceState === 'listening' && 'escuchando...'}
        {voiceState === 'processing' && 'procesando...'}
        {voiceState === 'speaking' && 'Aiden responde...'}
      </span>
    </div>
  );
}
