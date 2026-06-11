import { GlassCard } from "./GlassCard";
import { StatusPill } from "./StatusPill";
import { ProgressBar } from "./ProgressBar";
import { ProjectCardVM } from "@/lib/project-utils";
import { MapPin, CheckCircle2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export const ProjectCard = ({ project }: { project: ProjectCardVM }) => {
  const navigate = useNavigate();
  const { profile, session } = useAuth();
  const isAdmin = profile?.role === "admin";
  const isSupplier = profile?.role === "supplier";
  const isComplete = project.percent === 100;

  // Fetch unread notification count scoped to role
  const { data: notifCount = 0 } = useQuery({
    queryKey: ["notif-count", project.id, session?.user?.id],
    queryFn: async () => {
      let query = supabase
        .from("notifications")
        .select("*", { count: "exact", head: true })
        .eq("project_id", project.id)
        .eq("is_read", false);

      if (isAdmin) {
        query = query.is("target_user_id", null);
      } else {
        query = query.eq("target_user_id", session!.user.id);
      }

      const { count, error } = await query;
      if (error) return 0;
      return count || 0;
    },
    enabled: (isAdmin || isSupplier) && !!session?.user?.id,
  });

  return (
    <GlassCard
      hover
      className="cursor-pointer animate-fade-in relative overflow-visible"
      onClick={() => navigate(`/project/${project.id}`)}
    >
      {/* Notification badge */}
      {(isAdmin || isSupplier) && notifCount > 0 && (
        <div className="absolute -top-2 -left-2 w-6 h-6 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-xs font-bold shadow-lg z-10">
          {notifCount}
        </div>
      )}

      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-display font-semibold text-foreground truncate">{project.name}</h3>
            {isComplete && <CheckCircle2 className="w-4 h-4 text-status-green flex-shrink-0" />}
          </div>
          {project.address && (
            <div className="flex items-center gap-1 text-muted-foreground text-sm">
              <MapPin className="w-3 h-3" />
              <span className="truncate">{project.address}</span>
            </div>
          )}
        </div>
        <StatusPill status={project.status} />
      </div>

      <div className="mb-2">
        <div className="flex items-center justify-between text-sm mb-1.5">
          <span className="text-muted-foreground">
            {project.percent}% • {project.doneCount}/{project.totalCount} tareas
          </span>
        </div>
        <ProgressBar percent={project.percent} timeStatus={project.timeStatus} />
      </div>
    </GlassCard>
  );
};
