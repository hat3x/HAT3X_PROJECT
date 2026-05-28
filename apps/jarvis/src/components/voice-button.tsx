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
        onTouchStart={(e) => { e.preventDefault(); onPressStart(); }}
        onTouchEnd={(e) => { e.preventDefault(); onPressEnd(); }}
        disabled={isDisabled}
        aria-label={isActive ? 'Suelta para enviar' : 'Mantén pulsado para hablar'}
        className={[
          'w-20 h-20 rounded-full transition-all duration-150 select-none',
          'flex items-center justify-center text-3xl',
          isActive
            ? 'bg-violet-600 scale-110 shadow-lg shadow-violet-500/50 ring-4 ring-violet-400/40'
            : 'bg-jarvis-surface border border-jarvis-border hover:border-violet-600/50',
          isDisabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer active:scale-95',
        ].join(' ')}
      >
        🎙
      </button>
      <span className="text-jarvis-muted text-xs font-mono">
        {voiceState === 'idle' && 'mantén para hablar'}
        {voiceState === 'listening' && 'escuchando...'}
        {voiceState === 'processing' && 'procesando...'}
        {voiceState === 'speaking' && 'Jarvis responde...'}
      </span>
    </div>
  );
}
