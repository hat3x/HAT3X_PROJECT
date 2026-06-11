import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { GlassCard } from "@/components/ui-kit/GlassCard";
import { FileText, Plus, Trash2, Download, Camera, Loader2, X, Eye } from "lucide-react";
import { useRef, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface Props {
  projectId: string;
  isAdmin: boolean;
}

export const PlansTab = ({ projectId, isAdmin }: Props) => {
  const { session } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewName, setPreviewName] = useState("");

  const { data: plans = [], isLoading } = useQuery({
    queryKey: ["project-plans", projectId],
    queryFn: async () => {
      const { data, error } = await supabase.from("project_plans").select("*").eq("project_id", projectId).order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const uploadFile = async (file: File) => {
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "pdf";
      const filePath = `${projectId}/${crypto.randomUUID()}.${ext}`;

      const { error: uploadError } = await supabase.storage.from("plans").upload(filePath, file);
      if (uploadError) throw uploadError;

      const { error: insertError } = await supabase.from("project_plans").insert({
        project_id: projectId,
        file_path: filePath,
        file_name: file.name,
        uploaded_by: session?.user?.id || null,
      });
      if (insertError) throw insertError;

      queryClient.invalidateQueries({ queryKey: ["project-plans", projectId] });
      toast({ title: "Plano subido correctamente" });
    } catch (err: any) {
      toast({ title: "Error al subir", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
    e.target.value = "";
  };

  const deletePlan = useMutation({
    mutationFn: async (plan: any) => {
      await supabase.storage.from("plans").remove([plan.file_path]);
      const { error } = await supabase.from("project_plans").delete().eq("id", plan.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project-plans", projectId] });
      toast({ title: "Plano eliminado" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const downloadPlan = async (plan: any) => {
    const { data } = await supabase.storage.from("plans").createSignedUrl(plan.file_path, 60);
    if (data?.signedUrl) {
      window.open(data.signedUrl, "_blank");
    }
  };

  const openPreview = async (plan: any) => {
    const { data } = await supabase.storage.from("plans").createSignedUrl(plan.file_path, 300);
    if (data?.signedUrl) {
      setPreviewUrl(data.signedUrl);
      setPreviewName(plan.file_name);
    }
  };

  const isImage = (name: string) => /\.(jpg|jpeg|png|webp|gif)$/i.test(name);
  const isPdf = (name: string) => /\.pdf$/i.test(name);

  if (isLoading) {
    return <div className="flex justify-center py-10"><div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" /></div>;
  }

  return (
    <div className="space-y-3 animate-fade-in">
      {/* Hidden file inputs */}
      <input ref={fileInputRef} type="file" className="hidden" accept=".pdf,.png,.jpg,.jpeg,.webp" onChange={handleFileChange} />
      <input ref={cameraInputRef} type="file" className="hidden" accept="image/*" capture="environment" onChange={handleFileChange} />

      {plans.length === 0 ? (
        <GlassCard className="text-center py-8">
          <FileText className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
          <p className="text-muted-foreground">No hay planos subidos</p>
        </GlassCard>
      ) : (
        plans.map((p: any) => (
          <GlassCard key={p.id} className="flex items-center gap-3">
            <FileText className="w-5 h-5 text-primary flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{p.file_name}</p>
              <p className="text-xs text-muted-foreground">{new Date(p.created_at).toLocaleDateString("es-ES")}</p>
            </div>
            {(isImage(p.file_name) || isPdf(p.file_name)) && (
              <button onClick={() => openPreview(p)} className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-all" title="Previsualizar">
                <Eye className="w-4 h-4" />
              </button>
            )}
            <button onClick={() => downloadPlan(p)} className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-all" title="Descargar">
              <Download className="w-4 h-4" />
            </button>
            {isAdmin && (
              <button onClick={() => deletePlan.mutate(p)} className="p-2 rounded-lg text-destructive hover:bg-destructive/10 transition-all" title="Eliminar">
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </GlassCard>
        ))
      )}

      {isAdmin && (
        <div className="flex gap-2">
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border border-dashed border-glass-border text-muted-foreground hover:text-foreground hover:border-primary/50 transition-all disabled:opacity-50"
          >
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Adjuntar archivo
          </button>
          <button
            onClick={() => cameraInputRef.current?.click()}
            disabled={uploading}
            className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-dashed border-glass-border text-muted-foreground hover:text-foreground hover:border-primary/50 transition-all disabled:opacity-50"
            title="Escanear con cámara"
          >
            <Camera className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Preview Dialog */}
      <Dialog open={!!previewUrl} onOpenChange={(v) => !v && setPreviewUrl(null)}>
        <DialogContent className="glass-card border-glass-border bg-card/95 backdrop-blur-xl max-w-3xl max-h-[90vh] flex flex-col p-0 overflow-hidden [&>button]:hidden" aria-describedby={undefined}>
          <DialogHeader className="sr-only">
            <DialogTitle>Previsualización de plano</DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-between px-4 py-3 border-b border-glass-border">
            <p className="text-sm font-medium text-foreground truncate">{previewName}</p>
            <button onClick={() => setPreviewUrl(null)} className="p-1 rounded-lg text-muted-foreground hover:text-foreground">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 overflow-auto min-h-0 flex items-center justify-center bg-black/20 p-2">
            {previewUrl && isImage(previewName) && (
              <img src={previewUrl} alt={previewName} className="max-w-full max-h-[75vh] object-contain rounded-lg" />
            )}
            {previewUrl && isPdf(previewName) && (
              <iframe src={previewUrl} className="w-full h-[75vh] rounded-lg" title={previewName} />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
