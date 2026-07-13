import type { Metadata } from "next";

import { SectionPlaceholder } from "@/app/(dashboard)/ajustes/section-placeholder";

export const metadata: Metadata = {
  title: "Datos del salón",
};

export default function DatosPage(): React.ReactElement {
  return (
    <SectionPlaceholder
      title="Datos del salón"
      description="Nombre, contacto y ajustes generales del salón."
    />
  );
}
