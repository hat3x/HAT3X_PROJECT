import type { Metadata } from "next";
import { ClipboardList } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  PERMANENT_FDI_NUMBERS,
  TEETH,
  type Tooth,
} from "@/lib/dental/tooth";

export const metadata: Metadata = {
  title: "Odontograma",
};

/** Upper arch FDI numbers in visual left-to-right order */
const UPPER_ROW = PERMANENT_FDI_NUMBERS.slice(0, 16) as readonly number[];
/** Lower arch FDI numbers in visual left-to-right order */
const LOWER_ROW = PERMANENT_FDI_NUMBERS.slice(16, 32) as readonly number[];

function ToothCell({ tooth }: { tooth: Tooth }): React.ReactElement {
  return (
    <div
      title={tooth.label}
      aria-label={tooth.label}
      className="flex flex-col items-center gap-0.5"
    >
      <div
        className="h-8 w-8 rounded-md border border-border bg-card transition-colors hover:border-primary/60 hover:bg-accent"
        aria-hidden="true"
      />
      <span className="text-[9px] font-mono text-muted-foreground leading-none">
        {tooth.fdi}
      </span>
    </div>
  );
}

/**
 * Odontograma — vista de la dentición permanente del paciente.
 *
 * Muestra los 32 dientes en arcada superior e inferior siguiendo el estándar
 * FDI/ISO 3950. Cada celda es un placeholder interactivo: el estado clínico
 * (sano, caries, obturación, ausente, etc.) se añadirá en la siguiente fase.
 *
 * Solo accesible para el sector "odontologia" (bloqueado en layout.tsx).
 */
export default function OdontogramaPage(): React.ReactElement {
  return (
    <main className="container py-8 space-y-6">
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="grid h-10 w-10 place-items-center rounded-xl border border-primary/15 bg-accent text-primary"
        >
          <ClipboardList className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Odontograma</h1>
          <p className="text-sm text-muted-foreground">
            Ficha dental — dentición permanente (FDI/ISO 3950)
          </p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Arcada superior
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex justify-center gap-1 flex-wrap">
            {UPPER_ROW.map((fdi) => {
              const tooth = TEETH[fdi];
              if (!tooth) return null;
              return <ToothCell key={fdi} tooth={tooth} />;
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Arcada inferior
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex justify-center gap-1 flex-wrap">
            {LOWER_ROW.map((fdi) => {
              const tooth = TEETH[fdi];
              if (!tooth) return null;
              return <ToothCell key={fdi} tooth={tooth} />;
            })}
          </div>
        </CardContent>
      </Card>

      <Card className="border-dashed">
        <CardContent className="flex items-center gap-3 p-4">
          <ClipboardList className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden="true" />
          <CardDescription className="text-xs">
            Los estados clínicos (sano, caries, obturación, extracción, corona, etc.) se
            integrarán en la siguiente fase junto con el selector de superficies dentales.
          </CardDescription>
        </CardContent>
      </Card>
    </main>
  );
}
