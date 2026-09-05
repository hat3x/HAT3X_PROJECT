import Link from "next/link";
import { ChevronRight, Printer } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  SALE_STATUS_LABEL,
  SALE_STATUS_VARIANT,
  type SaleRow,
} from "@/lib/facturacion/rows";
import { formatSaleRef } from "@/lib/facturacion/sale-ticket";
import { formatDateTime, formatMoney } from "@/lib/format";

interface SalesTableProps {
  sales: SaleRow[];
}

/** Marcador de posición para un dato ausente (sede/profesional/cliente/pago). */
function Placeholder({ children }: { children: React.ReactNode }): React.ReactElement {
  return <span className="text-muted-foreground">{children}</span>;
}

/**
 * Histórico de tickets / ventas (`pos_sales`) como tabla de solo lectura.
 *
 * Muestra el snapshot ya cerrado de cada venta: fecha, sede (vía sesión de caja),
 * profesional, cliente (si lo hubo), método(s) de pago, total (`formatMoney`) y
 * estado. El total va alineado a la derecha con cifras tabulares; el estado y el
 * pago mixto se comunican con `Badge`.
 *
 * Cada fila abre el DETALLE de la venta (`/facturacion/tickets/[id]`, líneas y
 * cobros) y permite REIMPRIMIR el ticket térmico (`/api/facturacion/ticket/[id]`,
 * que reutiliza el generador del TPV). Ambas acciones son de solo lectura.
 */
export function SalesTable({ sales }: SalesTableProps): React.ReactElement {
  return (
    <div className="animate-fade-up overflow-hidden rounded-xl border bg-[var(--glass-panel)] backdrop-blur-xl backdrop-saturate-150 shadow-sm [animation-delay:60ms]">
      <Table scrollRegionLabel="Histórico de tickets y ventas (desplázate en horizontal para ver todas las columnas)">
        <TableCaption className="sr-only">
          Histórico de tickets y ventas: fecha, sede, profesional, cliente, método de
          pago, total y estado de cada venta, con acceso al detalle y a la reimpresión.
        </TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead scope="col">Fecha</TableHead>
            <TableHead scope="col">Sede</TableHead>
            <TableHead scope="col">Profesional</TableHead>
            <TableHead scope="col">Cliente</TableHead>
            <TableHead scope="col">Pago</TableHead>
            <TableHead scope="col" className="text-right">
              Total
            </TableHead>
            <TableHead scope="col">Estado</TableHead>
            <TableHead scope="col" className="w-[1%] text-right">
              Detalle
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sales.map((sale) => (
            <TableRow key={sale.id}>
              <TableCell className="whitespace-nowrap text-muted-foreground">
                {formatDateTime(sale.soldAt)}
              </TableCell>
              <TableCell>
                {sale.locationName ?? <Placeholder>Sin sede</Placeholder>}
              </TableCell>
              <TableCell>
                {sale.professionalName ?? <Placeholder>—</Placeholder>}
              </TableCell>
              <TableCell>
                {sale.customerName ?? <Placeholder>Sin cliente</Placeholder>}
              </TableCell>
              <TableCell>
                {sale.payment.label !== "" ? (
                  <span className="inline-flex items-center gap-2">
                    <span>{sale.payment.label}</span>
                    {sale.payment.isMixed ? (
                      <Badge variant="outline" className="font-normal">
                        Mixto
                      </Badge>
                    ) : null}
                  </span>
                ) : (
                  <Placeholder>—</Placeholder>
                )}
              </TableCell>
              <TableCell className="text-right font-semibold tabular-nums">
                {formatMoney(sale.totalCents, sale.currency)}
              </TableCell>
              <TableCell>
                <Badge variant={SALE_STATUS_VARIANT[sale.status]}>
                  {SALE_STATUS_LABEL[sale.status]}
                </Badge>
              </TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-0.5">
                  <Link
                    href={`/facturacion/tickets/${sale.id}`}
                    aria-label={`Ver el detalle de la venta ${formatSaleRef(sale.id)}`}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm font-medium text-primary transition-colors duration-150 ease-apple-out hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <span className="sr-only sm:not-sr-only">Detalle</span>
                    <ChevronRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                  <a
                    href={`/api/facturacion/ticket/${sale.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Reimprimir el ticket de la venta ${formatSaleRef(sale.id)}`}
                    title="Reimprimir ticket"
                    className="inline-flex items-center justify-center rounded-md p-1.5 text-muted-foreground transition-colors duration-150 ease-apple-out hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <Printer className="h-4 w-4" aria-hidden="true" />
                  </a>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
