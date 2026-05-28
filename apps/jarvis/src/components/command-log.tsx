'use client';
import type { CommandEntry } from '@/types/jarvis';

interface CommandLogProps { entries: CommandEntry[] }

export function CommandLog({ entries }: CommandLogProps) {
  if (entries.length === 0) return null;

  return (
    <div className="w-full max-w-lg">
      <p className="text-jarvis-muted text-xs font-mono mb-2 uppercase tracking-wider">Sesión actual</p>
      <div className="space-y-2 max-h-36 overflow-y-auto">
        {[...entries].reverse().map((entry) => (
          <div key={entry.id} className="border-l-2 border-jarvis-border pl-3 py-1">
            <p className="text-jarvis-muted text-xs truncate">› {entry.userText}</p>
            <p className="text-jarvis-text text-xs line-clamp-2">{entry.jarvisResponse}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
