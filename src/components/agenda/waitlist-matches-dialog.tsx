"use client";

import { useState } from "react";
import { BellRing, Loader2, Phone } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useSetWaitlistStatus, useWaitlistMatches } from "@/hooks/use-waitlist";
import type { FreedSlot } from "@/lib/booking/waitlist";
import { formatTimeInZone } from "@/lib/booking/timezone";

/**
 * A quién llamar cuando acaba de quedar libre un hueco (B3).
 *
 * Aparece justo después de cancelar una cita, que es el único momento en que la
 * lista de espera vale de algo. Antes de esto, cancelar dejaba un sillón parado
 * y a nadie sabiendo que había sitio.
 *
 * Dos decisiones deliberadas:
 *
 *  · **El teléfono es el contenido, no un detalle.** Va marcable de un toque,
 *    porque lo siguiente que pasa es una llamada.
 *  · **No se reordena aquí.** Se respeta el orden del motor —prioridad, y a
 *    igualdad quien lleva más tiempo esperando—. Cualquier reordenación en la
 *    pantalla rompería la única promesa de justicia que tiene la lista.
 */

export interface WaitlistMatchesDialogProps {
  salonId: string;
  /** Hueco liberado. `null` mientras no haya ninguno. */
  slot: FreedSlot | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function WaitlistMatchesDialog({
  salonId,
  slot,
  open,
  onOpenChange,
}: WaitlistMatchesDialogProps): React.ReactElement | null {
  const { data: matches, isLoading } = useWaitlistMatches(salonId, slot);
  const statusMutation = useSetWaitlistStatus(salonId);
  const [avisados, setAvisados] = useState<Set<string>>(new Set());

  if (slot === null) return null;

  const hora = `${formatTimeInZone(slot.startsAt, slot.timeZone)}–${formatTimeInZone(
    slot.endsAt,
    slot.timeZone,
  )}`;

  function avisar(entryId: string): void {
    statusMutation.mutate(
      { entryId, status: "avisado" },
      { onSuccess: () => setAvisados((prev) => new Set(prev).add(entryId)) },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ha quedado libre el hueco de las {hora}</DialogTitle>
          <DialogDescription>
            Estas personas están esperando y les encaja. Por orden: primero quien tiene prioridad
            y, a igualdad, quien lleva más tiempo apuntado.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : matches.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">
            Nadie de la lista encaja con este hueco. La cita queda libre en la agenda.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {matches.map((entry) => (
              <li
                key={entry.id}
                data-testid={`candidato-${entry.id}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3"
              >
                <div className="min-w-0">
                  <p data-testid="candidato-nombre" className="text-sm font-medium">
                    {entry.customer?.full_name ?? "—"}
                  </p>
                  {entry.customer?.phone == null ? (
                    <p className="text-xs text-muted-foreground">Sin teléfono</p>
                  ) : (
                    <a
                      href={`tel:${entry.customer.phone}`}
                      className="flex items-center gap-1.5 text-sm text-muted-foreground hover:underline"
                    >
                      <Phone className="h-3.5 w-3.5" aria-hidden="true" />
                      {entry.customer.phone}
                    </a>
                  )}
                </div>

                {avisados.has(entry.id) ? (
                  <Badge variant="secondary">Avisada</Badge>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    disabled={statusMutation.isPending}
                    onClick={() => avisar(entry.id)}
                    aria-label={`Marcar como avisada a ${entry.customer?.full_name ?? "esta persona"}`}
                  >
                    {statusMutation.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    ) : (
                      <BellRing className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    Avisada
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
