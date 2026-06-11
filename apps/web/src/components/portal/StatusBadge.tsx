import { cn } from "@/lib/utils";

const statusConfig: Record<string, { label: string; className: string }> = {
  // Project statuses
  planning: { label: "Planificación", className: "bg-secondary/80 text-secondary-foreground border-border/50" },
  active: { label: "Activo", className: "bg-primary/20 text-primary border-primary/30" },
  paused: { label: "Pausado", className: "bg-accent/20 text-accent border-accent/30" },
  completed: { label: "Completado", className: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" },
  cancelled: { label: "Cancelado", className: "bg-destructive/20 text-destructive border-destructive/30" },
  // Phase/milestone statuses
  pending: { label: "Pendiente", className: "bg-secondary/80 text-secondary-foreground border-border/50" },
  in_progress: { label: "En curso", className: "bg-primary/20 text-primary border-primary/30" },
  in_review: { label: "En revisión", className: "bg-accent/20 text-accent border-accent/30" },
  blocked: { label: "Bloqueado", className: "bg-destructive/20 text-destructive border-destructive/30" },
  // Task statuses
  todo: { label: "Pendiente", className: "bg-secondary/80 text-secondary-foreground border-border/50" },
  done: { label: "Completada", className: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" },
  // Update statuses
  draft: { label: "Borrador", className: "bg-secondary/80 text-secondary-foreground border-border/50" },
  published: { label: "Publicada", className: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" },
  // Conversation statuses
  open: { label: "Abierto", className: "bg-primary/20 text-primary border-primary/30" },
  replied: { label: "Respondido", className: "bg-accent/20 text-accent border-accent/30" },
  closed: { label: "Cerrado", className: "bg-secondary/80 text-secondary-foreground border-border/50" },
  // Priority
  low: { label: "Baja", className: "bg-secondary/80 text-secondary-foreground border-border/50" },
  medium: { label: "Media", className: "bg-accent/20 text-accent border-accent/30" },
  high: { label: "Alta", className: "bg-orange-500/20 text-orange-400 border-orange-500/30" },
  urgent: { label: "Urgente", className: "bg-destructive/20 text-destructive border-destructive/30" },
  // Commercial
  lead: { label: "Lead", className: "bg-primary/20 text-primary border-primary/30" },
  inactive: { label: "Inactivo", className: "bg-secondary/80 text-secondary-foreground border-border/50" },
  archived: { label: "Archivado", className: "bg-secondary/80 text-secondary-foreground border-border/50" },
};

interface StatusBadgeProps {
  status: string;
  className?: string;
}

const StatusBadge = ({ status, className }: StatusBadgeProps) => {
  const config = statusConfig[status] || { label: status, className: "bg-secondary text-secondary-foreground border-border" };
  return (
    <span className={cn(
      "inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold border tracking-wide",
      config.className,
      className
    )}>
      {config.label}
    </span>
  );
};

export default StatusBadge;
