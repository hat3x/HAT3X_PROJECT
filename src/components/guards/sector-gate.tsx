import { redirect } from "next/navigation";

import { getActiveSalonSector } from "@/lib/salon";
import type { SalonSector } from "@/types/database";

/**
 * Guard de sector para Server Components.
 *
 * Lee el sector del salón activo en SERVIDOR y redirige a /dashboard si no
 * coincide con `required`. Úsalo en el layout de cualquier ruta exclusiva de
 * un sector para una defensa en profundidad: el nav ya oculta el enlace, pero
 * esta capa garantiza el rechazo incluso si alguien fuerza la URL directamente.
 *
 * Patrón idéntico al de SalonFeaturesProvider + feature-gate del dominio: la
 * presentación oculta, el servidor rechaza — dos escudos independientes.
 */
export async function SectorGate({
  required,
  children,
}: {
  required: SalonSector;
  children: React.ReactNode;
}): Promise<React.ReactElement> {
  const sector = await getActiveSalonSector();

  if (sector !== required) {
    redirect("/dashboard");
  }

  return <>{children}</>;
}
