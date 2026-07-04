'use client';
import type { OfficeAgent, OfficeEvent } from '@/lib/office-state';

const STATUS_LABEL: Record<OfficeAgent['status'], string> = {
  working: '🟢 Trabajando',
  meeting: '🔵 En reunión',
  blocked: '🔴 Bloqueado',
  idle: '⚪ Descansando',
};

export function AgentPanel({ agent, events, onClose }: {
  agent: OfficeAgent;
  events: OfficeEvent[];
  onClose: () => void;
}) {
  const agentEvents = events.filter((e) => e.agentId === agent.agentId).slice(-30).reverse();
  return (
    <aside style={{
      position: 'fixed', right: 0, top: 0, bottom: 0, width: 340, background: '#fff',
      borderLeft: '1px solid #e5e7eb', padding: 16, overflowY: 'auto', zIndex: 50,
      boxShadow: '-4px 0 12px rgba(0,0,0,.06)', color: '#111827',
    }}>
      <button onClick={onClose} style={{ float: 'right', border: 'none', background: 'none', fontSize: 18, cursor: 'pointer' }}>✕</button>
      <h2 style={{ fontSize: 16, margin: '0 0 4px' }}>{agent.agentId}</h2>
      <p style={{ fontSize: 12, color: '#6b7280', margin: '0 0 12px' }}>
        {STATUS_LABEL[agent.status]}
        {agent.taskId !== null ? ` · ${agent.taskId}` : ''}
      </p>
      <h3 style={{ fontSize: 13, color: '#374151' }}>Actividad reciente</h3>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {agentEvents.map((e, i) => (
          <li key={i} style={{ fontSize: 12, padding: '6px 0', borderBottom: '1px solid #f3f4f6' }}>
            <span style={{ color: '#9ca3af' }}>{new Date(e.createdAt).toLocaleTimeString('es-ES')}</span>{' '}
            <strong>{e.eventType}</strong>
            <div style={{ color: '#4b5563' }}>{String(e.payload['detail'] ?? '')}</div>
          </li>
        ))}
        {agentEvents.length === 0 && (
          <li style={{ fontSize: 12, color: '#9ca3af', padding: '6px 0' }}>Sin actividad registrada.</li>
        )}
      </ul>
    </aside>
  );
}
