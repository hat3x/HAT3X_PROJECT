import type { Metadata } from "next";

import { SectionPlaceholder } from "@/app/(dashboard)/ajustes/section-placeholder";

export const metadata: Metadata = {
  title: "Servicios",
};

export default function ServiciosPage(): React.ReactElement {
  return (
    <SectionPlaceholder
      title="Servicios"
      description="Configura el catálogo de servicios, precios y duraciones."
    />
  );
}
