import { Sparkles } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";

/**
 * Placeholder genérico para módulos que el sector activo del salón todavía no
 * tiene disponibles (rutas alcanzables por navegación directa que no aplican
 * a este sector). Comparte los tokens visuales del sistema (tarjeta, chip de
 * acento, entrada `fade-up`) con el resto de estados vacíos para no romper
 * el diseño — ver `FeatureGateNotice` y `FacturacionEmpty` para primos de
 * este mismo patrón.
 *
 * Pure presentational: sin props, sin lógica. Cualquier ruta puede renderizar
 * `<ComingSoon />` sin tener que inventar copy propio.
 */
export function ComingSoon(): React.ReactElement {
  return (
    <Card className="mx-auto w-full max-w-md animate-fade-up border-dashed">
      <CardContent className="flex flex-col items-center gap-4 p-10 text-center">
        <span
          aria-hidden="true"
          className="grid h-14 w-14 place-items-center rounded-2xl border border-primary/15 bg-accent text-primary shadow-xs"
        >
          <Sparkles className="h-6 w-6" />
        </span>
        <div className="space-y-1.5">
          <h2 className="text-lg font-semibold tracking-tight">Próximamente</h2>
          <p className="text-sm text-muted-foreground">
            Este módulo aún no está disponible para tu sector.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
