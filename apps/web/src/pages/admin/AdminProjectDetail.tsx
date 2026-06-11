import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import PortalLayout from "@/components/portal/PortalLayout";
import PageHeader from "@/components/portal/PageHeader";
import StatusBadge from "@/components/portal/StatusBadge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { ArrowLeft, Plus, Save, Send, FileText } from "lucide-react";

const statusOptions = ["planning", "active", "paused", "completed", "cancelled"];
const priorityOptions = ["low", "medium", "high", "urgent"];
const taskStatuses = ["todo", "in_progress", "in_review", "done", "blocked"];
const phaseStatuses = ["pending", "in_progress", "in_review", "completed", "blocked"];
const milestoneStatuses = ["pending", "in_progress", "completed", "blocked"];

const categoryLabels: Record<string, string> = {
  proposal: "Propuesta", audit: "Auditoría", roadmap: "Roadmap",
  technical: "Doc. técnica", deliverable: "Entregable", training: "Formación", other: "Otros",
};

const AdminProjectDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  // Project
  const [project, setProject] = useState<any>(null);
  const [editForm, setEditForm] = useState<any>({});
  const [companies, setCompanies] = useState<any[]>([]);

  // Related data
  const [phases, setPhases] = useState<any[]>([]);
  const [milestones, setMilestones] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [files, setFiles] = useState<any[]>([]);
  const [updates, setUpdates] = useState<any[]>([]);
  const [conversations, setConversations] = useState<any[]>([]);
  const [selectedConv, setSelectedConv] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState("");

  // Create dialogs
  const [showCreatePhase, setShowCreatePhase] = useState(false);
  const [showCreateMilestone, setShowCreateMilestone] = useState(false);
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [showCreateDoc, setShowCreateDoc] = useState(false);
  const [showCreateUpdate, setShowCreateUpdate] = useState(false);

  // Create forms
  const [phaseForm, setPhaseForm] = useState({ name: "", description: "", sort_order: "0" });
  const [milestoneForm, setMilestoneForm] = useState({ name: "", description: "", due_date: "" });
  const [taskForm, setTaskForm] = useState({ name: "", description: "", priority: "medium", due_date: "", visible_to_client: false });
  const [docForm, setDocForm] = useState({ name: "", file_url: "", category: "other", visible_to_client: true });
  const [updateForm, setUpdateForm] = useState({ title: "", summary: "", what_was_done: "", current_status: "", next_steps: "", client_action_needed: "", status: "draft" });

  const fetchProject = async () => {
    if (!id) return;
    const [projRes, compRes] = await Promise.all([
      supabase.from("projects").select("*, companies(name)").eq("id", id).single(),
      supabase.from("companies").select("id, name").order("name"),
    ]);
    if (projRes.data) {
      setProject(projRes.data);
      setEditForm({
        name: projRes.data.name,
        description: projRes.data.description || "",
        status: projRes.data.status,
        priority: projRes.data.priority,
        progress: projRes.data.progress,
        service_type: projRes.data.service_type,
        start_date: projRes.data.start_date || "",
        estimated_end_date: projRes.data.estimated_end_date || "",
        company_id: projRes.data.company_id,
        visible_to_client: projRes.data.visible_to_client,
      });
    }
    setCompanies(compRes.data || []);
  };

  const fetchRelated = async () => {
    if (!id) return;
    const [phasesRes, msRes, tasksRes, filesRes, updRes, convRes] = await Promise.all([
      supabase.from("project_phases").select("*").eq("project_id", id).order("sort_order"),
      supabase.from("milestones").select("*").eq("project_id", id).order("due_date"),
      supabase.from("tasks").select("*").eq("project_id", id).order("created_at", { ascending: false }),
      supabase.from("files").select("*").eq("project_id", id).order("created_at", { ascending: false }),
      supabase.from("project_updates").select("*").eq("project_id", id).order("created_at", { ascending: false }),
      supabase.from("conversations").select("*, companies(name)").eq("project_id", id).order("updated_at", { ascending: false }),
    ]);
    setPhases(phasesRes.data || []);
    setMilestones(msRes.data || []);
    setTasks(tasksRes.data || []);
    setFiles(filesRes.data || []);
    setUpdates(updRes.data || []);
    setConversations(convRes.data || []);
  };

  useEffect(() => { fetchProject(); fetchRelated(); }, [id]);

  // Save project
  const saveProject = async () => {
    const { error } = await supabase.from("projects").update({
      ...editForm,
      start_date: editForm.start_date || null,
      estimated_end_date: editForm.estimated_end_date || null,
      progress: parseInt(editForm.progress) || 0,
    }).eq("id", id);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Proyecto actualizado" });
    fetchProject();
  };

  // Create handlers
  const createPhase = async () => {
    if (!phaseForm.name.trim()) return;
    const { error } = await supabase.from("project_phases").insert({ ...phaseForm, project_id: id, sort_order: parseInt(phaseForm.sort_order) || 0 });
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Fase creada" });
    setPhaseForm({ name: "", description: "", sort_order: "0" });
    setShowCreatePhase(false);
    fetchRelated();
  };

  const createMilestone = async () => {
    if (!milestoneForm.name.trim()) return;
    const { error } = await supabase.from("milestones").insert({ ...milestoneForm, project_id: id, due_date: milestoneForm.due_date || null });
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Hito creado" });
    setMilestoneForm({ name: "", description: "", due_date: "" });
    setShowCreateMilestone(false);
    fetchRelated();
  };

  const createTask = async () => {
    if (!taskForm.name.trim()) return;
    const { error } = await supabase.from("tasks").insert({ ...taskForm, project_id: id, due_date: taskForm.due_date || null });
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Tarea creada" });
    setTaskForm({ name: "", description: "", priority: "medium", due_date: "", visible_to_client: false });
    setShowCreateTask(false);
    fetchRelated();
  };

  const createDoc = async () => {
    if (!docForm.name.trim()) return;
    const { error } = await supabase.from("files").insert({ ...docForm, project_id: id, company_id: project?.company_id, uploaded_by: user?.id });
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Documento registrado" });
    setDocForm({ name: "", file_url: "", category: "other", visible_to_client: true });
    setShowCreateDoc(false);
    fetchRelated();
  };

  const createUpdate = async () => {
    if (!updateForm.title.trim()) return;
    const { error } = await supabase.from("project_updates").insert({
      ...updateForm, project_id: id, author_id: user?.id,
      published_at: updateForm.status === "published" ? new Date().toISOString() : null,
    });
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: updateForm.status === "published" ? "Publicada" : "Borrador guardado" });
    setUpdateForm({ title: "", summary: "", what_was_done: "", current_status: "", next_steps: "", client_action_needed: "", status: "draft" });
    setShowCreateUpdate(false);
    fetchRelated();
  };

  // Status updaters
  const updateTaskStatus = async (taskId: string, status: string) => {
    await supabase.from("tasks").update({ status, completed_at: status === "done" ? new Date().toISOString() : null }).eq("id", taskId);
    fetchRelated();
  };

  const updatePhaseStatus = async (phaseId: string, status: string) => {
    await supabase.from("project_phases").update({ status }).eq("id", phaseId);
    fetchRelated();
  };

  const updateMilestoneStatus = async (msId: string, status: string) => {
    await supabase.from("milestones").update({ status, completed_at: status === "completed" ? new Date().toISOString() : null }).eq("id", msId);
    fetchRelated();
  };

  const publishUpdate = async (upId: string) => {
    await supabase.from("project_updates").update({ status: "published", published_at: new Date().toISOString() }).eq("id", upId);
    fetchRelated();
  };

  // Messages
  const markAsRead = async (convId: string) => {
    if (!user) return;
    await supabase.from("message_reads").upsert(
      { user_id: user.id, conversation_id: convId, last_read_at: new Date().toISOString() },
      { onConflict: "user_id,conversation_id" }
    );
  };

  const selectConversation = async (conv: any) => {
    setSelectedConv(conv);
    const { data: msgs } = await supabase.from("messages").select("*").eq("conversation_id", conv.id).order("created_at");
    if (msgs && msgs.length > 0) {
      const senderIds = [...new Set(msgs.map(m => m.sender_id))];
      const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", senderIds);
      const profileMap = Object.fromEntries((profiles || []).map(p => [p.id, p.full_name]));
      setMessages(msgs.map(m => ({ ...m, sender_name: profileMap[m.sender_id] || "Usuario" })));
    } else {
      setMessages([]);
    }
    await markAsRead(conv.id);
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !selectedConv || !user) return;
    await supabase.from("messages").insert({ conversation_id: selectedConv.id, sender_id: user.id, content: newMessage });
    await supabase.from("conversations").update({ status: "replied", updated_at: new Date().toISOString() }).eq("id", selectedConv.id);
    setNewMessage("");
    selectConversation(selectedConv);
    fetchRelated();
  };

  if (!project) return (
    <PortalLayout type="admin">
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    </PortalLayout>
  );

  return (
    <PortalLayout type="admin">
      <div className="mb-6">
        <Button variant="ghost" onClick={() => navigate("/admin/projects")} className="text-muted-foreground hover:text-foreground mb-4">
          <ArrowLeft className="w-4 h-4 mr-2" /> Volver a proyectos
        </Button>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">{project.name}</h1>
            <p className="text-sm text-muted-foreground">{(project as any).companies?.name} · {project.service_type}</p>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={project.priority} />
            <StatusBadge status={project.status} />
          </div>
        </div>
        <div className="flex items-center gap-4 mt-3">
          <Progress value={project.progress} className="flex-1 h-2 bg-secondary/50 max-w-xs" />
          <span className="text-sm font-semibold text-foreground">{project.progress}%</span>
        </div>
      </div>

      <Tabs defaultValue="info" className="space-y-6">
        <TabsList className="bg-secondary/30 border border-border/30 flex-wrap h-auto gap-1 p-1">
          <TabsTrigger value="info" className="text-xs">Información</TabsTrigger>
          <TabsTrigger value="phases" className="text-xs">Fases ({phases.length})</TabsTrigger>
          <TabsTrigger value="milestones" className="text-xs">Hitos ({milestones.length})</TabsTrigger>
          <TabsTrigger value="tasks" className="text-xs">Tareas ({tasks.length})</TabsTrigger>
          <TabsTrigger value="documents" className="text-xs">Documentos ({files.length})</TabsTrigger>
          <TabsTrigger value="updates" className="text-xs">Actualizaciones ({updates.length})</TabsTrigger>
          <TabsTrigger value="messages" className="text-xs">Mensajes ({conversations.length})</TabsTrigger>
        </TabsList>

        {/* INFO / EDIT */}
        <TabsContent value="info">
          <div className="glass-card p-6 space-y-4 max-w-2xl">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div><Label>Nombre</Label><Input value={editForm.name || ""} onChange={e => setEditForm({ ...editForm, name: e.target.value })} className="bg-secondary/50 border-border/50 mt-1" /></div>
              <div><Label>Cliente</Label>
                <Select value={editForm.company_id || ""} onValueChange={v => setEditForm({ ...editForm, company_id: v })}>
                  <SelectTrigger className="bg-secondary/50 border-border/50 mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{companies.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Estado</Label>
                <Select value={editForm.status || ""} onValueChange={v => setEditForm({ ...editForm, status: v })}>
                  <SelectTrigger className="bg-secondary/50 border-border/50 mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{statusOptions.map(s => <SelectItem key={s} value={s}><StatusBadge status={s} /></SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Prioridad</Label>
                <Select value={editForm.priority || ""} onValueChange={v => setEditForm({ ...editForm, priority: v })}>
                  <SelectTrigger className="bg-secondary/50 border-border/50 mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{priorityOptions.map(p => <SelectItem key={p} value={p}><StatusBadge status={p} /></SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Tipo de servicio</Label><Input value={editForm.service_type || ""} onChange={e => setEditForm({ ...editForm, service_type: e.target.value })} className="bg-secondary/50 border-border/50 mt-1" /></div>
              <div><Label>Progreso (%)</Label><Input type="number" min={0} max={100} value={editForm.progress ?? 0} onChange={e => setEditForm({ ...editForm, progress: e.target.value })} className="bg-secondary/50 border-border/50 mt-1" /></div>
              <div><Label>Fecha inicio</Label><Input type="date" value={editForm.start_date || ""} onChange={e => setEditForm({ ...editForm, start_date: e.target.value })} className="bg-secondary/50 border-border/50 mt-1" /></div>
              <div><Label>Fecha entrega</Label><Input type="date" value={editForm.estimated_end_date || ""} onChange={e => setEditForm({ ...editForm, estimated_end_date: e.target.value })} className="bg-secondary/50 border-border/50 mt-1" /></div>
            </div>
            <div><Label>Descripción</Label><Textarea value={editForm.description || ""} onChange={e => setEditForm({ ...editForm, description: e.target.value })} className="bg-secondary/50 border-border/50 mt-1" rows={3} /></div>
            <div className="flex items-center gap-2">
              <Checkbox checked={editForm.visible_to_client ?? true} onCheckedChange={v => setEditForm({ ...editForm, visible_to_client: !!v })} />
              <Label className="text-sm">Visible para el cliente</Label>
            </div>
            <Button onClick={saveProject} className="bg-accent text-accent-foreground hover:bg-accent/90 rounded-xl">
              <Save className="w-4 h-4 mr-2" /> Guardar cambios
            </Button>
          </div>
        </TabsContent>

        {/* PHASES */}
        <TabsContent value="phases">
          <div className="flex justify-end mb-4">
            <Dialog open={showCreatePhase} onOpenChange={setShowCreatePhase}>
              <DialogTrigger asChild><Button className="bg-accent text-accent-foreground hover:bg-accent/90 rounded-xl text-sm"><Plus className="w-4 h-4 mr-2" />Nueva fase</Button></DialogTrigger>
              <DialogContent className="glass-card border-border/30 bg-card">
                <DialogHeader><DialogTitle className="text-foreground">Crear fase</DialogTitle></DialogHeader>
                <div className="space-y-4 mt-4">
                  <div><Label>Nombre *</Label><Input value={phaseForm.name} onChange={e => setPhaseForm({ ...phaseForm, name: e.target.value })} className="bg-secondary/50 border-border/50 mt-1" /></div>
                  <div><Label>Descripción</Label><Input value={phaseForm.description} onChange={e => setPhaseForm({ ...phaseForm, description: e.target.value })} className="bg-secondary/50 border-border/50 mt-1" /></div>
                  <div><Label>Orden</Label><Input type="number" value={phaseForm.sort_order} onChange={e => setPhaseForm({ ...phaseForm, sort_order: e.target.value })} className="bg-secondary/50 border-border/50 mt-1" /></div>
                  <Button onClick={createPhase} className="w-full bg-accent text-accent-foreground hover:bg-accent/90 rounded-xl">Crear</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
          <div className="space-y-3">
            {phases.map(p => (
              <div key={p.id} className="glass-card p-5 flex items-center justify-between gap-3">
                <div>
                  <h4 className="font-semibold text-foreground text-sm">{p.name}</h4>
                  {p.description && <p className="text-xs text-muted-foreground mt-0.5">{p.description}</p>}
                  <p className="text-xs text-muted-foreground">Orden: {p.sort_order}</p>
                </div>
                <Select value={p.status} onValueChange={v => updatePhaseStatus(p.id, v)}>
                  <SelectTrigger className="w-[140px] h-8 text-xs bg-secondary/50 border-border/50"><SelectValue /></SelectTrigger>
                  <SelectContent>{phaseStatuses.map(s => <SelectItem key={s} value={s}><StatusBadge status={s} /></SelectItem>)}</SelectContent>
                </Select>
              </div>
            ))}
            {phases.length === 0 && <div className="glass-card p-8 text-center"><p className="text-muted-foreground text-sm">Sin fases creadas.</p></div>}
          </div>
        </TabsContent>

        {/* MILESTONES */}
        <TabsContent value="milestones">
          <div className="flex justify-end mb-4">
            <Dialog open={showCreateMilestone} onOpenChange={setShowCreateMilestone}>
              <DialogTrigger asChild><Button className="bg-accent text-accent-foreground hover:bg-accent/90 rounded-xl text-sm"><Plus className="w-4 h-4 mr-2" />Nuevo hito</Button></DialogTrigger>
              <DialogContent className="glass-card border-border/30 bg-card">
                <DialogHeader><DialogTitle className="text-foreground">Crear hito</DialogTitle></DialogHeader>
                <div className="space-y-4 mt-4">
                  <div><Label>Nombre *</Label><Input value={milestoneForm.name} onChange={e => setMilestoneForm({ ...milestoneForm, name: e.target.value })} className="bg-secondary/50 border-border/50 mt-1" /></div>
                  <div><Label>Descripción</Label><Input value={milestoneForm.description} onChange={e => setMilestoneForm({ ...milestoneForm, description: e.target.value })} className="bg-secondary/50 border-border/50 mt-1" /></div>
                  <div><Label>Fecha prevista</Label><Input type="date" value={milestoneForm.due_date} onChange={e => setMilestoneForm({ ...milestoneForm, due_date: e.target.value })} className="bg-secondary/50 border-border/50 mt-1" /></div>
                  <Button onClick={createMilestone} className="w-full bg-accent text-accent-foreground hover:bg-accent/90 rounded-xl">Crear</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
          <div className="space-y-3">
            {milestones.map(m => (
              <div key={m.id} className="glass-card p-5 flex items-center justify-between gap-3">
                <div>
                  <h4 className="font-semibold text-foreground text-sm">{m.name}</h4>
                  {m.description && <p className="text-xs text-muted-foreground mt-0.5">{m.description}</p>}
                  <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
                    {m.due_date && <span>Previsto: {format(new Date(m.due_date), "d MMM yyyy", { locale: es })}</span>}
                    {m.completed_at && <span>Completado: {format(new Date(m.completed_at), "d MMM yyyy", { locale: es })}</span>}
                  </div>
                </div>
                <Select value={m.status} onValueChange={v => updateMilestoneStatus(m.id, v)}>
                  <SelectTrigger className="w-[140px] h-8 text-xs bg-secondary/50 border-border/50"><SelectValue /></SelectTrigger>
                  <SelectContent>{milestoneStatuses.map(s => <SelectItem key={s} value={s}><StatusBadge status={s} /></SelectItem>)}</SelectContent>
                </Select>
              </div>
            ))}
            {milestones.length === 0 && <div className="glass-card p-8 text-center"><p className="text-muted-foreground text-sm">Sin hitos creados.</p></div>}
          </div>
        </TabsContent>

        {/* TASKS */}
        <TabsContent value="tasks">
          <div className="flex justify-end mb-4">
            <Dialog open={showCreateTask} onOpenChange={setShowCreateTask}>
              <DialogTrigger asChild><Button className="bg-accent text-accent-foreground hover:bg-accent/90 rounded-xl text-sm"><Plus className="w-4 h-4 mr-2" />Nueva tarea</Button></DialogTrigger>
              <DialogContent className="glass-card border-border/30 bg-card">
                <DialogHeader><DialogTitle className="text-foreground">Crear tarea</DialogTitle></DialogHeader>
                <div className="space-y-4 mt-4">
                  <div><Label>Nombre *</Label><Input value={taskForm.name} onChange={e => setTaskForm({ ...taskForm, name: e.target.value })} className="bg-secondary/50 border-border/50 mt-1" /></div>
                  <div><Label>Descripción</Label><Input value={taskForm.description} onChange={e => setTaskForm({ ...taskForm, description: e.target.value })} className="bg-secondary/50 border-border/50 mt-1" /></div>
                  <div className="grid grid-cols-2 gap-4">
                    <div><Label>Prioridad</Label>
                      <Select value={taskForm.priority} onValueChange={v => setTaskForm({ ...taskForm, priority: v })}>
                        <SelectTrigger className="bg-secondary/50 border-border/50 mt-1"><SelectValue /></SelectTrigger>
                        <SelectContent>{priorityOptions.map(p => <SelectItem key={p} value={p}><StatusBadge status={p} /></SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div><Label>Fecha límite</Label><Input type="date" value={taskForm.due_date} onChange={e => setTaskForm({ ...taskForm, due_date: e.target.value })} className="bg-secondary/50 border-border/50 mt-1" /></div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox checked={taskForm.visible_to_client} onCheckedChange={v => setTaskForm({ ...taskForm, visible_to_client: !!v })} />
                    <Label className="text-sm">Visible para el cliente</Label>
                  </div>
                  <Button onClick={createTask} className="w-full bg-accent text-accent-foreground hover:bg-accent/90 rounded-xl">Crear</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
          <div className="space-y-3">
            {tasks.map(t => (
              <div key={t.id} className="glass-card p-5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="font-semibold text-foreground text-sm">{t.name}</h4>
                    {t.visible_to_client && <span className="text-[9px] bg-accent/20 text-accent px-1.5 py-0.5 rounded-full font-bold">VISIBLE</span>}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t.due_date && format(new Date(t.due_date), "d MMM", { locale: es })}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={t.priority} />
                  <Select value={t.status} onValueChange={v => updateTaskStatus(t.id, v)}>
                    <SelectTrigger className="w-[140px] h-8 text-xs bg-secondary/50 border-border/50"><SelectValue /></SelectTrigger>
                    <SelectContent>{taskStatuses.map(s => <SelectItem key={s} value={s}><StatusBadge status={s} /></SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
            ))}
            {tasks.length === 0 && <div className="glass-card p-8 text-center"><p className="text-muted-foreground text-sm">Sin tareas creadas.</p></div>}
          </div>
        </TabsContent>

        {/* DOCUMENTS */}
        <TabsContent value="documents">
          <div className="flex justify-end mb-4">
            <Dialog open={showCreateDoc} onOpenChange={setShowCreateDoc}>
              <DialogTrigger asChild><Button className="bg-accent text-accent-foreground hover:bg-accent/90 rounded-xl text-sm"><Plus className="w-4 h-4 mr-2" />Nuevo documento</Button></DialogTrigger>
              <DialogContent className="glass-card border-border/30 bg-card">
                <DialogHeader><DialogTitle className="text-foreground">Registrar documento</DialogTitle></DialogHeader>
                <div className="space-y-4 mt-4">
                  <div><Label>Nombre *</Label><Input value={docForm.name} onChange={e => setDocForm({ ...docForm, name: e.target.value })} className="bg-secondary/50 border-border/50 mt-1" /></div>
                  <div><Label>URL del archivo</Label><Input value={docForm.file_url} onChange={e => setDocForm({ ...docForm, file_url: e.target.value })} placeholder="https://..." className="bg-secondary/50 border-border/50 mt-1" /></div>
                  <div><Label>Categoría</Label>
                    <Select value={docForm.category} onValueChange={v => setDocForm({ ...docForm, category: v })}>
                      <SelectTrigger className="bg-secondary/50 border-border/50 mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>{Object.entries(categoryLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox checked={docForm.visible_to_client} onCheckedChange={v => setDocForm({ ...docForm, visible_to_client: !!v })} />
                    <Label className="text-sm">Visible para el cliente</Label>
                  </div>
                  <Button onClick={createDoc} className="w-full bg-accent text-accent-foreground hover:bg-accent/90 rounded-xl">Registrar</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
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
                    <p className="text-xs text-muted-foreground">{categoryLabels[f.category] || f.category} · v{f.version} · {format(new Date(f.created_at), "d MMM yyyy", { locale: es })}</p>
                  </div>
                </div>
                {f.file_url && (
                  <Button variant="ghost" size="icon" asChild className="shrink-0">
                    <a href={f.file_url} target="_blank" rel="noreferrer"><FileText className="w-4 h-4" /></a>
                  </Button>
                )}
              </div>
            ))}
            {files.length === 0 && <div className="glass-card p-8 text-center"><p className="text-muted-foreground text-sm">Sin documentos.</p></div>}
          </div>
        </TabsContent>

        {/* UPDATES */}
        <TabsContent value="updates">
          <div className="flex justify-end mb-4">
            <Dialog open={showCreateUpdate} onOpenChange={setShowCreateUpdate}>
              <DialogTrigger asChild><Button className="bg-accent text-accent-foreground hover:bg-accent/90 rounded-xl text-sm"><Plus className="w-4 h-4 mr-2" />Nueva actualización</Button></DialogTrigger>
              <DialogContent className="glass-card border-border/30 bg-card max-w-2xl max-h-[85vh] overflow-y-auto">
                <DialogHeader><DialogTitle className="text-foreground">Crear actualización</DialogTitle></DialogHeader>
                <div className="space-y-4 mt-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div><Label>Título *</Label><Input value={updateForm.title} onChange={e => setUpdateForm({ ...updateForm, title: e.target.value })} className="bg-secondary/50 border-border/50 mt-1" /></div>
                    <div><Label>Estado</Label>
                      <Select value={updateForm.status} onValueChange={v => setUpdateForm({ ...updateForm, status: v })}>
                        <SelectTrigger className="bg-secondary/50 border-border/50 mt-1"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="draft">Borrador</SelectItem>
                          <SelectItem value="published">Publicar ahora</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div><Label>Resumen</Label><Textarea value={updateForm.summary} onChange={e => setUpdateForm({ ...updateForm, summary: e.target.value })} className="bg-secondary/50 border-border/50 mt-1" rows={2} /></div>
                  <div><Label>Qué se ha hecho</Label><Textarea value={updateForm.what_was_done} onChange={e => setUpdateForm({ ...updateForm, what_was_done: e.target.value })} className="bg-secondary/50 border-border/50 mt-1" rows={2} /></div>
                  <div><Label>En qué estamos</Label><Textarea value={updateForm.current_status} onChange={e => setUpdateForm({ ...updateForm, current_status: e.target.value })} className="bg-secondary/50 border-border/50 mt-1" rows={2} /></div>
                  <div><Label>Qué viene después</Label><Textarea value={updateForm.next_steps} onChange={e => setUpdateForm({ ...updateForm, next_steps: e.target.value })} className="bg-secondary/50 border-border/50 mt-1" rows={2} /></div>
                  <div><Label>Qué necesitamos del cliente</Label><Textarea value={updateForm.client_action_needed} onChange={e => setUpdateForm({ ...updateForm, client_action_needed: e.target.value })} className="bg-secondary/50 border-border/50 mt-1" rows={2} /></div>
                  <Button onClick={createUpdate} className="w-full bg-accent text-accent-foreground hover:bg-accent/90 rounded-xl">
                    {updateForm.status === "published" ? "Publicar" : "Guardar borrador"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
          <div className="space-y-4">
            {updates.map(u => (
              <div key={u.id} className="glass-card p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h4 className="font-semibold text-foreground">{u.title}</h4>
                    <p className="text-xs text-muted-foreground">{u.created_at ? format(new Date(u.created_at), "d MMM yyyy", { locale: es }) : ""}</p>
                    {u.summary && <p className="text-sm text-muted-foreground mt-2 line-clamp-2">{u.summary}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={u.status} />
                    {u.status === "draft" && (
                      <Button variant="outline" size="sm" onClick={() => publishUpdate(u.id)} className="text-xs rounded-lg">Publicar</Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {updates.length === 0 && <div className="glass-card p-8 text-center"><p className="text-muted-foreground text-sm">Sin actualizaciones.</p></div>}
          </div>
        </TabsContent>

        {/* MESSAGES */}
        <TabsContent value="messages">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 min-h-[400px]">
            <div className="space-y-2">
              {conversations.map(c => (
                <button key={c.id} onClick={() => selectConversation(c)}
                  className={`w-full text-left glass-card p-4 transition-all ${selectedConv?.id === c.id ? "border-primary/30" : ""}`}>
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="font-semibold text-foreground text-sm truncate">{c.subject}</h4>
                    <StatusBadge status={c.status} />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{format(new Date(c.updated_at), "d MMM", { locale: es })}</p>
                </button>
              ))}
              {conversations.length === 0 && <div className="glass-card p-6 text-center"><p className="text-muted-foreground text-sm">Sin conversaciones vinculadas.</p></div>}
            </div>
            <div className="lg:col-span-2 glass-card flex flex-col">
              {selectedConv ? (
                <>
                  <div className="p-4 border-b border-border/30">
                    <h3 className="font-semibold text-foreground">{selectedConv.subject}</h3>
                  </div>
                  <div className="flex-1 overflow-y-auto p-4 space-y-3 max-h-[350px]">
                    {messages.map(m => (
                      <div key={m.id} className={`flex ${m.sender_id === user?.id ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm ${m.sender_id === user?.id ? "bg-primary/20 text-foreground" : "bg-secondary/50 text-foreground"}`}>
                          <p className="text-[10px] font-semibold text-muted-foreground mb-1">{m.sender_name || "Usuario"}</p>
                          <p>{m.content}</p>
                          <p className="text-[10px] text-muted-foreground mt-1">{format(new Date(m.created_at), "d MMM, HH:mm", { locale: es })}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="p-4 border-t border-border/30 flex gap-2">
                    <Input placeholder="Responder..." value={newMessage} onChange={e => setNewMessage(e.target.value)} onKeyDown={e => e.key === "Enter" && sendMessage()} className="bg-secondary/50 border-border/50" />
                    <Button onClick={sendMessage} size="icon" className="bg-accent text-accent-foreground hover:bg-accent/90 rounded-xl shrink-0"><Send className="w-4 h-4" /></Button>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center p-8">
                  <p className="text-sm text-muted-foreground">Selecciona una conversación</p>
                </div>
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </PortalLayout>
  );
};

export default AdminProjectDetail;
