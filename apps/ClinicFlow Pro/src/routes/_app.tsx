import { createFileRoute, Outlet, Link, redirect } from "@tanstack/react-router";
import { AppSidebar } from "@/components/app-sidebar";
import { DemoBanner } from "@/components/demo-banner";
import { supabase } from "@/lib/supabase";
import { store } from "@/lib/store";
import {
  LayoutDashboard, Users, Calendar, FileText, Wallet, Settings,
} from "lucide-react";

export const Route = createFileRoute("/_app")({
  beforeLoad: async ({ location }) => {
    if (typeof window === "undefined") return;

    // Demo mode: pasa siempre sin auth
    if (store.isDemo()) return;

    const isOnboarding = location.pathname === "/onboarding";

    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/auth" });

    if (store.getUserId() !== data.session.user.id) {
      store.initUser(data.session.user.id);
    }

    if (!isOnboarding && !store.get().clinic.configured) {
      throw redirect({ to: "/onboarding" });
    }
  },
  component: AppLayout,
});

const mobileNav = [
  { url: "/dashboard", icon: LayoutDashboard, label: "Inicio" },
  { url: "/pacientes", icon: Users, label: "Pacientes" },
  { url: "/calendario", icon: Calendar, label: "Citas" },
  { url: "/presupuestos", icon: FileText, label: "Docs" },
  { url: "/configuracion", icon: Settings, label: "Ajustes" },
];

function AppLayout() {
  return (
    <div className="min-h-screen bg-gradient-soft flex flex-col">
      <DemoBanner />
      <div className="flex flex-1 min-h-0">
        <AppSidebar />
        <main className="flex-1 min-w-0 flex flex-col">
          <div className="flex-1 p-5 md:p-8 pb-24 md:pb-8 max-w-[1400px] w-full mx-auto">
            <Outlet />
          </div>
          <nav className="md:hidden fixed bottom-0 inset-x-0 bg-card border-t border-border flex justify-around py-2 z-30">
            {mobileNav.map((item) => (
              <Link key={item.url} to={item.url} className="flex flex-col items-center gap-1 p-2 text-[10px] text-muted-foreground [&.active]:text-primary" activeProps={{ className: "active" }}>
                <item.icon className="size-5" />
                {item.label}
              </Link>
            ))}
          </nav>
        </main>
      </div>
    </div>
  );
}