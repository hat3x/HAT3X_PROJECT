import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { GlassScaffold } from "@/components/ui-kit/GlassScaffold";
import { GlassCard } from "@/components/ui-kit/GlassCard";
import { ProjectCard } from "@/components/ui-kit/ProjectCard";
import { useProjects } from "@/hooks/useProjects";
import { useAuth } from "@/contexts/AuthContext";
import { signOut } from "@/lib/auth";
import { Search, Plus, LogOut, RefreshCw, Building2, Pause, CheckCircle, Bell, HardHat } from "lucide-react";
import obratechLogo from "@/assets/obratech-logo.png";
import { CreateProjectDialog } from "@/components/CreateProjectDialog";
import { EditProjectDialog } from "@/components/EditProjectDialog";
import { NotificationsPanel } from "@/components/NotificationsPanel";

type FilterStatus = "all" | "active" | "paused" | "finished";

const AdminHome = () => {
  const { profile } = useAuth();
  const { data: projects = [], isLoading, refetch } = useProjects();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterStatus>("all");
  const [showCreate, setShowCreate] = useState(false);
  const [editProject, setEditProject] = useState<any>(null);
  const [showNotifs, setShowNotifs] = useState(false);

  const { data: totalUnread = 0 } = useQuery({
    queryKey: ["total-unread-notifs"],
    queryFn: async () => {
      const { count, error } = await supabase.
      from("notifications").
      select("*", { count: "exact", head: true }).
      eq("is_read", false).
      is("target_user_id", null);
      if (error) return 0;
      return count || 0;
    }
  });

  const filtered = projects.filter((p) => {
    if (filter !== "all" && p.status !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return p.name.toLowerCase().includes(q) || (p.address || "").toLowerCase().includes(q);
    }
    return true;
  });

  const counts = {
    all: projects.length,
    active: projects.filter((p) => p.status === "active").length,
    paused: projects.filter((p) => p.status === "paused").length,
    finished: projects.filter((p) => p.status === "finished").length
  };

  const chips: {key: FilterStatus;label: string;icon: React.ReactNode;count: number;}[] = [
  { key: "all", label: "Todas", icon: <Building2 className="w-3.5 h-3.5" />, count: counts.all },
  { key: "active", label: "Activas", icon: <HardHat className="w-3.5 h-3.5" />, count: counts.active },
  { key: "paused", label: "Pausadas", icon: <Pause className="w-3.5 h-3.5" />, count: counts.paused },
  { key: "finished", label: "Finalizadas", icon: <CheckCircle className="w-3.5 h-3.5" />, count: counts.finished }];


  return (
    <GlassScaffold className="min-h-screen">
      {/* Header */}
      <div className="sticky top-0 z-10 px-4 pb-3 bg-[#0d0c12]" style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 16px)", background: "linear-gradient(to bottom, hsl(250 20% 6%), hsl(250 20% 6% / 0.8))", backdropFilter: "blur(12px)" }}>
        <div className="flex items-center justify-between mb-4 max-w-4xl mx-auto">
          <div className="flex items-center gap-3">
            <img src={obratechLogo} alt="ObraTech" className="h-8 object-contain" />
            <div>
              <p className="text-xs text-muted-foreground">{profile?.full_name || profile?.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowNotifs(true)} className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-all relative">
              <Bell className="w-5 h-5" />
              {totalUnread > 0 &&
              <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-[10px] font-bold">
                  {totalUnread}
                </span>
              }
            </button>
            <button onClick={() => refetch()} className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-all">
              <RefreshCw className="w-5 h-5" />
            </button>
            <button onClick={signOut} className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-all">
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="max-w-4xl mx-auto space-y-3">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nombre o dirección..."
              className="glass-input w-full pl-10" />

          </div>

          {/* Filter chips */}
          <div className="flex gap-2 overflow-x-auto pb-1">
            {chips.map((c) =>
            <button
              key={c.key}
              onClick={() => setFilter(c.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
              filter === c.key ?
              "bg-primary text-primary-foreground shadow-lg" :
              "bg-secondary/50 text-muted-foreground hover:text-foreground"}`
              }>

                {c.icon}
                {c.label} ({c.count})
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="px-4 py-4 max-w-4xl mx-auto">
        {isLoading ?
        <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          </div> :
        filtered.length === 0 ?
        <GlassCard className="text-center py-12">
            <Building2 className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">No hay obras{search ? " que coincidan" : ""}</p>
          </GlassCard> :

        <div className="grid gap-3 sm:grid-cols-2">
            {filtered.map((p) =>
          <ProjectCard key={p.id} project={p} />
          )}
          </div>
        }
      </div>

      {/* FAB */}
      <button
        onClick={() => setShowCreate(true)}
        className="fixed bottom-6 right-6 w-14 h-14 rounded-2xl flex items-center justify-center shadow-2xl animate-pulse-glow transition-transform hover:scale-110"
        style={{ background: "var(--gradient-primary)" }}>

        <Plus className="w-6 h-6 text-primary-foreground" />
      </button>

      <CreateProjectDialog open={showCreate} onClose={() => setShowCreate(false)} onCreated={() => {setShowCreate(false);refetch();}} />
      <EditProjectDialog project={editProject} open={!!editProject} onClose={() => setEditProject(null)} onUpdated={() => {setEditProject(null);refetch();}} />
      <NotificationsPanel open={showNotifs} onClose={() => setShowNotifs(false)} />
    </GlassScaffold>);

};

export default AdminHome;