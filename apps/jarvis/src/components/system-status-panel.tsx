'use client';

import type { VoiceState } from '@/types/jarvis';

interface SystemStatusPanelProps {
  voiceState: VoiceState;
  isAutoMode: boolean;
  volume: number;
  hasAction: boolean;
  isLoading: boolean;
}

const STATE_LABEL: Record<VoiceState, string> = {
  idle: 'En espera',
  listening: 'Escuchando',
  processing: 'Procesando',
  speaking: 'Respondiendo',
};

function StatusRow({
  label,
  value,
  tone = 'cyan',
}: {
  label: string;
  value: string;
  tone?: 'cyan' | 'green' | 'amber' | 'violet';
}) {
  const toneClass = {
    cyan: 'text-cyan-300',
    green: 'text-emerald-300',
    amber: 'text-amber-300',
    violet: 'text-violet-300',
  }[tone];

  return (
    <div className="flex items-center justify-between border-t border-white/5 py-3 first:border-t-0 first:pt-0 last:pb-0">
      <span className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{label}</span>
      <span className={`text-xs font-medium ${toneClass}`}>{value}</span>
    </div>
  );
}

export function SystemStatusPanel({
  voiceState,
  isAutoMode,
  volume,
  hasAction,
  isLoading,
}: SystemStatusPanelProps) {
  return (
    <aside className="aiden-glass-panel aiden-scanlines p-5">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.22em] text-cyan-300/80">Sistema HAT3X</p>
          <h2 className="mt-1 text-lg font-semibold text-slate-100">Nucleo operativo</h2>
        </div>
        <span className="rounded border border-emerald-400/30 bg-emerald-400/10 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-emerald-300">
          online
        </span>
      </div>

      <div className="space-y-0">
        <StatusRow label="Jarvis" value={STATE_LABEL[voiceState]} tone={isLoading ? 'amber' : 'cyan'} />
        <StatusRow label="Command" value="Conectado" tone="green" />
        <StatusRow label="Modelo" value="OpenAI/Codex" tone="violet" />
        <StatusRow label="Modo" value={isAutoMode ? 'Continuo' : 'Push to talk'} tone={isAutoMode ? 'green' : 'cyan'} />
        <StatusRow label="Entrada" value={`${Math.round(volume)}%`} tone={voiceState === 'listening' ? 'amber' : 'cyan'} />
        <StatusRow label="Plan" value={hasAction ? 'En consola' : 'Sin pendiente'} tone={hasAction ? 'amber' : 'green'} />
      </div>

      <div className="mt-5 grid grid-cols-5 gap-1.5" aria-hidden="true">
        {Array.from({ length: 20 }).map((_, index) => (
          <span
            key={index}
            className={[
              'h-1 rounded-full',
              index < Math.max(1, Math.round(volume / 5))
                ? 'bg-cyan-300 shadow-[0_0_10px_rgba(103,232,249,0.6)]'
                : 'bg-slate-800',
            ].join(' ')}
          />
        ))}
      </div>
    </aside>
  );
}
