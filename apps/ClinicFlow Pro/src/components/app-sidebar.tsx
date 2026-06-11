import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard, Users, Calendar, FileText, Receipt,
  ClipboardSignature, Wallet, Settings, Sparkles, LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useStore, useDemo, store } from "@/lib/store";
import { supabase } from "@/lib/supabase";

const items = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Pacientes", url: "/pacientes", icon: Users },
  { title: "Calendario", url: "/calendario", icon: Calendar },
  { title: "Presupuestos", url: "/presupuestos", icon: FileText },
  { title: "Facturas", url: "/facturas", icon: Receipt },
  { title: "Consentimientos", url: "/consentimientos", icon: ClipboardSignature },
  { title: "Pagos", url: "/pagos", icon: Wallet },
];

export function AppSidebar() {
  const path = useRouterState({ select: (r) => r.location.pathname });
  const navigate = useNavigate();
  const isActive = (u: string) => path === u || path.startsWith(u + "/");
  const clinic = useStore((s) => s.clinic);
  const isDemo = useDemo();

  const dentistInitials = (clinic.dentistName || "CF")
    .split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    store.clearUser();
    navigate({ to: "/" });
  };

  return (
    <aside className="hidden md:flex w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
      <div className="px-5 py-5 flex items-center gap-2.5">
        <div className="size-9 rounded-xl bg-gradient-primary flex items-center justify-center shadow-elegant shrink-0">
          <Sparkles className="size-4 text-primary-foreground" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <div className="font-display font-semibold text-sidebar-foreground tracking-tight truncate">
              {clinic.name || "ClinicFlow Pro"}
            </div>
            {isDemo && (
              <span className="shrink-0 text-[9px] font-bold uppercase tracking-wider bg-amber-500 text-white px-1.5 py-0.5 rounded-md">
                Demo
              </span>
            )}
          </div>
          <div className="text-[11px] text-muted-foreground">ClinicFlow Pro</div>
        </div>
      </div>

      <nav className="px-3 mt-2 flex-1 flex flex-col gap-0.5">
        {items.map((item) => {
          const active = isActive(item.url);
          return (
            <Link
              key={item.url}
              to={item.url}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-soft"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
              )}
            >
              <item.icon className={cn("size-[18px]", active && "text-primary")} />
              {item.title}
            </Link>
          );
        })}
      </nav>

      <div className="p-3 border-t border-sidebar-border">
        <Link
          to="/configuracion"
          className={cn(
            "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
            isActive("/configuracion")
              ? "bg-sidebar-accent text-sidebar-accent-foreground"
              : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60"
          )}
        >
          <Settings className="size-[18px]" />
          Configuración
        </Link>

        <div className="mt-2 flex items-center gap-3 px-3 py-2 rounded-lg">
          <div className="size-8 rounded-full bg-gradient-primary flex items-center justify-center text-primary-foreground text-xs font-semibold shrink-0">
            {dentistInitials}
          </div>
          <div className="text-xs min-w-0 flex-1">
            <div className="font-medium text-sidebar-foreground truncate">
              {clinic.dentistName || "Usuario"}
            </div>
            <div className="text-muted-foreground">Odontólogo/a</div>
          </div>
          {!isDemo && (
            <button
              onClick={handleLogout}
              title="Cerrar sesión"
              className="shrink-0 size-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
            >
              <LogOut className="size-4" />
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}