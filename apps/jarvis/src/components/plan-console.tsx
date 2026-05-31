'use client';

import type { CommandAction, ExecutivePlan } from '@/types/jarvis';

interface PlanConsoleProps {
  action: CommandAction | undefined;
}

const RISK_LABEL: Record<ExecutivePlan['executionPlan']['riskLevel'], string> = {
  low: 'Bajo',
  medium: 'Medio',
  high: 'Alto',
};

function EmptyPlan() {
  return (
    <div className="aiden-glass-panel p-5">
      <p className="text-[11px] uppercase tracking-[0.22em] text-amber-300/80">Plan ejecutivo</p>
      <div className="mt-6 rounded border border-dashed border-slate-700/80 bg-slate-950/30 p-5">
        <p className="text-sm font-medium text-slate-300">Sin plan pendiente</p>
        <p className="mt-2 text-xs leading-5 text-slate-500">Canal de aprobacion limpio.</p>
      </div>
    </div>
  );
}

function PlanDetails({ plan }: { plan: ExecutivePlan }) {
  const agents = Array.from(new Set(plan.selections.map((selection) => selection.agentId)));
  const checkpoints = plan.executionPlan.checkpoints;

  return (
    <div className="aiden-glass-panel p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.22em] text-amber-300/80">Plan ejecutivo</p>
          <h2 className="mt-1 text-lg font-semibold text-slate-100">Pendiente de decision</h2>
        </div>
        <span className="rounded border border-amber-300/30 bg-amber-300/10 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-amber-200">
          revisar
        </span>
      </div>

      <p className="mt-4 line-clamp-3 text-sm leading-6 text-slate-300">{plan.orderRaw}</p>

      <div className="mt-5 grid grid-cols-3 gap-2" aria-label="Acciones del plan">
        <div className="rounded border border-white/10 bg-slate-950/40 p-3">
          <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Fases</p>
          <p className="mt-1 text-xl font-semibold text-cyan-200">{plan.executionPlan.phases.length}</p>
        </div>
        <div className="rounded border border-white/10 bg-slate-950/40 p-3">
          <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Agentes</p>
          <p className="mt-1 text-xl font-semibold text-emerald-200">{agents.length}</p>
        </div>
        <div className="rounded border border-white/10 bg-slate-950/40 p-3">
          <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Riesgo</p>
          <p className="mt-1 text-xl font-semibold text-amber-200">{RISK_LABEL[plan.executionPlan.riskLevel]}</p>
        </div>
      </div>

      <div className="mt-5 space-y-3">
        <div>
          <p className="mb-2 text-[11px] uppercase tracking-[0.18em] text-slate-500">Agentes principales</p>
          <div className="flex flex-wrap gap-2">
            {agents.slice(0, 8).map((agent) => (
              <span key={agent} className="rounded border border-cyan-300/20 bg-cyan-300/10 px-2 py-1 text-xs text-cyan-100">
                {agent}
              </span>
            ))}
          </div>
        </div>

        {checkpoints.length > 0 && (
          <div>
            <p className="mb-2 text-[11px] uppercase tracking-[0.18em] text-slate-500">Checkpoints</p>
            <div className="space-y-2">
              {checkpoints.slice(0, 2).map((checkpoint) => (
                <div key={`${checkpoint.afterPhase}-${checkpoint.reason}`} className="rounded border border-amber-300/20 bg-amber-300/10 px-3 py-2">
                  <p className="text-xs leading-5 text-amber-100">{checkpoint.reason}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="mt-5 grid grid-cols-3 gap-2">
        <button className="rounded border border-emerald-300/30 bg-emerald-300/10 px-3 py-2 text-xs font-medium text-emerald-200 transition hover:bg-emerald-300/15">
          Aprobar
        </button>
        <button className="rounded border border-cyan-300/25 bg-cyan-300/10 px-3 py-2 text-xs font-medium text-cyan-200 transition hover:bg-cyan-300/15">
          Ajustar
        </button>
        <button className="rounded border border-rose-300/25 bg-rose-300/10 px-3 py-2 text-xs font-medium text-rose-200 transition hover:bg-rose-300/15">
          Cancelar
        </button>
      </div>
    </div>
  );
}

export function PlanConsole({ action }: PlanConsoleProps) {
  if (action?.type !== 'plan_proposed') return <EmptyPlan />;
  return <PlanDetails plan={action.plan} />;
}
