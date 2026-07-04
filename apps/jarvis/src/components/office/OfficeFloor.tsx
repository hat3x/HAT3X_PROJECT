'use client';
import type { OfficeAgent } from '@/lib/office-state';
import { AgentAvatar } from './AgentAvatar';

const VERTICAL_ZONE: Record<string, string> = {
  'webs-apps': 'Dev', github: 'Dev', deployment: 'Dev', database: 'Dev',
  chatbots: 'Diseño', voz: 'Diseño',
  testing: 'QA', security: 'QA',
  automatizaciones: 'Operaciones', crm: 'Operaciones', calendar: 'Operaciones', documentation: 'Operaciones',
};

const ZONES = ['Sala de reuniones', 'Dev', 'Diseño', 'QA', 'Operaciones', 'Descanso'] as const;

function zoneOf(agent: OfficeAgent, verticalByAgent: Record<string, string>): string {
  if (agent.status === 'meeting') return 'Sala de reuniones';
  if (agent.status === 'idle') return 'Descanso';
  return VERTICAL_ZONE[verticalByAgent[agent.agentId] ?? ''] ?? 'Dev';
}

export function OfficeFloor({
  agents, verticalByAgent, onSelect,
}: {
  agents: OfficeAgent[];
  verticalByAgent: Record<string, string>;
  onSelect: (a: OfficeAgent) => void;
}) {
  const byZone = new Map<string, OfficeAgent[]>(ZONES.map((z) => [z, []]));
  for (const a of agents) byZone.get(zoneOf(a, verticalByAgent))!.push(a);
  const idle = byZone.get('Descanso')!;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, padding: 16 }}>
      <style>{`@keyframes office-pulse { 0%,100% { box-shadow: 0 0 0 0 rgba(34,197,94,.5) } 50% { box-shadow: 0 0 0 8px rgba(34,197,94,0) } }`}</style>
      {ZONES.map((zone) => (
        <section key={zone} style={{
          border: '2px solid #e5e7eb', borderRadius: 12, padding: 12, minHeight: 140,
          background: zone === 'Sala de reuniones' ? '#eff6ff' : zone === 'Descanso' ? '#f9fafb' : '#fff',
        }}>
          <h3 style={{ margin: '0 0 8px', fontSize: 13, color: '#6b7280' }}>{zone}</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {zone === 'Descanso' && idle.length > 12 ? (
              <span style={{ fontSize: 13, color: '#6b7280' }}>⚪ {idle.length} agentes descansando</span>
            ) : (
              byZone.get(zone)!.map((a) => <AgentAvatar key={a.agentId} agent={a} onClick={() => onSelect(a)} />)
            )}
          </div>
        </section>
      ))}
    </div>
  );
}
