import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { GlassCard } from "@/components/ui-kit/GlassCard";
import { Clock, Play, Square, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Props {
  projectId: string;
  isAdmin: boolean;
}

export const TimeTrackingTab = ({ projectId, isAdmin }: Props) => {
  const { session, profile } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isEmployee = profile?.role === "employee" || profile?.role === "supplier";

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ["time-entries", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("time_entries")
        .select("*")
        .eq("project_id", projectId)
        .order("clock_in", { ascending: false });
      if (error) throw error;

      // For admin, fetch profile info for all user_ids
      if (isAdmin && data && data.length > 0) {
        const userIds = [...new Set(data.map((e) => e.user_id))];
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, full_name, employee_id")
          .in("user_id", userIds);
        const profileMap = new Map((profiles || []).map((p) => [p.user_id, p]));
        return data.map((e) => ({ ...e, profile: profileMap.get(e.user_id) || null }));
      }
      return data.map((e) => ({ ...e, profile: null }));
    },
  });

  const openEntry = entries.find((e: any) => !e.clock_out && e.user_id === session?.user?.id);

  const clockIn = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("time_entries").insert({
        project_id: projectId,
        user_id: session?.user?.id!,
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["time-entries", projectId] }),
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const clockOut = useMutation({
    mutationFn: async () => {
      if (!openEntry) return;
      const { error } = await supabase
        .from("time_entries")
        .update({ clock_out: new Date().toISOString() })
        .eq("id", openEntry.id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["time-entries", projectId] }),
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const formatDuration = (clockIn: string, clockOut: string | null) => {
    const start = new Date(clockIn);
    const end = clockOut ? new Date(clockOut) : new Date();
    const diff = Math.floor((end.getTime() - start.getTime()) / 1000 / 60);
    const h = Math.floor(diff / 60);
    const m = diff % 60;
    return `${h}h ${m}m`;
  };

  if (isLoading) {
    return <div className="flex justify-center py-10"><div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" /></div>;
  }

  return (
    <div className="space-y-3 animate-fade-in">
      {/* Clock in/out button for employees */}
      {isEmployee && (
        <GlassCard className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">
              {openEntry ? "Fichaje activo" : "Sin fichar"}
            </p>
            {openEntry && (
              <p className="text-xs text-status-green">
                Desde {new Date(openEntry.clock_in).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}
                {" · "}{formatDuration(openEntry.clock_in, null)}
              </p>
            )}
          </div>
          {openEntry ? (
            <button
              onClick={() => clockOut.mutate()}
              disabled={clockOut.isPending}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-destructive/20 text-destructive hover:bg-destructive/30 transition-all text-sm font-medium"
            >
              {clockOut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Square className="w-4 h-4" />}
              Salir
            </button>
          ) : (
            <button
              onClick={() => clockIn.mutate()}
              disabled={clockIn.isPending}
              className="glass-button text-sm py-2 flex items-center gap-2"
            >
              {clockIn.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              Fichar
            </button>
          )}
        </GlassCard>
      )}

      {/* Entries list */}
      {entries.length === 0 ? (
        <GlassCard className="text-center py-8">
          <Clock className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
          <p className="text-muted-foreground">No hay fichajes registrados</p>
        </GlassCard>
      ) : (
        entries.map((e: any) => (
          <GlassCard key={e.id} className="flex items-center gap-3">
            <Clock className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            <div className="flex-1 min-w-0">
              {isAdmin && e.profile && (
                <p className="text-xs font-medium text-primary mb-0.5">
                  {e.profile.full_name || "Sin nombre"} · {e.profile.employee_id || "Sin ID"}
                </p>
              )}
              <p className="text-sm text-foreground">
                {new Date(e.clock_in).toLocaleDateString("es-ES")}
                {" · "}
                {new Date(e.clock_in).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}
                {" → "}
                {e.clock_out
                  ? new Date(e.clock_out).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })
                  : "En curso"}
              </p>
            </div>
            <span className="text-xs text-muted-foreground">{formatDuration(e.clock_in, e.clock_out)}</span>
          </GlassCard>
        ))
      )}
    </div>
  );
};
