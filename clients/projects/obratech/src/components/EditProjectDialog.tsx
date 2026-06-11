import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Trash2, Search, UserPlus, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

interface Props {
  project: any;
  open: boolean;
  onClose: () => void;
  onUpdated: () => void;
}

export const EditProjectDialog = ({ project, open, onClose, onUpdated }: Props) => {
  const { toast } = useToast();
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [status, setStatus] = useState("active");
  const [loading, setLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Client assignment
  const [clientSearch, setClientSearch] = useState("");
  const [clientResults, setClientResults] = useState<any[]>([]);
  const [assignedClient, setAssignedClient] = useState<any>(null);
  const [searchingClient, setSearchingClient] = useState(false);

  useEffect(() => {
    if (project && open) {
      setName(project.name || "");
      setAddress(project.address || "");
      setDueDate(project.dueDate ? project.dueDate.split("T")[0] : project.due_date ? project.due_date.split("T")[0] : "");
      setStatus(project.status || "active");
      setConfirmDelete(false);
      setClientSearch("");
      setClientResults([]);

      // Load assigned client
      if (project.client_id) {
        supabase
          .from("profiles")
          .select("user_id, full_name, client_id")
          .eq("user_id", project.client_id)
          .single()
          .then(({ data }) => setAssignedClient(data || null));
      } else {
        setAssignedClient(null);
      }
    }
  }, [project, open]);

  const searchClients = async (q: string) => {
    setClientSearch(q);
    if (q.length < 2) { setClientResults([]); return; }
    setSearchingClient(true);
    const { data } = await supabase
      .from("profiles")
      .select("user_id, full_name, client_id")
      .eq("role", "client")
      .or(`full_name.ilike.%${q}%,client_id.ilike.%${q}%`)
      .limit(5);
    setClientResults(data || []);
    setSearchingClient(false);
  };

  const assignClient = async (client: any) => {
    const { error } = await supabase.from("projects").update({ client_id: client.user_id }).eq("id", project.id);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    setAssignedClient(client);
    setClientSearch("");
    setClientResults([]);
    toast({ title: "Cliente asignado" });
  };

  const removeClient = async () => {
    const { error } = await supabase.from("projects").update({ client_id: null }).eq("id", project.id);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    setAssignedClient(null);
    toast({ title: "Cliente desvinculado" });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);

    const dueDateValue = dueDate
      ? new Date(dueDate + "T23:59:00").toISOString()
      : null;

    const { error } = await supabase.from("projects").update({
      name: name.trim(),
      address: address.trim() || null,
      due_date: dueDateValue,
      status,
    }).eq("id", project.id);

    setLoading(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Obra actualizada" });
      onUpdated();
    }
  };

  const handleDelete = async () => {
    setLoading(true);
    const { error } = await supabase.from("projects").delete().eq("id", project.id);
    setLoading(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Obra eliminada" });
      onUpdated();
    }
  };

  if (!project) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="glass-card border-glass-border bg-card/90 backdrop-blur-xl max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-lg">Editar Obra</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Nombre *</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className="glass-input w-full" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Dirección</label>
            <input value={address} onChange={(e) => setAddress(e.target.value)} className="glass-input w-full" />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Fecha de entrega</label>
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="glass-input w-full" />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Estado</label>
            <div className="flex gap-2">
              {(["active", "paused", "finished"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatus(s)}
                  className={`flex-1 py-2 rounded-xl text-xs font-medium transition-all ${
                    status === s
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary/50 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {s === "active" ? "Activa" : s === "paused" ? "Pausada" : "Finalizada"}
                </button>
              ))}
            </div>
          </div>
          <button type="submit" disabled={loading} className="glass-button w-full flex items-center justify-center gap-2 disabled:opacity-50">
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            Guardar Cambios
          </button>
        </form>

        {/* Client assignment - admin only */}
        {isAdmin && (
          <div className="border-t border-glass-border pt-4 mt-2 space-y-3">
            <label className="block text-sm font-medium text-foreground">Cliente asignado</label>
            {assignedClient ? (
              <div className="flex items-center justify-between p-3 rounded-xl bg-secondary/50">
                <div>
                  <p className="text-sm font-medium text-foreground">{assignedClient.full_name || "Sin nombre"}</p>
                  <p className="text-xs text-muted-foreground">{assignedClient.client_id}</p>
                </div>
                <button onClick={removeClient} className="p-1.5 rounded-lg text-destructive hover:bg-destructive/10 transition-all">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type="text"
                    value={clientSearch}
                    onChange={(e) => searchClients(e.target.value)}
                    placeholder="Buscar cliente por nombre o ID..."
                    className="glass-input w-full pl-10"
                  />
                </div>
                {clientResults.length > 0 && (
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {clientResults.map((c) => (
                      <button
                        key={c.user_id}
                        onClick={() => assignClient(c)}
                        className="w-full flex items-center gap-2 p-2 rounded-lg text-left hover:bg-secondary/50 transition-all"
                      >
                        <UserPlus className="w-4 h-4 text-primary" />
                        <div>
                          <p className="text-sm text-foreground">{c.full_name || "Sin nombre"}</p>
                          <p className="text-xs text-muted-foreground">{c.client_id}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <div className="border-t border-glass-border pt-4 mt-2">
          {!confirmDelete ? (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm text-destructive hover:bg-destructive/10 transition-all"
            >
              <Trash2 className="w-4 h-4" /> Eliminar obra
            </button>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-destructive text-center">¿Seguro que quieres eliminar esta obra?</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={loading}
                  className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-destructive text-destructive-foreground disabled:opacity-50"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Sí, eliminar"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="flex-1 py-2.5 rounded-xl text-sm text-muted-foreground hover:text-foreground bg-secondary/50"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
