'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { listCRMClients, listProjects, type CRMClient, type CRMProject } from '@/lib/crm'

export default function ClientsPage() {
  const [clients, setClients] = useState<CRMClient[]>([])
  const [projects, setProjects] = useState<CRMProject[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([listCRMClients(), listProjects()])
      .then(([c, p]) => { setClients(c); setProjects(p) })
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div style={{ padding: 40, color: '#475569', fontFamily: 'monospace' }}>Cargando clientes...</div>

  const projectsOf = (clientId: string) => projects.filter(p => p.client_id === clientId)

  return (
    <div style={{ padding: 32 }}>
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 11, fontFamily: 'monospace', color: '#10b981', letterSpacing: '0.15em', marginBottom: 6 }}>CRM · CLIENTES</div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#e2e8f0' }}>Todos los clientes</h1>
      </div>

      <div style={{ background: '#07101f', border: '1px solid #0f2040', borderRadius: 8, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #0f2040' }}>
              {['Cliente', 'Sector', 'Proyectos', 'Activos', 'Ultima nota'].map(h => (
                <th key={h} style={{ padding: '12px 20px', textAlign: 'left', fontSize: 10, fontFamily: 'monospace', color: '#475569', letterSpacing: '0.12em' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {clients.map(client => {
              const ps = projectsOf(client.id)
              const active = ps.filter(p => p.status === 'active').length
              return (
                <tr key={client.id} className="crm-row" style={{ borderBottom: '1px solid #0a1628' }}>
                  <td style={{ padding: '14px 20px' }}>
                    <Link href={`/crm/clients/${client.id}`} style={{ color: '#e2e8f0', textDecoration: 'none', fontWeight: 600 }}>{client.name}</Link>
                  </td>
                  <td style={{ padding: '14px 20px', color: '#64748b' }}>{client.sector ?? '—'}</td>
                  <td style={{ padding: '14px 20px', color: '#94a3b8', fontFamily: 'monospace' }}>{ps.length}</td>
                  <td style={{ padding: '14px 20px' }}>
                    {active > 0
                      ? <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 3, background: 'rgba(16,185,129,0.1)', color: '#10b981', fontFamily: 'monospace' }}>{active} activo{active > 1 ? 's' : ''}</span>
                      : <span style={{ color: '#1e293b', fontSize: 11 }}>—</span>}
                  </td>
                  <td style={{ padding: '14px 20px', color: '#475569', fontSize: 12, maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {client.notes?.split('\n').filter(Boolean).pop() ?? '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {clients.length === 0 && <div style={{ padding: 40, textAlign: 'center', color: '#1e293b', fontFamily: 'monospace' }}>Sin clientes registrados</div>}
      </div>

      <style>{`.crm-row:hover { background: rgba(16,185,129,0.03) !important; }`}</style>
    </div>
  )
}
