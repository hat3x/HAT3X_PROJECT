import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import PortalLayout from "@/components/portal/PortalLayout";
import PageHeader from "@/components/portal/PageHeader";
import StatCard from "@/components/portal/StatCard";
import StatusBadge from "@/components/portal/StatusBadge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import {
  FolderKanban, Milestone, ListChecks, Bell, CalendarDays,
  ArrowRight, TrendingUp, Clock, MessageSquare
} from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

const ClientDashboard = () => {
  const { profile, companyId } = useAuth();
  const [project, setProject] = useState<any>(null);
  const [phases, setPhases] = useState<any[]>([]);
  const [milestones, setMilestones] = useState<any[]>([]);
  const [updates, setUpdates] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [company, setCompany] = useState<any>(null);

  useEffect(() => {
    if (!companyId) return;
    const fetchData = async () => {
      const [companyRes, projectRes] = await Promise.all([
        supabase.from("companies").select("*").eq("id", companyId).single(),
        supabase.from("projects").select("*").eq("company_id", companyId).order("created_at", { ascending: false }).limit(1).single(),
      ]);
      if (companyRes.data) setCompany(companyRes.data);
      if (projectRes.data) {
        setProject(projectRes.data);
        const pid = projectRes.data.id;
        const [phasesRes, milestonesRes, updatesRes, tasksRes] = await Promise.all([
          supabase.from("project_phases").select("*").eq("project_id", pid).order("sort_order"),
          supabase.from("milestones").select("*").eq("project_id", pid).order("due_date"),
          supabase.from("project_updates").select("*").eq("project_id", pid).order("published_at", { ascending: false }).limit(3),
          supabase.from("tasks").select("*").eq("project_id", pid).order("created_at", { ascending: false }).limit(5),
        ]);
        setPhases(phasesRes.data || []);
        setMilestones(milestonesRes.data || []);
        setUpdates(updatesRes.data || []);
        setTasks(tasksRes.data || []);
      }
    };
    fetchData();
  }, [companyId]);

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return "Buenos días";
    if (h < 20) return "Buenas tardes";
    return "Buenas noches";
  };

  const nextMilestone = milestones.find(m => m.status !== "completed");
  const completedPhases = phases.filter(p => p.status === "completed").length;
  const activeTasks = tasks.filter(t => t.status !== "done").length;

  return (
    <PortalLayout type="client">
      <PageHeader
        title={`${greeting()}, ${profile?.full_name || "Cliente"}`}
        subtitle={company ? `${company.name} — Tu proyecto con HAT3X` : "Tu proyecto con HAT3X"}
      />

      {project ? (
        <div className="space-y-8">
          {/* Project overview card */}
          <div className="glass-card-highlight p-6 md:p-8">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <h2 className="text-xl font-bold text-foreground">{project.name}</h2>
                  <StatusBadge status={project.status} />
                </div>
                <p className="text-sm text-muted-foreground">{project.service_type} · {project.description}</p>
              </div>
              <Link to="/portal/messages">
                <Button className="bg-accent text-accent-foreground hover:bg-accent/90 rounded-xl text-sm font-semibold btn-primary-glow">
                  <MessageSquare className="w-4 h-4 mr-2" />
                  Contactar HAT3X
                </Button>
              </Link>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Avance global</span>
                <span className="font-bold text-foreground">{project.progress}%</span>
              </div>
              <Progress value={project.progress} className="h-3 bg-secondary/50" />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
              <div>
                <p className="text-xs text-muted-foreground">Inicio</p>
                <p className="text-sm font-semibold text-foreground">
                  {project.start_date ? format(new Date(project.start_date), "d MMM yyyy", { locale: es }) : "—"}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Entrega estimada</p>
                <p className="text-sm font-semibold text-foreground">
                  {project.estimated_end_date ? format(new Date(project.estimated_end_date), "d MMM yyyy", { locale: es }) : "—"}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Próximo hito</p>
                <p className="text-sm font-semibold text-foreground">{nextMilestone?.name || "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Última actualización</p>
                <p className="text-sm font-semibold text-foreground">
                  {updates[0]?.published_at ? format(new Date(updates[0].published_at), "d MMM yyyy", { locale: es }) : "—"}
                </p>
              </div>
            </div>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard icon={FolderKanban} label="Fases completadas" value={`${completedPhases}/${phases.length}`} accentColor="emerald" />
            <StatCard icon={Milestone} label="Hitos" value={milestones.length} accentColor="primary" />
            <StatCard icon={ListChecks} label="Tareas activas" value={activeTasks} accentColor="accent" />
            <StatCard icon={Bell} label="Actualizaciones" value={updates.length} accentColor="primary" />
          </div>

          {/* Recent updates */}
          {updates.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-foreground">Últimas actualizaciones</h3>
                <Link to="/portal/updates" className="text-sm text-primary hover:text-primary/80 flex items-center gap-1">
                  Ver todas <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
              <div className="space-y-3">
                {updates.map(u => (
                  <div key={u.id} className="glass-card p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h4 className="font-semibold text-foreground text-sm">{u.title}</h4>
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{u.summary}</p>
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {u.published_at ? format(new Date(u.published_at), "d MMM", { locale: es }) : "—"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Quick timeline preview */}
          {phases.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-foreground">Timeline del proyecto</h3>
                <Link to="/portal/timeline" className="text-sm text-primary hover:text-primary/80 flex items-center gap-1">
                  Ver completo <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-2">
                {phases.map((p, i) => (
                  <div key={p.id} className="glass-card p-4 min-w-[160px] shrink-0">
                    <div className="flex items-center gap-2 mb-2">
                      <div className={`w-2 h-2 rounded-full ${
                        p.status === "completed" ? "bg-emerald-400" :
                        p.status === "in_progress" ? "bg-primary" :
                        p.status === "blocked" ? "bg-destructive" : "bg-muted-foreground/30"
                      }`} />
                      <span className="text-[10px] text-muted-foreground font-semibold uppercase">Fase {i + 1}</span>
                    </div>
                    <p className="text-sm font-semibold text-foreground">{p.name}</p>
                    <StatusBadge status={p.status} className="mt-2" />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="glass-card p-12 text-center">
          <FolderKanban className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-foreground mb-2">Sin proyectos activos</h2>
          <p className="text-sm text-muted-foreground">Cuando tu proyecto esté activo, verás aquí toda la información.</p>
        </div>
      )}
    </PortalLayout>
  );
};

export default ClientDashboard;
