import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { GlassCard } from "@/components/ui-kit/GlassCard";
import { Plus, Loader2, Package } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

interface Props {
  projectId: string;
}

const statusColors: Record<string, string> = {
  needed: "text-status-red",
  ordered: "text-status-orange",
  delivered: "text-status-green",
};

const statusLabels: Record<string, string> = {
  needed: "Necesario",
  ordered: "Pedido",
  delivered: "Entregado",
};

export const MaterialsTab = ({ projectId }: Props) => {
  const { session } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("");

  const { data: materials = [], isLoading } = useQuery({
    queryKey: ["project-materials", projectId],
    queryFn: async () => {
      const { data, error } = await supabase.from("materials").select("*").eq("project_id", projectId).order("created_at", { ascending: false }).order("id", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const addMaterial = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("materials").insert({
        project_id: projectId,
        name: name.trim(),
        quantity: quantity ? Number(quantity) : null,
        unit: unit.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project-materials", projectId] });
      // Create notification for admin
      supabase.from("notifications").insert({
        project_id: projectId,
        type: "material_added",
        title: "Nuevo material añadido",
        message: `Se ha añadido "${name.trim()}" a la lista de materiales`,
        created_by: session?.user?.id,
      }).then(() => {
        queryClient.invalidateQueries({ queryKey: ["notif-count"] });
        queryClient.invalidateQueries({ queryKey: ["total-unread-notifs"] });
      });
      setName(""); setQuantity(""); setUnit(""); setShowAdd(false);
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const cycleStatus = useMutation({
    mutationFn: async ({ id, current }: { id: string; current: string }) => {
      const next = current === "needed" ? "ordered" : current === "ordered" ? "delivered" : "needed";
      const { error } = await supabase.from("materials").update({ status: next }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["project-materials", projectId] }),
  });

  if (isLoading) {
    return <div className="flex justify-center py-10"><div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" /></div>;
  }

  return (
    <div className="space-y-3 animate-fade-in">
      {materials.length === 0 && !showAdd && (
        <GlassCard className="text-center py-8">
          <Package className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
          <p className="text-muted-foreground">No hay materiales</p>
        </GlassCard>
      )}

      {materials.map((m: any) => (
        <GlassCard key={m.id} className="flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground">{m.name}</p>
            <p className="text-xs text-muted-foreground">
              {m.quantity != null ? `${m.quantity} ${m.unit || ""}` : "Sin cantidad"}
            </p>
          </div>
          <button
            onClick={() => cycleStatus.mutate({ id: m.id, current: m.status })}
            className={`text-xs font-medium px-3 py-1 rounded-full ${statusColors[m.status]} bg-secondary/50 hover:bg-secondary transition-all`}
          >
            {statusLabels[m.status]}
          </button>
        </GlassCard>
      ))}

      {showAdd && (
        <GlassCard>
          <form onSubmit={(e) => { e.preventDefault(); addMaterial.mutate(); }} className="space-y-3">
            <input value={name} onChange={(e) => setName(e.target.value)} className="glass-input w-full" placeholder="Nombre del material" required />
            <div className="flex gap-2">
              <input value={quantity} onChange={(e) => setQuantity(e.target.value)} className="glass-input flex-1" placeholder="Cantidad" type="number" />
              <input value={unit} onChange={(e) => setUnit(e.target.value)} className="glass-input w-24" placeholder="Unidad" />
            </div>
            <div className="flex gap-2">
              <button type="submit" disabled={addMaterial.isPending} className="glass-button text-sm py-2 flex items-center gap-1">
                {addMaterial.isPending && <Loader2 className="w-3 h-3 animate-spin" />} Añadir
              </button>
              <button type="button" onClick={() => setShowAdd(false)} className="px-4 py-2 rounded-xl text-sm text-muted-foreground hover:text-foreground">
                Cancelar
              </button>
            </div>
          </form>
        </GlassCard>
      )}

      {!showAdd && (
        <button
          onClick={() => setShowAdd(true)}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-dashed border-glass-border text-muted-foreground hover:text-foreground hover:border-primary/50 transition-all"
        >
          <Plus className="w-4 h-4" /> Añadir material
        </button>
      )}
    </div>
  );
};
