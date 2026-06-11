import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import PortalLayout from "@/components/portal/PortalLayout";
import PageHeader from "@/components/portal/PageHeader";
import StatusBadge from "@/components/portal/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { es } from "date-fns/locale";

const AdminPhases = () => {
  const [phases, setPhases] = useState<any[]>([]);
  const [milestones, setMilestones] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [showCreatePhase, setShowCreatePhase] = useState(false);
  const [showCreateMilestone, setShowCreateMilestone] = useState(false);
  const [phaseForm, setPhaseForm] = useState({ project_id: "", name: "", description: "", sort_order: "0" });
  const [milestoneForm, setMilestoneForm] = useState({ project_id: "", name: "", description: "", due_date: "" });

  const fetchAll = async () => {
    const [projRes, phasesRes, milestonesRes] = await Promise.all([
      supabase.from("projects").select("id, name").order("name"),
      supabase.from("project_phases").select("*, projects(name)").order("sort_order"),
      supabase.from("milestones").select("*, projects(name)").order("due_date"),
    ]);
    setProjects(projRes.data || []);
    setPhases(phasesRes.data || []);
    setMilestones(milestonesRes.data || []);
  };

  useEffect(() => { fetchAll(); }, []);

  const createPhase = async () => {
    if (!phaseForm.name.trim() || !phaseForm.project_id) return;
    const { error } = await supabase.from("project_phases").insert({ ...phaseForm, sort_order: parseInt(phaseForm.sort_order) || 0 });
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Fase creada" });
    setPhaseForm({ project_id: "", name: "", description: "", sort_order: "0" });
    setShowCreatePhase(false);
    fetchAll();
  };

  const createMilestone = async () => {
    if (!milestoneForm.name.trim() || !milestoneForm.project_id) return;
    const { error } = await supabase.from("milestones").insert({ ...milestoneForm, due_date: milestoneForm.due_date || null });
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Hito creado" });
    setMilestoneForm({ project_id: "", name: "", description: "", due_date: "" });
    setShowCreateMilestone(false);
    fetchAll();
  };

  const updatePhaseStatus = async (id: string, status: string) => {
    await supabase.from("project_phases").update({ status }).eq("id", id);
    fetchAll();
  };

  const updateMilestoneStatus = async (id: string, status: string) => {
    await supabase.from("milestones").update({ status, completed_at: status === "completed" ? new Date().toISOString() : null }).eq("id", id);
    fetchAll();
  };

  const statuses = ["pending", "in_progress", "in_review", "completed", "blocked"];
  const milestoneStatuses = ["pending", "in_progress", "completed", "blocked"];

  return (
    <PortalLayout type="admin">
      <PageHeader
        title="Fases e hitos"
        actions={
          <div className="flex gap-2">
            <Dialog open={showCreatePhase} onOpenChange={setShowCreatePhase}>
              <DialogTrigger asChild><Button variant="outline" className="rounded-xl text-sm"><Plus className="w-4 h-4 mr-1" />Fase</Button></DialogTrigger>
              <DialogContent className="glass-card border-border/30 bg-card">
                <DialogHeader><DialogTitle className="text-foreground">Crear fase</DialogTitle></DialogHeader>
                <div className="space-y-4 mt-4">
                  <div><Label>Proyecto *</Label>
                    <Select value={phaseForm.project_id} onValueChange={v => setPhaseForm({ ...phaseForm, project_id: v })}>
                      <SelectTrigger className="bg-secondary/50 border-border/50 mt-1"><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                      <SelectContent>{projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div><Label>Nombre *</Label><Input value={phaseForm.name} onChange={e => setPhaseForm({ ...phaseForm, name: e.target.value })} className="bg-secondary/50 border-border/50 mt-1" /></div>
                  <div><Label>Orden</Label><Input type="number" value={phaseForm.sort_order} onChange={e => setPhaseForm({ ...phaseForm, sort_order: e.target.value })} className="bg-secondary/50 border-border/50 mt-1" /></div>
                  <Button onClick={createPhase} className="w-full bg-accent text-accent-foreground hover:bg-accent/90 rounded-xl">Crear</Button>
                </div>
              </DialogContent>
            </Dialog>
            <Dialog open={showCreateMilestone} onOpenChange={setShowCreateMilestone}>
              <DialogTrigger asChild><Button className="bg-accent text-accent-foreground hover:bg-accent/90 rounded-xl text-sm"><Plus className="w-4 h-4 mr-1" />Hito</Button></DialogTrigger>
              <DialogContent className="glass-card border-border/30 bg-card">
                <DialogHeader><DialogTitle className="text-foreground">Crear hito</DialogTitle></DialogHeader>
                <div className="space-y-4 mt-4">
                  <div><Label>Proyecto *</Label>
                    <Select value={milestoneForm.project_id} onValueChange={v => setMilestoneForm({ ...milestoneForm, project_id: v })}>
                      <SelectTrigger className="bg-secondary/50 border-border/50 mt-1"><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                      <SelectContent>{projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div><Label>Nombre *</Label><Input value={milestoneForm.name} onChange={e => setMilestoneForm({ ...milestoneForm, name: e.target.value })} className="bg-secondary/50 border-border/50 mt-1" /></div>
                  <div><Label>Fecha prevista</Label><Input type="date" value={milestoneForm.due_date} onChange={e => setMilestoneForm({ ...milestoneForm, due_date: e.target.value })} className="bg-secondary/50 border-border/50 mt-1" /></div>
                  <Button onClick={createMilestone} className="w-full bg-accent text-accent-foreground hover:bg-accent/90 rounded-xl">Crear</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        }
      />

      {/* Phases */}
      <h3 className="text-lg font-semibold text-foreground mb-4">Fases</h3>
      <div className="space-y-3 mb-10">
        {phases.map(p => (
          <div key={p.id} className="glass-card p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h4 className="font-semibold text-foreground text-sm">{p.name}</h4>
              <p className="text-xs text-muted-foreground">{(p as any).projects?.name} · Orden: {p.sort_order}</p>
            </div>
            <div className="flex items-center gap-2">
              <Select value={p.status} onValueChange={v => updatePhaseStatus(p.id, v)}>
                <SelectTrigger className="w-[140px] h-8 text-xs bg-secondary/50 border-border/50"><SelectValue /></SelectTrigger>
                <SelectContent>{statuses.map(s => <SelectItem key={s} value={s}><StatusBadge status={s} /></SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
        ))}
        {phases.length === 0 && <div className="glass-card p-8 text-center"><p className="text-muted-foreground text-sm">Sin fases creadas.</p></div>}
      </div>

      {/* Milestones */}
      <h3 className="text-lg font-semibold text-foreground mb-4">Hitos</h3>
      <div className="space-y-3">
        {milestones.map(m => (
          <div key={m.id} className="glass-card p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h4 className="font-semibold text-foreground text-sm">{m.name}</h4>
              <p className="text-xs text-muted-foreground">
                {(m as any).projects?.name}
                {m.due_date && ` · ${format(new Date(m.due_date), "d MMM yyyy", { locale: es })}`}
              </p>
            </div>
            <Select value={m.status} onValueChange={v => updateMilestoneStatus(m.id, v)}>
              <SelectTrigger className="w-[140px] h-8 text-xs bg-secondary/50 border-border/50"><SelectValue /></SelectTrigger>
              <SelectContent>{milestoneStatuses.map(s => <SelectItem key={s} value={s}><StatusBadge status={s} /></SelectItem>)}</SelectContent>
            </Select>
          </div>
        ))}
        {milestones.length === 0 && <div className="glass-card p-8 text-center"><p className="text-muted-foreground text-sm">Sin hitos creados.</p></div>}
      </div>
    </PortalLayout>
  );
};

export default AdminPhases;
