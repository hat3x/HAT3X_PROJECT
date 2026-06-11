import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import PortalLayout from "@/components/portal/PortalLayout";
import PageHeader from "@/components/portal/PageHeader";
import StatusBadge from "@/components/portal/StatusBadge";

const ClientTimeline = () => {
  const { companyId } = useAuth();
  const [phases, setPhases] = useState<any[]>([]);
  const [projectName, setProjectName] = useState("");

  useEffect(() => {
    if (!companyId) return;
    const fetch = async () => {
      const { data: proj } = await supabase.from("projects").select("id, name").eq("company_id", companyId).order("created_at", { ascending: false }).limit(1).single();
      if (proj) {
        setProjectName(proj.name);
        const { data } = await supabase.from("project_phases").select("*").eq("project_id", proj.id).order("sort_order");
        setPhases(data || []);
      }
    };
    fetch();
  }, [companyId]);

  return (
    <PortalLayout type="client">
      <PageHeader title="Timeline del proyecto" subtitle={projectName} />

      <div className="relative">
        {/* Vertical line */}
        <div className="absolute left-6 top-0 bottom-0 w-px bg-border/50 hidden md:block" />

        <div className="space-y-6">
          {phases.map((phase, i) => {
            const isCompleted = phase.status === "completed";
            const isActive = phase.status === "in_progress";
            return (
              <div key={phase.id} className="flex gap-6">
                {/* Timeline dot */}
                <div className="hidden md:flex flex-col items-center shrink-0">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-sm font-bold z-10 ${
                    isCompleted ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" :
                    isActive ? "bg-primary/20 text-primary border border-primary/30 shadow-[0_0_16px_hsl(265_100%_50%/0.15)]" :
                    "bg-secondary text-muted-foreground border border-border/50"
                  }`}>
                    {String(i + 1).padStart(2, "0")}
                  </div>
                </div>

                {/* Content */}
                <div className={`flex-1 glass-card p-6 ${isActive ? "border-primary/30 shadow-[0_0_20px_hsl(265_100%_50%/0.08)]" : ""}`}>
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div>
                      <span className="text-xs text-muted-foreground font-semibold uppercase tracking-wider md:hidden">Fase {i + 1}</span>
                      <h3 className="text-lg font-semibold text-foreground">{phase.name}</h3>
                    </div>
                    <StatusBadge status={phase.status} />
                  </div>
                  {phase.description && (
                    <p className="text-sm text-muted-foreground leading-relaxed">{phase.description}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {phases.length === 0 && (
        <div className="glass-card p-12 text-center">
          <p className="text-muted-foreground">El timeline de tu proyecto aparecerá aquí.</p>
        </div>
      )}
    </PortalLayout>
  );
};

export default ClientTimeline;
