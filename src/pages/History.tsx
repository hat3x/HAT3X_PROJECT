import { useEffect, useState } from 'react';
import { supabase, SALON_ID } from '@/integrations/supabase/client';
import { LoadingState } from '@/components/staff/LoadingState';
import { EmptyState } from '@/components/staff/EmptyState';
import { Clock, Star, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Database } from '@/types/database';

type MovementType = Database['public']['Enums']['points_movement_type'];

interface MovementEntry {
  id: string;
  points: number;
  reason: string | null;
  type: MovementType;
  created_at: string;
  customers: { full_name: string } | null;
}

// Etiqueta legible por tipo cuando el movimiento no trae `reason`.
const MOVEMENT_LABELS: Record<MovementType, string> = {
  EARN: 'Puntos ganados',
  REDEEM: 'Canje de puntos',
  ADJUST: 'Ajuste de puntos',
  EXPIRE: 'Puntos caducados',
};

type FilterPeriod = 'today' | 'week' | 'all';

export default function History() {
  const [entries, setEntries] = useState<MovementEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<FilterPeriod>('today');

  useEffect(() => {
    async function fetchHistory() {
      setLoading(true);
      // Movimientos de puntos del salón, del más reciente al más antiguo, con el
      // nombre del cliente embebido (points_movements → customers).
      let query = supabase
        .from('points_movements')
        .select('id, points, reason, type, created_at, customers(full_name)')
        .eq('salon_id', SALON_ID)
        .order('created_at', { ascending: false })
        .limit(50);

      if (period === 'today') {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        query = query.gte('created_at', today.toISOString());
      } else if (period === 'week') {
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        query = query.gte('created_at', weekAgo.toISOString());
      }

      const { data } = await query;
      setEntries((data ?? []) as unknown as MovementEntry[]);
      setLoading(false);
    }
    fetchHistory();
  }, [period]);

  const formatTime = (d: string) => {
    const date = new Date(d);
    return date.toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="px-4 pt-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
          <Clock className="h-6 w-6 text-primary" />
          Historial
        </h1>
      </div>

      <div className="mb-4 flex gap-2">
        {([['today', 'Hoy'], ['week', '7 días'], ['all', 'Todo']] as const).map(([key, label]) => (
          <Button
            key={key}
            variant={period === key ? 'default' : 'outline'}
            size="sm"
            onClick={() => setPeriod(key)}
            className={period === key ? 'gradient-gold text-primary-foreground shadow-gold' : 'border-border text-foreground'}
          >
            {label}
          </Button>
        ))}
      </div>

      {loading ? (
        <LoadingState message="Cargando historial..." />
      ) : entries.length === 0 ? (
        <EmptyState title="Sin actividad" message="No hay movimientos de puntos en este período" />
      ) : (
        <div className="space-y-2">
          {entries.map((entry) => {
            const positive = entry.type === 'EARN' || (entry.type === 'ADJUST' && entry.points >= 0);
            const magnitude = Math.abs(entry.points);
            return (
              <div key={entry.id} className="rounded-xl bg-card border border-border p-4">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium text-foreground">
                        {entry.customers?.full_name ?? 'Cliente'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Star className={`h-4 w-4 ${positive ? 'text-primary' : 'text-destructive'}`} />
                      <span className={`text-sm font-medium ${positive ? 'text-primary' : 'text-destructive'}`}>
                        {positive ? '+' : '−'}{magnitude} pts
                      </span>
                      <span className="text-xs text-muted-foreground">
                        · {entry.reason ?? MOVEMENT_LABELS[entry.type]}
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">{formatTime(entry.created_at)}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
