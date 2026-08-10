import { SectorGate } from "@/components/guards/sector-gate";

/**
 * Layout del mostrador (restauración): SOLO gate de sector, SIN gate de rol.
 * A diferencia de `carta/layout.tsx` (gestión de la carta, exige
 * `canManageSettings`), el mostrador es el flujo operativo del día a día
 * —tomar pedidos y cobrar— y lo usa CUALQUIER miembro del equipo (staff
 * incluido), igual que `tpv/page.tsx` no exige rol para cobrar.
 */
export default async function MostradorLayout({
  children,
}: {
  children: React.ReactNode;
}): Promise<React.ReactElement> {
  return <SectorGate required="restauracion">{children}</SectorGate>;
}
