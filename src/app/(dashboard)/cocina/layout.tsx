import { SectorGate } from "@/components/guards/sector-gate";

/**
 * Layout de cocina (KDS, restauración): SOLO gate de sector, SIN gate de
 * rol — copia estructural de `mostrador/layout.tsx`. Igual que el
 * mostrador, el KDS es un flujo operativo del día a día (despachar
 * comandas) que usa cualquier miembro del equipo de cocina/barra, no solo
 * quien gestiona ajustes.
 */
export default async function CocinaLayout({
  children,
}: {
  children: React.ReactNode;
}): Promise<React.ReactElement> {
  return <SectorGate required="restauracion">{children}</SectorGate>;
}
