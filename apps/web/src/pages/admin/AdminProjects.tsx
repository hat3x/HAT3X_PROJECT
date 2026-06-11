import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import PortalLayout from "@/components/portal/PortalLayout";
import PageHeader from "@/components/portal/PageHeader";
import StatusBadge from "@/components/portal/StatusBadge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Search, ChevronRight, Trash2 } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { es } from "date-fns/locale";

const AdminProjects = () => {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", company_id: "", service_type: "custom", description: "", start_date: "", estimated_end_date: "" });

  const fetchAll = async () => {
    const [projRes, compRes] = await Promise.all([
      supabase.from("projects").select("*, companies(name)").order("updated_at", { ascending: false }),
      supabase.from("companies").select("id, name").order("name"),
    ]);
    setProjects(projRes.data || []);
    setCompanies(compRes.data || []);
  };

  useEffect(() => { fetchAll(); }, []);

  const createProject = async () => {
    if (!form.name.trim() || !form.company_id) return;
    const { error } = await supabase.from("projects").insert({
      ...form,
      start_date: form.start_date || null,
      estimated_end_date: form.estimated_end_date || null,
    });
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Proyecto creado" });
    setForm({ name: "", company_id: "", service_type: "custom", description: "", start_date: "", estimated_end_date: "" });
    setShowCreate(false);
    fetchAll();
  };

  const deleteProject = async (projectId: string) => {
    // Delete related data first
    await Promise.all([
      supabase.from("tasks").delete().eq("project_id", projectId),
      supabase.from("milestones").delete().eq("project_id", projectId),
      supabase.from("project_phases").delete().eq("project_id", projectId),
      supabase.from("project_updates").delete().eq("project_id", projectId),
      supabase.from("files").delete().eq("project_id", projectId),
      supabase.from("internal_notes").delete().eq("project_id", projectId),
    ]);
    // Delete conversations and their messages
    const { data: convs } = await supabase.from("conversations").select("id").eq("project_id", projectId);
    if (convs && convs.length > 0) {
      const convIds = convs.map(c => c.id);
      await supabase.from("messages").delete().in("conversation_id", convIds);
      await supabase.from("conversations").delete().eq("project_id", projectId);
    }
    const { error } = await supabase.from("projects").delete().eq("id", projectId);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Proyecto eliminado" });
    fetchAll();
  };

  const filtered = projects.filter(p => p.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <PortalLayout type="admin">
      <PageHeader
        title="Gestión de proyectos"
        subtitle={`${projects.length} proyectos`}
        actions={
          <Dialog open={showCreate} onOpenChange={setShowCreate}>
            <DialogTrigger asChild>
              <Button className="bg-accent text-accent-foreground hover:bg-accent/90 rounded-xl text-sm font-semibold">
                <Plus className="w-4 h-4 mr-2" /> Nuevo proyecto
              </Button>
            </DialogTrigger>
            <DialogContent className="glass-card border-border/30 bg-card max-w-lg">
              <DialogHeader><DialogTitle className="text-foreground">Crear proyecto</DialogTitle></DialogHeader>
              <div className="space-y-4 mt-4">
                <div><Label>Nombre *</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="bg-secondary/50 border-border/50 mt-1" /></div>
                <div>
                  <Label>Cliente *</Label>
                  <Select value={form.company_id} onValueChange={v => setForm({ ...form, company_id: v })}>
                    <SelectTrigger className="bg-secondary/50 border-border/50 mt-1"><SelectValue placeholder="Seleccionar cliente" /></SelectTrigger>
                    <SelectContent>{companies.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>Tipo de servicio</Label><Input value={form.service_type} onChange={e => setForm({ ...form, service_type: e.target.value })} className="bg-secondary/50 border-border/50 mt-1" /></div>
                <div><Label>Descripción</Label><Input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="bg-secondary/50 border-border/50 mt-1" /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div><Label>Fecha inicio</Label><Input type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} className="bg-secondary/50 border-border/50 mt-1" /></div>
                  <div><Label>Fecha entrega</Label><Input type="date" value={form.estimated_end_date} onChange={e => setForm({ ...form, estimated_end_date: e.target.value })} className="bg-secondary/50 border-border/50 mt-1" /></div>
                </div>
                <Button onClick={createProject} className="w-full bg-accent text-accent-foreground hover:bg-accent/90 rounded-xl">Crear</Button>
              </div>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="mb-6">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar proyectos..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10 bg-secondary/50 border-border/50" />
        </div>
      </div>

      <div className="space-y-4">
        {filtered.map(p => (
          <div key={p.id} className="glass-card p-5 cursor-pointer hover:border-primary/30 transition-all" onClick={() => navigate(`/admin/projects/${p.id}`)}>
            <div className="flex items-start justify-between gap-4 mb-3">
              <div>
                <h3 className="font-semibold text-foreground">{p.name}</h3>
                <p className="text-xs text-muted-foreground">{(p as any).companies?.name} · {p.service_type}</p>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={p.priority} />
                <StatusBadge status={p.status} />
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="icon" className="shrink-0 text-destructive hover:text-destructive" onClick={e => e.stopPropagation()}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent className="glass-card border-border/30 bg-card" onClick={e => e.stopPropagation()}>
                    <AlertDialogHeader>
                      <AlertDialogTitle>¿Eliminar proyecto?</AlertDialogTitle>
                      <AlertDialogDescription>Se eliminarán todas las tareas, fases, hitos, documentos, actualizaciones y conversaciones asociadas. Esta acción no se puede deshacer.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction onClick={() => deleteProject(p.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Eliminar</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </div>
            </div>
            <div className="flex items-center gap-4">
              <Progress value={p.progress} className="flex-1 h-2 bg-secondary/50" />
              <span className="text-sm font-semibold text-foreground">{p.progress}%</span>
            </div>
            <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
              {p.start_date && <span>Inicio: {format(new Date(p.start_date), "d MMM yyyy", { locale: es })}</span>}
              {p.estimated_end_date && <span>Entrega: {format(new Date(p.estimated_end_date), "d MMM yyyy", { locale: es })}</span>}
            </div>
          </div>
        ))}
      </div>
    </PortalLayout>
  );
};

export default AdminProjects;
