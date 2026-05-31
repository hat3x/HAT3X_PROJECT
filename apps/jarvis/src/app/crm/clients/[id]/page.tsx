'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { use } from 'react'
import { getCRMClient, listProjects, getAllFinancials, listProjectNotes, type CRMClient, type CRMProject, type ProjectFinancial, type ProjectNote } from '@/lib/crm'

const STATUS_COLOR: Record<string, string> = {
  proposal: '#94a3b8', active: '#10b981', delivered: '#3b82f6',
  invoiced: '#f59e0b', paid: '#a855f7', cancelled: '#ef4444',
}

export default function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [client, setClient] = useState<CRMClient | null>(null)
  const [projects, setProjects] = useState<CRMProject[]>([])
  const [financials, setFinancials] = useState<ProjectFinancial[]>([])
  const [notes, setNotes] = useState<ProjectNote[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([getCRMClient(id), listProjects(), getAllFinancials()])
      .then(async ([c, allP, allF]) => {
        setClient(c)
        const cp = allP.filter(p => p.client_id === id)
        setProjects(cp)
        const pids = new Set(cp.map(p => p.id))
        setFinancials(allF.filter(f => f.client_id === id || pids.has(f.project_id)))
        const allNotes = await Promise.all(cp.map(p => listProjectNotes(p.id)))
        setNotes(allNotes.flat().sort((a, b) => b.created_at.localeCompare(a.created_at)))
      }).finally(() => setLoading(false))
  }, [id])

  if (loading) return <div style={{ padding: 40, color: '#475569', fontFamily: 'monospace' }}>Cargando...</div>
  if (!client) return <div style={{ padding: 40, color: '#ef4444', fontFamily: 'monospace' }}>Cliente no encontrado</div>

  const fmt = (n: number) => n.toLocaleString('es-ES') + '€'
  const totalIncome  = financials.filter(f => f.type === 'income').reduce((s, f) => s + f.amount, 0)
  const totalExpense = financials.filter(f => f.type === 'expense').reduce((s, f) => s + f.amount, 0)
  const paid    = financials.filter(f => f.type === 'income' && f.status === 'paid').reduce((s, f) => s + f.amount, 0)
  const pending = financials.filter(f => f.type === 'income' && f.status !== 'paid' && f.status !== 'cancelled').reduce((s, f) => s + f.amount, 0)

  return (
    <div style={{ padding: 32 }}>
      <div style={{ marginBottom: 28 }}>
        <Link href="/crm/clients" style={{ fontSize: 11, fontFamily: 'monospace', color: '#475569', textDecoration: 'none' }}>← Clientes</Link>
        <div style={{ fontSize: 11, fontFamily: 'monospace', color: '#10b981', letterSpacing: '0.15em', marginTop: 12, marginBottom: 6 }}>CLIENTE</div>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#e2e8f0' }}>{client.name}</h1>
        {client.sector && <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>{client.sector}</div>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 32 }}>
        {[
          { label: 'FACTURADO', value: fmt(totalIncome) },
          { label: 'COBRADO',   value: fmt(paid),    color: '#10b981' },
          { label: 'PENDIENTE', value: fmt(pending), color: '#f59e0b' },
          { label: 'GASTOS',    value: fmt(totalExpense), color: '#ef4444' },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background: '#07101f', border: '1px solid #0f2040', borderRadius: 8, padding: '14px 18px' }}>
            <div style={{ fontSize: 10, fontFamily: 'monospace', color: '#475569', letterSpacing: '0.12em', marginBottom: 6 }}>{label}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: color ?? '#e2e8f0' }}>{value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 24 }}>
        <div>
          <div style={{ fontSize: 11, fontFamily: 'monospace', color: '#475569', letterSpacing: '0.12em', marginBottom: 12 }}>PROYECTOS</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {projects.map(p => (
              <Link key={p.id} href={`/crm/projects/${p.id}`} style={{ textDecoration: 'none' }}>
                <div className="crm-card" style={{ background: '#07101f', border: '1px solid #0f2040', borderRadius: 6, padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0' }}>{p.name}</div>
                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{p.phase ?? 'sin fase'} · {p.pm_vertical ?? 'sin PM'}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {p.budget != null && <span style={{ fontSize: 12, color: '#60a5fa', fontFamily: 'monospace' }}>{fmt(p.budget)}</span>}
                    <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 3, background: `${STATUS_COLOR[p.status]}20`, color: STATUS_COLOR[p.status], fontFamily: 'monospace' }}>{p.status}</span>
                  </div>
                </div>
              </Link>
            ))}
            {projects.length === 0 && <div style={{ color: '#1e293b', fontFamily: 'monospace', fontSize: 12 }}>Sin proyectos</div>}
          </div>
        </div>

        <div>
          <div style={{ fontSize: 11, fontFamily: 'monospace', color: '#475569', letterSpacing: '0.12em', marginBottom: 12 }}>ACTIVIDAD Y NOTAS</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {client.notes?.split('\n').filter(Boolean).slice(0, 3).map((line, i) => (
              <div key={i} style={{ background: '#07101f', border: '1px solid #0f2040', borderRadius: 6, padding: '10px 14px' }}>
                <div style={{ fontSize: 12, color: '#94a3b8' }}>{line}</div>
              </div>
            ))}
            {notes.slice(0, 5).map(note => (
              <div key={note.id} style={{ background: '#07101f', border: '1px solid #0f2040', borderRadius: 6, padding: '10px 14px' }}>
                <div style={{ fontSize: 10, fontFamily: 'monospace', color: '#475569', marginBottom: 4 }}>
                  {new Date(note.created_at).toLocaleDateString('es-ES')} · {note.source}
                </div>
                <div style={{ fontSize: 12, color: '#94a3b8' }}>{note.content}</div>
              </div>
            ))}
            {notes.length === 0 && !client.notes && <div style={{ color: '#1e293b', fontFamily: 'monospace', fontSize: 12 }}>Sin actividad</div>}
          </div>
        </div>
      </div>

      <style>{`.crm-card:hover { border-color: #1e3a5f !important; }`}</style>
    </div>
  )
}
