'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { supabase, fetchTask, fetchTaskEvents } from '@/lib/supabase-command'
import type { HatTask, BusEvent } from '@/lib/supabase-command'

const STATUS_COLOR: Record<string, string> = {
  running: '#3b82f6', pending: '#f59e0b', completed: '#10b981', failed: '#ef4444', paused: '#8b5cf6',
}

const EVENT_ICON: Record<string, string> = {
  'task.started': '▶', 'task.completed': '✓', 'task.failed': '✗',
  'checkpoint.triggered': '◆', 'checkpoint.approved': '✓', 'checkpoint.rejected': '✗',
  'meeting.called': '◎', 'meeting.resolved': '●',
  'phase.started': '→', 'phase.completed': '→',
  'agent.online': '◉', 'agent.offline': '○',
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 60000) return `${Math.floor(diff / 1000)}s`
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`
  return new Date(iso).toLocaleDateString('es-ES')
}

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [task, setTask] = useState<HatTask | null>(null)
  const [events, setEvents] = useState<BusEvent[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    Promise.all([fetchTask(id), fetchTaskEvents(id)]).then(([t, e]) => {
      setTask(t)
      setEvents(e)
      setLoading(false)
    })

    const channel = supabase
      .channel(`project-${id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'bus_events', filter: `task_id=eq.${id}` }, (p) => {
        setEvents(prev => [p.new as BusEvent, ...prev])
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'hat3x_tasks', filter: `id=eq.${id}` }, (p) => {
        setTask(p.new as HatTask)
      })
      .subscribe()

    return () => { void supabase.removeChannel(channel) }
  }, [id])

  if (loading) return <div style={{ padding: 32, color: '#475569', fontFamily: 'monospace', fontSize: 13 }}>Cargando...</div>
  if (!task) return (
    <div style={{ padding: 32 }}>
      <div style={{ color: '#ef4444', marginBottom: 16 }}>Tarea no encontrada: {id}</div>
      <Link href="/command/proyectos" style={{ color: '#3b82f6', fontSize: 13 }}>← Volver</Link>
    </div>
  )

  const phases = task.execution_plan?.phases ?? []
  const subtasks = Array.isArray(task.subtasks)
    ? task.subtasks as Array<{ id: string; description: string; vertical: string; estimatedHours: number }>
    : []

  return (
    <div style={{ padding: 32 }}>
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <Link href="/command/proyectos" style={{ color: '#475569', fontSize: 13, textDecoration: 'none' }}>Proyectos</Link>
          <span style={{ color: '#334155' }}>/</span>
          <span style={{ fontFamily: 'monospace', fontSize: 13, color: '#3b82f6' }}>{task.id}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8, lineHeight: 1.4 }}>{task.order_raw}</h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{
                fontSize: 12, fontFamily: 'monospace', padding: '3px 10px', borderRadius: 4,
                background: `${STATUS_COLOR[task.status] ?? '#475569'}15`,
                color: STATUS_COLOR[task.status] ?? '#94a3b8',
                border: `1px solid ${STATUS_COLOR[task.status] ?? '#475569'}35`,
              }}>{task.status}</span>
              <span style={{ fontSize: 12, color: '#64748b', fontFamily: 'monospace' }}>{task.control_mode}</span>
              {task.client_id && <span style={{ fontSize: 12, color: '#64748b', fontFamily: 'monospace' }}>cliente: {task.client_id}</span>}
            </div>
          </div>
          {task.execution_plan?.totalEstimatedHours != null && (
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#3b82f6' }}>{task.execution_plan.totalEstimatedHours}h</div>
              <div style={{ fontSize: 11, color: '#475569', fontFamily: 'monospace' }}>estimadas</div>
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 24 }}>
        <div style={{ display: 'grid', gap: 20 }}>

          {phases.length > 0 && (
            <div style={{ background: '#07101f', border: '1px solid #0f2040', borderRadius: 10, padding: 20 }}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>Plan de Ejecución</div>
              {phases.map((phase, i) => (
                <div key={phase.phaseNumber} style={{ marginBottom: i < phases.length - 1 ? 16 : 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <div style={{
                      width: 20, height: 20, borderRadius: '50%', background: '#0f2040', border: '1px solid #1e3a5f',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 10, color: '#64748b', fontFamily: 'monospace', flexShrink: 0,
                    }}>{phase.phaseNumber}</div>
                    <span style={{ fontSize: 12, color: '#94a3b8', fontFamily: 'monospace' }}>
                      Fase {phase.phaseNumber} · {phase.subtasks.length} subtarea{phase.subtasks.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <div style={{ marginLeft: 28, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {phase.subtasks.map(st => (
                      <span key={st.subtaskId} style={{ fontSize: 11, fontFamily: 'monospace', padding: '2px 8px', borderRadius: 4, background: '#0a1929', border: '1px solid #1e3050', color: '#64748b' }}>
                        {st.subtaskId}
                        {st.agentId && <span style={{ color: '#3b82f6' }}> → {st.agentId}</span>}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {subtasks.length > 0 && (
            <div style={{ background: '#07101f', border: '1px solid #0f2040', borderRadius: 10, padding: 20 }}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>Subtareas ({subtasks.length})</div>
              {subtasks.map((st, i) => (
                <div key={st.id} style={{ padding: '10px 0', borderTop: i > 0 ? '1px solid #0a1a2e' : 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#3b82f6' }}>{st.id}</span>
                    <div style={{ display: 'flex', gap: 8 }}>
                      {st.vertical && <span style={{ fontSize: 10, fontFamily: 'monospace', color: '#475569' }}>{st.vertical}</span>}
                      {st.estimatedHours && <span style={{ fontSize: 10, fontFamily: 'monospace', color: '#475569' }}>{st.estimatedHours}h</span>}
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: '#94a3b8' }}>{st.description}</div>
                </div>
              ))}
            </div>
          )}

          {phases.length === 0 && subtasks.length === 0 && (
            <div style={{ background: '#07101f', border: '1px solid #0f2040', borderRadius: 10, padding: 20, color: '#475569', fontSize: 13, textAlign: 'center' }}>
              Sin plan de ejecución todavía
            </div>
          )}
        </div>

        {/* Event feed */}
        <div style={{ background: '#07101f', border: '1px solid #0f2040', borderRadius: 10, padding: 20, alignSelf: 'start' }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />
            Actividad
          </div>
          {events.length === 0 ? (
            <div style={{ color: '#475569', fontSize: 13, padding: '20px 0', textAlign: 'center' }}>Sin actividad aún</div>
          ) : (
            events.map((ev) => (
              <div key={ev.id} style={{ padding: '8px 0', borderTop: '1px solid #0a1a2e', display: 'flex', gap: 10 }}>
                <span style={{ fontSize: 11, color: '#3b82f6', flexShrink: 0, marginTop: 1 }}>
                  {EVENT_ICON[ev.event_type] ?? '·'}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: 'monospace', fontSize: 11, color: '#64748b' }}>{ev.event_type}</div>
                  {ev.agent_id && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>{ev.agent_id}</div>}
                  {ev.payload && Object.keys(ev.payload).length > 0 && (
                    <div style={{ fontSize: 10, color: '#334155', marginTop: 2, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {JSON.stringify(ev.payload)}
                    </div>
                  )}
                </div>
                <span style={{ fontFamily: 'monospace', fontSize: 10, color: '#334155', flexShrink: 0 }}>{timeAgo(ev.created_at)}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
