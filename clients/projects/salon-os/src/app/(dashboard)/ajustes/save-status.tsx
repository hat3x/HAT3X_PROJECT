import { AlertCircle, CheckCircle2 } from "lucide-react";

import { cn } from "@/lib/utils";

interface SaveStatusProps {
  /** Mensaje de error (validación o servidor). Tiene prioridad sobre `saved`. */
  error?: string | null;
  /** Guardado con éxito. */
  saved?: boolean;
  /** Texto del estado de éxito. */
  savedLabel?: string;
  className?: string;
}

/**
 * Feedback de guardado premium y accesible, compartido por los formularios de
 * ajustes.
 *
 * - Error → banda destructiva con icono, `role="alert"`.
 * - Éxito → banda de éxito (token semántico `success`) con icono, `role="status"`
 *   y `aria-live="polite"`.
 *
 * Sustituye a los mensajes sueltos en texto plano por una señal visual clara y
 * coherente en toda la sección. Entra con una micro-animación (`scale-in`).
 */
export function SaveStatus({
  error = null,
  saved = false,
  savedLabel = "Cambios guardados.",
  className,
}: SaveStatusProps): React.ReactElement | null {
  if (error !== null && error !== undefined) {
    return (
      <p
        role="alert"
        className={cn(
          "flex items-center gap-2 rounded-lg border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive animate-scale-in",
          className,
        )}
      >
        <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>{error}</span>
      </p>
    );
  }

  if (saved) {
    return (
      <p
        role="status"
        aria-live="polite"
        className={cn(
          "flex items-center gap-2 rounded-lg border border-success/25 bg-success/10 px-3 py-2 text-sm font-medium text-success animate-scale-in",
          className,
        )}
      >
        <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>{savedLabel}</span>
      </p>
    );
  }

  return null;
}
