'use client';

import type { CommandEntry } from '@/types/jarvis';

interface CommandLogProps {
  entries: CommandEntry[];
}

export function CommandLog({ entries }: CommandLogProps) {
  if (entries.length === 0) return null;

  return (
    <div className="w-full">
      <p className="mb-2 text-xs font-mono uppercase tracking-widest text-slate-500">Sesion actual</p>
      <div className="max-h-44 overflow-y-auto rounded border border-white/10 bg-slate-950/40">
        {[...entries].reverse().map((entry, index) => (
          <div
            key={entry.id}
            className="border-b border-white/5 px-4 py-3 last:border-b-0"
            style={{
              borderLeftWidth: '2px',
              borderLeftColor: index === 0 ? 'rgba(103, 232, 249, 0.65)' : 'rgba(30, 41, 59, 0.8)',
            }}
          >
            <p className="truncate text-xs font-mono text-cyan-100">{entry.userText}</p>
            <p className="mt-1 line-clamp-2 text-xs leading-5 text-emerald-100/80">{entry.jarvisResponse}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
