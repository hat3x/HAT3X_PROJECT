"use client";

import { useState } from "react";
import { AlertCircle, CreditCard, Send, ShoppingBag } from "lucide-react";

import { centsToEuroInput, type TicketLine, type TicketTotals } from "@/app/(dashboard)/tpv/cart";
import { PaymentSheet } from "@/app/(dashboard)/mostrador/payment-sheet";
import {
  buildTicketData,
  PAYMENT_METHOD_LABELS,
  printTicketDocument,
} from "@/app/(dashboard)/tpv/print-ticket";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  useAddOrderItems,
  useCreateOrder,
  useSendOrderToStations,
  useSettleOrder,
} from "@/hooks/use-orders";
import { formatMoney } from "@/lib/format";
import { printKitchenComanda } from "@/lib/restauracion/kitchen-comanda";
import {
  buildSettleLines,
  settleTotals,
  type OrderItemDraft,
} from "@/lib/restauracion/order";
import type { SettleTenderInput } from "@/lib/validations/order";
import type { Order, PosPaymentMethodRow, Station } from "@/types/database";

/** Una línea del pedido con el nombre ya resuelto (cabecera de producto o
 * pieza de combo) para poder pintarla e imprimirla sin volver a consultar
 * el catálogo. */
export interface OrderPanelItem extends OrderItemDraft {
  name: string;
}

interface OrderPanelProps {
  salonId: string;
  /** Nombre comercial del salón; cabecera del ticket impreso. */
  salonName: string;
  /** Pedido actual (ya persistido), o `null` si todavía no se ha creado. */
  order: Order | null;
  /** TODAS las líneas del pedido en curso (ya enviadas + pendientes de mandar). */
  items: OrderPanelItem[];
  /** Ids de `items` que TODAVÍA no están en base de datos. */
  pendingIds: ReadonlySet<string>;
  stations: Station[];
  paymentMethods: PosPaymentMethodRow[];
  /** El pedido se creó (primer Mandar/Cobrar): el padre debe recordar su id. */
  onOrderPersisted: (order: Order) => void;
  /** Mandar terminó con éxito: el padre debe vaciar `pendingIds`. */
  onItemsSent: () => void;
  /** Cobro registrado: el padre debe resetear a un pedido nuevo/vacío. */
  onSettled: () => void;
}

/**
 * Panel de líneas + totales del mostrador, con las dos acciones del flujo:
 * Mandar (abre cuenta / envía comanda sin cobrar) y Cobrar (abre el diálogo
 * de pago y liquida el pedido). Sigue el patrón de `tpv-view.tsx`: el propio
 * panel orquesta las mutaciones de `@/hooks/use-orders` y la impresión, en
 * vez de delegar en el padre — así `mostrador-view.tsx` solo mantiene el
 * ESTADO del pedido en curso (líneas locales) y este componente decide CUÁNDO
 * persistirlo.
 */
export function OrderPanel({
  salonId,
  salonName,
  order,
  items,
  pendingIds,
  stations,
  paymentMethods,
  onOrderPersisted,
  onItemsSent,
  onSettled,
}: OrderPanelProps): React.ReactElement {
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createOrder = useCreateOrder(salonId);
  const addOrderItems = useAddOrderItems(salonId);
  const sendOrderToStations = useSendOrderToStations(salonId);
  const settleOrder = useSettleOrder(salonId);

  const displayLines = buildSettleLines(
    items.map((it) => ({
      productName: it.name,
      qty: it.qty,
      unitPriceCents: it.unitPriceCents,
      vatRate: it.vatRate,
      modifiersSnapshot: it.modifiersSnapshot,
    })),
  );
  const totals = settleTotals(displayLines);
  const pendingItems = items.filter((it) => pendingIds.has(it.id));

  const busy =
    createOrder.isPending ||
    addOrderItems.isPending ||
    sendOrderToStations.isPending ||
    settleOrder.isPending;

  function stationName(stationId: string | null): string {
    if (stationId === null) return "Sin estación";
    return stations.find((s) => s.id === stationId)?.name ?? "Estación";
  }

  /** Crea el pedido si todavía no existe (primer Mandar/Cobrar de la cuenta). */
  async function ensureOrder(): Promise<Order> {
    if (order !== null) return order;
    const id = crypto.randomUUID();
    const created = await createOrder.mutateAsync({ id, label: null, idempotencyKey: id });
    onOrderPersisted(created);
    return created;
  }

  /** Imprime una comanda por estación, agrupando las líneas recién mandadas. */
  function printComandas(current: Order, mandados: OrderPanelItem[]): void {
    const groups = new Map<string, OrderPanelItem[]>();
    for (const item of mandados) {
      const key = item.stationId ?? "__none__";
      const list = groups.get(key) ?? [];
      list.push(item);
      groups.set(key, list);
    }
    for (const [key, groupItems] of groups) {
      printKitchenComanda({
        orderNumber: current.order_number ?? 0,
        stationName: stationName(key === "__none__" ? null : key),
        label: current.label,
        issuedAt: new Date(),
        lines: groupItems.map((item) => ({
          qty: item.qty,
          name: item.name,
          modifiers: item.modifiersSnapshot.map((mod) => mod.name),
        })),
      });
    }
  }

  /** Ticket de cliente para el pedido cobrado (adapta las líneas resueltas al
   * formato de `buildTicketData`, que reutiliza el documento térmico del TPV). */
  function printTicket(saleId: string, tenders: SettleTenderInput[]): void {
    const ticketLines: TicketLine[] = displayLines.map((line, i) => ({
      localId: items[i]!.id,
      kind: "manual",
      refId: null,
      description: line.description,
      quantity: String(line.qty),
      unitPrice: centsToEuroInput(line.unitPriceCents),
      vatRate: String(line.vatRate),
    }));
    const ticketTotals: TicketTotals = {
      ...totals,
      couponPercentOff: null,
      couponDiscountCents: 0,
      grossTotalCents: totals.totalCents,
    };
    const ticketTenders = tenders.map((t) => ({
      label:
        (t.paymentMethodId !== null
          ? paymentMethods.find((m) => m.id === t.paymentMethodId)?.name
          : undefined) ?? PAYMENT_METHOD_LABELS[t.method],
      amountCents: t.amountCents,
    }));
    printTicketDocument(
      buildTicketData({
        salonName,
        ticketRef: saleId.slice(0, 8).toUpperCase(),
        issuedAt: new Date(),
        lines: ticketLines,
        totals: ticketTotals,
        tenders: ticketTenders,
        loyalty: null,
        notes: null,
      }),
    );
  }

  async function handleSend(): Promise<void> {
    if (pendingItems.length === 0) return;
    setError(null);
    try {
      const current = await ensureOrder();
      await addOrderItems.mutateAsync({ orderId: current.id, items: pendingItems });
      await sendOrderToStations.mutateAsync({ orderId: current.id });
      printComandas(current, pendingItems);
      onItemsSent();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo mandar el pedido");
    }
  }

  async function handleConfirmPayment(tenders: SettleTenderInput[]): Promise<void> {
    setError(null);
    try {
      const current = await ensureOrder();
      // "Pagar primero": si quedan líneas sin mandar, se añaden ahora; el
      // propio `settleOrder` con `sendPending: true` las manda a estación
      // tras cobrar (mismo criterio que `mostrador/actions.ts`, §10).
      const payFirst = pendingItems.length > 0;
      if (payFirst) {
        await addOrderItems.mutateAsync({ orderId: current.id, items: pendingItems });
      }
      const result = await settleOrder.mutateAsync({
        orderId: current.id,
        tenders,
        sendPending: true,
      });
      printTicket(result.saleId, tenders);
      if (payFirst) {
        printComandas(current, pendingItems);
      }
      setPaying(false);
      onSettled();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cobrar el pedido");
    }
  }

  return (
    <Card className="flex flex-col overflow-hidden lg:sticky lg:top-6 lg:h-fit lg:max-h-[calc(100vh-3rem)]">
      <div className="flex items-center justify-between gap-2 border-b border-border/70 bg-muted/30 px-5 py-4">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <ShoppingBag className="h-[1.15rem] w-[1.15rem]" />
          </span>
          <div className="leading-tight">
            <p className="text-sm font-semibold text-foreground">Pedido</p>
            <p className="text-xs text-muted-foreground">
              {items.length > 0
                ? `${items.length} línea${items.length !== 1 ? "s" : ""}`
                : "Vacío"}
            </p>
          </div>
        </div>
        {order !== null ? (
          <Badge variant="secondary" className="tabular-nums">
            Pedido #{order.order_number ?? "—"}
          </Badge>
        ) : null}
      </div>

      <CardContent className="flex flex-1 flex-col gap-3 overflow-y-auto p-5">
        {displayLines.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-card/40 px-4 py-10 text-center">
            <p className="max-w-[16rem] text-sm text-muted-foreground">
              Toca un producto de la carta para empezar el pedido.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {displayLines.map((line, i) => (
              <li
                key={items[i]!.id}
                className="flex items-center justify-between gap-2 rounded-xl border border-border/70 bg-card p-3 text-sm shadow-xs"
              >
                <span className="min-w-0 flex-1">
                  <span className="font-medium tabular-nums text-foreground">
                    {line.qty}×
                  </span>{" "}
                  <span className="text-foreground">{line.description}</span>
                  {pendingIds.has(items[i]!.id) ? (
                    <Badge variant="outline" className="ml-2 align-middle text-[10px]">
                      Sin mandar
                    </Badge>
                  ) : null}
                </span>
                <span className="shrink-0 font-semibold tabular-nums text-foreground">
                  {formatMoney(line.unitPriceCents * line.qty)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <div className="border-t border-border/70 bg-muted/30 p-5">
        <dl className="grid gap-1.5 text-sm">
          <div className="flex justify-between text-muted-foreground">
            <dt>Base imponible</dt>
            <dd className="tabular-nums">{formatMoney(totals.subtotalCents)}</dd>
          </div>
          {totals.vatBreakdown.map((entry) => (
            <div key={entry.vatRate} className="flex justify-between text-muted-foreground">
              <dt>IVA {entry.vatRate}%</dt>
              <dd className="tabular-nums">{formatMoney(entry.taxCents)}</dd>
            </div>
          ))}
          <div className="mt-1.5 flex items-baseline justify-between border-t border-border/70 pt-3">
            <dt className="text-base font-semibold">Total</dt>
            <dd className="text-2xl font-bold tabular-nums tracking-tight">
              {formatMoney(totals.totalCents)}
            </dd>
          </div>
        </dl>

        {error !== null ? (
          <p
            role="alert"
            className="mt-3 flex items-center gap-2 rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive"
          >
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </p>
        ) : null}

        <div className="mt-4 grid grid-cols-2 gap-2.5">
          <Button
            size="lg"
            variant="outline"
            className="h-14 rounded-xl text-base font-semibold"
            disabled={pendingItems.length === 0 || busy}
            onClick={() => void handleSend()}
          >
            <Send className="mr-2 h-4 w-4" />
            Mandar
          </Button>
          <Button
            size="lg"
            className="h-14 rounded-xl text-base font-semibold"
            disabled={items.length === 0 || busy}
            onClick={() => setPaying(true)}
          >
            <CreditCard className="mr-2 h-4 w-4" />
            Cobrar {items.length > 0 ? formatMoney(totals.totalCents) : ""}
          </Button>
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
          paymentMethods={paymentMethods}
          pending={settleOrder.isPending || addOrderItems.isPending || createOrder.isPending}
          error={error}
          onConfirm={(tenders) => void handleConfirmPayment(tenders)}
        />
      ) : null}
    </Card>
  );
}
