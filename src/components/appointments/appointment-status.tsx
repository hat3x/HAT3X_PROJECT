import { cn } from "@/lib/utils";
import type { AppointmentStatus } from "@/types/database";

/*
 * Salon OS — lenguaje visual de estados de cita (solo presentación).
 * ------------------------------------------------------------------
 * Fuente única de verdad para etiquetas, píldoras (badges) y franjas de
 * acento por estado, compartida entre la vista de citas y el panel del día.
 * NO contiene lógica de agenda ni de reservas.
 *
 * Paleta por estado, coherente con el acento violeta de marca:
 *   pending    → ámbar   (requiere acción)
 *   confirmed  → violeta (marca, en firme)
 *   completed  → verde   (cerrada con éxito)
 *   cancelled  → rojo    (anulada)
 *   no_show    → neutro  (no acudió)
 */

export const APPOINTMENT_STATUS_LABELS: Record<AppointmentStatus, string> = {
  pending: "Pendiente",
  confirmed: "Confirmada",
  completed: "Completada",
  cancelled: "Cancelada",
  no_show: "No presentado",
};

interface StatusStyle {
  /** Clases de la píldora (fondo tintado + texto legible en claro/oscuro). */
  badge: string;
  /** Punto indicador dentro de la píldora. */
  dot: string;
  /** Color sólido de la franja de acento lateral de la tarjeta. */
  accent: string;
}

const STATUS_STYLES: Record<AppointmentStatus, StatusStyle> = {
  pending: {
    badge: "bg-warning/12 text-warning",
    dot: "bg-warning",
    accent: "bg-warning",
  },
  confirmed: {
    badge: "bg-primary/12 text-primary",
    dot: "bg-primary",
    accent: "bg-primary",
  },
  completed: {
    badge: "bg-success/12 text-success",
    dot: "bg-success",
    accent: "bg-success",
  },
  cancelled: {
    badge: "bg-destructive/12 text-destructive",
    dot: "bg-destructive",
    accent: "bg-destructive",
  },
  no_show: {
    badge: "bg-muted text-muted-foreground",
    dot: "bg-muted-foreground/60",
    accent: "bg-muted-foreground/40",
  },
};

/** Clase de color sólido para la franja de acento lateral de una tarjeta. */
export function appointmentStatusAccent(status: AppointmentStatus): string {
  return STATUS_STYLES[status].accent;
}

interface AppointmentStatusBadgeProps {
  status: AppointmentStatus;
  className?: string;
}

/** Píldora de estado con punto de color y fondo tintado suave. */
export function AppointmentStatusBadge({
  status,
  className,
}: AppointmentStatusBadgeProps): React.ReactElement {
  const style = STATUS_STYLES[status];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
        style.badge,
        className,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", style.dot)} />
      {APPOINTMENT_STATUS_LABELS[status]}
    </span>
  );
}
