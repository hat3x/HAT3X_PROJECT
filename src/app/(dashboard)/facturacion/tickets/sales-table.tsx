import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
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
 */
export function SalesTable({ sales }: SalesTableProps): React.ReactElement {
  return (
    <div className="animate-fade-up overflow-hidden rounded-xl border [animation-delay:60ms]">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Fecha</TableHead>
            <TableHead>Sede</TableHead>
            <TableHead>Profesional</TableHead>
            <TableHead>Cliente</TableHead>
            <TableHead>Pago</TableHead>
            <TableHead className="text-right">Total</TableHead>
            <TableHead>Estado</TableHead>
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
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
