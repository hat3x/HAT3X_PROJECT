'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { use } from 'react'
import { getProject, listProjectFinancials, listProjectNotes, getProjectFinancialSummary, type CRMProject, type ProjectFinancial, type ProjectNote, type ProjectFinancialSummary } from '@/lib/crm'
import { getSupabaseClient } from '@/lib/supabase'

const SC: Record<string, string> = {
  proposal: '#94a3b8', active: '#10b981', delivered: '#3b82f6',
  invoiced: '#f59e0b', paid: '#a855f7', cancelled: '#ef4444',
}
const FSC: Record<string, string> = {
  pending: '#f59e0b', invoiced: '#3b82f6', paid: '#10b981', cancelled: '#475569',
}
const PHASES = ['discovery', 'design', 'development', 'review', 'launch']

interface LinkedTask { id: string; order_raw: string; status: string; created_at: string }

export default function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [project, setProject] = useState<CRMProject | null>(null)
  const [financials, setFinancials] = useState<ProjectFinancial[]>([])
  const [notes, setNotes] = useState<ProjectNote[]>([])
  const [summary, setSummary] = useState<ProjectFinancialSummary | null>(null)
  const [tasks, setTasks] = useState<LinkedTask[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([getProject(id), listProjectFinancials(id), listProjectNotes(id), getProjectFinancialSummary(id)])
      .then(async ([p, f, n, s]) => {
        setProject(p); setFinancials(f); setNotes(n); setSummary(s)
        if (p?.client_id) {
          const { data } = await getSupabaseClient().from('hat3x_tasks')
            .select('id, order_raw, status, created_at').eq('client_id', p.client_id)
            .order('created_at', { ascending: false }).limit(8)
          setTasks((data ?? []) as LinkedTask[])
        }
      }).finally(() => setLoading(false))
  }, [id])

  const fmt = (n: number) => n.toLocaleString('es-ES') + '€'

  if (loading) return <div style={{ padding: 40, color: '#475569', fontFamily: 'monospace' }}>Cargando proyecto...</div>
  if (!project) return <div style={{ padding: 40, color: '#ef4444', fontFamily: 'monospace' }}>Proyecto no encontrado</div>

  const phaseIdx = project.phase ? PHASES.indexOf(project.phase) : -1

  return (
    <div style={{ padding: 32 }}>
      <div style={{ marginBottom: 28 }}>
        <Link href="/crm/projects" style={{ fontSize: 11, fontFamily: 'monospace', color: '#475569', textDecoration: 'none' }}>← Proyectos</Link>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginTop: 12 }}>
          <div>
            <div style={{ fontSize: 11, fontFamily: 'monospace', color: '#10b981', letterSpacing: '0.15em', marginBottom: 6 }}>PROYECTO</div>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: '#e2e8f0' }}>{project.name}</h1>
            {project.client && (
              <Link href={`/crm/clients/${project.client_id}`} style={{ fontSize: 13, color: '#64748b', textDecoration: 'none', marginTop: 4, display: 'block' }}>
                {project.client.name}{project.client.sector ? ` · ${project.client.sector}` : ''}
              </Link>
            )}
            {project.description && <div style={{ fontSize: 13, color: '#475569', marginTop: 8, maxWidth: 600 }}>{project.description}</div>}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
            <span style={{ fontSize: 11, padding: '4px 12px', borderRadius: 4, background: `${SC[project.status]}20`, color: SC[project.status], fontFamily: 'monospace' }}>{project.status}</span>
            {project.pm_vertical && <span style={{ fontSize: 10, color: '#475569', fontFamily: 'monospace' }}>PM: {project.pm_vertical}</span>}
          </div>
        </div>
      </div>

      {project.phase && (
        <div style={{ background: '#07101f', border: '1px solid #0f2040', borderRadius: 8, padding: '16px 20px', marginBottom: 24 }}>
          <div style={{ fontSize: 10, fontFamily: 'monospace', color: '#475569', letterSpacing: '0.12em', marginBottom: 12 }}>FASE ACTUAL</div>
          <div style={{ display: 'flex' }}>
            {PHASES.map((ph, i) => (
              <div key={ph} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                <div style={{ width: '100%', height: 3, background: i <= phaseIdx ? '#10b981' : '#0f2040', borderRadius: i === 0 ? '3px 0 0 3px' : i === PHASES.length - 1 ? '0 3px 3px 0' : 0 }} />
                <div style={{ fontSize: 10, fontFamily: 'monospace', color: i <= phaseIdx ? '#10b981' : '#1e293b' }}>{ph}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {summary && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 24 }}>
          {[
            { label: 'PRESUPUESTO', value: project.budget != null ? fmt(project.budget) : '—' },
            { label: 'FACTURADO',   value: fmt(summary.totalIncome) },
            { label: 'COBRADO',     value: fmt(summary.paid),   color: '#10b981' },
            { label: 'PENDIENTE',   value: fmt(summary.pending), color: '#f59e0b' },
            { label: 'MARGEN',      value: fmt(summary.margin),  color: summary.margin >= 0 ? '#10b981' : '#ef4444' },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ background: '#07101f', border: '1px solid #0f2040', borderRadius: 8, padding: '14px 16px' }}>
              <div style={{ fontSize: 10, fontFamily: 'monospace', color: '#475569', letterSpacing: '0.12em', marginBottom: 6 }}>{label}</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: color ?? '#e2e8f0' }}>{value}</div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 24 }}>
        <div>
          <div style={{ fontSize: 11, fontFamily: 'monospace', color: '#475569', letterSpacing: '0.12em', marginBottom: 12 }}>MOVIMIENTOS FINANCIEROS</div>
          <div style={{ background: '#07101f', border: '1px solid #0f2040', borderRadius: 8, overflow: 'hidden', marginBottom: 24 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #0f2040' }}>
                  {['Concepto', 'Tipo', 'Importe', 'Fecha', 'Estado'].map(h => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 10, fontFamily: 'monospace', color: '#475569' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {financials.map(f => (
                  <tr key={f.id} style={{ borderBottom: '1px solid #0a1628' }}>
                    <td style={{ padding: '10px 14px', color: '#e2e8f0' }}>{f.concept}</td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ fontSize: 10, color: f.type === 'income' ? '#10b981' : '#ef4444', fontFamily: 'monospace' }}>{f.type}</span>
                    </td>
                    <td style={{ padding: '10px 14px', fontFamily: 'monospace', color: f.type === 'income' ? '#60a5fa' : '#f87171' }}>
                      {f.type === 'expense' ? '-' : ''}{fmt(f.amount)}
                    </td>
                    <td style={{ padding: '10px 14px', color: '#475569' }}>
                      {new Date(f.date).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: '2-digit' })}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 3, background: `${FSC[f.status]}15`, color: FSC[f.status], fontFamily: 'monospace' }}>{f.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {financials.length === 0 && <div style={{ padding: 24, textAlign: 'center', color: '#1e293b', fontFamily: 'monospace', fontSize: 12 }}>Sin movimientos. Pide a Jarvis que registre uno.</div>}
          </div>

          {tasks.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontFamily: 'monospace', color: '#475569', letterSpacing: '0.12em', marginBottom: 12 }}>TAREAS VINCULADAS</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {tasks.map(t => (
                  <div key={t.id} style={{ background: '#07101f', border: '1px solid #0f2040', borderRadius: 6, padding: '10px 14px', display: 'flex', gap: 10, alignItems: 'center' }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: t.status === 'running' ? '#10b981' : t.status === 'completed' ? '#3b82f6' : '#475569', flexShrink: 0 }} />
                    <span style={{ fontSize: 12, color: '#94a3b8', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.order_raw}</span>
                    <span style={{ fontSize: 10, color: '#475569', fontFamily: 'monospace', flexShrink: 0 }}>{t.status}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div>
          <div style={{ fontSize: 11, fontFamily: 'monospace', color: '#475569', letterSpacing: '0.12em', marginBottom: 12 }}>NOTAS Y ACTIVIDAD</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {notes.map(note => (
              <div key={note.id} style={{ background: '#07101f', border: '1px solid #0f2040', borderRadius: 6, padding: '10px 14px' }}>
                <div style={{ fontSize: 10, fontFamily: 'monospace', color: '#475569', marginBottom: 4 }}>
                  {new Date(note.created_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })} · {note.source}
                </div>
                <div style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.5 }}>{note.content}</div>
              </div>
            ))}
            {notes.length === 0 && <div style={{ color: '#1e293b', fontFamily: 'monospace', fontSize: 12 }}>Sin notas aun. Pide a Jarvis que apunte algo.</div>}
          </div>
        </div>
      </div>
    </div>
  )
}
