import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AjustesNav } from "@/app/(dashboard)/ajustes/ajustes-nav";
import { canManageSettings, getActiveMembership } from "@/lib/salon";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: {
    default: "Ajustes",
    template: "%s · Ajustes",
  },
};

/**
 * Layout del área protegida de ajustes.
 *
 * Guard de ruta (defensa en profundidad, como el resto de páginas del panel):
 * - Sin sesión → redirige a /login conservando el destino.
 * - Rol distinto de owner/manager (p. ej. staff) → redirige al panel.
 *
 * Renderiza la navegación entre secciones y el contenido de la sección activa.
 */
export default async function AjustesLayout({
  children,
}: Readonly<{ children: React.ReactNode }>): Promise<React.ReactElement> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user === null) {
    redirect("/login?next=/ajustes");
  }

  const membership = await getActiveMembership();
  if (!canManageSettings(membership?.role)) {
    redirect("/dashboard");
  }

  return (
    <main className="container py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Ajustes</h1>
        <p className="text-muted-foreground">
          Configura las sedes, servicios, personal, horarios y los datos de tu salón.
        </p>
      </div>

      <div className="flex flex-col gap-6 md:flex-row md:gap-10">
        <aside className="md:w-56 md:shrink-0">
          <AjustesNav />
        </aside>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </main>
  );
}
