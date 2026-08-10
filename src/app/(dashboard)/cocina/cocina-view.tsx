"use client";

import { useEffect, useState } from "react";
import { Loader2, WifiOff } from "lucide-react";

import { StationColumn } from "@/app/(dashboard)/cocina/station-column";
import { useKdsItems, useKdsRealtime } from "@/hooks/use-kds";
import { groupKdsItemsByOrder, type KdsItem } from "@/lib/restauracion/kds";

interface CocinaViewProps {
  salonId: string;
}

/** Estación sentinela para líneas sin `stationId` asignado en la carta. */
const UNASSIGNED_STATION = "Sin estación";

/**
 * Indicador "En directo" del estado de `useKdsRealtime` — mismo patrón
 * visual que `RealtimeIndicator` de `day-panel-view.tsx` (punto pulsante en
 * verde/conectado, icono de sin-conexión en error, spinner conectando),
 * adaptado al copy de cocina.
 */
function LiveIndicator({
  status,
}: {
  status: "connecting" | "connected" | "error";
}): React.ReactElement {
  const base =
    "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors duration-150 ease-apple-out";

  if (status === "connected") {
    return (
      <span
        className={`${base} border-success/25 bg-success/10 text-success`}
        title="Los cambios se reflejan al instante"
      >
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success/70" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-success" />
        </span>
        En directo
      </span>
    );
  }
  if (status === "error") {
    return (
      <span className={`${base} border-destructive/25 bg-destructive/10 text-destructive`}>
        <WifiOff className="h-3.5 w-3.5" aria-hidden="true" />
        Sin conexión en tiempo real
      </span>
    );
  }
  return (
    <span className={`${base} border-border bg-muted text-muted-foreground`}>
      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
      Conectando…
    </span>
  );
}

/** Agrupa las líneas activas del KDS por nombre de estación. */
function groupByStation(items: readonly KdsItem[]): Map<string, KdsItem[]> {
  const byStation = new Map<string, KdsItem[]>();
  for (const item of items) {
    const key = item.stationName ?? UNASSIGNED_STATION;
    const list = byStation.get(key) ?? [];
    list.push(item);
    byStation.set(key, list);
  }
  return byStation;
}

/**
 * Pantalla de cocina (KDS, Task 4): columnas por estación con las comandas
 * activas en tiempo real. `useKdsRealtime` invalida la query del KDS en
 * cualquier cambio de `order_items`; `useKdsItems` la vuelve a pedir. El
 * cronómetro de cada línea se refresca cada 30s con un `setInterval` que
 * solo fuerza un re-render (`now` en estado) — la lógica pura de minutos
 * transcurridos vive en `elapsedMinutes` (lib/restauracion/kds.ts) y NUNCA
 * llama a `Date.now()` directamente.
 */
export function CocinaView({ salonId }: CocinaViewProps): React.ReactElement {
  const realtimeStatus = useKdsRealtime(salonId);
  const itemsQuery = useKdsItems(salonId);

  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(id);
  }, []);

  const items = itemsQuery.data ?? [];
  const byStation = groupByStation(items);
  const stationNames = [...byStation.keys()].sort((a, b) => a.localeCompare(b, "es"));

  return (
    <main className="container py-6 lg:py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">Cocina</h1>
          <p className="text-sm text-muted-foreground">Comandas activas agrupadas por estación.</p>
        </div>
        <LiveIndicator status={realtimeStatus} />
      </div>

      {itemsQuery.isPending ? (
        <p className="text-sm text-muted-foreground">Cargando comandas…</p>
      ) : itemsQuery.isError ? (
        <p className="text-sm text-destructive">
          No se pudieron cargar las comandas: {(itemsQuery.error as Error).message}
        </p>
      ) : stationNames.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-card/40 py-16 text-center">
          <p className="text-sm text-muted-foreground">No hay comandas activas.</p>
        </div>
      ) : (
        <div className="flex animate-fade-up gap-5 overflow-x-auto pb-2">
          {stationNames.map((stationName) => (
            <StationColumn
              key={stationName}
              salonId={salonId}
              stationName={stationName}
              groups={groupKdsItemsByOrder(byStation.get(stationName) ?? [])}
              now={now}
            />
          ))}
        </div>
      )}
    </main>
  );
}
