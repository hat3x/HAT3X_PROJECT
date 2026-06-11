import { useState } from "react";
import { Link } from "react-router-dom";
import { ExternalLink, MapPin, ArrowUpRight, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import StatusBadge from "@/components/ui/status-badge";
import { useDeleteBusiness } from "@/hooks/use-businesses";
import { useToast } from "@/hooks/use-toast";
import type { Business } from "@/types/domain";

interface LeadCardProps {
  business: Business;
}

const LeadCard = ({ business }: LeadCardProps) => {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const { mutate: deleteBusiness, isPending } = useDeleteBusiness();
  const { toast } = useToast();

  const handleDelete = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setConfirmOpen(true);
  };

  const handleConfirmDelete = () => {
    deleteBusiness(business.id, {
      onSuccess: () => toast({ title: `"${business.name}" eliminado` }),
      onError: () => toast({ title: "Error al eliminar", variant: "destructive" }),
    });
  };

  return (
    <>
      <div className="card-interactive relative group">
        <Link to={`/analisis/${business.id}`} className="block p-5">
          <div className="flex items-start justify-between mb-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-display font-semibold text-foreground group-hover:text-primary transition-colors truncate">
                  {business.name}
                </h3>
                <ArrowUpRight className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">{business.sector}</p>
            </div>
            <StatusBadge status={business.status} />
          </div>
          <div className="divider-gradient my-3" />
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <MapPin className="w-3 h-3" />
              {business.city}
            </span>
            <span className="flex items-center gap-1.5">
              <ExternalLink className="w-3 h-3" />
              {new URL(business.url).hostname}
            </span>
          </div>
        </Link>

        <Button
          variant="ghost"
          size="icon"
          className="absolute top-3 right-3 w-7 h-7 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive hover:bg-destructive/10"
          onClick={handleDelete}
          disabled={isPending}
          aria-label="Eliminar lead"
        >
          {isPending ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Trash2 className="w-3.5 h-3.5" />
          )}
        </Button>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar este lead?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará <strong>{business.name}</strong> junto con su análisis, demos y emails generados. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default LeadCard;
