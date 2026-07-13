import type { Metadata } from "next";

import { SectionPlaceholder } from "@/app/(dashboard)/ajustes/section-placeholder";

export const metadata: Metadata = {
  title: "Horarios",
};

export default function HorariosPage(): React.ReactElement {
  return (
    <SectionPlaceholder
      title="Horarios"
      description="Define los horarios de apertura y la disponibilidad."
    />
  );
}
