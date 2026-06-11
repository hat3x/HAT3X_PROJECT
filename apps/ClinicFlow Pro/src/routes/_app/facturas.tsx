import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Topbar } from "@/components/topbar";
import { formatDate, formatEUR } from "@/lib/mock-data";
import { computeTotals, useStore } from "@/lib/store";
import { DocumentModal } from "@/components/document-modal";

export const Route = createFileRoute("/_app/facturas")({
  component: InvoicesPage,
});

const statusStyle: Record<string, string> = {
  pagado: "bg-success/15 text-success",
  pendiente: "bg-warning/15 text-warning",
  aceptado: "bg-primary/10 text-primary",
  parcial: "bg-primary/10 text-primary",
  cancelado: "bg-destructive/15 text-destructive",
};

function InvoicesPage() {
  const invoices = useStore((s) => s.documents.filter((d) => d.type === "factura"));
  const [openId, setOpenId] = useState<string | null>(null);
  const total = invoices.reduce((s, i) => s + computeTotals(i).total, 0);
  const pending = invoices.filter((i) => i.status !== "pagado").reduce((s, i) => s + computeTotals(i).total, 0);

  return (
    <>
      <Topbar title="Facturas" subtitle="Gestiona la facturación de tu clínica" />
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-5">
        <Card label="Facturado total" value={formatEUR(total)} />
        <Card label="Pendiente de cobro" value={formatEUR(pending)} accent />
        <Card label="Facturas emitidas" value={invoices.length.toString()} />
      </div>
      <div className="rounded-2xl bg-card border border-border shadow-soft overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-accent/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Nº</th>
              <th className="px-4 py-3">Paciente</th>
              <th className="px-4 py-3 hidden md:table-cell">Fecha</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3 text-right">Importe</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {invoices.map((i) => (
              <tr key={i.id} className="hover:bg-accent/30 transition cursor-pointer" onClick={() => setOpenId(i.id)}>
                <td className="px-4 py-3 font-mono text-xs">{i.number}</td>
                <td className="px-4 py-3">
                  <Link to="/pacientes/$id" params={{ id: i.patientId }} onClick={(e) => e.stopPropagation()} className="font-medium hover:text-primary">{i.patientName}</Link>
                </td>
                <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">{formatDate(i.date)}</td>
                <td className="px-4 py-3"><span className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded-md font-medium ${statusStyle[i.status]}`}>{i.status}</span></td>
                <td className="px-4 py-3 text-right font-semibold tabular-nums">{formatEUR(computeTotals(i).total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <DocumentModal id={openId} onClose={() => setOpenId(null)} />
    </>
  );
}

function Card({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded-2xl border border-border shadow-soft p-4 ${accent ? "bg-gradient-primary text-primary-foreground" : "bg-card"}`}>
      <div className={`text-xs ${accent ? "opacity-80" : "text-muted-foreground"}`}>{label}</div>
      <div className="font-display font-semibold text-xl md:text-2xl mt-1 tabular-nums">{value}</div>
    </div>
  );
}