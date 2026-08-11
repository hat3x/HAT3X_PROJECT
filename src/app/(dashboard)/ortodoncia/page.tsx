import type { Metadata } from "next";

import { OrtodonciaView } from "@/components/dental/ortodoncia-view";
import { PatientSelector } from "@/components/dental/patient-selector";
import { Card, CardContent } from "@/components/ui/card";
import { getActiveSalonId } from "@/lib/salon";

export const metadata: Metadata = { title: "Ortodoncia" };

export default async function OrtodonciaPage({
  searchParams,
}: {
  searchParams: Promise<{ paciente?: string }>;
}): Promise<React.ReactElement> {
  const [salonId, params] = await Promise.all([getActiveSalonId(), searchParams]);

  const customerId = params.paciente ?? "";
  const hasPatient = customerId.length > 0;

  return (
    <main className="container max-w-4xl py-10 sm:py-12">
      <div className="mb-8 space-y-1">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Ortodoncia</h1>
        <p className="text-muted-foreground">Ficha, tratamiento, visitas y consentimiento</p>
      </div>

      {salonId === null ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No tienes una clínica asignada.
          </CardContent>
        </Card>
      ) : !hasPatient ? (
        <PatientSelector
          salonId={salonId}
          hrefBase="/ortodoncia"
          purposeLabel="ver su ortodoncia"
        />
      ) : (
        <OrtodonciaView salonId={salonId} customerId={customerId} />
      )}
    </main>
  );
}
