'use client';

interface QuickCommandDockProps {
  disabled?: boolean;
  onCommand: (text: string) => void;
}

const QUICK_COMMANDS = [
  'Resumen operativo de hoy',
  'Que proyectos requieren mi aprobacion',
  'Como vamos de finanzas este mes',
  'Prepara plan para nuevo cliente',
];

export function QuickCommandDock({ disabled, onCommand }: QuickCommandDockProps) {
  return (
    <div className="aiden-glass-panel p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-[11px] uppercase tracking-[0.2em] text-cyan-300/80">Comandos rapidos</p>
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-300 shadow-[0_0_12px_rgba(110,231,183,0.8)]" />
      </div>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {QUICK_COMMANDS.map((command) => (
          <button
            key={command}
            type="button"
            disabled={disabled}
            onClick={() => onCommand(command)}
            className="min-h-12 rounded border border-white/10 bg-slate-950/40 px-3 py-2 text-left text-xs leading-4 text-slate-300 transition hover:border-cyan-300/40 hover:bg-cyan-300/10 hover:text-cyan-100 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {command}
          </button>
        ))}
      </div>
    </div>
  );
}
