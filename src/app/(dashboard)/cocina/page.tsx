import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { CocinaView } from "@/app/(dashboard)/cocina/cocina-view";
import { getActiveSalon } from "@/lib/salon";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Cocina",
};

/**
 * Resuelve el salón activo en SERVIDOR (mismo patrón que `mostrador/page.tsx`)
 * y delega el resto en `CocinaView` (cliente): sesión sin usuario → `/login`;
 * usuario sin salón asociado → aviso in-page (aún no ha completado alta).
 */
export default async function CocinaPage(): Promise<React.ReactElement> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user === null) {
    redirect("/login");
  }

  const salon = await getActiveSalon();

  if (salon === null) {
    return (
      <main className="container py-10">
        <h1 className="text-3xl font-bold tracking-tight">Cocina</h1>
        <p className="mt-2 text-muted-foreground">
          Tu usuario no está asociado a ningún salón todavía.
        </p>
      </main>
    );
  }

  return <CocinaView salonId={salon.id} />;
}
