import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import PortalLayout from "@/components/portal/PortalLayout";
import PageHeader from "@/components/portal/PageHeader";
import { format } from "date-fns";
import { es } from "date-fns/locale";

const ClientUpdates = () => {
  const { companyId } = useAuth();
  const [updates, setUpdates] = useState<any[]>([]);

  useEffect(() => {
    if (!companyId) return;
    const fetch = async () => {
      const { data: proj } = await supabase.from("projects").select("id").eq("company_id", companyId).order("created_at", { ascending: false }).limit(1).single();
      if (proj) {
        const { data } = await supabase.from("project_updates").select("*").eq("project_id", proj.id).order("published_at", { ascending: false });
        setUpdates(data || []);
      }
    };
    fetch();
  }, [companyId]);

  return (
    <PortalLayout type="client">
      <PageHeader title="Actualizaciones" subtitle="Novedades y avances de tu proyecto" />

      <div className="space-y-6">
        {updates.map((u, i) => (
          <div key={u.id} className="glass-card p-6 md:p-8">
            <div className="flex items-start justify-between gap-3 mb-4">
              <h3 className="text-lg font-semibold text-foreground">{u.title}</h3>
              <span className="text-xs text-muted-foreground shrink-0">
                {u.published_at ? format(new Date(u.published_at), "d MMM yyyy", { locale: es }) : "Borrador"}
              </span>
            </div>
            {u.summary && <p className="text-sm text-muted-foreground mb-4">{u.summary}</p>}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {u.what_was_done && (
                <div className="bg-secondary/30 rounded-xl p-4">
                  <p className="text-xs font-semibold text-emerald-400 uppercase tracking-wider mb-2">✓ Qué se ha hecho</p>
                  <p className="text-sm text-foreground leading-relaxed">{u.what_was_done}</p>
                </div>
              )}
              {u.current_status && (
                <div className="bg-secondary/30 rounded-xl p-4">
                  <p className="text-xs font-semibold text-primary uppercase tracking-wider mb-2">→ En qué estamos</p>
                  <p className="text-sm text-foreground leading-relaxed">{u.current_status}</p>
                </div>
              )}
              {u.next_steps && (
                <div className="bg-secondary/30 rounded-xl p-4">
                  <p className="text-xs font-semibold text-accent uppercase tracking-wider mb-2">⟶ Qué viene después</p>
                  <p className="text-sm text-foreground leading-relaxed">{u.next_steps}</p>
                </div>
              )}
              {u.client_action_needed && (
                <div className="bg-accent/10 rounded-xl p-4 border border-accent/20">
                  <p className="text-xs font-semibold text-accent uppercase tracking-wider mb-2">⚡ Necesitamos de ti</p>
                  <p className="text-sm text-foreground leading-relaxed">{u.client_action_needed}</p>
                </div>
              )}
            </div>
          </div>
        ))}
        {updates.length === 0 && (
          <div className="glass-card p-12 text-center">
            <p className="text-muted-foreground">Las actualizaciones de tu proyecto aparecerán aquí.</p>
          </div>
        )}
      </div>
    </PortalLayout>
  );
};

export default ClientUpdates;
