import { redirect } from "next/navigation";
import { SectorGate } from "@/components/guards/sector-gate";
import { canManageSettings, getActiveMembership } from "@/lib/salon";

export default async function CartaLayout({ children }: { children: React.ReactNode }): Promise<React.ReactElement> {
  const membership = await getActiveMembership();
  if (!canManageSettings(membership?.role)) redirect("/dashboard");
  return <SectorGate required="restauracion">{children}</SectorGate>;
}
