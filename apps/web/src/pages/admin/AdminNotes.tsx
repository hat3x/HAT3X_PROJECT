import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import PortalLayout from "@/components/portal/PortalLayout";
import PageHeader from "@/components/portal/PageHeader";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Plus, StickyNote } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { es } from "date-fns/locale";

const AdminNotes = () => {
  const { user } = useAuth();
  const [notes, setNotes] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ content: "", company_id: "", project_id: "" });
  const [filterCompany, setFilterCompany] = useState("all");

  const fetchAll = async () => {
    const [notesRes, compRes, projRes] = await Promise.all([
      supabase.from("internal_notes").select("*, companies(name), projects(name), profiles:author_id(full_name)").order("created_at", { ascending: false }),
      supabase.from("companies").select("id, name").order("name"),
      supabase.from("projects").select("id, name").order("name"),
    ]);
    setNotes(notesRes.data || []);
    setCompanies(compRes.data || []);
    setProjects(projRes.data || []);
  };

  useEffect(() => { fetchAll(); }, []);

  const createNote = async () => {
    if (!form.content.trim()) return;
    const { error } = await supabase.from("internal_notes").insert({
      content: form.content,
      company_id: form.company_id || null,
      project_id: form.project_id || null,
      author_id: user?.id,
    });
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Nota guardada" });
    setForm({ content: "", company_id: "", project_id: "" });
    setShowCreate(false);
    fetchAll();
  };

  const filtered = filterCompany === "all" ? notes : notes.filter(n => n.company_id === filterCompany);

  return (
    <PortalLayout type="admin">
      <PageHeader
        title="Notas internas"
        subtitle="Solo visibles para el equipo HAT3X"
        actions={
          <Dialog open={showCreate} onOpenChange={setShowCreate}>
            <DialogTrigger asChild>
              <Button className="bg-accent text-accent-foreground hover:bg-accent/90 rounded-xl text-sm font-semibold">
                <Plus className="w-4 h-4 mr-2" /> Nueva nota
              </Button>
            </DialogTrigger>
            <DialogContent className="glass-card border-border/30 bg-card">
              <DialogHeader><DialogTitle className="text-foreground">Nueva nota interna</DialogTitle></DialogHeader>
              <div className="space-y-4 mt-4">
                <div><Label>Contenido *</Label><Textarea value={form.content} onChange={e => setForm({ ...form, content: e.target.value })} className="bg-secondary/50 border-border/50 mt-1" rows={4} /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div><Label>Cliente</Label>
                    <Select value={form.company_id} onValueChange={v => setForm({ ...form, company_id: v })}>
                      <SelectTrigger className="bg-secondary/50 border-border/50 mt-1"><SelectValue placeholder="Opcional" /></SelectTrigger>
                      <SelectContent>{companies.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div><Label>Proyecto</Label>
                    <Select value={form.project_id} onValueChange={v => setForm({ ...form, project_id: v })}>
                      <SelectTrigger className="bg-secondary/50 border-border/50 mt-1"><SelectValue placeholder="Opcional" /></SelectTrigger>
                      <SelectContent>{projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                <Button onClick={createNote} className="w-full bg-accent text-accent-foreground hover:bg-accent/90 rounded-xl">Guardar</Button>
              </div>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="flex gap-2 mb-6 flex-wrap">
        <button onClick={() => setFilterCompany("all")} className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${filterCompany === "all" ? "bg-primary/20 text-primary border border-primary/30" : "bg-secondary/50 text-muted-foreground"}`}>
          Todas
        </button>
        {companies.map(c => (
          <button key={c.id} onClick={() => setFilterCompany(c.id)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${filterCompany === c.id ? "bg-primary/20 text-primary border border-primary/30" : "bg-secondary/50 text-muted-foreground"}`}>
            {c.name}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {filtered.map(n => (
          <div key={n.id} className="glass-card p-5">
            <p className="text-sm text-foreground whitespace-pre-wrap">{n.content}</p>
            <div className="flex items-center gap-3 mt-3 text-xs text-muted-foreground">
              <span>{(n as any).profiles?.full_name || "Equipo"}</span>
              {(n as any).companies?.name && <span>· {(n as any).companies.name}</span>}
              {(n as any).projects?.name && <span>· {(n as any).projects.name}</span>}
              <span>· {format(new Date(n.created_at), "d MMM yyyy, HH:mm", { locale: es })}</span>
            </div>
          </div>
        ))}
        {filtered.length === 0 && <div className="glass-card p-12 text-center"><p className="text-muted-foreground">Sin notas internas.</p></div>}
      </div>
    </PortalLayout>
  );
};

export default AdminNotes;
