import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, Info } from "lucide-react";

import { PerioIcon } from "@/components/brand/dental-icons";

import { Card, CardContent } from "@/components/ui/card";
import { PatientSelector } from "@/components/dental/patient-selector";
import { PerioWorkspace } from "@/components/dental/perio-workspace";
import { getActiveSalonId } from "@/lib/salon";

export const metadata: Metadata = {
  title: "Periodontograma",
};

/**
 * Periodontograma — carta de sondaje periodontal (6 sitios/diente, BSP/AAP).
 *
 * Route: /periodontograma
 *   No query param  → PatientSelector: search list, click navigates to ?paciente=<id>
 *   ?paciente=<id>  → PerioWorkspace: historial + exploración activa (nueva o
 *                     seleccionada) para ese paciente.
 *
 * Mismo patrón que /odontograma/page.tsx (Server Component ligero: solo
 * resuelve salon_id y lee searchParams; toda la carga de datos es cliente).
 */
export default async function PeriodontogramaPage({
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
          <PerioIcon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold tracking-tight">Periodontograma</h1>
          <p className="text-sm text-muted-foreground">
            Carta de sondaje periodontal · 6 sitios/diente
            {hasPatient ? ` · Paciente ${customerId.slice(0, 8)}…` : " · Selecciona un paciente"}
          </p>
        </div>

        {/* Back-to-selector link — only visible when a patient is loaded */}
        {hasPatient && (
          <Link
            href="/periodontograma"
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
        <PatientSelector
          salonId={salonId}
          hrefBase="/periodontograma"
          purposeLabel="ver su periodontograma"
        />
      ) : (
        <PerioWorkspace salonId={salonId} customerId={customerId} />
      )}
    </main>
  );
}
