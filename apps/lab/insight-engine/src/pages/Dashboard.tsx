import { Link } from "react-router-dom";
import { Search, BarChart3, Mail, Users, ArrowRight, Zap, ArrowUpRight } from "lucide-react";
import StatCard from "@/components/StatCard";
import LeadCard from "@/components/LeadCard";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useBusinesses } from "@/hooks/use-businesses";
import { useLeadStats } from "@/hooks/use-businesses";

const Dashboard = () => {
  const { data: businesses = [], isLoading: loadingBusinesses } = useBusinesses();
  const { data: stats, isLoading: loadingStats } = useLeadStats();

  return (
    <div className="space-y-10 animate-slide-up">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <p className="text-xs font-semibold text-primary uppercase tracking-[0.2em] mb-2">Centro de control</p>
          <h1 className="text-3xl font-display font-bold text-foreground tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1.5">Gestión comercial HAT3X</p>
        </div>
        <Button asChild className="gradient-purple border-0 text-primary-foreground gap-2 hover:opacity-90 btn-glow h-10 px-5">
          <Link to="/nuevo-analisis">
            <Zap className="w-4 h-4" />
            Nuevo análisis
          </Link>
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        {loadingStats ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[100px] rounded-xl" />
          ))
        ) : (
          <>
            <StatCard
              title="Analizados"
              value={stats?.total_active ?? 0}
              icon={BarChart3}
              variant="purple"
            />
            <StatCard
              title="Demos"
              value={stats?.total_demo ?? 0}
              icon={Zap}
              variant="orange"
            />
            <StatCard
              title="Emails"
              value={stats?.total_email ?? 0}
              icon={Mail}
            />
            <StatCard
              title="Leads activos"
              value={stats?.total_hot ?? 0}
              subtitle={`${stats?.total_new ?? 0} pendientes de seguimiento`}
              icon={Users}
            />
          </>
        )}
      </div>

      {/* Recent leads */}
      <div>
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-xl font-display font-semibold text-foreground">Últimos negocios</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{businesses.length} registrados</p>
          </div>
          <Link to="/leads" className="text-xs text-primary hover:text-primary/80 flex items-center gap-1 transition-colors font-medium">
            Ver todos <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
        {loadingBusinesses ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-[110px] rounded-xl" />
            ))}
          </div>
        ) : businesses.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-sm text-muted-foreground">Aún no hay negocios registrados.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {businesses.slice(0, 6).map((b) => (
              <LeadCard key={b.id} business={b} />
            ))}
          </div>
        )}
      </div>

      {/* Quick actions */}
      <div>
        <h2 className="text-lg font-display font-semibold text-foreground mb-4">Acciones rápidas</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Link
            to="/nuevo-analisis"
            className="card-interactive p-5 flex items-center gap-4 group"
          >
            <div className="w-12 h-12 rounded-xl gradient-purple flex items-center justify-center shrink-0">
              <Search className="w-5 h-5 text-primary-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">Analizar negocio</p>
              <p className="text-xs text-muted-foreground mt-0.5">Introduce una URL</p>
            </div>
            <ArrowUpRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
          </Link>
          <Link
            to="/leads"
            className="card-interactive p-5 flex items-center gap-4 group"
          >
            <div className="w-12 h-12 rounded-xl gradient-orange flex items-center justify-center shrink-0">
              <Users className="w-5 h-5 text-accent-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground group-hover:text-accent transition-colors">Gestionar leads</p>
              <p className="text-xs text-muted-foreground mt-0.5">Historial completo</p>
            </div>
            <ArrowUpRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
          </Link>
          <div className="card-premium p-5 flex items-center gap-4 opacity-40 cursor-not-allowed">
            <div className="w-12 h-12 rounded-xl bg-muted/40 flex items-center justify-center shrink-0">
              <Mail className="w-5 h-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Outreach masivo</p>
              <p className="text-xs text-muted-foreground mt-0.5">Próximamente</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
