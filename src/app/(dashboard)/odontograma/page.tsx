import type { Metadata } from "next";
import { ClipboardList, Info } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { OdontogramChart } from "@/components/dental/odontogram-chart";
import { PatientSelector } from "@/components/dental/patient-selector";
import { getActiveSalonId } from "@/lib/salon";

export const metadata: Metadata = {
  title: "Odontograma",
};

/**
 * Odontograma — ficha dental FDI/ISO 3950.
 *
 * Renders the OdontogramChart (Client Component) with the active salon_id.
 * Demo mode when no patient is passed: chart shows empty teeth, save button
 * is disabled.
 *
 * Pass ?paciente=<customer_id> to link to a specific patient's odontogram
 * (wired from the customer detail page in a later phase).
 */
export default async function OdontogramaPage({
  searchParams,
}: {
  searchParams: Promise<{ paciente?: string }>;
}): Promise<React.ReactElement> {
  const [salonId, params] = await Promise.all([
    getActiveSalonId(),
    searchParams,
  ]);

  const clinicalRecordId = params.paciente ?? "";

  return (
    <main className="container py-8 space-y-6">
      {/* Page header */}
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="grid h-10 w-10 place-items-center rounded-xl border border-primary/15 bg-accent text-primary"
        >
          <ClipboardList className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Odontograma</h1>
          <p className="text-sm text-muted-foreground">
            Ficha dental · FDI/ISO 3950
            {clinicalRecordId
              ? ` · Paciente ${clinicalRecordId.slice(0, 8)}…`
              : " · Vista previa"}
          </p>
        </div>
      </div>

      {/* No-salon edge case */}
      {salonId === null ? (
        <Card>
          <CardContent className="flex items-center gap-3 p-4 text-sm text-muted-foreground">
            <Info className="h-4 w-4 shrink-0" aria-hidden="true" />
            No se pudo identificar el salón activo. Cierra sesión y vuelve a entrar.
          </CardContent>
        </Card>
      ) : clinicalRecordId === "" ? (
        <PatientSelector salonId={salonId} />
      ) : (
        <OdontogramChart
          salonId={salonId}
          clinicalRecordId={clinicalRecordId}
        />
      )}
    </main>
  );
}
