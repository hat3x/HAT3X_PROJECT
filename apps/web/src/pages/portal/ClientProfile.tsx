import { useAuth } from "@/contexts/AuthContext";
import PortalLayout from "@/components/portal/PortalLayout";
import PageHeader from "@/components/portal/PageHeader";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { User, Mail, Phone, Building } from "lucide-react";

const ClientProfile = () => {
  const { profile, companyId } = useAuth();
  const [company, setCompany] = useState<any>(null);
  const [projects, setProjects] = useState<any[]>([]);

  useEffect(() => {
    if (!companyId) return;
    const fetch = async () => {
      const [compRes, projRes] = await Promise.all([
        supabase.from("companies").select("*").eq("id", companyId).single(),
        supabase.from("projects").select("*").eq("company_id", companyId),
      ]);
      if (compRes.data) setCompany(compRes.data);
      if (projRes.data) setProjects(projRes.data);
    };
    fetch();
  }, [companyId]);

  const activeProjects = projects.filter(p => p.status === "active").length;
  const completedProjects = projects.filter(p => p.status === "completed").length;

  return (
    <PortalLayout type="client">
      <PageHeader title="Mi perfil" />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="glass-card p-6 md:p-8">
          <h3 className="font-semibold text-foreground mb-6">Información de contacto</h3>
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <User className="w-4 h-4 text-primary" />
              <div>
                <p className="text-xs text-muted-foreground">Nombre</p>
                <p className="text-sm font-medium text-foreground">{profile?.full_name || "—"}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Mail className="w-4 h-4 text-primary" />
              <div>
                <p className="text-xs text-muted-foreground">Email</p>
                <p className="text-sm font-medium text-foreground">{profile?.email || "—"}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Phone className="w-4 h-4 text-primary" />
              <div>
                <p className="text-xs text-muted-foreground">Teléfono</p>
                <p className="text-sm font-medium text-foreground">{profile?.phone || "—"}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="glass-card p-6 md:p-8">
          <h3 className="font-semibold text-foreground mb-6">Empresa</h3>
          {company ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Building className="w-4 h-4 text-accent" />
                <div>
                  <p className="text-xs text-muted-foreground">Empresa</p>
                  <p className="text-sm font-medium text-foreground">{company.name}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 mt-4">
                <div className="bg-secondary/30 rounded-xl p-4 text-center">
                  <p className="text-2xl font-bold text-foreground">{activeProjects}</p>
                  <p className="text-xs text-muted-foreground">Proyectos activos</p>
                </div>
                <div className="bg-secondary/30 rounded-xl p-4 text-center">
                  <p className="text-2xl font-bold text-foreground">{completedProjects}</p>
                  <p className="text-xs text-muted-foreground">Finalizados</p>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Sin empresa asociada.</p>
          )}
        </div>
      </div>
    </PortalLayout>
  );
};

export default ClientProfile;
