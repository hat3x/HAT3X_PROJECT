"use client";

import { Plus, Receipt } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { useOpenOrders } from "@/hooks/use-orders";
import type { Order } from "@/types/database";

interface OpenOrdersBarProps {
  salonId: string;
  /** Id del pedido que se está trabajando ahora mismo, o `null` (cuenta nueva). */
  activeOrderId: string | null;
  /** Reabre una cuenta abierta: carga sus líneas en el panel. */
  onSelect: (order: Order) => void;
  /** Empieza una cuenta nueva (descarta el trabajo en curso sin persistir). */
  onNew: () => void;
}

/**
 * Barra de cuentas abiertas del salón: permite retomar un pedido `abierta`
 * (mandado a cocina pero aún no cobrado) o empezar uno nuevo. Mismo patrón
 * visual que el `AppointmentPicker` de `tpv/tpv-view.tsx` (fila de chips con
 * `aria-pressed` para la selección activa).
 */
export function OpenOrdersBar({
  salonId,
  activeOrderId,
  onSelect,
  onNew,
}: OpenOrdersBarProps): React.ReactElement {
  const openOrders = useOpenOrders(salonId);

  if (openOrders.isPending) {
    return <Skeleton className="h-11 w-full max-w-md rounded-xl" />;
  }

  const orders = openOrders.data ?? [];

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/70 bg-[var(--glass-panel)] backdrop-blur-xl backdrop-saturate-150 p-3 shadow-xs">
      <span className="inline-flex items-center gap-1.5 pl-1 pr-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <Receipt className="h-3.5 w-3.5" />
        Cuentas abiertas
      </span>

      <button
        type="button"
        onClick={onNew}
        aria-pressed={activeOrderId === null}
        className={[
          "inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium transition-all duration-200 ease-apple-out active:scale-[0.98]",
          activeOrderId === null
            ? "border-primary/40 bg-primary/10 text-primary"
            : "border-border/70 bg-background text-foreground hover:border-primary/30 hover:bg-accent",
        ].join(" ")}
      >
        <Plus className="h-3.5 w-3.5" />
        Cuenta nueva
      </button>

      {orders.length === 0 ? (
        <span className="text-sm text-muted-foreground">No hay cuentas abiertas.</span>
      ) : (
        orders.map((order) => {
          const active = activeOrderId === order.id;
          return (
            <button
              key={order.id}
              type="button"
              onClick={() => onSelect(order)}
              aria-pressed={active}
              className={[
                "inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm font-medium transition-all duration-200 ease-apple-out active:scale-[0.98]",
                active
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border/70 bg-background text-foreground hover:border-primary/30 hover:bg-accent",
              ].join(" ")}
            >
              <span className="tabular-nums">#{order.order_number ?? "—"}</span>
              {order.label !== null && order.label.trim() !== "" ? (
                <>
                  <span className="text-muted-foreground">·</span>
                  <span className="max-w-[9rem] truncate">{order.label}</span>
                </>
              ) : null}
            </button>
          );
        })
      )}
    </div>
  );
}
