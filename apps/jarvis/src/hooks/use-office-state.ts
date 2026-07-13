'use client';
import { useEffect, useState } from 'react';
import { getSupabaseClient } from '@/lib/supabase';
import {
  reduceOfficeState,
  rowToOfficeEvent,
  type OfficeAgent,
  type OfficeEvent,
} from '@/lib/office-state';

// El intelligence-layer es el cerebro del sistema, no un trabajador con mesa.
const NON_WORKERS = new Set(['intelligence-layer', 'rt-tester']);

export interface OfficeStateResult {
  agents: OfficeAgent[];
  events: OfficeEvent[];
  verticalByAgent: Record<string, string>;
}

export function useOfficeState(): OfficeStateResult {
  const [agents, setAgents] = useState<Map<string, OfficeAgent>>(new Map());
  const [events, setEvents] = useState<OfficeEvent[]>([]);
  const [rosterIdle, setRosterIdle] = useState<Map<string, OfficeAgent>>(new Map());
  const [verticalByAgent, setVerticalByAgent] = useState<Record<string, string>>({});

  useEffect(() => {
    const supabase = getSupabaseClient();
    let cancelled = false;

    // Plantilla completa: todos los agentes del roster empiezan descansando
    void fetch('/api/office/roster')
      .then((r) => r.json())
      .then((roster: { agents: Array<{ id: string; verticals: string[] }> }) => {
        if (cancelled) return;
        const idle = new Map<string, OfficeAgent>();
        const verticals: Record<string, string> = {};
        for (const a of roster.agents) {
          idle.set(a.id, { agentId: a.id, status: 'idle', bubble: null, taskId: null, lastEventAt: '' });
          // 'webs-apps' es la carpeta cajón-de-sastre; si el agente tiene otra
          // vertical más específica (testing, security...), esa manda para la zona.
          const specific = a.verticals.find((v) => v !== 'webs-apps');
          const chosen = specific ?? a.verticals[0];
          if (chosen !== undefined) verticals[a.id] = chosen;
        }
        setRosterIdle(idle);
        setVerticalByAgent(verticals);
      })
      .catch(() => {});

    void supabase
      .from('bus_events')
      .select('*')
      // Los 200 eventos MÁS RECIENTES (descending), no los más antiguos: si no,
      // la vista se queda anclada a tareas viejas y nunca muestra la actividad real.
      .order('created_at', { ascending: false })
      .limit(200)
      .then(({ data }) => {
        if (cancelled || data == null) return;
        // Invertir a orden cronológico (viejo→nuevo) para que el reducer aplique bien.
        const evs = (data as Record<string, unknown>[]).map(rowToOfficeEvent).reverse();
        setEvents(evs);
        setAgents(evs.reduce((m, e) => reduceOfficeState(m, e), new Map<string, OfficeAgent>()));
      });

    const channel = supabase
      .channel('office-bus')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'bus_events' }, (payload) => {
        const ev = rowToOfficeEvent(payload.new as Record<string, unknown>);
        setEvents((prev) => [...prev.slice(-199), ev]);
        setAgents((prev) => reduceOfficeState(prev, ev));
      })
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, []);

  // Plantilla (idle) + estado real por eventos (pisa al idle); sin pseudo-agentes
  const merged = new Map(rosterIdle);
  for (const [id, agent] of agents) {
    if (!NON_WORKERS.has(id)) merged.set(id, agent);
  }

  return { agents: Array.from(merged.values()), events, verticalByAgent };
}
