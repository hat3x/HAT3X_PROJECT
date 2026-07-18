import type { Metadata } from "next";

import { SectionPlaceholder } from "@/app/(dashboard)/ajustes/section-placeholder";
import { SalonMarcaForm } from "@/app/(dashboard)/ajustes/marca/salon-marca-form";
import { getActiveSalon } from "@/lib/salon";
import { getActiveSalonBranding } from "@/lib/salon-branding/server";

export const metadata: Metadata = {
  title: "Marca",
};

/**
 * Ajustes → Marca (white-label): logotipo y colores del salón activo.
 *
 * Mismo patrón que el resto de subpáginas de ajustes: resuelve el salón activo
 * (el layout ya exige sesión + rol owner/manager) y delega en el formulario
 * cliente. La marca puede ser `null` si el salón aún no la ha personalizado: en
 * ese caso el formulario arranca con los valores por defecto.
 */
export default async function MarcaPage(): Promise<React.ReactElement> {
  const salon = await getActiveSalon();
  if (salon === null) {
    return (
      <SectionPlaceholder
        title="Marca"
        description="No tienes un salón asignado."
      />
    );
  }

  const branding = await getActiveSalonBranding();

  return <SalonMarcaForm salonName={salon.name} branding={branding} />;
}
