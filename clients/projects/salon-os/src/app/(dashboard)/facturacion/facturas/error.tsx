"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Límite de error de Facturación → Facturas. Si falla la resolución de filtros o
 * las RPC de lista/totales, presenta un estado claro y sereno con acción de
 * reintento (`reset`, provista por Next.js). Debe ser Client Component por
 * requisito de los error boundaries del App Router.
 */
export default function FacturasError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): React.ReactElement {
  useEffect(() => {
    // Traza para diagnóstico; el mensaje al usuario se mantiene comprensible.
    console.error(error);
  }, [error]);

  return (
    <Card className="mx-auto max-w-md animate-scale-in text-center shadow-md">
      <CardContent className="flex flex-col items-center gap-4 p-8">
        <span className="grid h-14 w-14 place-items-center rounded-full bg-destructive/10 text-destructive">
          <AlertTriangle className="h-7 w-7" aria-hidden="true" />
        </span>
        <div className="space-y-1.5">
          <h2 className="text-xl font-semibold tracking-tight">
            No hemos podido cargar las facturas
          </h2>
          <p className="text-sm text-muted-foreground">
            Ha ocurrido un problema al preparar el libro de facturas con estos
            filtros. Puedes reintentar; si persiste, vuelve a intentarlo en unos
            minutos.
          </p>
        </div>

        {error.message ? (
          <p className="w-full truncate rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
            {error.message}
            {error.digest ? <span className="ml-1 opacity-70">({error.digest})</span> : null}
          </p>
        ) : null}

        <Button onClick={reset} className="mt-1">
          <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
          Reintentar
        </Button>
      </CardContent>
    </Card>
  );
}
