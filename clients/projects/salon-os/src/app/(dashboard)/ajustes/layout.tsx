import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AjustesNav } from "@/app/(dashboard)/ajustes/ajustes-nav";
import { getActiveMembership, getActiveSalonSector } from "@/lib/salon";
import { canEnterSettings } from "@/lib/settings/access";
import { sectorTerms } from "@/lib/sector/registry";
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
 * - Rol sin NINGUNA sección accesible → redirige al panel.
 *
 * Ya no basta con ser owner/manager: `staff` entra, pero solo verá las
 * secciones que le corresponden (ver `@/lib/settings/access`). Cada sección
 * repite su propia comprobación, porque este guard solo protege la puerta.
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
  if (!canEnterSettings(membership?.role)) {
    redirect("/dashboard");
  }

  // "de tu {business}" es gramaticalmente válido en cualquier sector (posesivo
  // invariante); en peluquería `terms.business` es "salón", así que la frase
  // queda IDÉNTICA a la anterior.
  const sector = await getActiveSalonSector();
  const terms = sectorTerms(sector ?? "peluqueria");

  return (
    <main className="container py-8 md:py-10">
      <div className="mb-8 animate-fade-up">
        <h1 className="text-3xl font-bold tracking-tight">Ajustes</h1>
        <p className="mt-1.5 max-w-prose text-muted-foreground">
          Configura las sedes, {terms.servicePlural.toLowerCase()}, personal, horarios, los datos y la marca de tu {terms.business}.
        </p>
      </div>

      <div className="flex flex-col gap-8 md:flex-row md:gap-10">
        <aside className="md:w-56 md:shrink-0">
          <div className="md:sticky md:top-8">
            <AjustesNav role={membership?.role ?? null} />
          </div>
        </aside>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </main>
  );
}
