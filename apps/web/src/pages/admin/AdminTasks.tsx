import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import PortalLayout from "@/components/portal/PortalLayout";
import PageHeader from "@/components/portal/PageHeader";
import StatusBadge from "@/components/portal/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Search } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { es } from "date-fns/locale";

const AdminTasks = () => {
  const [tasks, setTasks] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ project_id: "", name: "", description: "", priority: "medium", due_date: "", visible_to_client: false });

  const fetchAll = async () => {
    const [tasksRes, projRes] = await Promise.all([
      supabase.from("tasks").select("*, projects(name)").order("created_at", { ascending: false }),
      supabase.from("projects").select("id, name").order("name"),
    ]);
    setTasks(tasksRes.data || []);
    setProjects(projRes.data || []);
  };

  useEffect(() => { fetchAll(); }, []);

  const createTask = async () => {
    if (!form.name.trim() || !form.project_id) return;
    const { error } = await supabase.from("tasks").insert({ ...form, due_date: form.due_date || null });
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Tarea creada" });
    setForm({ project_id: "", name: "", description: "", priority: "medium", due_date: "", visible_to_client: false });
    setShowCreate(false);
    fetchAll();
  };

  const updateStatus = async (id: string, status: string) => {
    await supabase.from("tasks").update({ status, completed_at: status === "done" ? new Date().toISOString() : null }).eq("id", id);
    fetchAll();
  };

  const filtered = tasks.filter(t => {
    if (filterStatus !== "all" && t.status !== filterStatus) return false;
    return t.name.toLowerCase().includes(search.toLowerCase());
  });

  const statusOptions = ["todo", "in_progress", "in_review", "done", "blocked"];

  return (
    <PortalLayout type="admin">
      <PageHeader
        title="Gestión de tareas"
        subtitle={`${tasks.length} tareas`}
        actions={
          <Dialog open={showCreate} onOpenChange={setShowCreate}>
            <DialogTrigger asChild>
              <Button className="bg-accent text-accent-foreground hover:bg-accent/90 rounded-xl text-sm font-semibold">
                <Plus className="w-4 h-4 mr-2" /> Nueva tarea
              </Button>
            </DialogTrigger>
            <DialogContent className="glass-card border-border/30 bg-card max-w-lg">
              <DialogHeader><DialogTitle className="text-foreground">Crear tarea</DialogTitle></DialogHeader>
              <div className="space-y-4 mt-4">
                <div><Label>Proyecto *</Label>
                  <Select value={form.project_id} onValueChange={v => setForm({ ...form, project_id: v })}>
                    <SelectTrigger className="bg-secondary/50 border-border/50 mt-1"><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                    <SelectContent>{projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>Nombre *</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="bg-secondary/50 border-border/50 mt-1" /></div>
                <div><Label>Descripción</Label><Input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="bg-secondary/50 border-border/50 mt-1" /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div><Label>Prioridad</Label>
                    <Select value={form.priority} onValueChange={v => setForm({ ...form, priority: v })}>
                      <SelectTrigger className="bg-secondary/50 border-border/50 mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Baja</SelectItem>
                        <SelectItem value="medium">Media</SelectItem>
                        <SelectItem value="high">Alta</SelectItem>
                        <SelectItem value="urgent">Urgente</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label>Fecha límite</Label><Input type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} className="bg-secondary/50 border-border/50 mt-1" /></div>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox checked={form.visible_to_client} onCheckedChange={v => setForm({ ...form, visible_to_client: !!v })} />
                  <Label className="text-sm">Visible para el cliente</Label>
                </div>
                <Button onClick={createTask} className="w-full bg-accent text-accent-foreground hover:bg-accent/90 rounded-xl">Crear</Button>
              </div>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="flex flex-wrap gap-4 mb-6">
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar tareas..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10 bg-secondary/50 border-border/50" />
        </div>
        <div className="flex gap-2 flex-wrap">
          {["all", ...statusOptions].map(s => (
            <button key={s} onClick={() => setFilterStatus(s)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${filterStatus === s ? "bg-primary/20 text-primary border border-primary/30" : "bg-secondary/50 text-muted-foreground"}`}>
              {s === "all" ? "Todas" : <StatusBadge status={s} />}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        {filtered.map(t => (
          <div key={t.id} className="glass-card p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h4 className="font-semibold text-foreground text-sm">{t.name}</h4>
                {t.visible_to_client && <span className="text-[9px] bg-accent/20 text-accent px-1.5 py-0.5 rounded-full font-bold">VISIBLE</span>}
              </div>
              <p className="text-xs text-muted-foreground">{(t as any).projects?.name}
                {t.due_date && ` · ${format(new Date(t.due_date), "d MMM", { locale: es })}`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge status={t.priority} />
              <Select value={t.status} onValueChange={v => updateStatus(t.id, v)}>
                <SelectTrigger className="w-[140px] h-8 text-xs bg-secondary/50 border-border/50"><SelectValue /></SelectTrigger>
                <SelectContent>{statusOptions.map(s => <SelectItem key={s} value={s}><StatusBadge status={s} /></SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
        ))}
      </div>
    </PortalLayout>
  );
};

export default AdminTasks;
