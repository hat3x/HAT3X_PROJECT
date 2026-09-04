import type { Metadata } from "next";
import { requireSettingsSection } from "@/lib/settings/guard";

import { ServicesView } from "@/app/(dashboard)/ajustes/servicios/services-view";
import { getActiveSalonId } from "@/lib/salon";

export const metadata: Metadata = {
  title: "Servicios",
};

/**
 * Sección de servicios de /ajustes.
 *
 * El layout de ajustes ya aplica el guard de sesión y de rol (owner/manager),
 * por lo que aquí solo resolvemos el salón activo para scopear la vista.
 */
export default async function ServiciosPage(): Promise<React.ReactElement> {
  await requireSettingsSection("servicios");

  const salonId = await getActiveSalonId();

  if (salonId === null) {
    return (
      <p className="text-sm text-muted-foreground">
        Tu usuario no está asociado a ningún salón todavía.
      </p>
    );
  }

  return <ServicesView salonId={salonId} />;
}
