import type { Metadata } from "next";

import { ProfessionalsView } from "@/app/(dashboard)/ajustes/personal/professionals-view";
import { getActiveSalonId } from "@/lib/salon";

export const metadata: Metadata = {
  title: "Personal",
};

/**
 * Sección de personal de /ajustes.
 *
 * El layout de ajustes ya aplica el guard de sesión y de rol (owner/manager),
 * por lo que aquí solo resolvemos el salón activo para scopear la vista.
 */
export default async function PersonalPage(): Promise<React.ReactElement> {
  const salonId = await getActiveSalonId();

  if (salonId === null) {
    return (
      <p className="text-sm text-muted-foreground">
        Tu usuario no está asociado a ningún salón todavía.
      </p>
    );
  }

  return <ProfessionalsView salonId={salonId} />;
}
