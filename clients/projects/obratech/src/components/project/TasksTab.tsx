import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { GlassCard } from "@/components/ui-kit/GlassCard";
import { Plus, Loader2, CheckCircle2, Circle, Play } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

interface Props {
  projectId: string;
  tasks: any[];
  isAdmin: boolean;
  isEmployee?: boolean;
}

const statusIcon: Record<string, React.ReactNode> = {
  todo: <Circle className="w-4 h-4 text-muted-foreground" />,
  doing: <Play className="w-4 h-4 text-status-orange" />,
  done: <CheckCircle2 className="w-4 h-4 text-status-green" />,
};

const statusLabel: Record<string, string> = { todo: "Pendiente", doing: "En curso", done: "Hecha" };

export const TasksTab = ({ projectId, tasks, isAdmin, isEmployee }: Props) => {
  const { session } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");

  const addTask = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("tasks").insert({
        project_id: projectId,
        title: title.trim(),
        description: desc.trim() || null,
        created_by: session?.user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project-tasks", projectId] });
      setTitle("");
      setDesc("");
      setShowAdd(false);
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateStatus = useMutation({
    mutationFn: async ({ taskId, status }: { taskId: string; status: string }) => {
      const { error } = await supabase.from("tasks").update({ status }).eq("id", taskId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["project-tasks", projectId] }),
  });

  const deleteTask = useMutation({
    mutationFn: async (taskId: string) => {
      const { error } = await supabase.from("tasks").delete().eq("id", taskId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["project-tasks", projectId] }),
  });

  const nextStatus = (s: string) => (s === "todo" ? "doing" : s === "doing" ? "done" : "todo");

  return (
    <div className="space-y-3 animate-fade-in">
      {tasks.length === 0 && !showAdd && (
        <GlassCard className="text-center py-8">
          <p className="text-muted-foreground">No hay tareas aún</p>
        </GlassCard>
      )}

      {tasks.map((t) => (
        <GlassCard key={t.id} className="flex items-start gap-3">
          <button
            onClick={() => updateStatus.mutate({ taskId: t.id, status: nextStatus(t.status) })}
            className="mt-0.5 flex-shrink-0"
          >
            {statusIcon[t.status]}
          </button>
          <div className="flex-1 min-w-0">
            <p className={`text-sm font-medium ${t.status === "done" ? "line-through text-muted-foreground" : "text-foreground"}`}>
              {t.title}
            </p>
            {t.description && <p className="text-xs text-muted-foreground mt-0.5">{t.description}</p>}
            <span className="text-xs text-muted-foreground">{statusLabel[t.status]}</span>
          </div>
          {(isAdmin || isEmployee) && (
            <button onClick={() => deleteTask.mutate(t.id)} className="text-xs text-destructive hover:underline flex-shrink-0">
              Borrar
            </button>
          )}
        </GlassCard>
      ))}

      {showAdd && (
        <GlassCard>
          <form onSubmit={(e) => { e.preventDefault(); addTask.mutate(); }} className="space-y-3">
            <input value={title} onChange={(e) => setTitle(e.target.value)} className="glass-input w-full" placeholder="Título de la tarea" required />
            <input value={desc} onChange={(e) => setDesc(e.target.value)} className="glass-input w-full" placeholder="Descripción (opcional)" />
            <div className="flex gap-2">
              <button type="submit" disabled={addTask.isPending} className="glass-button text-sm py-2 flex items-center gap-1">
                {addTask.isPending && <Loader2 className="w-3 h-3 animate-spin" />} Crear
              </button>
              <button type="button" onClick={() => setShowAdd(false)} className="px-4 py-2 rounded-xl text-sm text-muted-foreground hover:text-foreground">
                Cancelar
              </button>
            </div>
          </form>
        </GlassCard>
      )}

      {(isAdmin || isEmployee) && !showAdd && (
        <button
          onClick={() => setShowAdd(true)}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-dashed border-glass-border text-muted-foreground hover:text-foreground hover:border-primary/50 transition-all"
        >
          <Plus className="w-4 h-4" /> Añadir tarea
        </button>
      )}
    </div>
  );
};
