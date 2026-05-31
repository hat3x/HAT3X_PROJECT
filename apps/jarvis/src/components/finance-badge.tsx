'use client';

import type { CommandAction, FinancialSummary, DbTask, DbClient, ExecutivePlan } from '@/types/jarvis';
import type { ReactNode } from 'react';

interface Props {
  action: CommandAction;
}

const CATEGORY_LABELS: Record<string, string> = {
  cliente: 'Cliente',
  otro: 'Otro',
  herramientas_saas: 'SaaS',
  personal: 'Personal',
  marketing: 'Marketing',
  infraestructura: 'Infraestructura',
};

function fmt(value: number) {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(value);
}

function ActionShell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="w-full rounded border border-white/10 bg-slate-950/40 px-4 py-3 text-sm">
      <p className="mb-2 text-[11px] font-mono uppercase tracking-[0.18em] text-slate-500">{label}</p>
      {children}
    </div>
  );
}

function TransactionBadge({
  transaction,
}: {
  transaction: { type: string; amount: number; description: string; category: string };
}) {
  const isIncome = transaction.type === 'income';
  return (
    <ActionShell label={isIncome ? 'Ingreso registrado' : 'Gasto registrado'}>
      <div className="flex items-center justify-between gap-4">
        <span className={`text-base font-semibold ${isIncome ? 'text-emerald-300' : 'text-rose-300'}`}>
          {isIncome ? '+' : '-'}{fmt(transaction.amount)}
        </span>
        <span className="text-xs uppercase tracking-wide text-slate-500">
          {CATEGORY_LABELS[transaction.category] ?? transaction.category}
        </span>
      </div>
      <p className="mt-1 truncate text-slate-200">{transaction.description}</p>
    </ActionShell>
  );
}

function SummaryBadge({ summary }: { summary: FinancialSummary }) {
  const monthName = new Date(summary.year, summary.month - 1).toLocaleString('es-ES', {
    month: 'long',
  });
  const isPositive = summary.margin >= 0;
  return (
    <ActionShell label={`Resumen ${monthName} ${summary.year}`}>
      <div className="space-y-2">
        <div className="flex justify-between">
          <span className="text-slate-500">Ingresos</span>
          <span className="font-semibold text-emerald-300">{fmt(summary.totalIncome)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Gastos</span>
          <span className="font-semibold text-rose-300">{fmt(summary.totalExpense)}</span>
        </div>
        <div className="flex justify-between border-t border-white/10 pt-2">
          <span className="font-semibold text-slate-200">Margen</span>
          <span className={`font-bold ${isPositive ? 'text-emerald-300' : 'text-rose-300'}`}>
            {fmt(summary.margin)}
          </span>
        </div>
      </div>
    </ActionShell>
  );
}

function TaskBadge({ task }: { task: DbTask }) {
  return (
    <ActionShell label="Tarea creada">
      <p className="text-slate-200">{task.order_raw}</p>
      {task.client_id && <p className="mt-1 text-xs text-slate-500">Cliente: {task.client_id}</p>}
    </ActionShell>
  );
}

function ClientBadge({ client }: { client: DbClient }) {
  return (
    <ActionShell label="Nota guardada">
      <p className="text-slate-200">{client.name}</p>
      {client.notes && <p className="mt-1 line-clamp-2 text-xs text-slate-500">{client.notes.split('\n').pop()}</p>}
    </ActionShell>
  );
}

function PlanBadge({ plan }: { plan: ExecutivePlan }) {
  const agents = Array.from(new Set(plan.selections.map((selection) => selection.agentId))).slice(0, 6);

  return (
    <ActionShell label="Plan propuesto">
      <p className="line-clamp-2 text-slate-200">{plan.orderRaw}</p>
      <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
        <div>
          <p className="text-slate-500">Fases</p>
          <p className="font-semibold text-cyan-200">{plan.executionPlan.phases.length}</p>
        </div>
        <div>
          <p className="text-slate-500">Agentes</p>
          <p className="font-semibold text-emerald-200">{agents.length}</p>
        </div>
        <div>
          <p className="text-slate-500">Riesgo</p>
          <p className="font-semibold text-amber-200">{plan.executionPlan.riskLevel}</p>
        </div>
      </div>
    </ActionShell>
  );
}

function BrainBadge({ result }: { result: { table: string; summary: string } }) {
  return (
    <ActionShell label="Cerebro actualizado">
      <p className="text-slate-200">{result.summary}</p>
      <p className="mt-1 text-xs text-slate-500">{result.table}</p>
    </ActionShell>
  );
}

export function FinanceBadge({ action }: Props) {
  if (action.type === 'transaction_recorded') return <TransactionBadge transaction={action.transaction} />;
  if (action.type === 'financial_summary') return <SummaryBadge summary={action.summary} />;
  if (action.type === 'task_created') return <TaskBadge task={action.task} />;
  if (action.type === 'client_updated') return <ClientBadge client={action.client} />;
  if (action.type === 'plan_proposed') return <PlanBadge plan={action.plan} />;
  if (action.type === 'brain_updated') return <BrainBadge result={action.result} />;
  return null;
}
