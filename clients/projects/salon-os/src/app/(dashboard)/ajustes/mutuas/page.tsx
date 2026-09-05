import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireSettingsSection } from "@/lib/settings/guard";

import { MutuasView } from "@/app/(dashboard)/ajustes/mutuas/mutuas-view";
import { getActiveSalonId, getActiveSalonSector } from "@/lib/salon";

export const metadata: Metadata = {
  title: "Mutuas y seguros",
};

/**
 * Sección de mutuas y seguros de /ajustes — SOLO sector odontología.
 *
 * El layout de ajustes ya aplica el guard de sesión y de rol (owner/manager);
 * aquí añadimos el guard de SECTOR (defensa en profundidad, mismo espíritu
 * que el gate de `ajustes/mutuas/actions.ts`): si el salón activo no es
 * odontología, redirige a Servicios — evita que alguien llegue a esta URL
 * directamente aunque `ajustes-nav.tsx` ya oculte el enlace fuera de odontología.
 */
export default async function MutuasPage(): Promise<React.ReactElement> {
  await requireSettingsSection("mutuas");

  const [salonId, sector] = await Promise.all([
    getActiveSalonId(),
    getActiveSalonSector(),
  ]);

  if (sector !== "odontologia") {
    redirect("/ajustes/servicios");
  }

  if (salonId === null) {
    return (
      <p className="text-sm text-muted-foreground">
        Tu usuario no está asociado a ningún salón todavía.
      </p>
    );
  }

  return <MutuasView salonId={salonId} />;
}
