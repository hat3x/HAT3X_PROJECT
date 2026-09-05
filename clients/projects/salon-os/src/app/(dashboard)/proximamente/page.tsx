import type { Metadata } from "next";

import { ComingSoon } from "@/components/coming-soon";

export const metadata: Metadata = {
  title: "Próximamente",
};

/**
 * Ruta de aterrizaje neutra para funcionalidad que el sector activo del salón
 * todavía no tiene disponible (p. ej. accesos de navegación que aplican solo
 * a algunos sectores). Sin lógica propia: delega todo el copy en `ComingSoon`.
 */
export default function ProximamentePage(): React.ReactElement {
  return (
    <main className="container flex min-h-[60vh] items-center justify-center py-10">
      <ComingSoon />
    </main>
  );
}
