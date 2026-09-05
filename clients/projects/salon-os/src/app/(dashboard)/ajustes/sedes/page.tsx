import type { Metadata } from "next";
import { requireSettingsSection } from "@/lib/settings/guard";

import { SedesView } from "@/app/(dashboard)/ajustes/sedes/sedes-view";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getActiveSalonId } from "@/lib/salon";

export const metadata: Metadata = {
  title: "Sedes",
};

/**
 * Sección de sedes de los ajustes. El guard de sesión y rol (owner/manager)
 * vive en `ajustes/layout.tsx`; aquí solo resolvemos el salón activo.
 */
export default async function SedesPage(): Promise<React.ReactElement> {
  await requireSettingsSection("sedes");

  const salonId = await getActiveSalonId();

  if (salonId === null) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Sedes</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Tu usuario no está asociado a ningún salón todavía.
          </p>
        </CardContent>
      </Card>
    );
  }

  return <SedesView salonId={salonId} />;
}
