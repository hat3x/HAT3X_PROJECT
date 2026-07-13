'use client';
import type { OfficeAgent } from '@/lib/office-state';
import { AgentAvatar } from './AgentAvatar';

const VERTICAL_ZONE: Record<string, string> = {
  'webs-apps': 'Dev', github: 'Dev', deployment: 'Dev', database: 'Dev',
  chatbots: 'Operaciones', voz: 'Operaciones',
  testing: 'QA', security: 'QA',
  automatizaciones: 'Operaciones', crm: 'Operaciones', calendar: 'Operaciones', documentation: 'Operaciones',
};

const ZONES = ['Sala de reuniones', 'Dev', 'Diseño', 'QA', 'Operaciones', 'Descanso'] as const;

// La zona se decide por el ROL del agente (su nombre) — mucho más fino que la
// vertical, porque no existe una vertical "diseño" y muchos agentes caen en la
// carpeta genérica webs-apps. El nombre delata lo que hace de verdad.
const ROLE_ZONE: Array<[RegExp, string]> = [
  [/design|dise[nñ]|\bui\b|ui-|-ui|\bux\b|ux-|-ux|art-|visual|whimsy|brand|figma|stitch/i, 'Diseño'],
  [/test|qa\b|quality|e2e|playwright|review|reviewer|audit|security|pentest/i, 'QA'],
  [/market|sales|content|community|support|crm|operation|ops\b|automation|automat|n8n|calendar|\bdoc|writer|seo|social/i, 'Operaciones'],
  [/engineer|backend|frontend|fullstack|database|\bsql|devops|deploy|\bapi\b|architect|programmer|\bgit|infra|migration/i, 'Dev'],
];

function zoneOf(agent: OfficeAgent, verticalByAgent: Record<string, string>): string {
  if (agent.status === 'meeting') return 'Sala de reuniones';
  if (agent.status === 'idle') return 'Descanso';
  for (const [re, zone] of ROLE_ZONE) {
    if (re.test(agent.agentId)) return zone;
  }
  // Fallback: por vertical, y si tampoco, Dev.
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
