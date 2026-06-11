import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import PortalLayout from "@/components/portal/PortalLayout";
import PageHeader from "@/components/portal/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, FileText, Upload } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { es } from "date-fns/locale";

const categoryLabels: Record<string, string> = {
  proposal: "Propuesta", audit: "Auditoría", roadmap: "Roadmap",
  technical: "Doc. técnica", deliverable: "Entregable", training: "Formación", other: "Otros",
};

const AdminDocuments = () => {
  const { user } = useAuth();
  const [files, setFiles] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", project_id: "", company_id: "", category: "other", visible_to_client: true, file_url: "" });

  const fetchAll = async () => {
    const [filesRes, projRes, compRes] = await Promise.all([
      supabase.from("files").select("*, projects(name), companies(name)").order("created_at", { ascending: false }),
      supabase.from("projects").select("id, name").order("name"),
      supabase.from("companies").select("id, name").order("name"),
    ]);
    setFiles(filesRes.data || []);
    setProjects(projRes.data || []);
    setCompanies(compRes.data || []);
  };

  useEffect(() => { fetchAll(); }, []);

  const createFile = async () => {
    if (!form.name.trim()) return;
    const { error } = await supabase.from("files").insert({
      ...form,
      project_id: form.project_id || null,
      company_id: form.company_id || null,
      uploaded_by: user?.id,
    });
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Documento registrado" });
    setForm({ name: "", project_id: "", company_id: "", category: "other", visible_to_client: true, file_url: "" });
    setShowCreate(false);
    fetchAll();
  };

  return (
    <PortalLayout type="admin">
      <PageHeader
        title="Gestión documental"
        subtitle={`${files.length} documentos`}
        actions={
          <Dialog open={showCreate} onOpenChange={setShowCreate}>
            <DialogTrigger asChild>
              <Button className="bg-accent text-accent-foreground hover:bg-accent/90 rounded-xl text-sm font-semibold">
                <Plus className="w-4 h-4 mr-2" /> Nuevo documento
              </Button>
            </DialogTrigger>
            <DialogContent className="glass-card border-border/30 bg-card">
              <DialogHeader><DialogTitle className="text-foreground">Registrar documento</DialogTitle></DialogHeader>
              <div className="space-y-4 mt-4">
                <div><Label>Nombre *</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="bg-secondary/50 border-border/50 mt-1" /></div>
                <div><Label>URL del archivo</Label><Input value={form.file_url} onChange={e => setForm({ ...form, file_url: e.target.value })} placeholder="https://..." className="bg-secondary/50 border-border/50 mt-1" /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div><Label>Proyecto</Label>
                    <Select value={form.project_id} onValueChange={v => setForm({ ...form, project_id: v })}>
                      <SelectTrigger className="bg-secondary/50 border-border/50 mt-1"><SelectValue placeholder="Opcional" /></SelectTrigger>
                      <SelectContent>{projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div><Label>Cliente</Label>
                    <Select value={form.company_id} onValueChange={v => setForm({ ...form, company_id: v })}>
                      <SelectTrigger className="bg-secondary/50 border-border/50 mt-1"><SelectValue placeholder="Opcional" /></SelectTrigger>
                      <SelectContent>{companies.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                <div><Label>Categoría</Label>
                  <Select value={form.category} onValueChange={v => setForm({ ...form, category: v })}>
                    <SelectTrigger className="bg-secondary/50 border-border/50 mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>{Object.entries(categoryLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox checked={form.visible_to_client} onCheckedChange={v => setForm({ ...form, visible_to_client: !!v })} />
                  <Label className="text-sm">Visible para el cliente</Label>
                </div>
                <Button onClick={createFile} className="w-full bg-accent text-accent-foreground hover:bg-accent/90 rounded-xl">Registrar</Button>
              </div>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="space-y-3">
        {files.map(f => (
          <div key={f.id} className="glass-card p-5 flex items-center justify-between gap-4">
            <div className="flex items-center gap-4 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
                <FileText className="w-5 h-5 text-primary" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h4 className="font-semibold text-foreground text-sm truncate">{f.name}</h4>
                  {!f.visible_to_client && <span className="text-[9px] bg-secondary text-muted-foreground px-1.5 py-0.5 rounded-full font-bold">INTERNO</span>}
                </div>
                <p className="text-xs text-muted-foreground">
                  {categoryLabels[f.category]} · v{f.version} · {format(new Date(f.created_at), "d MMM yyyy", { locale: es })}
                  {(f as any).projects?.name && ` · ${(f as any).projects.name}`}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </PortalLayout>
  );
};

export default AdminDocuments;
