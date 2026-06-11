import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { GlassCard } from "@/components/ui-kit/GlassCard";
import { Users, Plus, Search, X, Loader2, UserMinus } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface Props {
  projectId: string;
  isAdmin: boolean;
}

export const TeamTab = ({ projectId, isAdmin }: Props) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showAssign, setShowAssign] = useState(false);
  const [search, setSearch] = useState("");

  // Fetch member rows, then fetch their profiles and time entries
  const { data: members = [], isLoading } = useQuery({
    queryKey: ["project-members", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_members")
        .select("*")
        .eq("project_id", projectId);
      if (error) throw error;
      if (!data || data.length === 0) return [];

      const userIds = data.map((m) => m.user_id);
      const { data: profiles, error: profErr } = await supabase
        .from("profiles")
        .select("user_id, full_name, email, employee_id")
        .in("user_id", userIds);
      if (profErr) throw profErr;

      // Fetch time entries for this project to calculate hours
      let hoursMap = new Map<string, number>();
      if (isAdmin) {
        const { data: timeEntries } = await supabase
          .from("time_entries")
          .select("user_id, clock_in, clock_out")
          .eq("project_id", projectId)
          .in("user_id", userIds);
        if (timeEntries) {
          for (const te of timeEntries) {
            const start = new Date(te.clock_in).getTime();
            const end = te.clock_out ? new Date(te.clock_out).getTime() : Date.now();
            const minutes = (end - start) / 1000 / 60;
            hoursMap.set(te.user_id, (hoursMap.get(te.user_id) || 0) + minutes);
          }
        }
      }

      const profileMap = new Map((profiles || []).map((p) => [p.user_id, p]));
      return data.map((m) => ({
        ...m,
        profile: profileMap.get(m.user_id) || null,
        totalMinutes: hoursMap.get(m.user_id) || 0,
      }));
    },
  });

  // All employees for assignment dialog
  const { data: allEmployees = [] } = useQuery({
    queryKey: ["all-employees"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, full_name, email, employee_id")
        .eq("role", "employee");
      if (error) throw error;
      return data;
    },
    enabled: isAdmin,
  });

  const assignMember = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.from("project_members").insert({
        project_id: projectId,
        user_id: userId,
        member_role: "worker",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project-members", projectId] });
      toast({ title: "Empleado asignado" });
    },
    onError: (e: any) => {
      const msg = e.message?.includes("duplicate") ? "El empleado ya está asignado" : e.message;
      toast({ title: "Error", description: msg, variant: "destructive" });
    },
  });

  const removeMember = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase
        .from("project_members")
        .delete()
        .eq("project_id", projectId)
        .eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project-members", projectId] });
      toast({ title: "Empleado desasignado" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const memberIds = new Set(members.map((m: any) => m.user_id));
  const availableEmployees = allEmployees.filter((e: any) => !memberIds.has(e.user_id));
  const filteredEmployees = availableEmployees.filter((e: any) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (e.full_name || "").toLowerCase().includes(q) ||
      (e.employee_id || "").toLowerCase().includes(q)
    );
  });

  if (isLoading) {
    return <div className="flex justify-center py-10"><div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" /></div>;
  }

  return (
    <div className="space-y-3 animate-fade-in">
      {members.length === 0 ? (
        <GlassCard className="text-center py-8">
          <Users className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
          <p className="text-muted-foreground">No hay miembros asignados</p>
        </GlassCard>
      ) : (
        members.map((m: any) => {
          const h = Math.floor(m.totalMinutes / 60);
          const min = Math.round(m.totalMinutes % 60);
          return (
            <GlassCard key={m.user_id} className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center text-primary font-medium text-sm">
                {((m.profile?.full_name || m.profile?.employee_id || "?")[0] || "?").toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {m.profile?.full_name || m.profile?.employee_id || "Sin nombre"}
                </p>
                <p className="text-xs text-muted-foreground">{m.profile?.employee_id || m.member_role}</p>
              </div>
              {isAdmin && m.totalMinutes > 0 && (
                <span className="text-xs text-muted-foreground whitespace-nowrap">{h}h {min}m</span>
              )}
              {isAdmin && (
                <button
                  onClick={() => removeMember.mutate(m.user_id)}
                  className="p-2 rounded-lg text-destructive hover:bg-destructive/10 transition-all"
                  title="Quitar del equipo"
                >
                  <UserMinus className="w-4 h-4" />
                </button>
              )}
            </GlassCard>
          );
        })
      )}

      {isAdmin && (
        <button
          onClick={() => { setShowAssign(true); setSearch(""); }}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-dashed border-glass-border text-muted-foreground hover:text-foreground hover:border-primary/50 transition-all"
        >
          <Plus className="w-4 h-4" /> Asignar empleado
        </button>
      )}

      {/* Assign dialog */}
      <Dialog open={showAssign} onOpenChange={(v) => !v && setShowAssign(false)}>
        <DialogContent className="glass-card border-glass-border bg-card/90 backdrop-blur-xl max-w-md max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="font-display text-lg">Asignar Empleado</DialogTitle>
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
            {filteredEmployees.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                {availableEmployees.length === 0 ? "Todos los empleados ya están asignados" : "Sin resultados"}
              </p>
            ) : (
              filteredEmployees.map((emp: any) => (
                <button
                  key={emp.user_id}
                  onClick={() => {
                    assignMember.mutate(emp.user_id);
                    setShowAssign(false);
                  }}
                  className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-secondary/50 transition-all text-left"
                >
                  <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center text-primary font-medium text-sm flex-shrink-0">
                    {((emp.full_name || emp.employee_id || "?")[0] || "?").toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {emp.full_name || "Sin nombre"}
                    </p>
                    <p className="text-xs text-muted-foreground">{emp.employee_id || "Sin ID"}</p>
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