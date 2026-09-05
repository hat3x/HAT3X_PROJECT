import type { Metadata } from "next";
import { requireSettingsSection } from "@/lib/settings/guard";

import { SectionPlaceholder } from "@/app/(dashboard)/ajustes/section-placeholder";
import { SalonDatosForm } from "@/app/(dashboard)/ajustes/datos/salon-datos-form";
import { getActiveSalonId } from "@/lib/salon";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Datos del salón",
};

export default async function DatosPage(): Promise<React.ReactElement> {
  await requireSettingsSection("datos");

  const salonId = await getActiveSalonId();
  if (salonId === null) {
    return (
      <SectionPlaceholder
        title="Datos del salón"
        description="No tienes un salón asignado."
      />
    );
  }

  const supabase = createClient();
  const { data: salon, error } = await supabase
    .from("salons")
    .select("*")
    .eq("id", salonId)
    .maybeSingle();

  if (error !== null) {
    throw new Error(`No se pudo cargar el salón: ${error.message}`);
  }

  if (salon === null) {
    return (
      <SectionPlaceholder
        title="Datos del salón"
        description="No se encontró el salón."
      />
    );
  }

  return <SalonDatosForm salon={salon} />;
}
