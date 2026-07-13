import type { Metadata } from "next";

import { SectionPlaceholder } from "@/app/(dashboard)/ajustes/section-placeholder";

export const metadata: Metadata = {
  title: "Personal",
};

export default function PersonalPage(): React.ReactElement {
  return (
    <SectionPlaceholder
      title="Personal"
      description="Gestiona los profesionales del salón y sus permisos."
    />
  );
}
