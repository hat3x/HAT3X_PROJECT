import { FileText } from "lucide-react";

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
  INVOICE_TYPE_CODE,
  INVOICE_TYPE_LABEL,
  type InvoiceRow,
} from "@/lib/facturacion/rows";
import { formatDate, formatMoney } from "@/lib/format";

interface InvoicesTableProps {
  invoices: InvoiceRow[];
}

/**
 * Libro registro de facturas (`pos_invoices`) como tabla de solo lectura.
 *
 * Cada fila enlaza al documento imprimible (`GET /api/facturacion/documento/[id]`,
 * F1/F2) que se abre en una pestaña nueva. Los importes usan el snapshot cerrado
 * del registro (base, IVA, total ya cuadran por construcción) y se formatean con
 * `formatMoney`; las columnas de dinero van alineadas a la derecha y con cifras
 * tabulares para que comparen en vertical.
 */
export function InvoicesTable({ invoices }: InvoicesTableProps): React.ReactElement {
  return (
    <div className="animate-fade-up overflow-hidden rounded-xl border [animation-delay:60ms]">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Número</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead>Fecha</TableHead>
            <TableHead>Destinatario</TableHead>
            <TableHead className="text-right">Base imponible</TableHead>
            <TableHead className="text-right">IVA</TableHead>
            <TableHead className="text-right">Total</TableHead>
            <TableHead className="w-[1%] text-right">Documento</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {invoices.map((invoice) => (
            <TableRow key={invoice.id}>
              <TableCell className="whitespace-nowrap font-medium tabular-nums">
                {invoice.fullNumber}
              </TableCell>
              <TableCell>
                <Badge variant="outline" title={INVOICE_TYPE_LABEL[invoice.invoiceType]}>
                  {INVOICE_TYPE_CODE[invoice.invoiceType]}
                </Badge>
              </TableCell>
              <TableCell className="whitespace-nowrap text-muted-foreground">
                {formatDate(invoice.issuedAt)}
              </TableCell>
              <TableCell>
                {invoice.recipientName !== null ? (
                  invoice.recipientName
                ) : (
                  <span className="text-muted-foreground">Cliente final</span>
                )}
              </TableCell>
              <TableCell className="text-right tabular-nums text-muted-foreground">
                {formatMoney(invoice.taxableBaseCents, invoice.currency)}
              </TableCell>
              <TableCell className="text-right tabular-nums text-muted-foreground">
                {formatMoney(invoice.taxCents, invoice.currency)}
              </TableCell>
              <TableCell className="text-right font-semibold tabular-nums">
                {formatMoney(invoice.totalCents, invoice.currency)}
              </TableCell>
              <TableCell className="text-right">
                <a
                  href={`/api/facturacion/documento/${invoice.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Ver el documento de la factura ${invoice.fullNumber}`}
                  className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium text-primary transition-colors duration-150 ease-apple-out hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <FileText className="h-4 w-4" aria-hidden="true" />
                  <span className="sr-only sm:not-sr-only">Ver</span>
                </a>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
