'use client'
export const dynamic = 'force-dynamic'
import { useEffect, useState } from 'react'
import { getSupabase, fetchCheckpoints, resolveCheckpoint } from '@/lib/supabase-command'
import type { HatCheckpoint } from '@/lib/supabase-command'

const APPROVAL_LABEL: Record<string, string> = {
  jose: 'Jose', client: 'Cliente', both: 'Jose + Cliente',
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export default function CheckpointsPage() {
  const [checkpoints, setCheckpoints] = useState<HatCheckpoint[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending')
  const [resolving, setResolving] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<Record<string, string>>({})

  useEffect(() => {
    setLoading(true)
    fetchCheckpoints(filter === 'all' ? undefined : filter).then(c => { setCheckpoints(c); setLoading(false) })

    const channel = getSupabase()
      .channel('checkpoints-watch')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hat3x_checkpoints' }, () => {
        fetchCheckpoints(filter === 'all' ? undefined : filter).then(setCheckpoints)
      })
      .subscribe()

    return () => { void getSupabase().removeChannel(channel) }
  }, [filter])

  async function handleResolve(id: string, status: 'approved' | 'rejected') {
    setResolving(id)
    await resolveCheckpoint(id, status, feedback[id])
    setCheckpoints(prev => prev.map(c =>
      c.id === id ? { ...c, status, feedback: feedback[id] ?? null, resolved_at: new Date().toISOString() } : c
    ))
    setResolving(null)
  }

  return (
    <div style={{ padding: 32 }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 4 }}>Checkpoints</h1>
        <p style={{ fontSize: 13, color: '#64748b', fontFamily: 'monospace' }}>Puntos de aprobación antes de continuar la ejecución</p>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        {(['pending', 'approved', 'rejected', 'all'] as const).map(s => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            style={{
              fontSize: 12, fontFamily: 'monospace', padding: '5px 14px', borderRadius: 6, cursor: 'pointer',
              border: filter === s ? '1px solid #8b5cf6' : '1px solid #0f2040',
              background: filter === s ? '#8b5cf615' : '#07101f',
              color: filter === s ? '#a78bfa' : '#64748b',
            }}
          >
            {s === 'all' ? 'Todos' : s}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ color: '#475569', fontFamily: 'monospace', fontSize: 13 }}>Cargando...</div>
      ) : checkpoints.length === 0 ? (
        <div style={{ color: '#475569', fontSize: 13, padding: '60px 0', textAlign: 'center' }}>
          {filter === 'pending' ? '✓ Sin checkpoints pendientes' : 'Sin registros'}
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 16 }}>
          {checkpoints.map(cp => (
            <div key={cp.id} style={{
              background: '#07101f',
              border: `1px solid ${cp.status === 'pending' ? '#4c1d95' : cp.status === 'approved' ? '#064e3b' : '#450a0a'}`,
              borderRadius: 10, padding: 20,
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 14 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                    <span style={{ fontFamily: 'monospace', fontSize: 13, color: '#3b82f6', fontWeight: 600 }}>{cp.task_id}</span>
                    <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#64748b' }}>Fase {cp.after_phase}</span>
                    <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#8b5cf6' }}>
                      {APPROVAL_LABEL[cp.required_approval] ?? cp.required_approval}
                    </span>
                  </div>
                  <div style={{ fontSize: 14, color: '#cbd5e1', lineHeight: 1.5 }}>{cp.reason}</div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <span style={{
                    fontSize: 11, fontFamily: 'monospace', padding: '3px 10px', borderRadius: 4,
                    background: cp.status === 'pending' ? '#8b5cf620' : cp.status === 'approved' ? '#10b98120' : '#ef444420',
                    color: cp.status === 'pending' ? '#a78bfa' : cp.status === 'approved' ? '#34d399' : '#f87171',
                    border: `1px solid ${cp.status === 'pending' ? '#8b5cf640' : cp.status === 'approved' ? '#10b98140' : '#ef444440'}`,
                  }}>{cp.status}</span>
                  <div style={{ fontSize: 11, color: '#475569', fontFamily: 'monospace', marginTop: 6 }}>
                    {formatDate(cp.triggered_at)}
                  </div>
                </div>
              </div>

              {cp.status === 'pending' && (
                <div style={{ borderTop: '1px solid #1e3050', paddingTop: 14 }}>
                  <textarea
                    placeholder="Feedback opcional..."
                    value={feedback[cp.id] ?? ''}
                    onChange={e => setFeedback(prev => ({ ...prev, [cp.id]: e.target.value }))}
                    style={{
                      width: '100%', background: '#040810', border: '1px solid #0f2040', borderRadius: 6,
                      padding: '8px 12px', color: '#94a3b8', fontSize: 12, fontFamily: 'monospace',
                      resize: 'vertical', minHeight: 60, marginBottom: 12, boxSizing: 'border-box',
                    }}
                  />
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button
                      onClick={() => handleResolve(cp.id, 'approved')}
                      disabled={resolving === cp.id}
                      style={{
                        flex: 1, padding: '8px 0', borderRadius: 6, border: '1px solid #059669',
                        background: '#059669', color: '#fff', fontSize: 13, cursor: 'pointer',
                        opacity: resolving === cp.id ? 0.6 : 1,
                      }}
                    >
                      ✓ Aprobar
                    </button>
                    <button
                      onClick={() => handleResolve(cp.id, 'rejected')}
                      disabled={resolving === cp.id}
                      style={{
                        flex: 1, padding: '8px 0', borderRadius: 6, border: '1px solid #dc2626',
                        background: 'transparent', color: '#f87171', fontSize: 13, cursor: 'pointer',
                        opacity: resolving === cp.id ? 0.6 : 1,
                      }}
                    >
                      ✗ Rechazar
                    </button>
                  </div>
                </div>
              )}

              {cp.status !== 'pending' && cp.feedback && (
                <div style={{ borderTop: '1px solid #1e3050', paddingTop: 12, marginTop: 4 }}>
                  <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#64748b' }}>Feedback: </span>
                  <span style={{ fontSize: 12, color: '#94a3b8' }}>{cp.feedback}</span>
                  {cp.resolved_at && (
                    <span style={{ fontSize: 11, color: '#475569', fontFamily: 'monospace', marginLeft: 12 }}>
                      {formatDate(cp.resolved_at)}
                    </span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
