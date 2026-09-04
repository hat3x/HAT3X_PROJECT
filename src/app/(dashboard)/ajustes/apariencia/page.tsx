import type { Metadata } from "next";
import { Contrast } from "lucide-react";

import { SectionHeader } from "@/app/(dashboard)/ajustes/section-header";
import { AparienciaView } from "@/app/(dashboard)/ajustes/apariencia/apariencia-view";
import { requireSettingsSection } from "@/lib/settings/guard";

export const metadata: Metadata = { title: "Apariencia" };

/**
 * Ajustes → Apariencia: tema (claro/oscuro/sistema) y paleta de ambiente.
 * La selección se guarda por dispositivo (localStorage) y la aplica el
 * ThemeProvider al instante.
 */
export default async function AparienciaPage(): Promise<React.ReactElement> {
  // Pasa a `async` solo para poder comprobar el permiso en servidor. La página
  // en sí no lee nada: el tema vive en el navegador.
  await requireSettingsSection("apariencia");

  return (
    <>
      <SectionHeader
        icon={Contrast}
        title="Apariencia"
        description="Elige el tema y la paleta de ambiente. La preferencia se guarda en este dispositivo."
      />
      <AparienciaView />
    </>
  );
}
