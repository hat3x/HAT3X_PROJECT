"use client";

import { useState } from "react";
import { AlertCircle, Clock, CreditCard, Plus, Receipt, Sparkles, UtensilsCrossed, X } from "lucide-react";

import { PaymentSheet } from "@/app/(dashboard)/mostrador/payment-sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useOrderItems, useSettleOrder } from "@/hooks/use-orders";
import { useSetTableStatus } from "@/hooks/use-tables";
import { formatMoney } from "@/lib/format";
import { elapsedMinutes } from "@/lib/restauracion/kds";
import { settleTotals, type SettleLineInput } from "@/lib/restauracion/order";
import type { SettleTenderInput } from "@/lib/validations/order";
import type { DiningTable, Order, TableStatus } from "@/types/database";

const STATUS_LABELS: Record<TableStatus, string> = {
  libre: "Libre",
  ocupada: "Ocupada",
  cuenta_pedida: "Cuenta pedida",
  por_limpiar: "Por limpiar",
};

/**
 * Etiqueta de línea de comanda: `useOrderItems` (`@/hooks/use-orders`) lee
 * `order_items` en crudo (solo `product_id`, sin el nombre resuelto que sí
 * lleva `OrderPanelItem` en el mostrador — ahí el nombre se conoce en
 * cliente porque la línea nace de la carta ya cargada). Sin un join al
 * catálogo (que esta tarea no trae, ver "Dudas" del reporte), se usa el
 * mismo fallback que ya adopta el KDS cuando no puede resolver el nombre
 * (`fetchKdsItems`, `@/lib/queries/kds.ts`: `row.products?.name ?? "Producto"`).
 */
const LINE_FALLBACK_NAME = "Producto";

interface TablePanelProps {
  table: DiningTable;
  order: Order | null;
  salonId: string;
  now: Date;
  onClose: () => void;
  onAdd: () => void;
}

/**
 * Panel de mesa (Task 6): al tocar una mesa ocupada, muestra su comanda, el
 * tiempo sentados, el total, los comensales y las acciones — reusa
 * `useOrderItems`/`useSettleOrder` (comanda + cobro) y `useSetTableStatus`
 * (Task 5, transición de estado) en vez de reimplementar nada. Sigue el
 * patrón visual de `mostrador/order-panel.tsx`: el propio panel orquesta las
 * mutaciones, el padre (`sala-view.tsx`, tarea futura) solo pasa `table`/
 * `order` y reacciona a `onClose`/`onAdd`.
 */
export function TablePanel({
  table,
  order,
  salonId,
  now,
  onClose,
  onAdd,
}: TablePanelProps): React.ReactElement {
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: rawItems } = useOrderItems(salonId, order?.id ?? null);
  const setTableStatus = useSetTableStatus(salonId);
  const settleOrder = useSettleOrder(salonId);

  // Líneas activas: excluye tanto la fila de auditoría de una anulación
  // (`void_of_item_id !== null`) como el original ya marcado `anulado` — el
  // MISMO criterio que `settleOrder` aplica en servidor
  // (`mostrador/actions.ts`, §"Líneas a cobrar: NO anuladas") para que el
  // total mostrado aquí cuadre con lo que de verdad se cobraría.
  const activeItems = (rawItems ?? []).filter(
    (it) => it.void_of_item_id === null && it.status !== "anulado",
  );
  const lines: SettleLineInput[] = activeItems.map((it) => ({
    description: LINE_FALLBACK_NAME,
    qty: it.qty,
    unitPriceCents: it.unit_price_cents,
    vatRate: it.vat_rate,
  }));
  const totals = settleTotals(lines);

  const minutes = order !== null ? elapsedMinutes(order.created_at, now) : null;
  const busy = setTableStatus.isPending || settleOrder.isPending;

  function changeStatus(to: TableStatus): void {
    setError(null);
    setTableStatus.mutate(
      { tableId: table.id, from: table.status, to },
      { onError: (e) => setError(e instanceof Error ? e.message : "No se pudo actualizar la mesa") },
    );
  }

  function handleConfirmPayment(tenders: SettleTenderInput[]): void {
    if (order === null) return;
    setError(null);
    settleOrder.mutate(
      { orderId: order.id, tenders, sendPending: true },
      {
        onSuccess: () => {
          setPaying(false);
          // Orquestación pedida por el brief: al cobrar con éxito, la mesa
          // pasa a `por_limpiar` (nunca directamente a `libre` — hace falta
          // que alguien confirme que la mesa quedó recogida).
          setTableStatus.mutate({ tableId: table.id, from: table.status, to: "por_limpiar" });
        },
        onError: (e) => setError(e instanceof Error ? e.message : "No se pudo cobrar el pedido"),
      },
    );
  }

  return (
    <Card className="flex flex-col overflow-hidden lg:sticky lg:top-6 lg:h-fit lg:max-h-[calc(100vh-3rem)]">
      <div className="flex items-center justify-between gap-2 border-b border-border/70 bg-muted/30 px-5 py-4">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <UtensilsCrossed className="h-[1.15rem] w-[1.15rem]" />
          </span>
          <div className="leading-tight">
            <p className="text-sm font-semibold text-foreground">{table.name}</p>
            <p className="text-xs text-muted-foreground">{STATUS_LABELS[table.status]}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {order !== null ? (
            <Badge variant="secondary" className="tabular-nums">
              {order.covers ?? "—"} comensales
            </Badge>
          ) : null}
          <Button variant="ghost" size="icon" aria-label="Cerrar panel de mesa" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {order === null ? (
        <CardContent className="flex flex-1 flex-col items-center justify-center gap-2 p-10 text-center">
          <p className="max-w-[16rem] text-sm text-muted-foreground">
            Esta mesa no tiene una cuenta abierta.
          </p>
        </CardContent>
      ) : (
        <>
          {minutes !== null ? (
            <div className="flex items-center gap-1.5 border-b border-border/70 px-5 py-2.5 text-xs text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              Hace {minutes} min
            </div>
          ) : null}

          <CardContent className="flex flex-1 flex-col gap-3 overflow-y-auto p-5">
            {activeItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-card/40 px-4 py-8 text-center">
                <p className="max-w-[16rem] text-sm text-muted-foreground">
                  Todavía no hay líneas en la comanda.
                </p>
              </div>
            ) : (
              <ul className="flex flex-col gap-2">
                {activeItems.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center justify-between gap-2 rounded-xl border border-border/70 bg-card p-3 text-sm shadow-xs"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="font-medium tabular-nums text-foreground">{item.qty}×</span>{" "}
                      <span className="text-foreground">{LINE_FALLBACK_NAME}</span>
                    </span>
                    <span className="shrink-0 font-semibold tabular-nums text-foreground">
                      {formatMoney(item.unit_price_cents * item.qty)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>

          <div className="border-t border-border/70 bg-muted/30 p-5">
            <div className="flex items-baseline justify-between">
              <span className="text-base font-semibold">Total</span>
              <span className="text-2xl font-bold tabular-nums tracking-tight">
                {formatMoney(totals.totalCents)}
              </span>
            </div>

            {error !== null ? (
              <p
                role="alert"
                className="mt-3 flex items-center gap-2 rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive"
              >
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </p>
            ) : null}

            <div className="mt-4 flex flex-wrap gap-2.5">
              <Button
                variant="outline"
                className="h-12 flex-1 rounded-xl text-sm font-semibold"
                onClick={onAdd}
              >
                <Plus className="mr-2 h-4 w-4" />
                Añadir
              </Button>
              {table.status === "ocupada" ? (
                <Button
                  variant="outline"
                  className="h-12 flex-1 rounded-xl text-sm font-semibold"
                  disabled={busy}
                  onClick={() => changeStatus("cuenta_pedida")}
                >
                  <Receipt className="mr-2 h-4 w-4" />
                  Pedir cuenta
                </Button>
              ) : null}
              {table.status !== "por_limpiar" ? (
                <Button
                  className="h-12 flex-1 rounded-xl text-sm font-semibold"
                  disabled={busy || activeItems.length === 0}
                  onClick={() => setPaying(true)}
                >
                  <CreditCard className="mr-2 h-4 w-4" />
                  Cobrar
                </Button>
              ) : null}
              {table.status === "por_limpiar" ? (
                <Button
                  className="h-12 flex-1 rounded-xl text-sm font-semibold"
                  disabled={busy}
                  onClick={() => changeStatus("libre")}
                >
                  <Sparkles className="mr-2 h-4 w-4" />
                  Limpiar
                </Button>
              ) : null}
            </div>
          </div>

          {paying ? (
            <PaymentSheet
              open={paying}
              onOpenChange={(open) => {
                setPaying(open);
                if (!open) settleOrder.reset();
              }}
              totalCents={totals.totalCents}
              paymentMethods={[]}
              pending={settleOrder.isPending}
              error={error}
              onConfirm={handleConfirmPayment}
            />
          ) : null}
        </>
      )}
    </Card>
  );
}
