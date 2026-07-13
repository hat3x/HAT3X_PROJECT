import type { Metadata } from "next";

import { SectionPlaceholder } from "@/app/(dashboard)/ajustes/section-placeholder";
import { SalonFiscalForm } from "@/app/(dashboard)/ajustes/fiscal/salon-fiscal-form";
import { getActiveSalonId } from "@/lib/salon";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Datos fiscales",
};

export default async function FiscalPage(): Promise<React.ReactElement> {
  const salonId = await getActiveSalonId();
  if (salonId === null) {
    return (
      <SectionPlaceholder
        title="Datos fiscales"
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
        title="Datos fiscales"
        description="No se encontró el salón."
      />
    );
  }

  return <SalonFiscalForm salon={salon} />;
}
