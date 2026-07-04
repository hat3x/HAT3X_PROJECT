'use client';
import { useEffect, useState } from 'react';
import { getSupabaseClient } from '@/lib/supabase';
import {
  reduceOfficeState,
  rowToOfficeEvent,
  type OfficeAgent,
  type OfficeEvent,
} from '@/lib/office-state';

export function useOfficeState(): { agents: OfficeAgent[]; events: OfficeEvent[] } {
  const [agents, setAgents] = useState<Map<string, OfficeAgent>>(new Map());
  const [events, setEvents] = useState<OfficeEvent[]>([]);

  useEffect(() => {
    const supabase = getSupabaseClient();
    let cancelled = false;

    void supabase
      .from('bus_events')
      .select('*')
      .order('created_at', { ascending: true })
      .limit(200)
      .then(({ data }) => {
        if (cancelled || data == null) return;
        const evs = (data as Record<string, unknown>[]).map(rowToOfficeEvent);
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

  return { agents: Array.from(agents.values()), events };
}
