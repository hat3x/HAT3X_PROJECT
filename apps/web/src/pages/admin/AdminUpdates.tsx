import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import PortalLayout from "@/components/portal/PortalLayout";
import PageHeader from "@/components/portal/PageHeader";
import StatusBadge from "@/components/portal/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { es } from "date-fns/locale";

const AdminUpdates = () => {
  const { user } = useAuth();
  const [updates, setUpdates] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    project_id: "", title: "", summary: "", what_was_done: "",
    current_status: "", next_steps: "", client_action_needed: "", status: "draft" as string,
  });

  const fetchAll = async () => {
    const [updRes, projRes] = await Promise.all([
      supabase.from("project_updates").select("*, projects(name)").order("created_at", { ascending: false }),
      supabase.from("projects").select("id, name").order("name"),
    ]);
    setUpdates(updRes.data || []);
    setProjects(projRes.data || []);
  };

  useEffect(() => { fetchAll(); }, []);

  const createUpdate = async () => {
    if (!form.title.trim() || !form.project_id) return;
    const { error } = await supabase.from("project_updates").insert({
      ...form,
      author_id: user?.id,
      published_at: form.status === "published" ? new Date().toISOString() : null,
    });
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: form.status === "published" ? "Actualización publicada" : "Borrador guardado" });
    setForm({ project_id: "", title: "", summary: "", what_was_done: "", current_status: "", next_steps: "", client_action_needed: "", status: "draft" });
    setShowCreate(false);
    fetchAll();
  };

  const publish = async (id: string) => {
    await supabase.from("project_updates").update({ status: "published", published_at: new Date().toISOString() }).eq("id", id);
    fetchAll();
  };

  return (
    <PortalLayout type="admin">
      <PageHeader
        title="Actualizaciones"
        subtitle="Publica avances para tus clientes"
        actions={
          <Dialog open={showCreate} onOpenChange={setShowCreate}>
            <DialogTrigger asChild>
              <Button className="bg-accent text-accent-foreground hover:bg-accent/90 rounded-xl text-sm font-semibold">
                <Plus className="w-4 h-4 mr-2" /> Nueva actualización
              </Button>
            </DialogTrigger>
            <DialogContent className="glass-card border-border/30 bg-card max-w-2xl max-h-[85vh] overflow-y-auto">
              <DialogHeader><DialogTitle className="text-foreground">Crear actualización</DialogTitle></DialogHeader>
              <div className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div><Label>Proyecto *</Label>
                    <Select value={form.project_id} onValueChange={v => setForm({ ...form, project_id: v })}>
                      <SelectTrigger className="bg-secondary/50 border-border/50 mt-1"><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                      <SelectContent>{projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div><Label>Estado</Label>
                    <Select value={form.status} onValueChange={v => setForm({ ...form, status: v })}>
                      <SelectTrigger className="bg-secondary/50 border-border/50 mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="draft">Borrador</SelectItem>
                        <SelectItem value="published">Publicar ahora</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div><Label>Título *</Label><Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} className="bg-secondary/50 border-border/50 mt-1" /></div>
                <div><Label>Resumen</Label><Textarea value={form.summary} onChange={e => setForm({ ...form, summary: e.target.value })} className="bg-secondary/50 border-border/50 mt-1" rows={2} /></div>
                <div><Label>Qué se ha hecho</Label><Textarea value={form.what_was_done} onChange={e => setForm({ ...form, what_was_done: e.target.value })} className="bg-secondary/50 border-border/50 mt-1" rows={2} /></div>
                <div><Label>En qué estamos</Label><Textarea value={form.current_status} onChange={e => setForm({ ...form, current_status: e.target.value })} className="bg-secondary/50 border-border/50 mt-1" rows={2} /></div>
                <div><Label>Qué viene después</Label><Textarea value={form.next_steps} onChange={e => setForm({ ...form, next_steps: e.target.value })} className="bg-secondary/50 border-border/50 mt-1" rows={2} /></div>
                <div><Label>Qué necesitamos del cliente</Label><Textarea value={form.client_action_needed} onChange={e => setForm({ ...form, client_action_needed: e.target.value })} className="bg-secondary/50 border-border/50 mt-1" rows={2} /></div>
                <Button onClick={createUpdate} className="w-full bg-accent text-accent-foreground hover:bg-accent/90 rounded-xl">
                  {form.status === "published" ? "Publicar" : "Guardar borrador"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="space-y-4">
        {updates.map(u => (
          <div key={u.id} className="glass-card p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h4 className="font-semibold text-foreground">{u.title}</h4>
                <p className="text-xs text-muted-foreground">{(u as any).projects?.name} · {u.created_at ? format(new Date(u.created_at), "d MMM yyyy", { locale: es }) : ""}</p>
                {u.summary && <p className="text-sm text-muted-foreground mt-2 line-clamp-2">{u.summary}</p>}
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={u.status} />
                {u.status === "draft" && (
                  <Button variant="outline" size="sm" onClick={() => publish(u.id)} className="text-xs rounded-lg">Publicar</Button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </PortalLayout>
  );
};

export default AdminUpdates;
