import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { EquiposView } from "@/app/(dashboard)/ajustes/equipos/equipos-view";
import { getActiveSalonId, getActiveSalonSector } from "@/lib/salon";

export const metadata: Metadata = {
  title: "Equipos de imagen",
};

/**
 * Sección de equipos de imagen de /ajustes — SOLO sector odontología.
 *
 * Mismo guard que `ajustes/mutuas`: el layout ya cubre sesión y rol
 * (owner/manager); aquí se añade el de SECTOR, en defensa en profundidad con el
 * gate de `ajustes/equipos/actions.ts`. Evita llegar a esta URL a mano aunque
 * `ajustes-nav.tsx` oculte el enlace fuera de odontología.
 */
export default async function EquiposPage(): Promise<React.ReactElement> {
  const [salonId, sector] = await Promise.all([getActiveSalonId(), getActiveSalonSector()]);

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

  return <EquiposView salonId={salonId} />;
}
