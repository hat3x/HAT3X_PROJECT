'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { listProjects, type CRMProject, type ProjectStatus } from '@/lib/crm'

const STATUS_OPTS: { value: ProjectStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'proposal', label: 'Propuesta' },
  { value: 'active', label: 'Activo' },
  { value: 'delivered', label: 'Entregado' },
  { value: 'invoiced', label: 'Facturado' },
  { value: 'paid', label: 'Cobrado' },
  { value: 'cancelled', label: 'Cancelado' },
]

const SC: Record<string, string> = {
  proposal: '#94a3b8', active: '#10b981', delivered: '#3b82f6',
  invoiced: '#f59e0b', paid: '#a855f7', cancelled: '#ef4444',
}

const PHASES = ['discovery', 'design', 'development', 'review', 'launch']

export default function ProjectsPage() {
  const [projects, setProjects] = useState<CRMProject[]>([])
  const [filter, setFilter] = useState<ProjectStatus | 'all'>('all')
  const [loading, setLoading] = useState(true)

  useEffect(() => { listProjects().then(setProjects).finally(() => setLoading(false)) }, [])

  const visible = filter === 'all' ? projects : projects.filter(p => p.status === filter)

  if (loading) return <div style={{ padding: 40, color: '#475569', fontFamily: 'monospace' }}>Cargando proyectos...</div>

  return (
    <div style={{ padding: 32 }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 11, fontFamily: 'monospace', color: '#10b981', letterSpacing: '0.15em', marginBottom: 6 }}>CRM · PROYECTOS</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#e2e8f0' }}>Todos los proyectos</h1>
          <div style={{ fontSize: 12, color: '#475569', fontFamily: 'monospace' }}>{visible.length} proyecto{visible.length !== 1 ? 's' : ''}</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 20, flexWrap: 'wrap' }}>
        {STATUS_OPTS.map(({ value, label }) => (
          <button key={value} onClick={() => setFilter(value)}
            style={{ padding: '5px 12px', borderRadius: 4, fontSize: 12, fontFamily: 'monospace', cursor: 'pointer',
              border: `1px solid ${filter === value ? (value === 'all' ? '#334155' : SC[value] + '40') : '#0f2040'}`,
              background: filter === value ? (value === 'all' ? '#1e293b' : `${SC[value]}20`) : 'transparent',
              color: filter === value ? (value === 'all' ? '#e2e8f0' : SC[value]) : '#475569' }}>
            {label}
          </button>
        ))}
      </div>

      <div style={{ background: '#07101f', border: '1px solid #0f2040', borderRadius: 8, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #0f2040' }}>
              {['Proyecto', 'Cliente', 'Estado', 'Fase', 'PM', 'Presupuesto', 'Inicio'].map(h => (
                <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 10, fontFamily: 'monospace', color: '#475569', letterSpacing: '0.12em' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map(p => (
              <tr key={p.id} className="crm-row" style={{ borderBottom: '1px solid #0a1628' }}>
                <td style={{ padding: '13px 16px' }}>
                  <Link href={`/crm/projects/${p.id}`} style={{ color: '#e2e8f0', textDecoration: 'none', fontWeight: 600 }}>{p.name}</Link>
                </td>
                <td style={{ padding: '13px 16px', color: '#64748b' }}>{p.client?.name ?? '—'}</td>
                <td style={{ padding: '13px 16px' }}>
                  <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 3, background: `${SC[p.status]}18`, color: SC[p.status], fontFamily: 'monospace' }}>{p.status}</span>
                </td>
                <td style={{ padding: '13px 16px' }}>
                  {p.phase ? (
                    <div style={{ display: 'flex', gap: 2 }}>
                      {PHASES.map(ph => (
                        <span key={ph} style={{ width: 8, height: 8, borderRadius: 2, background: PHASES.indexOf(ph) <= PHASES.indexOf(p.phase!) ? '#10b981' : '#0f2040' }} />
                      ))}
                    </div>
                  ) : <span style={{ color: '#1e293b' }}>—</span>}
                </td>
                <td style={{ padding: '13px 16px', color: '#64748b', fontSize: 11, fontFamily: 'monospace' }}>{p.pm_vertical ?? '—'}</td>
                <td style={{ padding: '13px 16px', color: '#60a5fa', fontFamily: 'monospace', fontSize: 12 }}>
                  {p.budget != null ? `${p.budget.toLocaleString('es-ES')}€` : '—'}
                </td>
                <td style={{ padding: '13px 16px', color: '#475569', fontSize: 11 }}>
                  {p.start_date ? new Date(p.start_date).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {visible.length === 0 && <div style={{ padding: 40, textAlign: 'center', color: '#1e293b', fontFamily: 'monospace' }}>Sin proyectos en este estado</div>}
      </div>

      <style>{`.crm-row:hover { background: rgba(16,185,129,0.03) !important; }`}</style>
    </div>
  )
}
