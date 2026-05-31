'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { listProjects, getCRMKPIs, type CRMProject, type CRMKPIs, type ProjectStatus } from '@/lib/crm'

const STATUS_COLS: { status: ProjectStatus; label: string; color: string }[] = [
  { status: 'proposal',  label: 'Propuesta',  color: '#94a3b8' },
  { status: 'active',    label: 'Activo',     color: '#10b981' },
  { status: 'delivered', label: 'Entregado',  color: '#3b82f6' },
  { status: 'invoiced',  label: 'Facturado',  color: '#f59e0b' },
  { status: 'paid',      label: 'Cobrado',    color: '#a855f7' },
  { status: 'cancelled', label: 'Cancelado',  color: '#ef4444' },
]

const PM_SHORT: Record<string, string> = {
  'voz': 'Voz', 'chatbots': 'Chat', 'webs-apps': 'Web',
  'automatizaciones': 'Auto', 'operaciones': 'Ops',
}

function KPICard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ background: '#07101f', border: '1px solid #0f2040', borderRadius: 8, padding: '16px 20px', minWidth: 140 }}>
      <div style={{ fontSize: 10, color: '#475569', fontFamily: 'monospace', letterSpacing: '0.12em', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: '#e2e8f0' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

function ProjectCard({ project }: { project: CRMProject }) {
  return (
    <Link href={`/crm/projects/${project.id}`} style={{ textDecoration: 'none' }}>
      <div className="crm-card" style={{ background: '#07101f', border: '1px solid #0f2040', borderRadius: 6, padding: '12px 14px', marginBottom: 8, cursor: 'pointer' }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#e2e8f0', marginBottom: 4 }}>{project.name}</div>
        {project.client && <div style={{ fontSize: 11, color: '#64748b' }}>{project.client.name}</div>}
        <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
          {project.pm_vertical && (
            <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 3, background: 'rgba(16,185,129,0.1)', color: '#10b981', fontFamily: 'monospace' }}>
              {PM_SHORT[project.pm_vertical] ?? project.pm_vertical}
            </span>
          )}
          {project.budget != null && (
            <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 3, background: 'rgba(59,130,246,0.1)', color: '#60a5fa', fontFamily: 'monospace' }}>
              {project.budget.toLocaleString('es-ES')}€
            </span>
          )}
          {project.phase && (
            <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 3, background: 'rgba(148,163,184,0.08)', color: '#94a3b8', fontFamily: 'monospace' }}>
              {project.phase}
            </span>
          )}
        </div>
      </div>
    </Link>
  )
}

export default function CRMPipelinePage() {
  const [projects, setProjects] = useState<CRMProject[]>([])
  const [kpis, setKpis] = useState<CRMKPIs | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([listProjects(), getCRMKPIs()])
      .then(([p, k]) => { setProjects(p); setKpis(k) })
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div style={{ padding: 40, color: '#475569', fontFamily: 'monospace', fontSize: 13 }}>Cargando pipeline...</div>

  const byStatus = (s: ProjectStatus) => projects.filter(p => p.status === s)

  return (
    <div style={{ padding: 32 }}>
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 11, fontFamily: 'monospace', color: '#10b981', letterSpacing: '0.15em', marginBottom: 6 }}>CRM · PIPELINE</div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#e2e8f0' }}>Estado de proyectos</h1>
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 32 }}>
        <KPICard label="ACTIVOS" value={String(kpis?.activeProjects ?? 0)} sub={`de ${kpis?.totalProjects ?? 0} total`} />
        <KPICard label="CLIENTES" value={String(kpis?.totalClients ?? 0)} />
        <KPICard label="POR COBRAR" value={`${(kpis?.pendingRevenue ?? 0).toLocaleString('es-ES')}€`} />
        <KPICard label="COBRADO" value={`${(kpis?.paidRevenue ?? 0).toLocaleString('es-ES')}€`} />
        <KPICard label="GASTOS" value={`${(kpis?.totalExpenses ?? 0).toLocaleString('es-ES')}€`} />
        <KPICard label="MARGEN NETO" value={`${((kpis?.paidRevenue ?? 0) - (kpis?.totalExpenses ?? 0)).toLocaleString('es-ES')}€`} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(180px, 1fr))', gap: 16, overflowX: 'auto' }}>
        {STATUS_COLS.map(({ status, label, color }) => (
          <div key={status}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, display: 'inline-block' }} />
              <span style={{ fontSize: 11, fontFamily: 'monospace', color, letterSpacing: '0.1em' }}>{label}</span>
              <span style={{ fontSize: 10, color: '#475569', marginLeft: 'auto' }}>{byStatus(status).length}</span>
            </div>
            {byStatus(status).map(p => <ProjectCard key={p.id} project={p} />)}
            {byStatus(status).length === 0 && (
              <div style={{ fontSize: 11, color: '#1e293b', fontFamily: 'monospace', padding: '8px 0' }}>—</div>
            )}
          </div>
        ))}
      </div>

      <style>{`.crm-card:hover { border-color: #1e3a5f !important; }`}</style>
    </div>
  )
}
