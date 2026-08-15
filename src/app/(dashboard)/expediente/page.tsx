import type { Metadata } from "next";
import { Info } from "lucide-react";

import { DentalRecordIcon } from "@/components/brand/dental-icons";

import { ExpedienteWorkspace } from "@/components/dental/expediente-workspace";
import { PatientSelector } from "@/components/dental/patient-selector";
import { Card, CardContent } from "@/components/ui/card";
import { getActiveSalonId } from "@/lib/salon";

export const metadata: Metadata = {
  title: "Expediente clínico",
};

/**
 * Expediente clínico: consentimientos informados + imágenes/radiografías
 * (odontología).
 *
 * Route: /expediente
 *   No query param  → PatientSelector: search list, click navigates to ?paciente=<id>
 *   ?paciente=<id>  → ExpedienteWorkspace: pestañas Consentimientos/Imágenes
 *                     para ese paciente. El enlace "Cambiar paciente" vive
 *                     dentro de ExpedienteWorkspace (no aquí), igual que en
 *                     /planes.
 *
 * Mismo patrón que /planes/page.tsx (Server Component ligero: solo resuelve
 * salon_id y lee searchParams; toda la carga de datos es cliente).
 */
export default async function ExpedientePage({
  searchParams,
}: {
  searchParams: Promise<{ paciente?: string }>;
}): Promise<React.ReactElement> {
  const [salonId, params] = await Promise.all([getActiveSalonId(), searchParams]);

  const customerId = params.paciente ?? "";
  const hasPatient = customerId.length > 0;

  return (
    <main className="container py-8 space-y-6">
      {/* Page header */}
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="grid h-10 w-10 place-items-center rounded-xl border border-primary/15 bg-accent text-primary"
        >
          <DentalRecordIcon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold tracking-tight">Expediente clínico</h1>
          <p className="text-sm text-muted-foreground">
            Consentimientos informados e imágenes/radiografías
            {hasPatient ? ` · Paciente ${customerId.slice(0, 8)}…` : " · Selecciona un paciente"}
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
      ) : !hasPatient ? (
        <PatientSelector
          salonId={salonId}
          hrefBase="/expediente"
          purposeLabel="ver su expediente clínico"
        />
      ) : (
        <ExpedienteWorkspace salonId={salonId} customerId={customerId} />
      )}
    </main>
  );
}
