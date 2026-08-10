"use client";

import { Timer } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useSetOrderItemStatus } from "@/hooks/use-orders";
import { elapsedMinutes, type KdsItem, type KdsOrderGroup } from "@/lib/restauracion/kds";
import { cn } from "@/lib/utils";
import type { OrderItemStatus } from "@/types/database";

interface OrderTicketCardProps {
  salonId: string;
  group: KdsOrderGroup;
  /** Reloj compartido de la vista (Task 4): refrescado cada 30s por
   * `CocinaView`, NUNCA `Date.now()` calculado aquí — mantiene el
   * cronómetro puro y testable con un `now` fijo. */
  now: Date;
}

/**
 * Franja de color del cronómetro por antigüedad de la línea: verde (<5 min),
 * ámbar (5-10 min) y rojo (>10 min) — misma escala de urgencia visual que
 * usa `day-panel-view.tsx` para el indicador de Realtime, aplicada aquí a
 * tiempo de espera en cocina.
 */
function timerTone(minutes: number): string {
  if (minutes > 10) return "border-destructive/25 bg-destructive/10 text-destructive";
  if (minutes >= 5) return "border-warning/25 bg-warning/10 text-warning";
  return "border-success/25 bg-success/10 text-success";
}

/**
 * Tarjeta de comanda del KDS: una por pedido dentro de una columna de
 * estación (`StationColumn`). Cada línea puede avanzar de estado con un
 * botón — **Entregar** (enviado/preparando → listo) o **Entregado**
 * (listo → entregado) — llamando a `useSetOrderItemStatus`, cuya mutation
 * server-side condiciona el UPDATE por `status = from` (ver
 * `mostrador/actions.ts`). Si el servidor rechaza por CONFLICTO (otro
 * miembro del equipo ya cambió el estado de esa línea), no hace falta
 * manejarlo aquí explícitamente: `useKdsRealtime` invalida la query del KDS
 * en cualquier cambio de `order_items` y la lista se refresca sola.
 */
export function OrderTicketCard({ salonId, group, now }: OrderTicketCardProps): React.ReactElement {
  const setStatus = useSetOrderItemStatus(salonId);

  function advance(item: KdsItem, to: OrderItemStatus): void {
    setStatus.mutate({ itemId: item.id, from: item.status as OrderItemStatus, to });
  }

  return (
    <Card className="border-border/70">
      <CardHeader className="flex flex-row items-baseline gap-2 space-y-0 p-4 pb-2">
        <span className="text-2xl font-bold leading-none tabular-nums">#{group.orderNumber}</span>
        {group.orderLabel !== null && group.orderLabel.trim() !== "" ? (
          <span className="truncate text-sm font-medium text-muted-foreground">{group.orderLabel}</span>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-2.5 p-4 pt-0">
        {group.items.map((item) => {
          const minutes = elapsedMinutes(item.createdAt, now);
          return (
            <div
              key={item.id}
              className="flex flex-wrap items-center gap-2.5 rounded-lg border border-border/60 bg-background/60 p-2.5"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-foreground">
                  <span className="tabular-nums">{item.qty}×</span> {item.productName}
                </p>
                {item.modifiers.length > 0 ? (
                  <p className="truncate text-xs text-muted-foreground">{item.modifiers.join(", ")}</p>
                ) : null}
              </div>

              <span
                className={cn(
                  "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium tabular-nums transition-colors duration-150 ease-apple-out",
                  timerTone(minutes),
                )}
              >
                <Timer className="h-3 w-3" aria-hidden="true" />
                {minutes} min
              </span>

              {item.status !== "listo" ? (
                <Button size="sm" onClick={() => advance(item, "listo")} disabled={setStatus.isPending}>
                  Entregar
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => advance(item, "entregado")}
                  disabled={setStatus.isPending}
                >
                  Entregado
                </Button>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
