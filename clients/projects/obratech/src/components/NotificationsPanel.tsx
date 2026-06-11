import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { GlassCard } from "@/components/ui-kit/GlassCard";
import { Bell, Check } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface Props {
  open: boolean;
  onClose: () => void;
}

export const NotificationsPanel = ({ open, onClose }: Props) => {
  const queryClient = useQueryClient();
  const { profile, session } = useAuth();
  const isAdmin = profile?.role === "admin";

  const { data: notifications = [] } = useQuery({
    queryKey: ["notifications"],
    queryFn: async () => {
      let query = supabase
        .from("notifications")
        .select("*")
        .eq("is_read", false)
        .order("created_at", { ascending: false })
        .limit(50);

      // Everyone only sees notifications targeted to them or untargeted (null)
      if (isAdmin) {
        query = query.or(`target_user_id.is.null,target_user_id.eq.${session!.user.id}`);
      } else if (session?.user?.id) {
        query = query.eq("target_user_id", session.user.id);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!session?.user?.id,
  });

  const markRead = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("notifications")
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["notif-count"] });
      queryClient.invalidateQueries({ queryKey: ["total-unread-notifs"] });
    },
  });

  const markAllRead = useMutation({
    mutationFn: async () => {
      const unread = notifications.filter((n) => !n.is_read).map((n) => n.id);
      if (unread.length === 0) return;
      const { error } = await supabase
        .from("notifications")
        .update({ is_read: true, read_at: new Date().toISOString() })
        .in("id", unread);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["notif-count"] });
      queryClient.invalidateQueries({ queryKey: ["total-unread-notifs"] });
    },
  });

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="glass-card border-glass-border bg-card/90 backdrop-blur-xl max-w-md max-h-[80vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="font-display text-lg flex items-center gap-2">
              <Bell className="w-5 h-5" /> Notificaciones
              {unreadCount > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-primary text-primary-foreground text-xs">{unreadCount}</span>
              )}
            </DialogTitle>
            {unreadCount > 0 && (
              <button
                onClick={() => markAllRead.mutate()}
                className="text-xs text-primary hover:underline"
              >
                Marcar todas como leídas
              </button>
            )}
          </div>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
          {notifications.length === 0 ? (
            <div className="text-center py-10 space-y-2">
              <p className="text-3xl">😊</p>
              <p className="text-sm font-medium text-foreground">¡No hay más notificaciones!</p>
              <p className="text-xs text-muted-foreground">Estás al día</p>
            </div>
          ) : (
            notifications.map((n) => (
              <div
                key={n.id}
                className="p-3 rounded-xl transition-all bg-primary/10 border border-primary/20"
              >
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">{n.title}</p>
                    {n.message && <p className="text-xs text-muted-foreground mt-0.5">{n.message}</p>}
                    <p className="text-xs text-muted-foreground mt-1">
                      {new Date(n.created_at).toLocaleDateString("es-ES")} · {new Date(n.created_at).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                  <button
                    onClick={() => markRead.mutate(n.id)}
                    className="p-1 rounded-lg text-primary hover:bg-primary/20 transition-all flex-shrink-0"
                    title="Marcar como leída"
                  >
                    <Check className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};