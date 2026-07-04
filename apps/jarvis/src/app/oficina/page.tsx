'use client';
import { useState } from 'react';
import { useOfficeState } from '@/hooks/use-office-state';
import { OfficeFloor } from '@/components/office/OfficeFloor';
import { AgentPanel } from '@/components/office/AgentPanel';
import type { OfficeAgent } from '@/lib/office-state';

export default function OficinaPage() {
  const { agents, events } = useOfficeState();
  const [selected, setSelected] = useState<OfficeAgent | null>(null);
  const working = agents.filter((a) => a.status === 'working').length;
  const blocked = agents.filter((a) => a.status === 'blocked').length;
  const meeting = agents.filter((a) => a.status === 'meeting').length;

  return (
    <main style={{ maxWidth: 1100, margin: '0 auto', background: '#f3f4f6', minHeight: '100vh' }}>
      <header style={{ padding: '16px 16px 0' }}>
        <h1 style={{ fontSize: 20, margin: 0, color: '#111827' }}>🏢 Oficina HAT3X</h1>
        <p style={{ fontSize: 13, color: '#6b7280' }}>
          🟢 {working} trabajando · 🔵 {meeting} en reunión · 🔴 {blocked} bloqueados · {agents.length} agentes activos hoy
        </p>
      </header>
      <OfficeFloor agents={agents} verticalByAgent={{}} onSelect={setSelected} />
      {selected !== null && (
        <AgentPanel
          agent={agents.find((a) => a.agentId === selected.agentId) ?? selected}
          events={events}
          onClose={() => setSelected(null)}
        />
      )}
    </main>
  );
}
