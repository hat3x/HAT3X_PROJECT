import { SectorGate } from "@/components/guards/sector-gate";

/**
 * Layout de `/sala` (Task 7): SOLO gate de sector, patrón `carta/layout.tsx`
 * pero SIN gate de rol — a diferencia de la carta (configuración, solo
 * owner/manager), la sala es operativa de staff del día a día (abrir mesas,
 * ver comandas, cobrar). El modo edición del plano (arrastrar mesas, crear
 * zonas/mesas) SÍ exige `canManageSettings`, pero eso se decide dentro de
 * `sala-view.tsx` con el `role` resuelto por `page.tsx`, no aquí.
 */
export default async function SalaLayout({
  children,
}: {
  children: React.ReactNode;
}): Promise<React.ReactElement> {
  return <SectorGate required="restauracion">{children}</SectorGate>;
}
