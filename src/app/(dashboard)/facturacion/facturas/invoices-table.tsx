import { FileText } from "lucide-react";

import { DeleteInvoiceButton } from "@/app/(dashboard)/facturacion/facturas/delete-invoice-button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  INVOICE_TYPE_CODE,
  INVOICE_TYPE_LABEL,
  type InvoiceRow,
  type InvoiceTotals,
} from "@/lib/facturacion/rows";
import { formatDate, formatMoney } from "@/lib/format";

interface InvoicesTableProps {
  invoices: InvoiceRow[];
  /** Totales del periodo FILTRADO (no solo de las filas mostradas). */
  totals: InvoiceTotals;
  /** Moneda para formatear el pie de totales (el proyecto opera en EUR). */
  currency?: string;
}

/**
 * Libro registro de facturas (`pos_invoices`) como tabla de solo lectura, con una
 * fila de TOTALES del periodo filtrado en el pie.
 *
 * Cada fila enlaza al documento imprimible (`GET /api/facturacion/documento/[id]`,
 * F1/F2) que se abre en una pestaña nueva. Los importes usan el snapshot cerrado
 * del registro (base, IVA, total ya cuadran por construcción) y se formatean con
 * `formatMoney`; las columnas de dinero van alineadas a la derecha y con cifras
 * tabulares para que comparen en vertical.
 *
 * El pie (`TableFooter`) suma base imponible, IVA y total de TODO el periodo
 * filtrado —no solo de las filas visibles— porque procede de la agregación en
 * servidor (`salon_invoices_totals`). Por eso incluye el nº de facturas: si supera
 * las filas mostradas, la vista avisa del recorte.
 */
export function InvoicesTable({
  invoices,
  totals,
  currency = "EUR",
}: InvoicesTableProps): React.ReactElement {
  return (
    <div className="animate-fade-up overflow-hidden rounded-xl border [animation-delay:60ms]">
      <Table scrollRegionLabel="Libro registro de facturas (desplázate en horizontal para ver todas las columnas)">
        <TableCaption className="sr-only">
          Libro registro de facturas del periodo: número, tipo, fecha, destinatario,
          base imponible, IVA y total por documento, con la fila de totales al pie.
        </TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead scope="col">Número</TableHead>
            <TableHead scope="col">Tipo</TableHead>
            <TableHead scope="col">Fecha</TableHead>
            <TableHead scope="col">Destinatario</TableHead>
            <TableHead scope="col" className="text-right">
              Base imponible
            </TableHead>
            <TableHead scope="col" className="text-right">
              IVA
            </TableHead>
            <TableHead scope="col" className="text-right">
              Total
            </TableHead>
            <TableHead scope="col" className="w-[1%] text-right">
              Acciones
            </TableHead>
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
                <div className="flex items-center justify-end gap-1">
                  <a
                    href={`/api/facturacion/documento/${invoice.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Abrir el documento de la factura ${invoice.fullNumber} para imprimir o descargar`}
                    title="Abrir para imprimir o guardar como PDF"
                    className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium text-primary transition-colors duration-150 ease-apple-out hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <FileText className="h-4 w-4" aria-hidden="true" />
                    <span className="sr-only sm:not-sr-only">Ver</span>
                  </a>
                  <DeleteInvoiceButton
                    invoiceId={invoice.id}
                    invoiceNumber={invoice.fullNumber}
                  />
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow className="hover:bg-transparent">
            <TableCell colSpan={4} className="text-xs font-medium text-muted-foreground">
              Totales del periodo
              <span className="ml-1.5 font-normal tabular-nums">
                · {totals.invoiceCount}{" "}
                {totals.invoiceCount === 1 ? "factura" : "facturas"}
              </span>
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {formatMoney(totals.taxableBaseCents, currency)}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {formatMoney(totals.taxCents, currency)}
            </TableCell>
            <TableCell className="text-right font-semibold tabular-nums">
              {formatMoney(totals.totalCents, currency)}
            </TableCell>
            <TableCell aria-hidden="true" />
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  );
}
