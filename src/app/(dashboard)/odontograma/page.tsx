import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardList, Info, ChevronLeft } from "lucide-react";

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
 * Route: /odontograma
 *   No query param  → PatientSelector: search list, click navigates to ?paciente=<id>
 *   ?paciente=<id>  → OdontogramChart loaded with that patient's findings
 *
 * Data is fetched client-side via useOdontogramFindings (React Query).
 * This Server Component only resolves the active salon_id and reads searchParams.
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
  const hasPatient = clinicalRecordId.length > 0;

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
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold tracking-tight">Odontograma</h1>
          <p className="text-sm text-muted-foreground">
            Ficha dental · FDI/ISO 3950
            {hasPatient
              ? ` · Paciente ${clinicalRecordId.slice(0, 8)}…`
              : " · Selecciona un paciente"}
          </p>
        </div>

        {/* Back-to-selector link — only visible when a patient is loaded */}
        {hasPatient && (
          <Link
            href="/odontograma"
            className="ml-auto flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm text-muted-foreground ring-1 ring-border transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            Cambiar paciente
          </Link>
        )}
      </div>

      {/* No-salon edge case */}
      {salonId === null ? (
        <Card>
          <CardContent className="flex items-center gap-3 p-4 text-sm text-muted-foreground">
            <Info className="h-4 w-4 shrink-0" aria-hidden="true" />
            No se pudo identificar el salón activo. Cierra sesión y vuelve a entrar.
          </CardContent>
        </Card>
      ) : !hasPatient ? (
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
