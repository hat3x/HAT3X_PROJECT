import { DashboardNav } from "@/components/dashboard-nav";
import { QueryProvider } from "@/components/providers/query-provider";
import { canManageSettings, getActiveMembership, getActiveSalon } from "@/lib/salon";

/**
 * Layout compartido de las rutas autenticadas del panel.
 * Envuelve el árbol en el provider de TanStack Query y añade la navegación
 * principal (barra superior premium con glass, jerarquía y responsive real).
 */
export default async function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>): Promise<React.ReactElement> {
  const [membership, salon] = await Promise.all([
    getActiveMembership(),
    getActiveSalon(),
  ]);
  const showSettings = canManageSettings(membership?.role);

  return (
    <QueryProvider>
      <div className="flex min-h-screen flex-col">
        <DashboardNav
          brandName={salon?.name ?? null}
          role={membership?.role ?? null}
          showSettings={showSettings}
        />
        <div className="flex-1">{children}</div>
      </div>
    </QueryProvider>
  );
}
