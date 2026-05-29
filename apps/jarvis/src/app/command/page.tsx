'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase, fetchTasks, fetchRecentEvents, fetchCheckpoints } from '@/lib/supabase-command'
import type { HatTask, BusEvent, HatCheckpoint } from '@/lib/supabase-command'

const STATUS_COLOR: Record<string, string> = {
  running: '#3b82f6',
  pending: '#f59e0b',
  completed: '#10b981',
  failed: '#ef4444',
  paused: '#8b5cf6',
}

const EVENT_ICON: Record<string, string> = {
  'task.started': '▶',
  'task.completed': '✓',
  'task.failed': '✗',
  'task.paused': '⏸',
  'agent.online': '◉',
  'agent.offline': '○',
  'checkpoint.triggered': '◆',
  'checkpoint.approved': '✓',
  'checkpoint.rejected': '✗',
  'meeting.called': '◎',
  'meeting.resolved': '✓',
  'phase.started': '→',
  'phase.completed': '→',
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 60000) return `${Math.floor(diff / 1000)}s`
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`
  return `${Math.floor(diff / 86400000)}d`
}

export default function CommandOverview() {
  const [tasks, setTasks] = useState<HatTask[]>([])
  const [events, setEvents] = useState<BusEvent[]>([])
  const [checkpoints, setCheckpoints] = useState<HatCheckpoint[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([fetchTasks(), fetchRecentEvents(20), fetchCheckpoints('pending')]).then(([t, e, c]) => {
      setTasks(t)
      setEvents(e)
      setCheckpoints(c)
      setLoading(false)
    })

    const channel = supabase
      .channel('command-overview')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'bus_events' }, (p) => {
        setEvents((prev) => [p.new as BusEvent, ...prev.slice(0, 29)])
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'hat3x_tasks' }, () => {
        fetchTasks().then(setTasks)
      })
      .subscribe()

    return () => { void supabase.removeChannel(channel) }
  }, [])

  const running = tasks.filter(t => t.status === 'running')
  const pending = tasks.filter(t => t.status === 'pending')
  const completed = tasks.filter(t => t.status === 'completed')

  return (
    <div style={{ padding: 32 }}>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 4 }}>Oficina Virtual</h1>
        <p style={{ fontSize: 13, color: '#64748b', fontFamily: 'monospace' }}>
          {new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
      </div>

      {loading ? (
        <div style={{ color: '#475569', fontFamily: 'monospace', fontSize: 13 }}>Cargando...</div>
      ) : (
        <div style={{ display: 'grid', gap: 24 }}>

          {/* KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
            {[
              { label: 'En ejecución', value: running.length, color: '#3b82f6' },
              { label: 'Pendientes', value: pending.length, color: '#f59e0b' },
              { label: 'Completados', value: completed.length, color: '#10b981' },
              { label: 'Checkpoints', value: checkpoints.length, color: '#8b5cf6' },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ background: '#07101f', border: '1px solid #0f2040', borderRadius: 10, padding: '18px 20px' }}>
                <div style={{ fontSize: 28, fontWeight: 700, color }}>{value}</div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 4, fontFamily: 'monospace' }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Checkpoint alerts */}
          {checkpoints.length > 0 && (
            <div style={{ background: '#0d1a30', border: '1px solid #8b5cf6', borderRadius: 10, padding: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                <span style={{ color: '#8b5cf6', fontSize: 14 }}>◆</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: '#a78bfa' }}>Checkpoints pendientes</span>
              </div>
              {checkpoints.map((cp) => (
                <div key={cp.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderTop: '1px solid #1e3050' }}>
                  <div>
                    <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#8b5cf6' }}>{cp.task_id}</span>
                    <span style={{ fontSize: 13, color: '#cbd5e1', marginLeft: 12 }}>{cp.reason}</span>
                  </div>
                  <Link href="/command/checkpoints" style={{ fontSize: 12, color: '#a78bfa', textDecoration: 'none', padding: '4px 12px', border: '1px solid #8b5cf6', borderRadius: 6 }}>
                    Revisar →
                  </Link>
                </div>
              ))}
            </div>
          )}

          {/* Tasks + Live feed */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 24 }}>

            <div style={{ background: '#07101f', border: '1px solid #0f2040', borderRadius: 10, padding: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <span style={{ fontSize: 14, fontWeight: 600 }}>Proyectos activos</span>
                <Link href="/command/proyectos" style={{ fontSize: 12, color: '#3b82f6', textDecoration: 'none' }}>Ver todos →</Link>
              </div>
              {tasks.slice(0, 8).map((task) => (
                <Link key={task.id} href={`/command/proyectos/${task.id}`} style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
                  <div style={{ padding: '12px 0', borderTop: '1px solid #0f2040' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#3b82f6' }}>{task.id}</span>
                      <span style={{
                        fontSize: 11, fontFamily: 'monospace', padding: '2px 8px', borderRadius: 4,
                        background: `${STATUS_COLOR[task.status] ?? '#475569'}20`,
                        color: STATUS_COLOR[task.status] ?? '#94a3b8',
                        border: `1px solid ${STATUS_COLOR[task.status] ?? '#475569'}40`,
                      }}>
                        {task.status}
                      </span>
                    </div>
                    <div style={{ fontSize: 13, color: '#94a3b8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {task.order_raw}
                    </div>
                    <div style={{ fontSize: 11, color: '#475569', fontFamily: 'monospace', marginTop: 4 }}>
                      {task.control_mode} · {timeAgo(task.created_at)}
                    </div>
                  </div>
                </Link>
              ))}
              {tasks.length === 0 && (
                <div style={{ color: '#475569', fontSize: 13, padding: '20px 0', textAlign: 'center' }}>Sin proyectos aún</div>
              )}
            </div>

            <div style={{ background: '#07101f', border: '1px solid #0f2040', borderRadius: 10, padding: 20 }}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />
                Estado en tiempo real
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {events.map((ev) => (
                  <div key={ev.id} style={{ padding: '8px 0', borderTop: '1px solid #0a1a2e', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <span style={{ fontSize: 12, color: '#3b82f6', flexShrink: 0, marginTop: 1 }}>
                      {EVENT_ICON[ev.event_type] ?? '·'}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: 'monospace', fontSize: 11, color: '#64748b' }}>{ev.event_type}</div>
                      {ev.agent_id && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>{ev.agent_id}</div>}
                    </div>
                    <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#334155', flexShrink: 0 }}>
                      {timeAgo(ev.created_at)}
                    </span>
                  </div>
                ))}
                {events.length === 0 && (
                  <div style={{ color: '#475569', fontSize: 13, padding: '20px 0', textAlign: 'center' }}>Esperando eventos...</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
