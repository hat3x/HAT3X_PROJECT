import { Lock, type LucideIcon } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface FeatureGateNoticeProps {
  /** Título breve del aviso (p. ej. «La facturación necesita el TPV»). */
  title: string;
  /** Explicación serena de qué add-on lo habilita y qué sigue disponible sin él. */
  description: string;
  /** Icono del chip; por defecto un candado (superficie bloqueada). */
  icon?: LucideIcon;
  className?: string;
}

/**
 * Aviso de módulo GATED por un add-on no contratado (p. ej. `pos`/TPV).
 *
 * Una superficie de PAGO oculta CON GRACIA: en lugar de un 404 o una redirección
 * abrupta, explica por qué no está disponible y qué la habilita, con el mismo
 * lenguaje visual del sistema (tarjeta de borde discontinuo, chip de acento,
 * entrada `fade-up`). Es la fuente ÚNICA de este aviso para que el copy y el
 * aspecto no diverjan entre Analítica y Facturación (gating coherente).
 *
 * Es SOLO presentación: el gate de datos real vive en el servidor de cada dominio,
 * así que un usuario que fuerce la URL o la server action sigue topándose con él.
 */
export function FeatureGateNotice({
  title,
  description,
  icon: Icon = Lock,
  className,
}: FeatureGateNoticeProps): React.ReactElement {
  return (
    <Card className={cn("animate-fade-up border-dashed", className)}>
      <CardContent className="flex flex-col items-start gap-3 p-6 sm:flex-row sm:items-center">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-accent text-accent-foreground">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        <div>
          <p className="font-medium text-foreground">{title}</p>
          <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
        </div>
      </CardContent>
    </Card>
  );
}
