'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { fetchTasks } from '@/lib/supabase-command'
import type { HatTask } from '@/lib/supabase-command'

const STATUS_COLOR: Record<string, string> = {
  running: '#3b82f6',
  pending: '#f59e0b',
  completed: '#10b981',
  failed: '#ef4444',
  paused: '#8b5cf6',
}

const MODE_LABEL: Record<string, string> = {
  autopilot: 'Autopilot',
  phased: 'Phased',
  supervised: 'Supervised',
  configurable: 'Config.',
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 60000) return `${Math.floor(diff / 1000)}s`
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`
  return new Date(iso).toLocaleDateString('es-ES')
}

export default function ProyectosPage() {
  const [tasks, setTasks] = useState<HatTask[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>('all')

  useEffect(() => {
    fetchTasks().then(t => { setTasks(t); setLoading(false) })
  }, [])

  const statuses = ['all', 'running', 'pending', 'completed', 'failed', 'paused']
  const filtered = filter === 'all' ? tasks : tasks.filter(t => t.status === filter)

  return (
    <div style={{ padding: 32 }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 4 }}>Proyectos</h1>
        <p style={{ fontSize: 13, color: '#64748b', fontFamily: 'monospace' }}>{tasks.length} tareas en total</p>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        {statuses.map(s => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            style={{
              fontSize: 12, fontFamily: 'monospace', padding: '5px 14px', borderRadius: 6, cursor: 'pointer',
              border: filter === s ? `1px solid ${STATUS_COLOR[s] ?? '#3b82f6'}` : '1px solid #0f2040',
              background: filter === s ? `${STATUS_COLOR[s] ?? '#3b82f6'}15` : '#07101f',
              color: filter === s ? (STATUS_COLOR[s] ?? '#3b82f6') : '#64748b',
            }}
          >
            {s === 'all' ? 'Todos' : s}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ color: '#475569', fontFamily: 'monospace', fontSize: 13 }}>Cargando...</div>
      ) : filtered.length === 0 ? (
        <div style={{ color: '#475569', fontSize: 13, padding: '40px 0', textAlign: 'center' }}>Sin proyectos en este estado</div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {filtered.map(task => {
            const phases = task.execution_plan?.phases ?? []
            const totalSubtasks = phases.reduce((n, p) => n + p.subtasks.length, 0)
            return (
              <Link key={task.id} href={`/command/proyectos/${task.id}`} style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
                <div style={{ background: '#07101f', border: '1px solid #0f2040', borderRadius: 10, padding: '18px 20px' }} className="task-card">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span style={{ fontFamily: 'monospace', fontSize: 13, color: '#3b82f6', fontWeight: 600 }}>{task.id}</span>
                      {task.client_id && (
                        <span style={{ fontSize: 11, color: '#64748b', fontFamily: 'monospace' }}>· {task.client_id}</span>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 11, color: '#475569', fontFamily: 'monospace' }}>
                        {MODE_LABEL[task.control_mode] ?? task.control_mode}
                      </span>
                      <span style={{
                        fontSize: 11, fontFamily: 'monospace', padding: '2px 10px', borderRadius: 4,
                        background: `${STATUS_COLOR[task.status] ?? '#475569'}15`,
                        color: STATUS_COLOR[task.status] ?? '#94a3b8',
                        border: `1px solid ${STATUS_COLOR[task.status] ?? '#475569'}35`,
                      }}>
                        {task.status}
                      </span>
                    </div>
                  </div>

                  <div style={{ fontSize: 14, color: '#94a3b8', marginBottom: 10, lineHeight: 1.5 }}>{task.order_raw}</div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                    {phases.length > 0 && (
                      <span style={{ fontSize: 11, color: '#475569', fontFamily: 'monospace' }}>
                        {phases.length} fases · {totalSubtasks} subtareas
                      </span>
                    )}
                    {task.execution_plan?.riskLevel && (
                      <span style={{ fontSize: 11, color: '#475569', fontFamily: 'monospace' }}>riesgo: {task.execution_plan.riskLevel}</span>
                    )}
                    <span style={{ fontSize: 11, color: '#334155', fontFamily: 'monospace', marginLeft: 'auto' }}>
                      {timeAgo(task.created_at)}
                    </span>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}

      <style>{`.task-card:hover { border-color: #1e3a5f !important; }`}</style>
    </div>
  )
}
