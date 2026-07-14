import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

interface SectionHeaderProps {
  /** Icono de la sección; se muestra en un chip con tinte de marca. */
  icon: LucideIcon;
  title: string;
  description: string;
  /** Acción principal de la sección (p. ej. botón «Nuevo…»), alineada a la derecha. */
  action?: React.ReactNode;
  className?: string;
}

/**
 * Cabecera premium reutilizable de una sección de ajustes.
 *
 * Unifica el encabezado de todas las subpáginas (sedes, servicios, personal,
 * horarios, datos y fiscal): chip con icono de marca, título, descripción y un
 * hueco opcional para la acción principal. Aporta jerarquía y aire consistentes
 * y una entrada suave al cargar (`fade-up`).
 */
export function SectionHeader({
  icon: Icon,
  title,
  description,
  action,
  className,
}: SectionHeaderProps): React.ReactElement {
  return (
    <div
      className={cn(
        "mb-6 flex flex-col gap-4 animate-fade-up sm:flex-row sm:items-start sm:justify-between",
        className,
      )}
    >
      <div className="flex items-start gap-3.5">
        <span
          aria-hidden="true"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/15 bg-accent text-primary shadow-xs"
        >
          <Icon className="h-5 w-5" />
        </span>
        <div className="space-y-1">
          <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
          <p className="max-w-prose text-sm text-muted-foreground">
            {description}
          </p>
        </div>
      </div>
      {action !== undefined ? (
        <div className="shrink-0 sm:pt-0.5">{action}</div>
      ) : null}
    </div>
  );
}
