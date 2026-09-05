import type { LucideIcon } from "lucide-react";

interface FacturacionEmptyProps {
  /** Icono representativo de la sección; se muestra en un chip con tinte de marca. */
  icon: LucideIcon;
  title: string;
  description: string;
}

/**
 * Estado vacío premium reutilizable de las secciones de facturación.
 *
 * A diferencia del placeholder de «en construcción», comunica de forma intencional
 * qué contenido vivirá aquí (el listado aparece al haber datos). Comparte los tokens
 * del sistema (chip de marca, borde suave, entrada `fade-up`) para no romper el diseño.
 */
export function FacturacionEmpty({
  icon: Icon,
  title,
  description,
}: FacturacionEmptyProps): React.ReactElement {
  return (
    <div className="flex animate-fade-up flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-border/70 bg-muted/20 px-6 py-16 text-center [animation-delay:60ms]">
      <span
        aria-hidden="true"
        className="flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/15 bg-accent text-primary shadow-xs"
      >
        <Icon className="h-6 w-6" />
      </span>
      <div className="space-y-1.5">
        <h3 className="text-base font-semibold tracking-tight">{title}</h3>
        <p className="mx-auto max-w-sm text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}
