import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { RecallView } from "@/app/(dashboard)/recordatorios/recall-view";
import { getActiveSalonId } from "@/lib/salon";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Recordatorios",
};

/**
 * Página de Recordatorios: recall de revisión (clientes que hace tiempo que
 * no vienen). SIN gate de sector — vale para todos los verticales. El botón
 * de recordatorio individual del recall queda gateado por rol en el server
 * action (`sendRecallReminder`), no aquí.
 */
export default async function RecordatoriosPage(): Promise<React.ReactElement> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user === null) {
    redirect("/login");
  }

  const salonId = await getActiveSalonId();

  if (salonId === null) {
    return (
      <main className="container py-10">
        <h1 className="text-3xl font-bold tracking-tight">Recordatorios</h1>
        <p className="mt-2 text-muted-foreground">
          Tu usuario no está asociado a ningún salón todavía.
        </p>
      </main>
    );
  }

  return <RecallView salonId={salonId} />;
}
