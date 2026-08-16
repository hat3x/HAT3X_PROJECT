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
import { SALE_STATUS_LABEL, SALE_STATUS_VARIANT } from "@/lib/facturacion/rows";
import type { SaleDetail } from "@/lib/facturacion/sale-ticket";
import { formatDateTime, formatMoney } from "@/lib/format";

interface TicketDetailViewProps {
  detail: SaleDetail;
}

/** Marcador para un dato ausente (sede/profesional/cliente). */
function Placeholder({ children }: { children: React.ReactNode }): React.ReactElement {
  return <span className="text-muted-foreground">{children}</span>;
}

/** Campo etiquetado de la ficha de cabecera (label pequeño + valor). */
function MetaField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="space-y-1">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="text-sm font-medium">{children}</dd>
    </div>
  );
}

/**
 * Detalle de una venta cerrada (`pos_sales`): cabecera, LÍNEAS, desglose de IVA y
 * COBROS, en el lenguaje visual del panel. Solo lectura: la reimpresión del ticket
 * (documento térmico del TPV) y la nota de inmutabilidad completan la vista. Los
 * importes usan los snapshots ya cerrados por la caja; nada se recalcula aquí.
 */
export function TicketDetailView({ detail }: TicketDetailViewProps): React.ReactElement {
  const { currency } = detail;
  const hasDiscount = detail.discountCents > 0;

  return (
    <div className="space-y-8">
      {/* Cabecera de la venta */}
      <dl className="grid animate-fade-up grid-cols-2 gap-x-6 gap-y-5 rounded-xl border bg-[var(--glass-panel)] backdrop-blur-xl backdrop-saturate-150 p-5 sm:grid-cols-3 [animation-delay:60ms]">
        <MetaField label="Fecha y hora">{formatDateTime(detail.soldAt)}</MetaField>
        <MetaField label="Estado">
          <Badge variant={SALE_STATUS_VARIANT[detail.status]}>
            {SALE_STATUS_LABEL[detail.status]}
          </Badge>
        </MetaField>
        <MetaField label="Pago">
          {detail.payment.label !== "" ? (
            <span className="inline-flex items-center gap-2">
              <span>{detail.payment.label}</span>
              {detail.payment.isMixed ? (
                <Badge variant="outline" className="font-normal">
                  Mixto
                </Badge>
              ) : null}
            </span>
          ) : (
            <Placeholder>—</Placeholder>
          )}
        </MetaField>
        <MetaField label="Sede">
          {detail.locationName ?? <Placeholder>Sin sede</Placeholder>}
        </MetaField>
        <MetaField label="Profesional">
          {detail.professionalName ?? <Placeholder>—</Placeholder>}
        </MetaField>
        <MetaField label="Cliente">
          {detail.customerName ?? <Placeholder>Cliente final</Placeholder>}
        </MetaField>
      </dl>

      {/* Líneas de la venta */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold tracking-tight">Líneas</h3>
        {detail.lines.length === 0 ? (
          <p className="rounded-xl border border-dashed bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground">
            Esta venta no tiene líneas de detalle registradas.
          </p>
        ) : (
          <div className="animate-fade-up overflow-hidden rounded-xl border [animation-delay:80ms]">
            <Table scrollRegionLabel="Líneas del ticket (desplázate en horizontal para ver todas las columnas)">
              <TableCaption className="sr-only">
                Líneas de detalle del ticket: concepto, cantidad, precio unitario, IVA
                e importe de cada línea.
              </TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Concepto</TableHead>
                  <TableHead scope="col" className="text-right">
                    Cant.
                  </TableHead>
                  <TableHead scope="col" className="text-right">
                    P. unit.
                  </TableHead>
                  <TableHead scope="col" className="text-right">
                    IVA
                  </TableHead>
                  <TableHead scope="col" className="text-right">
                    Importe
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detail.lines.map((line, index) => (
                  <TableRow key={`${line.description}-${index}`}>
                    <TableCell className="font-medium">{line.description}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {new Intl.NumberFormat("es-ES", { maximumFractionDigits: 3 }).format(
                        line.quantity,
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {formatMoney(line.unitPriceCents, currency)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {line.vatRate}%
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {formatMoney(line.lineTotalCents, currency)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      {/* Totales + cobros, en dos columnas en pantallas anchas */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Cobros */}
        <section className="space-y-3">
          <h3 className="text-sm font-semibold tracking-tight">Cobros</h3>
          <div className="rounded-xl border">
            {detail.payments.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                Sin cobros registrados.
              </p>
            ) : (
              <ul className="divide-y divide-border/60">
                {detail.payments.map((payment, index) => (
                  <li
                    key={`${payment.method}-${index}`}
                    className="flex items-center justify-between px-4 py-3 text-sm"
                  >
                    <span className="font-medium">{payment.label}</span>
                    <span className="tabular-nums">
                      {formatMoney(payment.amountCents, currency)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {detail.payment.isMixed ? (
            <p className="text-xs text-muted-foreground">
              Pago mixto: liquidado con más de un método.
            </p>
          ) : null}
        </section>

        {/* Totales */}
        <section className="space-y-3">
          <h3 className="text-sm font-semibold tracking-tight">Totales</h3>
          <dl className="space-y-2 rounded-xl border bg-[var(--glass-panel)] backdrop-blur-xl backdrop-saturate-150 p-5 tabular-nums">
            {hasDiscount ? (
              <>
                <div className="flex justify-between text-sm text-muted-foreground">
                  <dt>Subtotal</dt>
                  <dd>{formatMoney(detail.grossTotalCents, currency)}</dd>
                </div>
                <div className="flex justify-between text-sm">
                  <dt>Descuento</dt>
                  <dd className="text-primary">
                    −{formatMoney(detail.discountCents, currency)}
                  </dd>
                </div>
              </>
            ) : null}
            <div className="flex justify-between text-sm text-muted-foreground">
              <dt>Base imponible</dt>
              <dd>{formatMoney(detail.taxableBaseCents, currency)}</dd>
            </div>
            {detail.vatBreakdown.map((row) => (
              <div
                key={row.vatRate}
                className="flex justify-between text-sm text-muted-foreground"
              >
                <dt>
                  IVA {row.vatRate}%{" "}
                  <span className="text-xs">
                    (base {formatMoney(row.baseCents, currency)})
                  </span>
                </dt>
                <dd>{formatMoney(row.taxCents, currency)}</dd>
              </div>
            ))}
            <div className="mt-1 flex items-baseline justify-between border-t pt-3 text-base font-semibold">
              <dt>Total</dt>
              <dd>{formatMoney(detail.totalCents, currency)}</dd>
            </div>
          </dl>
        </section>
      </div>

      {/* Nota del ticket, si la hubo */}
      {detail.notes !== null && detail.notes.trim() !== "" ? (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold tracking-tight">Nota</h3>
          <p className="whitespace-pre-wrap rounded-xl border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
            {detail.notes}
          </p>
        </section>
      ) : null}
    </div>
  );
}
