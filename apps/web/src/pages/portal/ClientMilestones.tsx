import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import PortalLayout from "@/components/portal/PortalLayout";
import PageHeader from "@/components/portal/PageHeader";
import StatusBadge from "@/components/portal/StatusBadge";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

const ClientMilestones = () => {
  const { companyId } = useAuth();
  const [milestones, setMilestones] = useState<any[]>([]);

  useEffect(() => {
    if (!companyId) return;
    const fetch = async () => {
      const { data: proj } = await supabase.from("projects").select("id").eq("company_id", companyId).order("created_at", { ascending: false }).limit(1).single();
      if (proj) {
        const { data } = await supabase.from("milestones").select("*").eq("project_id", proj.id).order("due_date");
        setMilestones(data || []);
      }
    };
    fetch();
  }, [companyId]);

  return (
    <PortalLayout type="client">
      <PageHeader title="Hitos y entregables" subtitle="Hitos principales de tu proyecto" />
      <div className="space-y-4">
        {milestones.map(m => (
          <div key={m.id} className="glass-card p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold text-foreground">{m.name}</h3>
                {m.description && <p className="text-sm text-muted-foreground mt-1">{m.description}</p>}
                <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                  {m.due_date && <span>Previsto: {format(new Date(m.due_date), "d MMM yyyy", { locale: es })}</span>}
                  {m.completed_at && <span>Completado: {format(new Date(m.completed_at), "d MMM yyyy", { locale: es })}</span>}
                </div>
              </div>
              <StatusBadge status={m.status} />
            </div>
          </div>
        ))}
        {milestones.length === 0 && (
          <div className="glass-card p-12 text-center">
            <p className="text-muted-foreground">Los hitos de tu proyecto aparecerán aquí.</p>
          </div>
        )}
      </div>
    </PortalLayout>
  );
};

export default ClientMilestones;
