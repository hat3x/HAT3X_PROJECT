import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { ArqueoView } from "@/app/(dashboard)/arqueo/arqueo-view";
import { canManageSettings, getActiveMembership, getActiveSalon } from "@/lib/salon";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Arqueo de caja",
};

export default async function ArqueoPage(): Promise<React.ReactElement> {
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
        <h1 className="text-3xl font-bold tracking-tight">Arqueo de caja</h1>
        <p className="mt-2 text-muted-foreground">
          Tu usuario no está asociado a ningún salón todavía.
        </p>
      </main>
    );
  }

  // El arqueo muestra el dinero de caja (materia sensible): solo owner/manager.
  // Un staff que navegue directo a /arqueo se redirige al panel.
  const membership = await getActiveMembership();
  if (!canManageSettings(membership?.role)) {
    redirect("/dashboard");
  }

  return <ArqueoView salonId={salon.id} />;
}
