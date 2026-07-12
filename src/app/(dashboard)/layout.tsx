import Link from "next/link";

import { QueryProvider } from "@/components/providers/query-provider";

/**
 * Layout compartido de las rutas autenticadas del panel.
 * Envuelve el árbol en el provider de TanStack Query y añade la navegación.
 */
export default function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>): React.ReactElement {
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
              href="/appointments"
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              Citas
            </Link>
            <Link
              href="/customers"
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              Clientes
            </Link>
          </nav>
        </header>
        <div className="flex-1">{children}</div>
      </div>
    </QueryProvider>
  );
}
