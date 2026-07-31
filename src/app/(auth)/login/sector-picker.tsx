import { Scissors, Stethoscope, UtensilsCrossed, type LucideIcon } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { SECTOR_ORDER, SECTOR_REGISTRY } from "@/lib/sector/registry";
import type { SalonSector } from "@/types/database";

/**
 * Un icono por sector, puramente decorativo (el picker no depende de él para
 * funcionar). Mismo set de sectores que {@link SECTOR_REGISTRY}.
 */
export const SECTOR_ICON: Record<SalonSector, LucideIcon> = {
  peluqueria: Scissors,
  odontologia: Stethoscope,
  restauracion: UtensilsCrossed,
};

/**
 * Paso previo al login: el visitante elige el SECTOR de su negocio antes de
 * ver el formulario de credenciales. Server component puro — cada tarjeta es
 * un enlace a `/login?sector=<x>`, que `LoginPage` valida con
 * `parseSectorParam` (de `@/lib/auth/sector-login`) y usa para temar el
 * formulario y, tras el sign-in, verificar que coincide con el sector real
 * del tenant (`sectorMismatchMessage`).
 */
export function SectorPicker(): React.ReactElement {
  return (
    <div className="flex w-full max-w-md animate-fade-up flex-col items-center gap-8">
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          ¿Cuál es tu sector?
        </h1>
        <p className="text-sm text-muted-foreground">
          Elige tu negocio para acceder con tus credenciales
        </p>
      </div>

      <div className="grid w-full gap-3">
        {SECTOR_ORDER.map((sector) => {
          const config = SECTOR_REGISTRY[sector];
          const Icon = SECTOR_ICON[sector];
          return (
            <a
              key={sector}
              href={`/login?sector=${sector}`}
              className="group focus-visible:outline-none"
            >
              <Card className="transition-colors duration-150 ease-apple-out group-hover:border-primary/50 group-hover:bg-accent/40 group-focus-visible:ring-2 group-focus-visible:ring-ring group-focus-visible:ring-offset-2 group-focus-visible:ring-offset-background">
                <CardContent className="flex items-center gap-4 p-4">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                    <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-medium">{config.label}</p>
                    <p className="truncate text-sm text-muted-foreground">
                      {config.brandName}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </a>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground/80">
        Hecho por{" "}
        <span className="font-medium tracking-wide text-foreground/70">
          HAT3X
        </span>
      </p>
    </div>
  );
}
