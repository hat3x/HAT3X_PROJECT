import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import PortalLayout from "@/components/portal/PortalLayout";
import PageHeader from "@/components/portal/PageHeader";
import { Download, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { es } from "date-fns/locale";

const categoryLabels: Record<string, string> = {
  proposal: "Propuesta",
  audit: "Auditoría",
  roadmap: "Roadmap",
  technical: "Documentación técnica",
  deliverable: "Entregable",
  training: "Formación",
  other: "Otros",
};

const ClientDocuments = () => {
  const { companyId } = useAuth();
  const [files, setFiles] = useState<any[]>([]);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    if (!companyId) return;
    const fetch = async () => {
      const { data } = await supabase.from("files").select("*").eq("company_id", companyId).order("created_at", { ascending: false });
      setFiles(data || []);
    };
    fetch();
  }, [companyId]);

  const categories = ["all", ...Object.keys(categoryLabels)];
  const filtered = filter === "all" ? files : files.filter(f => f.category === filter);

  return (
    <PortalLayout type="client">
      <PageHeader title="Centro documental" subtitle="Documentos de tu proyecto" />

      <div className="flex gap-2 mb-6 flex-wrap">
        {categories.map(c => (
          <button
            key={c}
            onClick={() => setFilter(c)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              filter === c ? "bg-primary/20 text-primary border border-primary/30" : "bg-secondary/50 text-muted-foreground hover:text-foreground"
            }`}
          >
            {c === "all" ? "Todos" : categoryLabels[c]}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {filtered.map(f => (
          <div key={f.id} className="glass-card p-5 flex items-center justify-between gap-4">
            <div className="flex items-center gap-4 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
                <FileText className="w-5 h-5 text-primary" />
              </div>
              <div className="min-w-0">
                <h4 className="font-semibold text-foreground text-sm truncate">{f.name}</h4>
                <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                  <span>{categoryLabels[f.category] || f.category}</span>
                  <span>v{f.version}</span>
                  <span>{format(new Date(f.created_at), "d MMM yyyy", { locale: es })}</span>
                </div>
              </div>
            </div>
            {f.file_url && (
              <Button variant="ghost" size="icon" asChild className="shrink-0">
                <a href={f.file_url} target="_blank" rel="noreferrer"><Download className="w-4 h-4" /></a>
              </Button>
            )}
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="glass-card p-12 text-center">
            <p className="text-muted-foreground">No hay documentos disponibles.</p>
          </div>
        )}
      </div>
    </PortalLayout>
  );
};

export default ClientDocuments;
