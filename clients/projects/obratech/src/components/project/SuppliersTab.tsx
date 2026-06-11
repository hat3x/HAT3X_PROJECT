import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { GlassCard } from "@/components/ui-kit/GlassCard";
import { Truck, Plus, Search, X, ChevronRight, UserMinus } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SupplierWorksView } from "./SupplierWorksView";

interface Props {
  projectId: string;
  isAdmin: boolean;
}

export const SuppliersTab = ({ projectId, isAdmin }: Props) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showAssign, setShowAssign] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedSupplier, setSelectedSupplier] = useState<any>(null);

  const { data: members = [], isLoading } = useQuery({
    queryKey: ["project-suppliers", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_members")
        .select("*")
        .eq("project_id", projectId)
        .eq("member_role", "supplier");
      if (error) throw error;
      if (!data || data.length === 0) return [];

      const userIds = data.map((m) => m.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name, email, supplier_id")
        .in("user_id", userIds);

      // Count works per supplier
      const { data: works } = await supabase
        .from("supplier_works")
        .select("supplier_user_id, status")
        .eq("project_id", projectId)
        .in("supplier_user_id", userIds);

      const workMap = new Map<string, { total: number; review: number; done: number }>();
      (works || []).forEach((w) => {
        if (!workMap.has(w.supplier_user_id)) workMap.set(w.supplier_user_id, { total: 0, review: 0, done: 0 });
        const entry = workMap.get(w.supplier_user_id)!;
        entry.total++;
        if (w.status === "review") entry.review++;
        if (w.status === "completed") entry.done++;
      });

      const profileMap = new Map((profiles || []).map((p) => [p.user_id, p]));
      return data.map((m) => ({
        ...m,
        profile: profileMap.get(m.user_id) || null,
        workStats: workMap.get(m.user_id) || { total: 0, review: 0, done: 0 },
      }));
    },
  });

  const { data: allSuppliers = [] } = useQuery({
    queryKey: ["all-suppliers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, full_name, email, supplier_id")
        .eq("role", "supplier");
      if (error) throw error;
      return data;
    },
    enabled: isAdmin,
  });

  const assignSupplier = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.from("project_members").insert({
        project_id: projectId,
        user_id: userId,
        member_role: "supplier",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project-suppliers", projectId] });
      toast({ title: "Proveedor asignado" });
    },
    onError: (e: any) => {
      const msg = e.message?.includes("duplicate") ? "El proveedor ya está asignado" : e.message;
      toast({ title: "Error", description: msg, variant: "destructive" });
    },
  });

  const removeSupplier = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase
        .from("project_members")
        .delete()
        .eq("project_id", projectId)
        .eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project-suppliers", projectId] });
      toast({ title: "Proveedor desasignado" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const memberIds = new Set(members.map((m: any) => m.user_id));
  const availableSuppliers = allSuppliers.filter((s: any) => !memberIds.has(s.user_id));
  const filteredSuppliers = availableSuppliers.filter((s: any) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (s.full_name || "").toLowerCase().includes(q) ||
      (s.supplier_id || "").toLowerCase().includes(q)
    );
  });

  if (selectedSupplier) {
    return (
      <SupplierWorksView
        projectId={projectId}
        supplier={selectedSupplier}
        isAdmin={isAdmin}
        onBack={() => setSelectedSupplier(null)}
      />
    );
  }

  if (isLoading) {
    return <div className="flex justify-center py-10"><div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" /></div>;
  }

  return (
    <div className="space-y-3 animate-fade-in">
      {members.length === 0 ? (
        <GlassCard className="text-center py-8">
          <Truck className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
          <p className="text-muted-foreground">No hay proveedores asignados</p>
        </GlassCard>
      ) : (
        members.map((m: any) => (
          <GlassCard key={m.user_id} className="flex items-center gap-3 cursor-pointer" onClick={() => setSelectedSupplier(m)}>
            <div className="w-9 h-9 rounded-full bg-accent/20 flex items-center justify-center text-accent font-medium text-sm">
              {((m.profile?.full_name || m.profile?.supplier_id || "?")[0] || "?").toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">
                {m.profile?.full_name || m.profile?.supplier_id || "Sin nombre"}
              </p>
              <p className="text-xs text-muted-foreground">
                {m.profile?.supplier_id || "Proveedor"} · {m.workStats.total} trabajos
                {m.workStats.review > 0 && <span className="text-status-orange"> · {m.workStats.review} en revisión</span>}
              </p>
            </div>
            {isAdmin && (
              <button
                onClick={(e) => { e.stopPropagation(); removeSupplier.mutate(m.user_id); }}
                className="p-2 rounded-lg text-destructive hover:bg-destructive/10 transition-all"
                title="Quitar proveedor"
              >
                <UserMinus className="w-4 h-4" />
              </button>
            )}
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </GlassCard>
        ))
      )}

      {isAdmin && (
        <button
          onClick={() => { setShowAssign(true); setSearch(""); }}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-dashed border-glass-border text-muted-foreground hover:text-foreground hover:border-primary/50 transition-all"
        >
          <Plus className="w-4 h-4" /> Asignar proveedor
        </button>
      )}

      <Dialog open={showAssign} onOpenChange={(v) => !v && setShowAssign(false)}>
        <DialogContent className="glass-card border-glass-border bg-card/90 backdrop-blur-xl max-w-md max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="font-display text-lg">Asignar Proveedor</DialogTitle>
          </DialogHeader>
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nombre o ID..."
              className="glass-input w-full pl-10"
              autoFocus
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
            {filteredSuppliers.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                {availableSuppliers.length === 0 ? "Todos los proveedores ya están asignados" : "Sin resultados"}
              </p>
            ) : (
              filteredSuppliers.map((sup: any) => (
                <button
                  key={sup.user_id}
                  onClick={() => { assignSupplier.mutate(sup.user_id); setShowAssign(false); }}
                  className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-secondary/50 transition-all text-left"
                >
                  <div className="w-9 h-9 rounded-full bg-accent/20 flex items-center justify-center text-accent font-medium text-sm flex-shrink-0">
                    {((sup.full_name || sup.supplier_id || "?")[0] || "?").toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{sup.full_name || "Sin nombre"}</p>
                    <p className="text-xs text-muted-foreground">{sup.supplier_id || "Sin ID"}</p>
                  </div>
                </button>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
