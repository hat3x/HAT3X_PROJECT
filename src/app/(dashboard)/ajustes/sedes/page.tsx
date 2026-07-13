import type { Metadata } from "next";

import { SectionPlaceholder } from "@/app/(dashboard)/ajustes/section-placeholder";

export const metadata: Metadata = {
  title: "Sedes",
};

export default function SedesPage(): React.ReactElement {
  return (
    <SectionPlaceholder
      title="Sedes"
      description="Gestiona las ubicaciones físicas de tu salón."
    />
  );
}
