import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import PortalLayout from "@/components/portal/PortalLayout";
import PageHeader from "@/components/portal/PageHeader";
import StatCard from "@/components/portal/StatCard";
import StatusBadge from "@/components/portal/StatusBadge";
import { Users, FolderKanban, ListChecks, MessageSquare, Bell, Milestone, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Link } from "react-router-dom";

const AdminDashboard = () => {
  const [stats, setStats] = useState({ clients: 0, activeProjects: 0, pendingMessages: 0, overdueTasks: 0 });
  const [projects, setProjects] = useState<any[]>([]);
  const [recentUpdates, setRecentUpdates] = useState<any[]>([]);
  const [upcomingMilestones, setUpcomingMilestones] = useState<any[]>([]);

  useEffect(() => {
    const fetch = async () => {
      const [companiesRes, projectsRes, conversationsRes, tasksRes, updatesRes, milestonesRes] = await Promise.all([
        supabase.from("companies").select("id", { count: "exact", head: true }),
        supabase.from("projects").select("*").order("updated_at", { ascending: false }),
        supabase.from("conversations").select("id", { count: "exact", head: true }).eq("status", "open"),
        supabase.from("tasks").select("*").in("status", ["todo", "in_progress"]),
        supabase.from("project_updates").select("*").order("created_at", { ascending: false }).limit(5),
        supabase.from("milestones").select("*").in("status", ["pending", "in_progress"]).order("due_date").limit(5),
      ]);

      const activeProjects = (projectsRes.data || []).filter(p => p.status === "active").length;
      const overdueTasks = (tasksRes.data || []).filter(t => t.due_date && new Date(t.due_date) < new Date()).length;

      setStats({
        clients: companiesRes.count || 0,
        activeProjects,
        pendingMessages: conversationsRes.count || 0,
        overdueTasks,
      });
      setProjects((projectsRes.data || []).slice(0, 5));
      setRecentUpdates(updatesRes.data || []);
      setUpcomingMilestones(milestonesRes.data || []);
    };
    fetch();
  }, []);

  return (
    <PortalLayout type="admin">
      <PageHeader title="Panel de administración" subtitle="Visión general del negocio operativo" />

      <div className="space-y-8">
        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={Users} label="Clientes" value={stats.clients} accentColor="primary" />
          <StatCard icon={FolderKanban} label="Proyectos activos" value={stats.activeProjects} accentColor="accent" />
          <StatCard icon={MessageSquare} label="Mensajes pendientes" value={stats.pendingMessages} accentColor="primary" />
          <StatCard icon={AlertTriangle} label="Tareas vencidas" value={stats.overdueTasks} accentColor="accent" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Projects */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-foreground">Proyectos recientes</h3>
              <Link to="/admin/projects" className="text-sm text-primary hover:text-primary/80">Ver todos →</Link>
            </div>
            <div className="space-y-3">
              {projects.map(p => (
                <div key={p.id} className="glass-card p-4 flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-semibold text-foreground">{p.name}</h4>
                    <p className="text-xs text-muted-foreground">{p.service_type} · {p.progress}%</p>
                  </div>
                  <StatusBadge status={p.status} />
                </div>
              ))}
            </div>
          </div>

          {/* Upcoming milestones */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-foreground">Próximos hitos</h3>
              <Link to="/admin/phases" className="text-sm text-primary hover:text-primary/80">Ver todos →</Link>
            </div>
            <div className="space-y-3">
              {upcomingMilestones.map(m => (
                <div key={m.id} className="glass-card p-4 flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-semibold text-foreground">{m.name}</h4>
                    {m.due_date && <p className="text-xs text-muted-foreground">{format(new Date(m.due_date), "d MMM yyyy", { locale: es })}</p>}
                  </div>
                  <StatusBadge status={m.status} />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Recent updates */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-foreground">Últimas actualizaciones</h3>
            <Link to="/admin/updates" className="text-sm text-primary hover:text-primary/80">Ver todas →</Link>
          </div>
          <div className="space-y-3">
            {recentUpdates.map(u => (
              <div key={u.id} className="glass-card p-4 flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-semibold text-foreground">{u.title}</h4>
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{u.summary}</p>
                </div>
                <StatusBadge status={u.status} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </PortalLayout>
  );
};

export default AdminDashboard;
