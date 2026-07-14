import Link from "next/link";

import { QueryProvider } from "@/components/providers/query-provider";
import { canManageSettings, getActiveMembership } from "@/lib/salon";

/**
 * Layout compartido de las rutas autenticadas del panel.
 * Envuelve el árbol en el provider de TanStack Query y añade la navegación.
 */
export default async function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>): Promise<React.ReactElement> {
  const membership = await getActiveMembership();
  const showSettings = canManageSettings(membership?.role);

  return (
    <QueryProvider>
      <div className="flex min-h-screen flex-col">
        <header className="border-b">
          <nav className="container flex h-14 items-center gap-6 text-sm font-medium">
            <Link href="/dashboard" className="font-semibold">
              Salon OS
            </Link>
            <Link
              href="/dashboard"
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              Panel
            </Link>
            <Link
              href="/day-panel"
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              Panel del día
            </Link>
            <Link
              href="/appointments"
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              Citas
            </Link>
            <Link
              href="/tpv"
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              Caja
            </Link>
            <Link
              href="/customers"
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              Clientes
            </Link>
            <Link
              href="/products"
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              Productos
            </Link>
            {showSettings && (
              <Link
                href="/ajustes"
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                Ajustes
              </Link>
            )}
          </nav>
        </header>
        <div className="flex-1">{children}</div>
      </div>
    </QueryProvider>
  );
}
