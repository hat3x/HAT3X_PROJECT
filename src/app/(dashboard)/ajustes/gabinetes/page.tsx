import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireSettingsSection } from "@/lib/settings/guard";

import { GabinetesView } from "@/app/(dashboard)/ajustes/gabinetes/gabinetes-view";
import { getActiveSalon } from "@/lib/salon";

export const metadata: Metadata = {
  title: "Gabinetes",
};

/**
 * Ajustes → Gabinetes. El layout de ajustes ya aplica el guard de sesión y rol;
 * aquí solo queda la puerta de sector: un gabinete es de una clínica dental.
 */
export default async function GabinetesPage(): Promise<React.ReactElement> {
  await requireSettingsSection("gabinetes");

  const salon = await getActiveSalon();
  if (salon === null) {
    return (
      <p className="text-sm text-muted-foreground">
        Tu usuario no está asociado a ningún salón todavía.
      </p>
    );
  }
  if (salon.sector !== "odontologia") notFound();

  return <GabinetesView salonId={salon.id} />;
}
