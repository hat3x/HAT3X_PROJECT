import { Search, Bell, Plus } from "lucide-react";
import { Link } from "@tanstack/react-router";

export function Topbar({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-foreground">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-2">
        <div className="relative hidden lg:block">
          <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            placeholder="Buscar paciente, cita, documento…"
            className="h-10 w-80 rounded-xl border border-input bg-card pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40 transition"
          />
        </div>
        <button className="size-10 rounded-xl border border-input bg-card flex items-center justify-center hover:bg-accent transition">
          <Bell className="size-4 text-muted-foreground" />
        </button>
        {action ?? (
          <Link
            to="/pacientes"
            className="h-10 px-4 rounded-xl bg-gradient-primary text-primary-foreground text-sm font-medium flex items-center gap-2 shadow-elegant hover:opacity-95 transition"
          >
            <Plus className="size-4" /> Nuevo
          </Link>
        )}
      </div>
    </div>
  );
}