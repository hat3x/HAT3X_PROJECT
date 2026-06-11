import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export const CreateProjectDialog = ({ open, onClose, onCreated }: Props) => {
  const { session } = useAuth();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);

    const dueDateValue = dueDate
      ? new Date(dueDate + "T23:59:00").toISOString()
      : null;

    const { error } = await supabase.from("projects").insert({
      name: name.trim(),
      address: address.trim() || null,
      due_date: dueDateValue,
      created_by: session?.user?.id,
    });

    setLoading(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setName("");
      setAddress("");
      setDueDate("");
      onCreated();
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="glass-card border-glass-border bg-card/90 backdrop-blur-xl max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-lg">Nueva Obra</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Nombre *</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className="glass-input w-full" placeholder="Edificio Aurora" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Dirección</label>
            <input value={address} onChange={(e) => setAddress(e.target.value)} className="glass-input w-full" placeholder="Calle Mayor, 10" />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Fecha de entrega</label>
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="glass-input w-full" />
          </div>
          <button type="submit" disabled={loading} className="glass-button w-full flex items-center justify-center gap-2 disabled:opacity-50">
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            Crear Obra
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
};
