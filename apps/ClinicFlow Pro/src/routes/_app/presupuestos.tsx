import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Topbar } from "@/components/topbar";
import { formatDate, formatEUR } from "@/lib/mock-data";
import { computeTotals, useStore } from "@/lib/store";
import { DocumentModal } from "@/components/document-modal";

export const Route = createFileRoute("/_app/presupuestos")({
  component: BudgetsPage,
});

const statusStyle: Record<string, string> = {
  pendiente: "bg-warning/15 text-warning",
  aceptado: "bg-success/15 text-success",
  pagado: "bg-success/15 text-success",
  parcial: "bg-primary/10 text-primary",
  cancelado: "bg-destructive/15 text-destructive",
};

function BudgetsPage() {
  const budgets = useStore((s) => s.documents.filter((d) => d.type === "presupuesto"));
  const [openId, setOpenId] = useState<string | null>(null);
  return (
    <>
      <Topbar title="Presupuestos" subtitle={`${budgets.length} presupuestos emitidos`} />
      <div className="rounded-2xl bg-card border border-border shadow-soft overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-accent/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Nº</th>
              <th className="px-4 py-3">Paciente</th>
              <th className="px-4 py-3 hidden md:table-cell">Fecha</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3 text-right">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {budgets.map((b) => (
              <tr key={b.id} className="hover:bg-accent/30 transition cursor-pointer" onClick={() => setOpenId(b.id)}>
                <td className="px-4 py-3 font-mono text-xs">{b.number}</td>
                <td className="px-4 py-3">
                  <Link to="/pacientes/$id" params={{ id: b.patientId }} onClick={(e) => e.stopPropagation()} className="font-medium hover:text-primary">{b.patientName}</Link>
                </td>
                <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">{formatDate(b.date)}</td>
                <td className="px-4 py-3"><span className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded-md font-medium ${statusStyle[b.status]}`}>{b.status}</span></td>
                <td className="px-4 py-3 text-right font-semibold tabular-nums">{formatEUR(computeTotals(b).total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <DocumentModal id={openId} onClose={() => setOpenId(null)} />
    </>
  );
}