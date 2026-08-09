"use client";

import { useMemo } from "react";
import { ExternalLink, Receipt } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useBillingHistory } from "@/hooks/use-billing-history";
import { usePatientInvoices } from "@/hooks/use-patient-invoices";
import { formatDate, formatMoney } from "@/lib/format";

interface BillingHistoryCardProps {
  salonId: string;
  customerId: string;
}

type MergedRow = {
  key: string;
  date: string;
  fullNumber: string;
  totalCents: number;
  source: "kairos" | "historico";
  docUrl: string | null;
  unpaid: boolean;
};

export function BillingHistoryCard({
  salonId,
  customerId,
}: BillingHistoryCardProps): React.ReactElement {
  const historyQuery = useBillingHistory(salonId, customerId);
  const kairosQuery = usePatientInvoices(salonId, customerId);

  const rows = useMemo<MergedRow[]>(() => {
    const kairos: MergedRow[] = (kairosQuery.data ?? []).map((r) => ({
      key: `k-${r.key}`,
      date: r.dateIso,
      fullNumber: r.fullNumber ?? (r.kind === "ticket" ? "Ticket" : "—"),
      totalCents: r.totalCents,
      source: "kairos",
      docUrl: r.docUrl,
      unpaid: false,
    }));
    const historico: MergedRow[] = (historyQuery.data ?? []).map((f) => ({
      key: `h-${f.id}`,
      date: f.issued_on,
      fullNumber: f.full_number ?? "—",
      totalCents: f.total_cents,
      source: "historico",
      docUrl: null,
      unpaid: !f.paid,
    }));
    return [...kairos, ...historico].sort((a, b) => b.date.localeCompare(a.date));
  }, [kairosQuery.data, historyQuery.data]);

  const total = useMemo(
    () => rows.reduce((acc, r) => acc + r.totalCents, 0),
    [rows],
  );

  const isPending = historyQuery.isPending || kairosQuery.isPending;
  const isError = historyQuery.isError || kairosQuery.isError;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Receipt className="h-5 w-5 text-primary" aria-hidden="true" />
          Facturación
        </CardTitle>
        <CardDescription>
          Facturas y tickets del paciente. Las de Kairos se pueden abrir e imprimir;
          las del sistema anterior son solo consulta.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isPending ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : isError ? (
          <p className="py-6 text-center text-sm text-destructive">
            Error al cargar la facturación
          </p>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center py-10 text-center">
            <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-accent text-accent-foreground ring-1 ring-inset ring-primary/10">
              <Receipt className="h-5 w-5" />
            </span>
            <p className="font-medium">Sin facturas</p>
            <p className="mt-1 max-w-xs text-sm text-muted-foreground">
              No hay facturas registradas para este paciente.
            </p>
          </div>
        ) : (
          <>
            <div className="mb-4 flex items-center justify-between rounded-lg border bg-muted/40 px-4 py-3">
              <span className="text-sm text-muted-foreground">
                {rows.length} {rows.length === 1 ? "documento" : "documentos"}
              </span>
              <span className="text-lg font-bold tabular-nums">
                {formatMoney(total, "EUR")}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Fecha</th>
                    <th className="py-2 pr-3 font-medium">Nº</th>
                    <th className="py-2 pr-3 font-medium">Origen</th>
                    <th className="py-2 pr-3 text-right font-medium">Importe</th>
                    <th className="py-2 text-right font-medium">Documento</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.key} className="border-b last:border-0">
                      <td className="py-2 pr-3 tabular-nums">{formatDate(r.date)}</td>
                      <td className="py-2 pr-3 tabular-nums text-muted-foreground">
                        {r.fullNumber}
                        {r.unpaid ? (
                          <span className="ml-1.5 text-xs text-amber-600 dark:text-amber-400">
                            (pendiente)
                          </span>
                        ) : null}
                      </td>
                      <td className="py-2 pr-3">
                        <Badge variant={r.source === "kairos" ? "default" : "secondary"}>
                          {r.source === "kairos" ? "Kairos" : "Histórico"}
                        </Badge>
                      </td>
                      <td className="py-2 pr-3 text-right font-semibold tabular-nums">
                        {formatMoney(r.totalCents, "EUR")}
                      </td>
                      <td className="py-2 text-right">
                        {r.docUrl ? (
                          <a
                            href={r.docUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-primary transition-colors hover:underline"
                          >
                            Abrir
                            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                          </a>
                        ) : (
                          <span className="text-muted-foreground/50">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
