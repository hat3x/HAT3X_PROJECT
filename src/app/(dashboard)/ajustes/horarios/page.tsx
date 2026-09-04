import type { Metadata } from "next";

import { HorariosView } from "@/app/(dashboard)/ajustes/horarios/horarios-view";
import { getActiveSalonId } from "@/lib/salon";
import { canManageSalonSchedule } from "@/lib/settings/access";
import { requireSettingsSection } from "@/lib/settings/guard";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Horarios",
};

/**
 * Sección de horarios de /ajustes.
 *
 * El layout deja entrar a `staff` desde que Kristel necesitaba llegar a su
 * horario, así que aquí se resuelve QUÉ puede ver cada uno: owner y manager, el
 * horario de la clínica y el de todos; staff, solo el suyo.
 *
 * Lo que se decide aquí es lo que se PINTA. Lo que se puede guardar lo vuelven
 * a comprobar las server actions, que es donde importa.
 */
export default async function HorariosPage(): Promise<React.ReactElement> {
  const membership = await requireSettingsSection("horarios");
  const salonId = await getActiveSalonId();

  if (salonId === null) {
    return (
      <p className="text-sm text-muted-foreground">
        Tu usuario no está asociado a ningún salón todavía.
      </p>
    );
  }

  const puedeClinica = canManageSalonSchedule(membership?.role);

  // Para staff hay que saber CUÁL es su profesional. Si su usuario no está
  // vinculado a ninguno, `onlyProfessionalId` queda a un id imposible y la
  // lista sale vacía — que es mejor que enseñarle los de todos.
  let soloProfesional: string | null = null;
  if (!puedeClinica) {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data } = await supabase
      .from("professionals")
      .select("id")
      .eq("salon_id", salonId)
      .eq("user_id", user?.id ?? "")
      .maybeSingle();
    soloProfesional = data?.id ?? "sin-profesional-vinculado";
  }

  return (
    <HorariosView
      salonId={salonId}
      canManageSalon={puedeClinica}
      onlyProfessionalId={soloProfesional}
    />
  );
}
