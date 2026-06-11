import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { GlassScaffold } from "@/components/ui-kit/GlassScaffold";
import { StatusPill } from "@/components/ui-kit/StatusPill";
import { computeTimeStatus } from "@/lib/project-utils";
import { ArrowLeft, Pencil, Trash2 } from "lucide-react";
import { useState, useEffect } from "react";
import { SummaryTab } from "@/components/project/SummaryTab";
import { TasksTab } from "@/components/project/TasksTab";
import { TeamTab } from "@/components/project/TeamTab";
import { MaterialsTab } from "@/components/project/MaterialsTab";
import { PlansTab } from "@/components/project/PlansTab";
import { TimeTrackingTab } from "@/components/project/TimeTrackingTab";
import { SuppliersTab } from "@/components/project/SuppliersTab";
import { EditProjectDialog } from "@/components/EditProjectDialog";
import { useToast } from "@/hooks/use-toast";

// Map notification types to tab keys
const notifTypeToTab: Record<string, string> = {
  work_review: "suppliers",
  work_approved: "suppliers",
  work_rejected: "suppliers",
  material_added: "materials"
};

const ProjectDetailPage = () => {
  const { id } = useParams<{id: string;}>();
  const navigate = useNavigate();
  const { profile, session } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isClient = profile?.role === "client";
  const isAdmin = profile?.role === "admin";
  const isEmployee = profile?.role === "employee";
  const isSupplier = profile?.role === "supplier";
  const [editOpen, setEditOpen] = useState(false);

  const tabs = isClient ?
  [{ key: "summary", label: "Resumen" }] :
  isSupplier ?
  [
  { key: "summary", label: "Resumen" },
  { key: "suppliers", label: "Proveedores" },
  { key: "materials", label: "Materiales" },
  { key: "plans", label: "Planos" },
  { key: "time", label: "Fichaje" }] :

  isEmployee ?
  [
  { key: "summary", label: "Resumen" },
  { key: "tasks", label: "Tareas" },
  { key: "materials", label: "Materiales" },
  { key: "plans", label: "Planos" },
  { key: "time", label: "Fichaje" }] :

  [
  { key: "summary", label: "Resumen" },
  { key: "tasks", label: "Tareas" },
  { key: "suppliers", label: "Proveedores" },
  { key: "team", label: "Equipo" },
  { key: "materials", label: "Materiales" },
  { key: "plans", label: "Planos" },
  { key: "time", label: "Fichaje" }];


  const [activeTab, setActiveTab] = useState("summary");

  // Fetch unread notifications for this project to highlight tabs
  const { data: unreadNotifs = [] } = useQuery({
    queryKey: ["project-unread-notifs", id, session?.user?.id],
    queryFn: async () => {
      let query = supabase.
      from("notifications").
      select("id, type").
      eq("project_id", id!).
      eq("is_read", false);

      if (isAdmin) {
        query = query.is("target_user_id", null);
      } else {
        query = query.eq("target_user_id", session!.user.id);
      }

      const { data, error } = await query;
      if (error) return [];
      return data || [];
    },
    enabled: !!id && !!session?.user?.id
  });

  // Compute which tabs have notifications
  const tabsWithNotifs = new Set<string>();
  unreadNotifs.forEach((n: any) => {
    const tab = notifTypeToTab[n.type];
    if (tab) tabsWithNotifs.add(tab);
  });

  // Auto-mark notifications as read when visiting the tab that has them
  useEffect(() => {
    if (!id || !session?.user?.id) return;
    const notifsForTab = unreadNotifs.filter((n: any) => notifTypeToTab[n.type] === activeTab);
    if (notifsForTab.length === 0) return;

    const markRead = async () => {
      const ids = notifsForTab.map((n: any) => n.id);
      await supabase.
      from("notifications").
      update({ is_read: true, read_at: new Date().toISOString() }).
      in("id", ids);
      queryClient.invalidateQueries({ queryKey: ["project-unread-notifs", id] });
      queryClient.invalidateQueries({ queryKey: ["notif-count", id] });
      queryClient.invalidateQueries({ queryKey: ["total-unread-notifs"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    };
    markRead();
  }, [activeTab, id, unreadNotifs.length]);

  const { data: project } = useQuery({
    queryKey: ["project", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("projects").select("*").eq("id", id!).single();
      if (error) throw error;
      return data;
    },
    enabled: !!id
  });

  const { data: tasks = [] } = useQuery({
    queryKey: ["project-tasks", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("tasks").select("*").eq("project_id", id!).order("created_at");
      if (error) throw error;
      return data;
    },
    enabled: !!id
  });

  const deleteProject = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("projects").delete().eq("id", id!);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      toast({ title: "Obra eliminada" });
      navigate(-1);
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" })
  });

  const doneCount = tasks.filter((t) => t.status === "done").length;
  const totalCount = tasks.length;
  const percent = totalCount > 0 ? Math.round(doneCount / totalCount * 100) : 0;
  const timeStatus = project ? computeTimeStatus(project.created_at, project.due_date, percent) : "no-date";

  if (!project) {
    return (
      <GlassScaffold className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </GlassScaffold>);

  }

  return (
    <GlassScaffold className="min-h-screen">
      {/* Header */}
      <div className="sticky top-0 z-10 px-4 pt-4 pb-3 bg-[#0d0c12]" style={{ background: "linear-gradient(to bottom, hsl(250 20% 6%), hsl(250 20% 6% / 0.8))", backdropFilter: "blur(12px)" }}>
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-3 mb-3">
            <button onClick={() => navigate(-1)} className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-all">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="font-display font-bold text-lg text-foreground truncate">{project.name}</h1>
                <StatusPill status={project.status as any} />
              </div>
              {project.address && <p className="text-xs text-muted-foreground truncate">{project.address}</p>}
            </div>
            {isAdmin &&
            <div className="flex items-center gap-1 flex-shrink-0">
                <button
                onClick={() => setEditOpen(true)}
                className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-all"
                title="Editar obra">

                  <Pencil className="w-4 h-4" />
                </button>
                <button
                onClick={() => {
                  if (confirm("¿Seguro que quieres eliminar esta obra?")) {
                    deleteProject.mutate();
                  }
                }}
                className="p-2 rounded-xl text-destructive hover:bg-destructive/10 transition-all"
                title="Eliminar obra">

                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            }
          </div>

          {/* Tabs */}
          <div className="flex gap-1 overflow-x-auto overflow-y-visible pb-1 pt-1">
            {tabs.map((t) =>
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`relative overflow-visible px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
              activeTab === t.key ?
              "bg-primary text-primary-foreground" :
              "text-muted-foreground hover:text-foreground hover:bg-secondary/50"}`
              }>

                {t.label}
                {tabsWithNotifs.has(t.key) && activeTab !== t.key &&
              <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-primary animate-pulse shadow-[0_0_6px_2px_hsl(var(--primary)/0.6)]" />
              }
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Tab Content */}
      <div className="px-4 py-4 max-w-4xl mx-auto">
        {activeTab === "summary" &&
        <SummaryTab
          project={project}
          doneCount={doneCount}
          totalCount={totalCount}
          percent={percent}
          timeStatus={timeStatus} />

        }
        {activeTab === "tasks" && <TasksTab projectId={id!} tasks={tasks} isAdmin={isAdmin!} isEmployee={isEmployee!} />}
        {activeTab === "suppliers" && <SuppliersTab projectId={id!} isAdmin={isAdmin!} />}
        {activeTab === "team" && <TeamTab projectId={id!} isAdmin={isAdmin!} />}
        {activeTab === "materials" && <MaterialsTab projectId={id!} />}
        {activeTab === "plans" && <PlansTab projectId={id!} isAdmin={isAdmin!} />}
        {activeTab === "time" && <TimeTrackingTab projectId={id!} isAdmin={isAdmin!} />}
      </div>

      {/* Edit Dialog */}
      {isAdmin &&
      <EditProjectDialog
        project={project}
        open={editOpen}
        onClose={() => setEditOpen(false)}
        onUpdated={() => queryClient.invalidateQueries({ queryKey: ["project", id] })} />

      }
    </GlassScaffold>);

};

export default ProjectDetailPage;