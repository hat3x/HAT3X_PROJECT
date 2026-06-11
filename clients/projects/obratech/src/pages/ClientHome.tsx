import { GlassScaffold } from "@/components/ui-kit/GlassScaffold";
import { GlassCard } from "@/components/ui-kit/GlassCard";
import { ProjectCard } from "@/components/ui-kit/ProjectCard";
import { useProjects } from "@/hooks/useProjects";
import { useAuth } from "@/contexts/AuthContext";
import { signOut } from "@/lib/auth";
import { LogOut, RefreshCw, Building2 } from "lucide-react";
import obratechLogo from "@/assets/obratech-logo.png";

const ClientHome = () => {
  const { profile } = useAuth();
  const { data: projects = [], isLoading, refetch } = useProjects();

  return (
    <GlassScaffold className="min-h-screen">
      <div className="sticky top-0 z-10 px-4 pt-4 pb-3" style={{ background: "linear-gradient(to bottom, hsl(250 20% 6%), hsl(250 20% 6% / 0.8))", backdropFilter: "blur(12px)" }}>
        <div className="flex items-center justify-between max-w-4xl mx-auto">
          <div className="flex items-center gap-3">
            <img src={obratechLogo} alt="ObraTech" className="h-8 object-contain" />
            <div>
              <p className="text-xs text-muted-foreground">{profile?.full_name || profile?.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => refetch()} className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-all">
              <RefreshCw className="w-5 h-5" />
            </button>
            <button onClick={signOut} className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-all">
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      <div className="px-4 py-4 max-w-4xl mx-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          </div>
        ) : projects.length === 0 ? (
          <GlassCard className="text-center py-12">
            <Building2 className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">No tienes obras asignadas</p>
          </GlassCard>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {projects.map((p) => (
              <ProjectCard key={p.id} project={p} />
            ))}
          </div>
        )}
      </div>
    </GlassScaffold>
  );
};

export default ClientHome;
