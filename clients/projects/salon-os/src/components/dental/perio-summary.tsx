"use client";

import { Activity } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  computePerioRollups,
  deriveCal,
  perioStage,
  type PerioSiteMeasurement,
} from "@/lib/dental/perio";

// ---------------------------------------------------------------------------
// PerioSummary — tarjeta de roll-ups agregados de una exploración periodontal
// ---------------------------------------------------------------------------

export interface PerioSummaryProps {
  sites: readonly PerioSiteMeasurement[];
}

/**
 * Tarjeta de indicadores agregados de una exploración periodontal (o de un
 * subconjunto de sitios, p. ej. lo tecleado en vivo mientras se edita):
 * % de sangrado al sondaje (BoP), peor profundidad de sondaje (PD), CAL medio
 * y estadio periodontal derivado del peor CAL. Toda la lógica vive en
 * `lib/dental/perio.ts` (`computePerioRollups`, `deriveCal`, `perioStage`);
 * este componente solo la muestra.
 */
export function PerioSummary({ sites }: PerioSummaryProps): React.ReactElement {
  const rollups = computePerioRollups(sites);
  const maxCal =
    sites.length === 0
      ? 0
      : Math.max(...sites.map((s) => deriveCal(s.pd_mm, s.gingival_margin_mm)));
  const stage = perioStage(maxCal);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-accent-foreground"
          >
            <Activity className="h-4 w-4" />
          </span>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Resumen periodontal
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <PerioStat label="Sangrado al sondaje (BoP)" value={`${rollups.bopPercent}%`} />
          <PerioStat label="Peor profundidad de sondaje" value={`${rollups.worstPd} mm`} />
          <PerioStat label="CAL medio" value={rollups.meanCal.toFixed(1)} />
          <PerioStat label="Estadio" value={stage} />
        </dl>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Sub-componente
// ---------------------------------------------------------------------------

function PerioStat({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div className="rounded-lg border bg-muted/30 px-3 py-2">
      <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="text-lg font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
