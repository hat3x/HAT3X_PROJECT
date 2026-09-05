import { OrderTicketCard } from "@/app/(dashboard)/cocina/order-ticket-card";
import type { KdsOrderGroup } from "@/lib/restauracion/kds";

interface StationColumnProps {
  salonId: string;
  stationName: string;
  groups: KdsOrderGroup[];
  /** Reloj compartido de `CocinaView`, ver `OrderTicketCard`. */
  now: Date;
}

/**
 * Columna de una estación (cocina, barra…) del KDS: encabezado con el
 * nombre y el nº de comandas activas, y la lista de tarjetas de pedido —ya
 * ordenadas FIFO por `groupKdsItemsByOrder`, la más antigua primero, igual
 * que despacharía la cocina en persona. Ancho fijo pensado para pantalla
 * grande: varias columnas visibles a la vez, con scroll horizontal en la
 * fila si no caben todas (ver `CocinaView`).
 */
export function StationColumn({
  salonId,
  stationName,
  groups,
  now,
}: StationColumnProps): React.ReactElement {
  return (
    <section className="flex w-80 shrink-0 flex-col gap-3 rounded-xl border border-border/70 bg-muted/30 p-3">
      <header className="flex items-center justify-between gap-2 px-1">
        <h2 className="truncate text-lg font-bold tracking-tight">{stationName}</h2>
        <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold tabular-nums text-primary">
          {groups.length}
        </span>
      </header>

      {groups.length === 0 ? (
        <p className="px-1 text-sm text-muted-foreground">Sin comandas activas.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {groups.map((group) => (
            <OrderTicketCard key={group.orderId} salonId={salonId} group={group} now={now} />
          ))}
        </div>
      )}
    </section>
  );
}
