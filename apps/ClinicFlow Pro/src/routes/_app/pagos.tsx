import { createFileRoute, Link } from "@tanstack/react-router";
import { Topbar } from "@/components/topbar";
import { payments, formatDate, formatEUR } from "@/lib/mock-data";

export const Route = createFileRoute("/_app/pagos")({
  component: PaymentsPage,
});

function PaymentsPage() {
  const completed = payments.filter((p) => p.status === "completado").reduce((s, p) => s + p.amount, 0);
  const pending = payments.filter((p) => p.status !== "completado").reduce((s, p) => s + p.amount, 0);

  return (
    <>
      <Topbar title="Pagos" subtitle="Registro de cobros y pendientes" />
      <div className="grid grid-cols-2 gap-4 mb-5">
        <div className="rounded-2xl bg-card border border-border shadow-soft p-5">
          <div className="text-xs text-muted-foreground">Cobrado</div>
          <div className="font-display font-semibold text-2xl mt-1 tabular-nums text-success">{formatEUR(completed)}</div>
        </div>
        <div className="rounded-2xl bg-card border border-border shadow-soft p-5">
          <div className="text-xs text-muted-foreground">Pendiente</div>
          <div className="font-display font-semibold text-2xl mt-1 tabular-nums text-warning">{formatEUR(pending)}</div>
        </div>
      </div>

      <div className="rounded-2xl bg-card border border-border shadow-soft overflow-hidden">
        <ul className="divide-y divide-border">
          {payments.map((p) => (
            <li key={p.id} className="flex items-center gap-3 p-4">
              <div className={`size-10 rounded-xl flex items-center justify-center text-xs font-semibold ${p.status === "completado" ? "bg-success/15 text-success" : "bg-warning/15 text-warning"}`}>
                {p.method[0]}
              </div>
              <div className="flex-1 min-w-0">
                <Link to="/pacientes/$id" params={{ id: p.patientId }} className="font-medium hover:text-primary">{p.patientName}</Link>
                <div className="text-xs text-muted-foreground">{p.method} · {formatDate(p.date)}</div>
              </div>
              <div className="text-right">
                <div className="font-semibold tabular-nums">{formatEUR(p.amount)}</div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{p.status}</div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}