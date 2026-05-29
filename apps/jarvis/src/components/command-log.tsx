'use client';
import type { CommandEntry } from '@/types/jarvis';

interface CommandLogProps { entries: CommandEntry[] }

export function CommandLog({ entries }: CommandLogProps) {
  if (entries.length === 0) return null;

  return (
    <div className="w-full max-w-lg">
      <p className="holo-text-muted text-xs font-mono mb-2 uppercase tracking-widest">
        &#9658; sesión actual
      </p>
      <div className="holo-panel max-h-36 overflow-y-auto" style={{ padding: 0 }}>
        {[...entries].reverse().map((entry, idx) => (
          <div
            key={entry.id}
            className="px-4 py-2.5 border-b border-violet-900/30 last:border-b-0"
            style={{
              borderLeftWidth: '2px',
              borderLeftColor: idx === 0 ? 'rgba(124,58,237,0.6)' : 'rgba(30,41,59,0.5)',
            }}
          >
            <p className="holo-text-muted text-xs font-mono truncate">
              <span className="text-violet-500/70 mr-1">›</span>
              {entry.userText}
            </p>
            <p className="holo-text-jarvis text-xs font-mono line-clamp-2 mt-0.5 opacity-80">
              {entry.jarvisResponse}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
