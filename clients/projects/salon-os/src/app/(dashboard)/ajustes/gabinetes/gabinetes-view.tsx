"use client";

import { useState } from "react";
import { Armchair, Loader2, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useCreateOperatory,
  useOperatories,
  useSetOperatoryActive,
} from "@/hooks/use-operatories";
import { cn } from "@/lib/utils";

/**
 * Gabinetes de la clínica (B2).
 *
 * El gabinete es un recurso compartido: dos profesionales pueden trabajar a la
 * vez, pero no en el mismo sillón. Hasta ahora eso se resolvía con un
 * interruptor que bloqueaba la clínica entera; aquí se declaran de verdad.
 *
 * La pantalla avisa de algo que no se espera de unos ajustes: **dar de alta el
 * primer gabinete cambia cómo se calculan los huecos**. Mientras no haya
 * ninguno, todo funciona como siempre.
 */

export interface GabinetesViewProps {
  salonId: string;
}

export function GabinetesView({ salonId }: GabinetesViewProps): React.ReactElement {
  const { data, isPending, isError } = useOperatories(salonId);
  const crear = useCreateOperatory(salonId);
  const cambiar = useSetOperatoryActive(salonId);

  const [nombre, setNombre] = useState("");
  const [error, setError] = useState<string | null>(null);

  function anadir(): void {
    if (nombre.trim() === "") {
      setError("Ponle nombre al gabinete.");
      return;
    }
    setError(null);
    crear.mutate(
      { name: nombre.trim() },
      {
        onSuccess: () => setNombre(""),
        onError: (e: Error) => setError(e.message),
      },
    );
  }

  const lista = data ?? [];

  return (
    <Card className="animate-fade-up">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Armchair className="h-5 w-5" aria-hidden="true" />
          Gabinetes
        </CardTitle>
        <CardDescription>
          Los sillones de la clínica. Dos profesionales pueden atender a la vez, pero no en el
          mismo gabinete: la agenda deja de ofrecer una hora cuando no queda ninguno libre.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Aviso deliberado: es un cambio de comportamiento que nadie espera de
            una pantalla de ajustes. Mientras no haya ninguno, todo sigue igual. */}
        <p className="rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
          <strong>Sin gabinetes</strong> dados de alta, la agenda funciona como hasta ahora. En
          cuanto crees el primero, empezará a tenerlos en cuenta para decidir qué horas ofrece.
        </p>

        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-48 flex-1 space-y-1">
            <Label htmlFor="gab-nombre" className="text-xs">
              Nombre
            </Label>
            <Input
              id="gab-nombre"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Gabinete 1, Sala de cirugía…"
            />
          </div>
          <Button type="button" onClick={anadir} disabled={crear.isPending}>
            {crear.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
            )}
            Añadir
          </Button>
        </div>

        {error !== null ? <p className="text-sm text-destructive">{error}</p> : null}

        {isPending ? (
          <Skeleton className="h-20 w-full" />
        ) : isError ? (
          <p className="text-sm text-destructive">No se pudieron cargar los gabinetes.</p>
        ) : lista.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">
            No hay gabinetes todavía.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {lista.map((g) => (
              <li
                key={g.id}
                className={cn(
                  "flex flex-wrap items-center justify-between gap-2 rounded-md border p-3",
                  !g.active && "opacity-60",
                )}
              >
                <span className="text-sm font-medium">
                  {g.name}
                  {g.active ? null : (
                    <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-[11px] font-normal">
                      Desactivado
                    </span>
                  )}
                </span>
                {/* Se DESACTIVA, no se borra: las citas atendidas en él
                    quedarían sin explicación. */}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => cambiar.mutate({ id: g.id, active: !g.active }, {})}
                >
                  {g.active ? "Desactivar" : "Activar"}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
