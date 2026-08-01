import type { Metadata } from "next";
import { ClipboardList, Info } from "lucide-react";

import { PatientSelector } from "@/components/dental/patient-selector";
import { PlanWorkspace } from "@/components/dental/plan-workspace";
import { Card, CardContent } from "@/components/ui/card";
import { getActiveSalonId } from "@/lib/salon";

export const metadata: Metadata = {
  title: "Planes de tratamiento",
};

/**
 * Planes de tratamiento / presupuestos (odontología).
 *
 * Route: /planes
 *   No query param  → PatientSelector: search list, click navigates to ?paciente=<id>
 *   ?paciente=<id>  → PlanWorkspace: lista de planes + detalle activo (nuevo o
 *                     seleccionado) para ese paciente. El enlace "Cambiar
 *                     paciente" vive dentro de PlanWorkspace (no aquí), a
 *                     diferencia de /periodontograma.
 *
 * Mismo patrón que /odontograma/page.tsx y /periodontograma/page.tsx (Server
 * Component ligero: solo resuelve salon_id y lee searchParams; toda la carga
 * de datos es cliente).
 */
export default async function PlanesPage({
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
          <ClipboardList className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold tracking-tight">Planes de tratamiento</h1>
          <p className="text-sm text-muted-foreground">
            Presupuestos y fases de tratamiento
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
          hrefBase="/planes"
          purposeLabel="ver sus planes de tratamiento"
        />
      ) : (
        <PlanWorkspace salonId={salonId} customerId={customerId} />
      )}
    </main>
  );
}
