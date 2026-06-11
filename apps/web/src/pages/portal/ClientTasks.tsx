import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import PortalLayout from "@/components/portal/PortalLayout";
import PageHeader from "@/components/portal/PageHeader";
import StatusBadge from "@/components/portal/StatusBadge";
import { format } from "date-fns";
import { es } from "date-fns/locale";

const ClientTasks = () => {
  const { companyId } = useAuth();
  const [tasks, setTasks] = useState<any[]>([]);
  const [filter, setFilter] = useState<string>("all");

  useEffect(() => {
    if (!companyId) return;
    const fetch = async () => {
      const { data: proj } = await supabase.from("projects").select("id").eq("company_id", companyId).order("created_at", { ascending: false }).limit(1).single();
      if (proj) {
        const { data } = await supabase.from("tasks").select("*").eq("project_id", proj.id).order("created_at", { ascending: false });
        setTasks(data || []);
      }
    };
    fetch();
  }, [companyId]);

  const filtered = filter === "all" ? tasks : tasks.filter(t => t.status === filter);

  return (
    <PortalLayout type="client">
      <PageHeader title="Tareas" subtitle="Tareas visibles de tu proyecto" />

      <div className="flex gap-2 mb-6 flex-wrap">
        {[{ key: "all", label: "Todas" }, { key: "todo", label: "Pendientes" }, { key: "in_progress", label: "En curso" }, { key: "done", label: "Completadas" }].map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              filter === f.key ? "bg-primary/20 text-primary border border-primary/30" : "bg-secondary/50 text-muted-foreground hover:text-foreground"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {filtered.map(t => (
          <div key={t.id} className="glass-card p-5 flex items-center justify-between gap-4">
            <div className="min-w-0">
              <h4 className="font-semibold text-foreground text-sm">{t.name}</h4>
              {t.description && <p className="text-xs text-muted-foreground mt-0.5 truncate">{t.description}</p>}
              <div className="flex items-center gap-3 mt-2">
                <StatusBadge status={t.priority} />
                {t.due_date && <span className="text-xs text-muted-foreground">{format(new Date(t.due_date), "d MMM", { locale: es })}</span>}
              </div>
            </div>
            <StatusBadge status={t.status} />
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="glass-card p-12 text-center">
            <p className="text-muted-foreground">No hay tareas visibles con este filtro.</p>
          </div>
        )}
      </div>
    </PortalLayout>
  );
};

export default ClientTasks;
