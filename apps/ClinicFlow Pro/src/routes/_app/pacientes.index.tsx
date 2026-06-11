import { createFileRoute, Link } from "@tanstack/react-router";
import { Topbar } from "@/components/topbar";
import { patients, formatDate } from "@/lib/mock-data";
import { Search, ChevronRight, AlertCircle } from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/_app/pacientes/")({
  component: PatientsPage,
});

function PatientsPage() {
  const [q, setQ] = useState("");
  const filtered = patients.filter((p) => p.name.toLowerCase().includes(q.toLowerCase()) || p.dni.toLowerCase().includes(q.toLowerCase()));

  return (
    <>
      <Topbar title="Pacientes" subtitle={`${patients.length} pacientes en tu clínica`} />

      <div className="rounded-2xl bg-card border border-border shadow-soft overflow-hidden">
        <div className="p-4 border-b border-border">
          <div className="relative">
            <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por nombre o DNI…"
              className="h-11 w-full rounded-xl border border-input bg-background pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
          </div>
        </div>
        <ul className="divide-y divide-border">
          {filtered.map((p) => (
            <li key={p.id}>
              <Link to="/pacientes/$id" params={{ id: p.id }} className="flex items-center gap-4 p-4 hover:bg-accent/50 transition">
                <div className="size-11 rounded-full bg-gradient-primary flex items-center justify-center text-primary-foreground font-semibold text-sm shrink-0">
                  {p.name.split(" ").map((n) => n[0]).slice(0, 2).join("")}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="font-medium text-foreground truncate">{p.name}</div>
                    {p.alerts?.map((a) => (
                      <span key={a} className="hidden md:inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md bg-warning/15 text-warning">
                        <AlertCircle className="size-3" /> {a}
                      </span>
                    ))}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5 truncate">
                    {p.phone} · {p.dni} · Última visita {p.lastVisit ? formatDate(p.lastVisit) : "—"}
                  </div>
                </div>
                <ChevronRight className="size-4 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}