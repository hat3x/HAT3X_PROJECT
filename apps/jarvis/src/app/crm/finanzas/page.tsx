'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getAllFinancials, listProjects, type ProjectFinancial, type CRMProject } from '@/lib/crm'

interface MonthBucket { month: string; income: number; expense: number }
interface ProjectBucket { project: CRMProject; income: number; expense: number; paid: number }

function toMonthly(financials: ProjectFinancial[]): MonthBucket[] {
  const map = new Map<string, { income: number; expense: number }>()
  for (const f of financials) {
    const m = f.date.slice(0, 7)
    const e = map.get(m) ?? { income: 0, expense: 0 }
    if (f.type === 'income') e.income += f.amount; else e.expense += f.amount
    map.set(m, e)
  }
  return Array.from(map.entries()).sort(([a], [b]) => b.localeCompare(a)).slice(0, 12)
    .map(([month, { income, expense }]) => ({ month, income, expense }))
}

function toByProject(financials: ProjectFinancial[], projects: CRMProject[]): ProjectBucket[] {
  return projects.map(project => {
    const pf = financials.filter(f => f.project_id === project.id)
    const income  = pf.filter(f => f.type === 'income').reduce((s, f) => s + f.amount, 0)
    const expense = pf.filter(f => f.type === 'expense').reduce((s, f) => s + f.amount, 0)
    const paid    = pf.filter(f => f.type === 'income' && f.status === 'paid').reduce((s, f) => s + f.amount, 0)
    return { project, income, expense, paid }
  }).filter(b => b.income > 0 || b.expense > 0).sort((a, b) => b.income - a.income)
}

export default function FinanzasPage() {
  const [financials, setFinancials] = useState<ProjectFinancial[]>([])
  const [projects, setProjects] = useState<CRMProject[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([getAllFinancials(), listProjects()])
      .then(([f, p]) => { setFinancials(f); setProjects(p) })
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div style={{ padding: 40, color: '#475569', fontFamily: 'monospace' }}>Cargando finanzas...</div>

  const monthly    = toMonthly(financials)
  const byProject  = toByProject(financials, projects)
  const fmt = (n: number) => n.toLocaleString('es-ES') + '€'

  const totalIncome  = financials.filter(f => f.type === 'income').reduce((s, f) => s + f.amount, 0)
  const totalExpense = financials.filter(f => f.type === 'expense').reduce((s, f) => s + f.amount, 0)
  const totalPaid    = financials.filter(f => f.type === 'income' && f.status === 'paid').reduce((s, f) => s + f.amount, 0)
  const totalPending = financials.filter(f => f.type === 'income' && f.status !== 'paid' && f.status !== 'cancelled').reduce((s, f) => s + f.amount, 0)
  const maxIncome    = Math.max(...monthly.map(m => m.income), 1)

  return (
    <div style={{ padding: 32 }}>
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 11, fontFamily: 'monospace', color: '#10b981', letterSpacing: '0.15em', marginBottom: 6 }}>CRM · FINANZAS</div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#e2e8f0' }}>P&amp;L General</h1>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 32 }}>
        {[
          { label: 'FACTURADO',  value: fmt(totalIncome) },
          { label: 'COBRADO',    value: fmt(totalPaid),    color: '#10b981' },
          { label: 'POR COBRAR', value: fmt(totalPending), color: '#f59e0b' },
          { label: 'MARGEN',     value: fmt(totalIncome - totalExpense), color: (totalIncome - totalExpense) >= 0 ? '#10b981' : '#ef4444' },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background: '#07101f', border: '1px solid #0f2040', borderRadius: 8, padding: '16px 20px' }}>
            <div style={{ fontSize: 10, fontFamily: 'monospace', color: '#475569', letterSpacing: '0.12em', marginBottom: 6 }}>{label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: color ?? '#e2e8f0' }}>{value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        <div style={{ background: '#07101f', border: '1px solid #0f2040', borderRadius: 8, padding: 20 }}>
          <div style={{ fontSize: 11, fontFamily: 'monospace', color: '#475569', letterSpacing: '0.12em', marginBottom: 16 }}>INGRESOS POR MES</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {monthly.map(({ month, income, expense }) => (
              <div key={month} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 48, fontSize: 10, fontFamily: 'monospace', color: '#475569', flexShrink: 0 }}>{month.slice(5)}/{month.slice(2, 4)}</div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <div style={{ height: 8, borderRadius: 2, background: '#10b981', width: `${(income / maxIncome) * 100}%`, minWidth: income > 0 ? 2 : 0 }} />
                  <div style={{ height: 4, borderRadius: 2, background: '#ef444450', width: `${(expense / maxIncome) * 100}%`, minWidth: expense > 0 ? 2 : 0 }} />
                </div>
                <div style={{ width: 68, fontSize: 11, fontFamily: 'monospace', color: '#60a5fa', textAlign: 'right', flexShrink: 0 }}>{fmt(income)}</div>
              </div>
            ))}
            {monthly.length === 0 && <div style={{ color: '#1e293b', fontFamily: 'monospace', fontSize: 12 }}>Sin datos aun</div>}
          </div>
        </div>

        <div style={{ background: '#07101f', border: '1px solid #0f2040', borderRadius: 8, padding: 20 }}>
          <div style={{ fontSize: 11, fontFamily: 'monospace', color: '#475569', letterSpacing: '0.12em', marginBottom: 16 }}>P&amp;L POR PROYECTO</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {byProject.map(({ project, income, expense, paid }) => (
              <div key={project.id} style={{ borderBottom: '1px solid #0a1628', paddingBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <Link href={`/crm/projects/${project.id}`} style={{ fontSize: 12, fontWeight: 600, color: '#e2e8f0', textDecoration: 'none' }}>{project.name}</Link>
                  <span style={{ fontSize: 12, fontFamily: 'monospace', color: income - expense >= 0 ? '#10b981' : '#ef4444' }}>{fmt(income - expense)}</span>
                </div>
                <div style={{ display: 'flex', gap: 12, fontSize: 10, fontFamily: 'monospace', color: '#475569' }}>
                  <span>Fact: <span style={{ color: '#60a5fa' }}>{fmt(income)}</span></span>
                  <span>Cobrado: <span style={{ color: '#10b981' }}>{fmt(paid)}</span></span>
                  <span>Gastos: <span style={{ color: '#f87171' }}>{fmt(expense)}</span></span>
                </div>
              </div>
            ))}
            {byProject.length === 0 && <div style={{ color: '#1e293b', fontFamily: 'monospace', fontSize: 12 }}>Sin datos financieros por proyecto</div>}
          </div>
        </div>
      </div>
    </div>
  )
}
