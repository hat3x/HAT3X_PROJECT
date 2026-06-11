import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import PortalLayout from "@/components/portal/PortalLayout";
import PageHeader from "@/components/portal/PageHeader";
import { Zap, Clock, ArrowRight } from "lucide-react";

const ClientNextSteps = () => {
  const { companyId } = useAuth();
  const [project, setProject] = useState<any>(null);
  const [currentPhase, setCurrentPhase] = useState<any>(null);
  const [nextPhase, setNextPhase] = useState<any>(null);
  const [latestUpdate, setLatestUpdate] = useState<any>(null);

  useEffect(() => {
    if (!companyId) return;
    const fetch = async () => {
      const { data: proj } = await supabase.from("projects").select("*").eq("company_id", companyId).order("created_at", { ascending: false }).limit(1).single();
      if (proj) {
        setProject(proj);
        const { data: phases } = await supabase.from("project_phases").select("*").eq("project_id", proj.id).order("sort_order");
        if (phases) {
          const active = phases.find(p => p.status === "in_progress");
          setCurrentPhase(active || null);
          if (active) {
            const idx = phases.findIndex(p => p.id === active.id);
            setNextPhase(phases[idx + 1] || null);
          }
        }
        const { data: update } = await supabase.from("project_updates").select("*").eq("project_id", proj.id).order("published_at", { ascending: false }).limit(1).single();
        if (update) setLatestUpdate(update);
      }
    };
    fetch();
  }, [companyId]);

  return (
    <PortalLayout type="client">
      <PageHeader title="Próximos pasos" subtitle="Resumen claro de qué está pasando con tu proyecto" />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* What we're doing now */}
        <div className="glass-card-highlight p-6 md:p-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center">
              <Zap className="w-5 h-5 text-primary" />
            </div>
            <h3 className="font-semibold text-foreground">Qué estamos haciendo</h3>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {currentPhase
              ? `Estamos en la fase de ${currentPhase.name.toLowerCase()}. ${currentPhase.description || ""}`
              : latestUpdate?.current_status || "Tu proyecto está en proceso."}
          </p>
        </div>

        {/* What we need from you */}
        <div className="glass-card p-6 md:p-8 border-accent/20">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-accent/15 flex items-center justify-center">
              <Clock className="w-5 h-5 text-accent" />
            </div>
            <h3 className="font-semibold text-foreground">Qué necesitamos de ti</h3>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {latestUpdate?.client_action_needed || "Ahora mismo no necesitamos nada de tu parte. Te avisaremos si es necesario."}
          </p>
        </div>

        {/* What happens next */}
        <div className="glass-card p-6 md:p-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center">
              <ArrowRight className="w-5 h-5 text-emerald-400" />
            </div>
            <h3 className="font-semibold text-foreground">Qué sucede después</h3>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {nextPhase
              ? `La siguiente fase será: ${nextPhase.name}. ${nextPhase.description || ""}`
              : latestUpdate?.next_steps || "Te informaremos sobre los próximos pasos."}
          </p>
        </div>
      </div>
    </PortalLayout>
  );
};

export default ClientNextSteps;
