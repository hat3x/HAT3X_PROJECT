import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { GlassCard } from "@/components/ui-kit/GlassCard";
import { ArrowLeft, Plus, Loader2, Camera, CheckCircle2, Clock, AlertCircle, Circle, Trash2, XCircle, Eye, Download, X } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { useState, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface Props {
  projectId: string;
  supplier: any;
  isAdmin: boolean;
  onBack: () => void;
}

const statusConfig: Record<string, { icon: React.ReactNode; label: string; className: string }> = {
  pending: { icon: <Circle className="w-4 h-4" />, label: "Pendiente", className: "text-muted-foreground" },
  in_progress: { icon: <Clock className="w-4 h-4" />, label: "En curso", className: "text-status-orange" },
  review: { icon: <AlertCircle className="w-4 h-4" />, label: "En revisión", className: "text-status-orange" },
  completed: { icon: <CheckCircle2 className="w-4 h-4" />, label: "Finalizado", className: "text-status-green" },
  rejected: { icon: <XCircle className="w-4 h-4" />, label: "No aprobado", className: "text-destructive" },
};

export const SupplierWorksView = ({ projectId, supplier, isAdmin, onBack }: Props) => {
  const { session, profile } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [photoDialog, setPhotoDialog] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [rejectDialog, setRejectDialog] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const isSupplier = profile?.role === "supplier" && session?.user?.id === supplier.user_id;

  const { data: works = [], isLoading } = useQuery({
    queryKey: ["supplier-works", projectId, supplier.user_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("supplier_works")
        .select("*")
        .eq("project_id", projectId)
        .eq("supplier_user_id", supplier.user_id)
        .order("created_at", { ascending: false })
        .order("id", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const addWork = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("supplier_works").insert({
        project_id: projectId,
        supplier_user_id: supplier.user_id,
        title: title.trim(),
        description: desc.trim() || null,
        created_by: session?.user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["supplier-works", projectId, supplier.user_id] });
      setTitle(""); setDesc(""); setShowAdd(false);
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteWork = useMutation({
    mutationFn: async (workId: string) => {
      const { error } = await supabase.from("supplier_works").delete().eq("id", workId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["supplier-works", projectId, supplier.user_id] }),
  });

  const cycleStatus = useMutation({
    mutationFn: async ({ workId, current, bySupplier }: { workId: string; current: string; bySupplier?: boolean }) => {
      let next: string;
      // Supplier marks pending → in_progress
      if (bySupplier && current === "pending") next = "in_progress";
      // Admin approves review → completed
      else if (current === "review" && isAdmin) {
      next = "completed";
        // Mark as completed with reviewer info
        const { error } = await supabase.from("supplier_works")
          .update({ status: next, reviewed_by: session?.user?.id, reviewed_at: new Date().toISOString() })
          .eq("id", workId);
        if (error) throw error;
        // Notify supplier of approval
        const work = works.find((w: any) => w.id === workId);
        await supabase.from("notifications").insert({
          project_id: projectId,
          type: "work_approved",
          title: "Trabajo aprobado",
          message: `Tu trabajo "${work?.title || ""}" ha sido aprobado`,
          created_by: session?.user?.id,
          target_user_id: supplier.user_id,
        });
        return;
      } else return;

      const { error } = await supabase.from("supplier_works").update({ status: next }).eq("id", workId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["supplier-works", projectId, supplier.user_id] }),
  });

  const rejectWork = useMutation({
    mutationFn: async ({ workId, reason }: { workId: string; reason: string }) => {
      const { error } = await supabase.from("supplier_works")
        .update({ status: "rejected", rejection_reason: reason, reviewed_by: session?.user?.id, reviewed_at: new Date().toISOString() })
        .eq("id", workId);
      if (error) throw error;
    },
    onSuccess: async (_data: any, variables: { workId: string; reason: string }) => {
      queryClient.invalidateQueries({ queryKey: ["supplier-works", projectId, supplier.user_id] });
      // Notify supplier of rejection
      const work = works.find((w: any) => w.id === variables.workId);
      await supabase.from("notifications").insert({
        project_id: projectId,
        type: "work_rejected",
        title: "Trabajo rechazado",
        message: `Tu trabajo "${work?.title || ""}" no fue aprobado: ${variables.reason}`,
        created_by: session?.user?.id,
        target_user_id: supplier.user_id,
      });
      setRejectDialog(null);
      setRejectReason("");
      toast({ title: "Trabajo rechazado" });
    },
  });

  // Supplier marks work as finished → must upload photo first
  const handleSupplierFinish = (workId: string) => {
    setPhotoDialog(workId);
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !photoDialog) return;

    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `${session?.user?.id}/${photoDialog}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("work-photos")
        .upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;

      // Update work status to review
      const { error } = await supabase.from("supplier_works")
        .update({ status: "review", photo_path: path })
        .eq("id", photoDialog);
      if (error) throw error;

      // Create notification for admin
      await supabase.from("notifications").insert({
        project_id: projectId,
        type: "work_review",
        title: "Trabajo pendiente de revisión",
        message: `${supplier.profile?.full_name || "Proveedor"} solicita revisión de un trabajo`,
        created_by: session?.user?.id,
        target_user_id: null, // admin notifications have no specific target (admins see all)
      });

      queryClient.invalidateQueries({ queryKey: ["supplier-works", projectId, supplier.user_id] });
      toast({ title: "Foto subida", description: "El trabajo está ahora en revisión" });
      setPhotoDialog(null);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const supplierName = supplier.profile?.full_name || supplier.profile?.supplier_id || "Proveedor";

  if (isLoading) {
    return <div className="flex justify-center py-10"><div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" /></div>;
  }

  return (
    <div className="space-y-3 animate-fade-in">
      <button onClick={onBack} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-all mb-2">
        <ArrowLeft className="w-4 h-4" /> Volver a proveedores
      </button>

      <GlassCard className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center text-accent font-bold text-sm">
          {supplierName[0]?.toUpperCase()}
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">{supplierName}</p>
          <p className="text-xs text-muted-foreground">{supplier.profile?.supplier_id || "Proveedor"} · {works.length} trabajos</p>
        </div>
      </GlassCard>

      {works.length === 0 && !showAdd && (
        <GlassCard className="text-center py-8">
          <p className="text-muted-foreground">No hay trabajos asignados</p>
        </GlassCard>
      )}

      {works.map((w: any) => {
        const cfg = statusConfig[w.status] || statusConfig.pending;
        return (
          <GlassCard key={w.id} className="space-y-2">
            <div className="flex items-start gap-3">
              {/* Supplier can mark pending → in_progress */}
              {isSupplier && w.status === "pending" && (
                <button
                  onClick={() => cycleStatus.mutate({ workId: w.id, current: w.status, bySupplier: true })}
                  className={`mt-0.5 flex-shrink-0 ${cfg.className}`}
                >
                  {cfg.icon}
                </button>
              )}
              {/* Non-clickable status icon for everyone else */}
              {!(isSupplier && w.status === "pending") && (
                <span className={`mt-0.5 flex-shrink-0 ${cfg.className}`}>{cfg.icon}</span>
              )}
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium ${w.status === "completed" ? "line-through text-muted-foreground" : "text-foreground"}`}>
                  {w.title}
                </p>
                {w.description && <p className="text-xs text-muted-foreground mt-0.5">{w.description}</p>}
                <span className={`text-xs ${cfg.className}`}>{cfg.label}</span>
              </div>

              <div className="flex items-center gap-1 flex-shrink-0">
                {/* Supplier can finish work (requires photo) */}
                {isSupplier && (w.status === "pending" || w.status === "in_progress" || w.status === "rejected") && (
                  <button
                    onClick={() => handleSupplierFinish(w.id)}
                    className="text-xs px-2 py-1 rounded-lg bg-primary/20 text-primary hover:bg-primary/30 transition-all flex items-center gap-1"
                  >
                    <Camera className="w-3 h-3" /> {w.status === "rejected" ? "Reenviar" : "Finalizar"}
                  </button>
                )}

                {/* Admin approves review */}
                {isAdmin && w.status === "review" && (
                  <button
                    onClick={() => cycleStatus.mutate({ workId: w.id, current: w.status })}
                    className="text-xs px-2 py-1 rounded-lg bg-status-green/20 text-status-green hover:bg-status-green/30 transition-all"
                  >
                    Aprobar
                  </button>
                )}

                {isAdmin && w.status === "review" && (
                  <button
                    onClick={() => { setRejectDialog(w.id); setRejectReason(""); }}
                    className="text-xs px-2 py-1 rounded-lg bg-destructive/20 text-destructive hover:bg-destructive/30 transition-all"
                  >
                    Rechazar
                  </button>
                )}

                {isAdmin && (
                  <button onClick={() => deleteWork.mutate(w.id)} className="p-1 text-destructive hover:bg-destructive/10 rounded-lg transition-all">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Rejection reason */}
            {w.status === "rejected" && w.rejection_reason && (
              <div className="ml-7 p-2 rounded-lg bg-destructive/10 border border-destructive/20">
                <p className="text-xs text-destructive font-medium">Motivo del rechazo:</p>
                <p className="text-xs text-foreground mt-0.5">{w.rejection_reason}</p>
              </div>
            )}

            {/* Photo actions for review/completed/rejected */}
            {w.photo_path && (w.status === "review" || w.status === "completed" || w.status === "rejected") && (
              <PhotoPreview path={w.photo_path} />
            )}
          </GlassCard>
        );
      })}

      {isAdmin && !showAdd && (
        <GlassCard>
          <form onSubmit={(e) => { e.preventDefault(); setShowAdd(false); addWork.mutate(); }} className={showAdd ? "" : "hidden"}>
          </form>
        </GlassCard>
      )}

      {showAdd && (
        <GlassCard>
          <form onSubmit={(e) => { e.preventDefault(); addWork.mutate(); }} className="space-y-3">
            <input value={title} onChange={(e) => setTitle(e.target.value)} className="glass-input w-full" placeholder="Título del trabajo" required />
            <input value={desc} onChange={(e) => setDesc(e.target.value)} className="glass-input w-full" placeholder="Descripción (opcional)" />
            <div className="flex gap-2">
              <button type="submit" disabled={addWork.isPending} className="glass-button text-sm py-2 flex items-center gap-1">
                {addWork.isPending && <Loader2 className="w-3 h-3 animate-spin" />} Crear
              </button>
              <button type="button" onClick={() => setShowAdd(false)} className="px-4 py-2 rounded-xl text-sm text-muted-foreground hover:text-foreground">
                Cancelar
              </button>
            </div>
          </form>
        </GlassCard>
      )}

      {isAdmin && !showAdd && (
        <button
          onClick={() => setShowAdd(true)}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-dashed border-glass-border text-muted-foreground hover:text-foreground hover:border-primary/50 transition-all"
        >
          <Plus className="w-4 h-4" /> Añadir trabajo
        </button>
      )}

      {/* Photo upload dialog */}
      <Dialog open={!!photoDialog} onOpenChange={(v) => !v && setPhotoDialog(null)}>
        <DialogContent className="glass-card border-glass-border bg-card/90 backdrop-blur-xl max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display text-lg">Adjuntar foto del trabajo</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground mb-4">
            Para marcar el trabajo como finalizado, debes adjuntar una foto del trabajo realizado. El admin revisará y aprobará.
          </p>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handlePhotoUpload}
            className="hidden"
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="glass-button w-full flex items-center justify-center gap-2"
          >
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
            {uploading ? "Subiendo..." : "Tomar / Seleccionar foto"}
          </button>
        </DialogContent>
      </Dialog>

      {/* Reject dialog */}
      <Dialog open={!!rejectDialog} onOpenChange={(v) => { if (!v) { setRejectDialog(null); setRejectReason(""); } }}>
        <DialogContent className="glass-card border-glass-border bg-card/90 backdrop-blur-xl max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display text-lg">Rechazar trabajo</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground mb-2">
            Indica el motivo por el que no se aprueba este trabajo. El proveedor verá este mensaje.
          </p>
          <Textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Motivo del rechazo..."
            className="glass-input min-h-[80px]"
            required
          />
          <div className="flex gap-2 mt-2">
            <button
              onClick={() => {
                if (!rejectReason.trim()) return;
                rejectWork.mutate({ workId: rejectDialog!, reason: rejectReason.trim() });
              }}
              disabled={!rejectReason.trim() || rejectWork.isPending}
              className="glass-button text-sm py-2 flex-1 bg-destructive text-white hover:bg-destructive/80"
            >
              {rejectWork.isPending ? <Loader2 className="w-3 h-3 animate-spin mx-auto" /> : "Rechazar"}
            </button>
            <button
              onClick={() => { setRejectDialog(null); setRejectReason(""); }}
              className="px-4 py-2 rounded-xl text-sm text-muted-foreground hover:text-foreground"
            >
              Cancelar
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// Small helper for photo preview with preview/download buttons
const PhotoPreview = ({ path }: { path: string }) => {
  const [showFull, setShowFull] = useState(false);
  const { data: url } = useQuery({
    queryKey: ["work-photo-url", path],
    queryFn: async () => {
      const { data } = await supabase.storage.from("work-photos").createSignedUrl(path, 3600);
      return data?.signedUrl || null;
    },
    staleTime: 1000 * 60 * 30,
  });

  if (!url) return null;

  const handleDownload = () => {
    window.open(url, "_blank");
  };

  return (
    <>
      <div className="flex items-center gap-1 mt-2 ml-7">
        <button onClick={() => setShowFull(true)} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-all" title="Previsualizar">
          <Eye className="w-3.5 h-3.5" />
        </button>
        <button onClick={handleDownload} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-all" title="Descargar">
          <Download className="w-3.5 h-3.5" />
        </button>
      </div>

      <Dialog open={showFull} onOpenChange={setShowFull}>
        <DialogContent className="glass-card border-glass-border bg-card/95 backdrop-blur-xl max-w-3xl max-h-[90vh] flex flex-col p-0 overflow-hidden [&>button]:hidden" aria-describedby={undefined}>
          <DialogHeader className="sr-only">
            <DialogTitle>Foto del trabajo</DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-between px-4 py-3 border-b border-glass-border">
            <p className="text-sm font-medium text-foreground">Foto del trabajo</p>
            <button onClick={() => setShowFull(false)} className="p-1 rounded-lg text-muted-foreground hover:text-foreground">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 overflow-auto min-h-0 flex items-center justify-center bg-black/20 p-2">
            <img src={url} alt="Foto del trabajo" className="max-w-full max-h-[75vh] object-contain rounded-lg" />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
