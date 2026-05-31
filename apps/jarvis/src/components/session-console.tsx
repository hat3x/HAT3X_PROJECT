'use client';

import { CommandLog } from '@/components/command-log';
import { FinanceBadge } from '@/components/finance-badge';
import type { CommandAction, CommandEntry } from '@/types/jarvis';

interface SessionConsoleProps {
  action: CommandAction | undefined;
  entries: CommandEntry[];
}

export function SessionConsole({ action, entries }: SessionConsoleProps) {
  const hasContent = action != null || entries.length > 0;

  return (
    <section className="aiden-glass-panel p-5">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.22em] text-emerald-300/80">Sesion</p>
          <h2 className="mt-1 text-lg font-semibold text-slate-100">Registro activo</h2>
        </div>
        <span className="text-xs text-slate-500">{entries.length} turnos</span>
      </div>

      {action != null && action.type !== 'plan_proposed' && (
        <div className="mb-4">
          <FinanceBadge action={action} />
        </div>
      )}

      {entries.length > 0 && <CommandLog entries={entries} />}

      {!hasContent && (
        <div className="rounded border border-dashed border-slate-700/80 bg-slate-950/30 p-5">
          <p className="text-sm font-medium text-slate-300">Sesion en espera</p>
          <p className="mt-2 text-xs leading-5 text-slate-500">Registro limpio.</p>
        </div>
      )}
    </section>
  );
}
