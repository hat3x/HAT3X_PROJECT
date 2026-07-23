"use client";

import Link from "next/link";
import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Límite de error de `/analitica`. Si falla la agregación de métricas del periodo,
 * presenta un estado claro y sereno con acción de reintento (`reset`, provista por
 * Next.js) y una salida secundaria al panel. Debe ser Client Component por requisito
 * de los error boundaries del App Router.
 */
export default function AnaliticaError({
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
    <main className="container flex min-h-[60vh] items-center justify-center py-10">
      <Card className="w-full max-w-md animate-scale-in text-center shadow-md">
        <CardContent className="flex flex-col items-center gap-4 p-8">
          <span className="grid h-14 w-14 place-items-center rounded-full bg-destructive/10 text-destructive">
            <AlertTriangle className="h-7 w-7" aria-hidden="true" />
          </span>
          <div className="space-y-1.5">
            <h1 className="text-xl font-semibold tracking-tight">
              No hemos podido cargar la analítica
            </h1>
            <p className="text-sm text-muted-foreground">
              Ha ocurrido un problema al agregar las métricas del periodo. Puedes
              reintentar; si persiste, vuelve a intentarlo en unos minutos.
            </p>
          </div>

          {error.message ? (
            <p className="w-full truncate rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
              {error.message}
              {error.digest ? (
                <span className="ml-1 opacity-70">({error.digest})</span>
              ) : null}
            </p>
          ) : null}

          <div className="mt-1 flex w-full flex-col gap-2 sm:flex-row sm:justify-center">
            <Button onClick={reset}>
              <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
              Reintentar
            </Button>
            <Button variant="outline" asChild>
              <Link href="/dashboard">Volver al panel</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
