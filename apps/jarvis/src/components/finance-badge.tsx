'use client';
import type { CommandAction, FinancialSummary } from '@/types/jarvis';

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

function fmt(n: number) {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n);
}

function TransactionBadge({
  transaction,
}: {
  transaction: { type: string; amount: number; description: string; category: string };
}) {
  const isIncome = transaction.type === 'income';
  return (
    <div className="rounded-lg border border-jarvis-border bg-jarvis-surface px-4 py-3 text-sm w-full max-w-xs">
      <div className="flex items-center justify-between mb-1">
        <span className={`font-semibold text-base ${isIncome ? 'text-emerald-400' : 'text-red-400'}`}>
          {isIncome ? '+' : '-'}{fmt(transaction.amount)}
        </span>
        <span className="text-jarvis-muted text-xs uppercase tracking-wide">
          {CATEGORY_LABELS[transaction.category] ?? transaction.category}
        </span>
      </div>
      <p className="text-jarvis-text truncate">{transaction.description}</p>
      <p className="text-jarvis-muted text-xs mt-0.5">{isIncome ? 'Ingreso' : 'Gasto'} registrado</p>
    </div>
  );
}

function SummaryBadge({ summary }: { summary: FinancialSummary }) {
  const monthName = new Date(summary.year, summary.month - 1).toLocaleString('es-ES', {
    month: 'long',
  });
  const isPositive = summary.margin >= 0;
  return (
    <div className="rounded-lg border border-jarvis-border bg-jarvis-surface px-4 py-3 text-sm w-full max-w-xs space-y-2">
      <p className="text-jarvis-muted text-xs uppercase tracking-wide font-mono">
        Resumen {monthName} {summary.year}
      </p>
      <div className="flex justify-between">
        <span className="text-jarvis-muted">Ingresos</span>
        <span className="text-emerald-400 font-semibold">{fmt(summary.totalIncome)}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-jarvis-muted">Gastos</span>
        <span className="text-red-400 font-semibold">{fmt(summary.totalExpense)}</span>
      </div>
      <div className="flex justify-between border-t border-jarvis-border pt-2">
        <span className="text-jarvis-text font-semibold">Margen</span>
        <span className={`font-bold ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
          {fmt(summary.margin)}
        </span>
      </div>
    </div>
  );
}

export function FinanceBadge({ action }: Props) {
  if (action.type === 'transaction_recorded') {
    return <TransactionBadge transaction={action.transaction} />;
  }
  if (action.type === 'financial_summary') {
    return <SummaryBadge summary={action.summary} />;
  }
  return null;
}
