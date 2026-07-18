import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { supabase, SALON_ID } from '@/integrations/supabase/client';
import { ScanLine, Users, Clock, Star, TrendingUp, Gift } from 'lucide-react';
import { LoadingState } from '@/components/staff/LoadingState';

interface DashboardStats {
  visitsToday: number;
  pointsToday: number;
  rewardsToday: number;
}

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats>({ visitsToday: 0, pointsToday: 0, rewardsToday: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayISO = todayStart.toISOString();

      const [visitsRes, pointsRes, rewardsRes] = await Promise.all([
        supabase.from('visits').select('id', { count: 'exact', head: true })
          .eq('salon_id', SALON_ID).gte('visited_at', todayISO),
        supabase.from('points_movements').select('points')
          .eq('salon_id', SALON_ID).eq('type', 'EARN').gte('created_at', todayISO),
        supabase.from('rewards').select('id', { count: 'exact', head: true })
          .eq('salon_id', SALON_ID).gte('created_at', todayISO),
      ]);

      const totalPoints = pointsRes.data?.reduce((sum, r) => sum + r.points, 0) ?? 0;

      setStats({
        visitsToday: visitsRes.count ?? 0,
        pointsToday: totalPoints,
        rewardsToday: rewardsRes.count ?? 0,
      });
      setLoading(false);
    }
    fetchStats();
  }, []);

  if (loading) return <LoadingState message="Cargando dashboard..." />;

  const statCards = [
    { icon: Star, label: 'Visitas hoy', value: stats.visitsToday, color: 'text-primary' },
    { icon: TrendingUp, label: 'Puntos hoy', value: stats.pointsToday, color: 'text-accent' },
    { icon: Gift, label: 'Recompensas', value: stats.rewardsToday, color: 'text-info' },
  ];

  const quickActions = [
    { icon: ScanLine, label: 'Escanear QR', to: '/scan', gradient: true },
    { icon: Users, label: 'Buscar cliente', to: '/customers', gradient: false },
    { icon: Clock, label: 'Historial', to: '/history', gradient: false },
  ];

  return (
    <div className="px-4 pt-6 pb-4">
      <div className="mb-6">
        <p className="text-sm text-muted-foreground">Hola,</p>
        <h1 className="text-2xl font-bold text-foreground">{user?.email?.split('@')[0] ?? 'Staff'}</h1>
      </div>

      {/* Stats */}
      <div className="mb-6 grid grid-cols-3 gap-3">
        {statCards.map(({ icon: Icon, label, value, color }) => (
          <div key={label} className="rounded-xl bg-card p-4 text-center border border-border">
            <Icon className={`mx-auto mb-1 h-5 w-5 ${color}`} />
            <p className="text-2xl font-bold text-foreground">{value}</p>
            <p className="text-xs text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>

      {/* Quick actions */}
      <h2 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wide">Acciones rápidas</h2>
      <div className="space-y-3">
        {quickActions.map(({ icon: Icon, label, to, gradient }) => (
          <button
            key={to}
            onClick={() => navigate(to)}
            className={`flex w-full items-center gap-4 rounded-xl p-4 text-left transition-all active:scale-[0.98] ${
              gradient
                ? 'gradient-gold text-primary-foreground shadow-gold'
                : 'bg-card border border-border text-foreground hover:bg-secondary'
            }`}
          >
            <Icon className="h-6 w-6 flex-shrink-0" />
            <span className="text-base font-semibold">{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
