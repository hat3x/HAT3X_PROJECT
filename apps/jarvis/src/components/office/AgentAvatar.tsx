'use client';
import type { OfficeAgent } from '@/lib/office-state';

const STATUS_COLOR: Record<OfficeAgent['status'], string> = {
  working: '#22c55e',
  meeting: '#3b82f6',
  blocked: '#ef4444',
  idle: '#9ca3af',
};

export function AgentAvatar({ agent, onClick }: { agent: OfficeAgent; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title={agent.bubble ?? agent.agentId}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
        background: 'none', border: 'none', cursor: 'pointer', width: 92,
      }}
    >
      {agent.bubble !== null && (
        <span style={{
          fontSize: 10, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8,
          padding: '2px 6px', maxWidth: 90, overflow: 'hidden', textOverflow: 'ellipsis',
          whiteSpace: 'nowrap', boxShadow: '0 1px 2px rgba(0,0,0,.08)', color: '#111827',
        }}>{agent.bubble}</span>
      )}
      <span style={{
        width: 40, height: 40, borderRadius: '50%',
        background: STATUS_COLOR[agent.status],
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#fff', fontWeight: 700, fontSize: 14,
        transition: 'background .3s',
        animation: agent.status === 'working' ? 'office-pulse 2s infinite' : undefined,
      }}>{agent.agentId.slice(0, 2).toUpperCase()}</span>
      <span style={{ fontSize: 10, color: '#374151', maxWidth: 90, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {agent.agentId}
      </span>
    </button>
  );
}
