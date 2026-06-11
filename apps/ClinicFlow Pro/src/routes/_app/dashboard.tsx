import { createFileRoute, Link } from "@tanstack/react-router";
import { Topbar } from "@/components/topbar";
import { appointments, patients, budgets, invoices, formatEUR, formatTime } from "@/lib/mock-data";
import { Mic, ArrowRight, CalendarClock, AlertCircle, CheckCircle2, Sparkles, TrendingUp } from "lucide-react";

export const Route = createFileRoute("/_app/dashboard")({
  component: Dashboard,
});

function Dashboard() {
  const today = new Date().toDateString();
  const todayApts = appointments.filter((a) => new Date(a.date).toDateString() === today);
  const pendingReviews = patients.filter((p) => p.nextReview);
  const recentBudgets = budgets.slice(0, 3);
  const pendingInvoices = invoices.filter((i) => i.status !== "pagada");

  return (
    <>
      <Topbar title="Buenos días, Dra. Pérez" subtitle="Aquí tienes el resumen de tu clínica hoy." />

      {/* Magic CTA */}
      <Link
        to="/pacientes"
        className="block mb-6 rounded-2xl bg-gradient-primary p-5 md:p-6 shadow-elegant text-primary-foreground hover:opacity-95 transition group"
      >
        <div className="flex items-center gap-4">
          <div className="size-12 rounded-xl bg-white/15 flex items-center justify-center backdrop-blur">
            <Mic className="size-6" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider opacity-80">
              <Sparkles className="size-3" /> Dictado mágico con IA
            </div>
            <div className="font-display font-semibold text-lg mt-0.5">Selecciona un paciente y dicta el tratamiento</div>
            <div className="text-sm opacity-90 mt-0.5">La IA genera notas, presupuesto y próxima revisión en segundos.</div>
          </div>
          <ArrowRight className="size-5 group-hover:translate-x-1 transition" />
        </div>
      </Link>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Stat label="Citas hoy" value={todayApts.length.toString()} accent="primary" icon={<CalendarClock className="size-4" />} />
        <Stat label="Revisiones próximas" value={pendingReviews.length.toString()} accent="warning" icon={<AlertCircle className="size-4" />} />
        <Stat label="Pagos pendientes" value={formatEUR(pendingInvoices.reduce((s, i) => s + i.total, 0))} accent="muted" icon={<TrendingUp className="size-4" />} />
        <Stat label="Pacientes totales" value={patients.length.toString()} accent="success" icon={<CheckCircle2 className="size-4" />} />
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 rounded-2xl bg-card border border-border shadow-soft p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-foreground">Citas de hoy</h2>
            <Link to="/calendario" className="text-xs text-primary hover:underline">Ver agenda</Link>
          </div>
          <div className="space-y-2">
            {todayApts.length === 0 && <p className="text-sm text-muted-foreground">No hay citas hoy.</p>}
            {todayApts.map((a) => (
              <Link
                key={a.id}
                to="/pacientes/$id" params={{ id: a.patientId }}
                className="flex items-center gap-3 p-3 rounded-xl hover:bg-accent transition"
              >
                <div className="w-14 text-sm font-semibold text-primary tabular-nums">{formatTime(a.date)}</div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-foreground truncate">{a.patientName}</div>
                  <div className="text-xs text-muted-foreground truncate">{a.treatment} · {a.dentist}</div>
                </div>
                <StatusPill status={a.status} />
              </Link>
            ))}
          </div>
        </div>

        <div className="rounded-2xl bg-card border border-border shadow-soft p-5">
          <h2 className="font-semibold text-foreground mb-4">Últimos presupuestos</h2>
          <div className="space-y-3">
            {recentBudgets.map((b) => (
              <div key={b.id} className="flex items-center justify-between text-sm">
                <div className="min-w-0">
                  <div className="font-medium truncate">{b.patientName}</div>
                  <div className="text-xs text-muted-foreground">{b.number}</div>
                </div>
                <div className="text-right">
                  <div className="font-semibold tabular-nums">{formatEUR(b.total)}</div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{b.status}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

function Stat({ label, value, accent, icon }: { label: string; value: string; accent: "primary"|"warning"|"success"|"muted"; icon: React.ReactNode }) {
  const colors = {
    primary: "text-primary bg-primary/10",
    warning: "text-warning bg-warning/15",
    success: "text-success bg-success/15",
    muted: "text-muted-foreground bg-muted",
  } as const;
  return (
    <div className="rounded-2xl bg-card border border-border shadow-soft p-4">
      <div className={`inline-flex items-center justify-center size-8 rounded-lg ${colors[accent]} mb-3`}>{icon}</div>
      <div className="text-xl md:text-2xl font-semibold tabular-nums">{value}</div>
      <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    confirmada: "bg-success/15 text-success",
    pendiente: "bg-warning/15 text-warning",
    completada: "bg-primary/10 text-primary",
    cancelada: "bg-destructive/15 text-destructive",
    reagendada: "bg-muted text-muted-foreground",
  };
  return <span className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded-md font-medium ${map[status] || "bg-muted"}`}>{status}</span>;
}