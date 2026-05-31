'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import type { CompanyBrainContext } from '@/lib/company-brain';

type BrainTab = 'expenses' | 'revenue' | 'costs' | 'memory';

const tabs: { id: BrainTab; label: string }[] = [
  { id: 'expenses', label: 'Gastos' },
  { id: 'revenue', label: 'Ingresos' },
  { id: 'costs', label: 'Costes' },
  { id: 'memory', label: 'Memoria' },
];

const emptyContext: CompanyBrainContext = {
  monthlyRecurringExpenses: 0,
  projectRevenueOpen: 0,
  projectCostsOpen: 0,
  recurringExpenses: [],
  projectRevenue: [],
  projectCosts: [],
  memoryNotes: [],
};

function eur(value: number) {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(value);
}

async function saveBrainEntry(type: string, payload: Record<string, FormDataEntryValue>) {
  const cleaned = Object.fromEntries(
    Object.entries(payload)
      .map(([key, value]) => [key, typeof value === 'string' ? value.trim() : value])
      .filter(([, value]) => value !== '')
  );

  for (const key of ['amount', 'importance']) {
    if (typeof cleaned[key] === 'string') cleaned[key] = Number(cleaned[key]);
  }

  const response = await fetch('/api/company-brain', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, payload: cleaned }),
  });
  const body = await response.json() as { error?: string };
  if (!response.ok) throw new Error(body.error ?? 'No se pudo guardar el dato.');
}

export function CompanyBrainPanel() {
  const [activeTab, setActiveTab] = useState<BrainTab>('expenses');
  const [context, setContext] = useState<CompanyBrainContext>(emptyContext);
  const [status, setStatus] = useState('Cargando cerebro...');
  const [isSaving, setIsSaving] = useState(false);

  const margin = useMemo(
    () => context.projectRevenueOpen - context.projectCostsOpen - context.monthlyRecurringExpenses,
    [context]
  );

  const loadContext = useCallback(async () => {
    const response = await fetch('/api/company-brain');
    const body = await response.json() as { context?: CompanyBrainContext; error?: string };
    if (!response.ok || !body.context) throw new Error(body.error ?? 'No se pudo leer el cerebro.');
    setContext(body.context);
    setStatus('Cerebro sincronizado');
  }, []);

  useEffect(() => {
    void loadContext().catch((err) => {
      setStatus(err instanceof Error ? err.message : 'No se pudo leer el cerebro.');
    });
  }, [loadContext]);

  const handleSubmit = useCallback(async (event: FormEvent<HTMLFormElement>, type: string) => {
    event.preventDefault();
    setIsSaving(true);
    setStatus('Guardando...');
    const form = event.currentTarget;
    const payload = Object.fromEntries(new FormData(form).entries());

    try {
      await saveBrainEntry(type, payload);
      form.reset();
      await loadContext();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'No se pudo guardar el dato.');
    } finally {
      setIsSaving(false);
    }
  }, [loadContext]);

  return (
    <section className="aiden-glass-panel p-5">
      <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-[0.22em] text-cyan-300/80">Memoria operativa</p>
          <h2 className="mt-1 text-xl font-semibold text-slate-100">Cerebro HAT3X</h2>
          <p className="mt-2 text-xs leading-5 text-slate-500">{status}</p>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4 lg:min-w-[520px]">
          <Metric label="Gasto fijo" value={eur(context.monthlyRecurringExpenses)} tone="cyan" />
          <Metric label="Ingresos mes" value={eur(context.projectRevenueOpen)} tone="emerald" />
          <Metric label="Costes mes" value={eur(context.projectCostsOpen)} tone="amber" />
          <Metric label="Margen vivo" value={eur(margin)} tone={margin >= 0 ? 'emerald' : 'rose'} />
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={[
              'rounded border px-3 py-1.5 text-xs font-mono transition',
              activeTab === tab.id
                ? 'border-cyan-300/60 bg-cyan-300/15 text-cyan-100'
                : 'border-white/10 bg-slate-950/40 text-slate-400 hover:border-cyan-300/40 hover:text-cyan-100',
            ].join(' ')}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(280px,420px)_1fr]">
        <div className="rounded border border-white/10 bg-slate-950/35 p-4">
          {activeTab === 'expenses' && (
            <form className="grid gap-3" onSubmit={(event) => void handleSubmit(event, 'recurring_expense')}>
              <Field label="Nombre del gasto" name="name" required />
              <Field label="Importe mensual" name="amount" type="number" min="0" step="0.01" required />
              <Select label="Categoria" name="category" options={['herramientas_saas', 'infraestructura', 'marketing', 'personal', 'operaciones', 'otro']} />
              <Field label="Proveedor" name="vendor" />
              <Field label="Notas" name="notes" />
              <Submit disabled={isSaving} label="Guardar gasto" />
            </form>
          )}

          {activeTab === 'revenue' && (
            <form className="grid gap-3" onSubmit={(event) => void handleSubmit(event, 'project_revenue')}>
              <Field label="ID proyecto" name="project_id" required />
              <Field label="Importe" name="amount" type="number" min="0" step="0.01" required />
              <Field label="Concepto" name="concept" required />
              <Select label="Estado" name="status" options={['pending', 'invoiced', 'paid', 'cancelled']} />
              <Field label="Referencia factura" name="invoice_ref" />
              <Submit disabled={isSaving} label="Guardar ingreso" />
            </form>
          )}

          {activeTab === 'costs' && (
            <form className="grid gap-3" onSubmit={(event) => void handleSubmit(event, 'project_cost')}>
              <Field label="ID proyecto" name="project_id" required />
              <Field label="Importe" name="amount" type="number" min="0" step="0.01" required />
              <Select label="Categoria" name="category" options={['herramientas_saas', 'infraestructura', 'freelance', 'ads', 'operaciones', 'otro']} />
              <Field label="Descripcion" name="description" required />
              <Field label="Proveedor" name="vendor" />
              <Submit disabled={isSaving} label="Guardar coste" />
            </form>
          )}

          {activeTab === 'memory' && (
            <form className="grid gap-3" onSubmit={(event) => void handleSubmit(event, 'memory_note')}>
              <Field label="Titulo" name="title" required />
              <Field label="Contenido" name="content" required />
              <Select label="Ambito" name="scope" options={['company', 'client', 'project', 'finance', 'operations']} />
              <Field label="Importancia" name="importance" type="number" min="1" max="5" defaultValue="3" />
              <Submit disabled={isSaving} label="Guardar memoria" />
            </form>
          )}
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <List title="Gastos recurrentes" items={context.recurringExpenses.map((item) => `${item.name} · ${eur(Number(item.amount))} · ${item.category}`)} />
          <List title="Ingresos de proyecto" items={context.projectRevenue.map((item) => `${item.project_id} · ${eur(Number(item.amount))} · ${item.status}`)} />
          <List title="Costes de proyecto" items={context.projectCosts.map((item) => `${item.project_id} · ${eur(Number(item.amount))} · ${item.category}`)} />
          <List title="Memoria prioritaria" items={context.memoryNotes.map((item) => `${item.title} · P${item.importance}`)} />
        </div>
      </div>
    </section>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone: 'cyan' | 'emerald' | 'amber' | 'rose' }) {
  const tones = {
    cyan: 'text-cyan-200',
    emerald: 'text-emerald-200',
    amber: 'text-amber-200',
    rose: 'text-rose-200',
  };
  return (
    <div className="rounded border border-white/10 bg-slate-950/40 p-3">
      <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className={`mt-1 font-mono text-sm ${tones[tone]}`}>{value}</p>
    </div>
  );
}

function Field(props: React.InputHTMLAttributes<HTMLInputElement> & { label: string; name: string }) {
  const { label, name, ...inputProps } = props;
  return (
    <label className="grid gap-1 text-xs text-slate-400">
      <span>{label}</span>
      <input
        {...inputProps}
        name={name}
        className="h-9 rounded border border-white/10 bg-slate-950/70 px-3 text-sm text-slate-100 outline-none transition focus:border-cyan-300/60"
      />
    </label>
  );
}

function Select({ label, name, options }: { label: string; name: string; options: string[] }) {
  return (
    <label className="grid gap-1 text-xs text-slate-400">
      <span>{label}</span>
      <select
        name={name}
        className="h-9 rounded border border-white/10 bg-slate-950/70 px-3 text-sm text-slate-100 outline-none transition focus:border-cyan-300/60"
      >
        {options.map((option) => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}

function Submit({ disabled, label }: { disabled: boolean; label: string }) {
  return (
    <button
      type="submit"
      disabled={disabled}
      className="mt-1 h-10 rounded border border-cyan-300/40 bg-cyan-300/10 px-3 text-xs font-mono text-cyan-100 transition hover:bg-cyan-300/20 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {disabled ? 'Guardando...' : label}
    </button>
  );
}

function List({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="min-h-36 rounded border border-white/10 bg-slate-950/30 p-4">
      <p className="mb-3 text-[11px] uppercase tracking-[0.18em] text-slate-500">{title}</p>
      {items.length > 0 ? (
        <ul className="space-y-2">
          {items.slice(0, 5).map((item) => (
            <li key={item} className="truncate border-l border-cyan-300/30 pl-3 text-xs text-slate-300">{item}</li>
          ))}
        </ul>
      ) : (
        <p className="text-xs leading-5 text-slate-600">Sin datos todavia.</p>
      )}
    </div>
  );
}
